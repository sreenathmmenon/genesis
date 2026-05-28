# Deploy Genesis Online (~$20/month)

Vercel (frontend) + Railway (backend + databases) + Qdrant Cloud + Modal.com

---

## Prerequisites

- Railway CLI: `npm install -g @railway/cli`
- Vercel CLI: `npm install -g vercel`
- Accounts at: [railway.app](https://railway.app), [vercel.com](https://vercel.com), [cloud.qdrant.io](https://cloud.qdrant.io), [modal.com](https://modal.com)

---

## Step 1: Railway (Backend + PostgreSQL + Redis)

1. `railway login`

2. `cd genesis && railway init` (choose "Empty project", name it `genesis`)

3. `railway add` (select **PostgreSQL** — creates managed database)

4. `railway add` (select **Redis** — creates managed Redis)

5. Set all environment variables:

   ```shell
   railway variables set ANTHROPIC_API_KEY=your_key
   railway variables set TELEGRAM_BOT_TOKEN=your_token
   railway variables set TELEGRAM_CHAT_ID=your_chat_id
   railway variables set ENVIRONMENT=production
   railway variables set LOG_LEVEL=INFO
   ```

   Set all other vars from `.env.example` the same way.

6. `railway up` (deploys backend from `backend/` directory)

7. Copy your Railway backend URL — looks like: `https://genesis-production.up.railway.app`

   You will need this for Step 2 and Step 5.

---

## Step 2: Vercel (Frontend)

1. `cd frontend`

2. `vercel` (follow prompts — link to your account, set project name to `genesis-frontend`)

3. In Vercel dashboard → Settings → Environment Variables, add:

   ```
   NEXT_PUBLIC_API_URL = https://your-railway-url.up.railway.app
   NEXT_PUBLIC_WS_URL  = wss://your-railway-url.up.railway.app
   ```

4. `vercel --prod`

5. Your frontend is live at: `https://genesis-frontend.vercel.app`

---

## Step 3: Qdrant Cloud (Vector Memory)

1. Sign up at [cloud.qdrant.io](https://cloud.qdrant.io) (free tier: 1GB, no credit card)

2. Create a cluster (free tier, any region)

3. Copy the cluster URL and API key from the dashboard

4. `railway variables set QDRANT_URL=https://your-cluster.qdrant.io`

5. `railway variables set QDRANT_API_KEY=your_api_key`

---

## Step 4: Modal.com (Code Sandbox)

1. Sign up at [modal.com](https://modal.com) (free tier generous for demos)

2. In your terminal: `modal token new`

3. Copy the token ID and secret from output

4. `railway variables set MODAL_TOKEN_ID=your_token_id`

5. `railway variables set MODAL_TOKEN_SECRET=your_token_secret`

---

## Step 5: Set Telegram Webhook

```shell
curl -X POST "https://api.telegram.org/bot{YOUR_BOT_TOKEN}/setWebhook" \
  -d "url=https://your-railway-url.up.railway.app/api/telegram/webhook"
```

Replace `{YOUR_BOT_TOKEN}` and the Railway URL with your actual values.

Verify webhook is set:

```shell
curl "https://api.telegram.org/bot{YOUR_BOT_TOKEN}/getWebhookInfo"
```

---

## Step 6: Verify Everything Works

- [ ] Open your Vercel URL — canvas loads with empty state
- [ ] Open Railway URL + `/health` — returns `status ok, db ok, redis ok`
- [ ] Open Railway URL + `/docs` — FastAPI docs show all routes
- [ ] Send `/start` to your Telegram bot — receives welcome message
- [ ] Send an intent to Telegram — canvas shows agents building
- [ ] Tap **Deploy** in Telegram — system goes live

---

## Total Monthly Cost

| Service | What it runs | Cost |
|---|---|---|
| Railway Hobby | FastAPI + PostgreSQL + Redis | ~$15/month |
| Vercel | Next.js frontend | Free |
| Qdrant Cloud | Vector memory (1GB) | Free |
| Modal.com | Sandbox execution | Free (pay per use, minimal) |
| **TOTAL** | | **~$15–20/month** |

---

## Updating After Changes

**Backend update:** `railway up` (from `genesis/` directory)

**Frontend update:** `vercel --prod` (from `frontend/` directory)

Or: push to GitHub and both auto-deploy if connected.
