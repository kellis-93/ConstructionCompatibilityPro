// ============================================================
// Cloudflare Worker — Anthropic API Proxy
// Deploy at: https://workers.cloudflare.com
//
// Environment variable to set in the Worker dashboard:
//   ANTHROPIC_API_KEY = sk-ant-api03-xxxxxxx
// ============================================================

const ALLOWED_ORIGINS = [
  // Add your GitHub Pages URL and any other domains you want to allow
  // e.g. "https://yourusername.github.io",
  //      "https://yourdomain.com"
  // Leave empty array to allow ALL origins (easier to start with)
];

const RATE_LIMIT_REQUESTS = 10;   // max requests per IP per window
const RATE_LIMIT_WINDOW_S = 3600; // window in seconds (1 hour)

// Simple in-memory rate limit store (resets on Worker restart)
// For production, swap this for a Cloudflare KV store
const rateLimitMap = new Map();

function checkRateLimit(ip) {
  const now = Date.now();
  const windowMs = RATE_LIMIT_WINDOW_S * 1000;
  const entry = rateLimitMap.get(ip) || { count: 0, windowStart: now };

  if (now - entry.windowStart > windowMs) {
    // Reset window
    entry.count = 1;
    entry.windowStart = now;
  } else {
    entry.count += 1;
  }
  rateLimitMap.set(ip, entry);
  return entry.count <= RATE_LIMIT_REQUESTS;
}

function corsHeaders(origin) {
  const allowed =
    ALLOWED_ORIGINS.length === 0 ||
    ALLOWED_ORIGINS.includes(origin);

  return {
    "Access-Control-Allow-Origin": allowed ? (origin || "*") : "null",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
    "Access-Control-Max-Age": "86400",
  };
}

export default {
  async fetch(request, env) {
    const origin = request.headers.get("Origin") || "";
    const cors   = corsHeaders(origin);

    // Handle CORS pre-flight
    if (request.method === "OPTIONS") {
      return new Response(null, { status: 204, headers: cors });
    }

    // Only accept POST to /check
    const url = new URL(request.url);
    if (request.method !== "POST" || url.pathname !== "/check") {
      return new Response(JSON.stringify({ error: "Not found" }), {
        status: 404,
        headers: { ...cors, "Content-Type": "application/json" },
      });
    }

    // Rate limit by IP
    const ip = request.headers.get("CF-Connecting-IP") || "unknown";
    if (!checkRateLimit(ip)) {
      return new Response(
        JSON.stringify({ error: `Rate limit exceeded. Max ${RATE_LIMIT_REQUESTS} requests per hour.` }),
        { status: 429, headers: { ...cors, "Content-Type": "application/json" } }
      );
    }

    // Parse request body
    let body;
    try {
      body = await request.json();
    } catch {
      return new Response(JSON.stringify({ error: "Invalid JSON body" }), {
        status: 400,
        headers: { ...cors, "Content-Type": "application/json" },
      });
    }

    const { productA, productB, materialList } = body;
    if (!productA || !productB || !materialList) {
      return new Response(JSON.stringify({ error: "Missing productA, productB or materialList" }), {
        status: 400,
        headers: { ...cors, "Content-Type": "application/json" },
      });
    }

    // Build Anthropic request
    const systemPrompt = `You are a construction materials and coatings compatibility expert.
You have access to a compatibility database with the following material categories and representative products:

${materialList}

Your task:
1. Identify which database material ID best matches Product A and Product B.
2. Using your expert knowledge of the SPECIFIC products named, assess compatibility.
3. Return ONLY valid JSON — no markdown, no code fences, no explanation outside the JSON.

JSON schema:
{
  "productA": { "name": "<as entered>", "matchedId": "<material id>", "matchedLabel": "<label>", "category": "<category>", "productNotes": "<1-2 sentences on this specific product's chemistry and type>" },
  "productB": { "name": "<as entered>", "matchedId": "<material id>", "matchedLabel": "<label>", "category": "<category>", "productNotes": "<1-2 sentences>" },
  "compatibility": {
    "status": "ok|warn|bad|check",
    "summary": "<2-3 sentence expert assessment of these two SPECIFIC products together>",
    "conditions": ["<actionable condition 1>", "<actionable condition 2>"],
    "referenceStandard": "<relevant standard or test method, or empty string>",
    "confidence": "high|medium|low",
    "confidenceReason": "<brief reason>"
  }
}`;

    const anthropicPayload = {
      model: "claude-sonnet-4-20250514",
      max_tokens: 1000,
      system: systemPrompt,
      messages: [
        {
          role: "user",
          content: `Product A: ${productA}\nProduct B: ${productB}\n\nAnalyse compatibility between these two specific construction products.`
        }
      ]
    };

    // Forward to Anthropic
    let anthropicResp;
    try {
      anthropicResp = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-api-key": env.ANTHROPIC_API_KEY,
          "anthropic-version": "2023-06-01",
        },
        body: JSON.stringify(anthropicPayload),
      });
    } catch (e) {
      return new Response(JSON.stringify({ error: "Failed to reach Anthropic API: " + e.message }), {
        status: 502,
        headers: { ...cors, "Content-Type": "application/json" },
      });
    }

    if (!anthropicResp.ok) {
      const errText = await anthropicResp.text();
      return new Response(
        JSON.stringify({ error: `Anthropic API error ${anthropicResp.status}: ${errText}` }),
        { status: anthropicResp.status, headers: { ...cors, "Content-Type": "application/json" } }
      );
    }

    const anthropicData = await anthropicResp.json();
    const rawText = anthropicData.content?.find(b => b.type === "text")?.text || "";
    const clean = rawText.replace(/```json|```/g, "").trim();

    let parsed;
    try {
      parsed = JSON.parse(clean);
    } catch {
      return new Response(JSON.stringify({ error: "AI returned unexpected format. Please try again." }), {
        status: 500,
        headers: { ...cors, "Content-Type": "application/json" },
      });
    }

    return new Response(JSON.stringify(parsed), {
      status: 200,
      headers: { ...cors, "Content-Type": "application/json" },
    });
  }
};
