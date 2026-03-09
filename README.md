# sentry-brrr

A Cloudflare Worker that receives [Sentry issue alert webhooks](https://docs.sentry.io/organization/integrations/integration-platform/webhooks/issue-alerts/) and forwards them as push notifications via [brrr](https://brrr.now).

## How it works

1. Sentry sends a webhook POST request when an issue alert fires
2. The worker verifies the HMAC-SHA256 signature to ensure the request is authentic
3. If the webhook is an issue alert (`event_alert`), it sends a push notification to your devices via brrr
4. The brrr notification includes the alert rule name, event title, and a link back to the issue in Sentry

Other webhook types (metric alerts, issues, comments, etc.) are acknowledged but ignored.

## Prerequisites

- [Node.js](https://nodejs.org/) (v18+)
- A [Cloudflare](https://cloudflare.com) account
- A [Sentry](https://sentry.io) internal integration with webhook alerts enabled
- The [brrr](https://brrr.now) app installed on your device

## Setup

```sh
npm install
```

### Secrets

This worker requires two secrets. Set them with `wrangler secret put` **before deploying** (or after, Cloudflare will prompt you):

#### `SENTRY_CLIENT_SECRET`

The **Client Secret** from your Sentry internal integration. Sentry uses this to sign webhook payloads so the worker can verify authenticity.

To find it: Sentry > Settings > Developer Settings > your integration > Client Secret.

```sh
npx wrangler secret put SENTRY_CLIENT_SECRET
```

#### `BRRR_WEBHOOK_SECRET`

The secret portion of your brrr webhook URL. Open the brrr app, find your webhook URL (it looks like `https://api.brrr.now/v1/br_usr_a1b2c3d4e5f6g7h8i9j0`), and copy just the secret part (`br_usr_a1b2c3d4e5f6g7h8i9j0`).

Use the shared webhook secret to notify all devices, or a device-specific one for a single device.

```sh
npx wrangler secret put BRRR_WEBHOOK_SECRET
```

## Deploy

```sh
npm run deploy
```

After deploying, copy the worker URL (e.g., `https://sentry-brrr.<your-subdomain>.workers.dev`) and paste it as the **Webhook URL** in your Sentry internal integration settings.

## Local development

```sh
npm run dev
```

For local development, create a `.dev.vars` file with your secrets:

```
SENTRY_CLIENT_SECRET=your-sentry-client-secret
BRRR_WEBHOOK_SECRET=br_usr_your-brrr-secret
```

This file is gitignored by wrangler by default.

## Configuring Sentry

1. Go to **Settings > Developer Settings** in your Sentry organization
2. Create or edit an **Internal Integration**
3. Under **Webhooks**, enable **Alert Rule Action** and set the Webhook URL to your deployed worker URL
4. Copy the **Client Secret** and set it as the `SENTRY_CLIENT_SECRET` secret (see above)
5. Create an alert rule in any project and add your integration as an action
