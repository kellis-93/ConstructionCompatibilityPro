# Construction Material Compatibility Checker — Setup Guide

## What you have

| File | Purpose |
|------|---------|
| `index.html` | Your website — upload to GitHub Pages |
| `worker.js` | Cloudflare Worker — proxies AI requests so your API key stays secret |

---

## Step 1 — Get an Anthropic API key

1. Go to https://console.anthropic.com
2. Sign up / log in
3. Click **API Keys** → **Create Key**
4. Copy the key (starts with `sk-ant-api03-…`)

Pricing: ~$0.003 per product search. 1,000 searches ≈ $3.

---

## Step 2 — Deploy the Cloudflare Worker

Cloudflare Workers have a **free tier of 100,000 requests/day** — more than enough for most sites.

### 2a. Create a Cloudflare account
- Go to https://cloudflare.com and sign up (free)

### 2b. Create a new Worker
1. In the Cloudflare dashboard, go to **Workers & Pages**
2. Click **Create Application** → **Create Worker**
3. Give it a name, e.g. `material-compat`
4. Click **Deploy** (don't worry about the default code)

### 2c. Paste the worker code
1. Click **Edit Code** on your new worker
2. Delete all existing code
3. Copy the entire contents of `worker.js` and paste it in
4. Click **Save and Deploy**

### 2d. Set your API key as a secret
1. In your Worker dashboard, go to **Settings** → **Variables**
2. Under **Environment Variables**, click **Add variable**
3. Name: `ANTHROPIC_API_KEY`
4. Value: paste your `sk-ant-api03-…` key
5. Tick **Encrypt** (keeps it secret)
6. Click **Save and Deploy**

### 2e. Note your Worker URL
Your worker will have a URL like:
```
https://material-compat.youraccount.workers.dev
```
Copy this URL.

---

## Step 3 — Connect your website to the Worker

Open `index.html` in any text editor and find this line near the top of the script:

```javascript
const WORKER_URL = "https://YOUR-WORKER-NAME.YOUR-ACCOUNT.workers.dev/check";
```

Replace it with your actual worker URL + `/check`, for example:

```javascript
const WORKER_URL = "https://material-compat.myaccount.workers.dev/check";
```

Save the file.

---

## Step 4 — Restrict the Worker to your domain (recommended)

Open `worker.js` and find this section:

```javascript
const ALLOWED_ORIGINS = [
  // Add your GitHub Pages URL and any other domains you want to allow
];
```

Add your GitHub Pages URL:

```javascript
const ALLOWED_ORIGINS = [
  "https://yourusername.github.io",
  "https://yourdomain.com",  // if you have a custom domain
];
```

Re-deploy the worker after this change (paste updated code back into Cloudflare editor).

This prevents other websites from using your API key.

---

## Step 5 — Publish to GitHub Pages

1. Go to https://github.com → **New repository**
   - Name: `material-compatibility` (or anything you like)
   - Tick **Add a README file**
   - Click **Create repository**

2. Click **Add file** → **Upload files**
   - Drag and drop `index.html`
   - **Rename it to `index.html`** if it isn't already
   - Click **Commit changes**

3. Go to **Settings** → **Pages**
   - Source: **Deploy from a branch**
   - Branch: `main`, folder: `/ (root)`
   - Click **Save**

4. Wait ~60 seconds. Your site is live at:
   ```
   https://yourusername.github.io/material-compatibility
   ```

---

## Rate limiting

The Worker is pre-configured to allow **10 AI searches per IP address per hour**.
To change this, edit these lines in `worker.js`:

```javascript
const RATE_LIMIT_REQUESTS = 10;   // max requests per IP per window
const RATE_LIMIT_WINDOW_S = 3600; // window in seconds (1 hour)
```

For higher-traffic sites, consider upgrading to **Cloudflare KV** for persistent rate limiting across Worker instances.

---

## Monthly cost estimate

| Traffic | AI searches/month | Approx. cost |
|---------|------------------|--------------|
| Small   | 500              | ~$1.50       |
| Medium  | 5,000            | ~$15         |
| Large   | 50,000           | ~$150        |

The Cloudflare Worker itself is **free** up to 100,000 requests/day.

---

## Troubleshooting

**"Worker not yet configured"** banner shows on site
→ You haven't updated `WORKER_URL` in `index.html` yet. See Step 3.

**AI search returns an error**
→ Check your `ANTHROPIC_API_KEY` is set correctly in the Worker's Environment Variables.

**CORS error in browser console**
→ Make sure your GitHub Pages domain is listed in `ALLOWED_ORIGINS` in `worker.js` (or leave the array empty to allow all origins while testing).

**Rate limit hit**
→ Increase `RATE_LIMIT_REQUESTS` in `worker.js` or switch to Cloudflare KV for production-grade rate limiting.
