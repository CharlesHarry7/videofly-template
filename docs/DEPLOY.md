# ZombieCoupleVideo deploy notes

This repository does not contain keys. Do not paste Stripe, KIE, Resend, or
storage secrets into git, Wrangler `vars`, or `wrangler.jsonc`.

Do not run production or live Stripe charges from this branch until a human
has filled secrets in the Cloudflare dashboard and verified Stripe test mode.

## Env var names

Set these as Cloudflare Worker secrets (or `.env.local` for Node) — never in the repo:

| Name | Used for |
| --- | --- |
| `DATABASE_URL` | PostgreSQL |
| `POSTGRES_URL` | PostgreSQL fallback |
| `BETTER_AUTH_SECRET` | Auth signing |
| `RESEND_API_KEY` | Magic-link email |
| `RESEND_FROM` | From address |
| `STRIPE_API_KEY` | Stripe secret key (`sk_test_...` until live is enabled) |
| `STRIPE_WEBHOOK_SECRET` | Stripe webhook signing |
| `STORAGE_ENDPOINT` | R2/S3 endpoint |
| `STORAGE_REGION` | Usually `auto` for R2 |
| `STORAGE_ACCESS_KEY` | R2 access key |
| `STORAGE_SECRET_KEY` | R2 secret |
| `STORAGE_BUCKET` | Private bucket |
| `KIE_API_KEY` | Video/image generation |
| `CALLBACK_HMAC_SECRET` | Provider callbacks |
| `BOT_CHECK_SECRET` | Free-preview bot challenge |
| `ZCV_MEDIA_TOKEN_SECRET` | Signed media URLs |
| `CRON_SECRET` | Reconcile cron |
| `AI_CALLBACK_URL` | Provider webhook URL |

Non-secret public/config vars (safe in Wrangler `vars`, still not keys):

| Name | Production | Sandbox |
| --- | --- | --- |
| `NEXT_PUBLIC_APP_URL` | `https://zombiecouplevideo.com` | the `*.workers.dev` URL after first sandbox deploy |
| `NEXT_PUBLIC_BILLING_PROVIDER` | `stripe` | `stripe` |
| `ZCV_STRIPE_MODE` | `test` until go-live | `test` |
| `ZCV_ALLOW_LIVE_PAYMENTS` | `false` until go-live | `false` |
| `ZCV_NOINDEX` | `false` | `true` |
| `CLOUDFLARE_ENV` | `production` | `sandbox` |
| `DEFAULT_AI_PROVIDER` | `kie` | `kie` |
| `ZCV_SUPPORT_EMAIL` | `support@zombiecouplevideo.com` | same or a sandbox inbox |
| `ZCV_DAILY_PREVIEW_BUDGET` | `80` | lower is safer |
| `ZCV_DAILY_PREVIEW_CREDIT_BUDGET` | `400` | lower is safer |

Optional Stripe Price objects, if you create them in Stripe instead of using
server `price_data`:

- `STRIPE_PRICE_ID_SINGLE`

Amounts are still enforced server-side against the pack table (`$9.99` Single /
10 credits). Plus and Bundle packs are not sold.

## Cloudflare steps (human)

1. Install deploy tooling once: `pnpm add -D wrangler @opennextjs/cloudflare`
2. Create a Cloudflare account, enable Workers, and attach the domain
   `zombiecouplevideo.com`.
3. Create two Workers from `wrangler.jsonc`: production `zombiecouplevideo` and
   sandbox `zombiecouplevideo-sandbox` (`workers.dev` only).
4. Put every secret with Wrangler. Examples:
   - `pnpm exec wrangler secret put STRIPE_API_KEY`
   - `pnpm exec wrangler secret put STRIPE_API_KEY --env sandbox`
   Repeat for the secret table above. Do not put `sk_live_` in sandbox.
5. Set sandbox `NEXT_PUBLIC_APP_URL` to the assigned
   `https://zombiecouplevideo-sandbox.<subdomain>.workers.dev` URL.
6. Sandbox must keep `ZCV_NOINDEX=true` and `CLOUDFLARE_ENV=sandbox`. HTML
   responses then send `X-Robots-Tag: noindex, nofollow`, and `robots.txt`
   disallows all.
7. Production routes in `wrangler.jsonc` are `zombiecouplevideo.com/*` and
   `www.zombiecouplevideo.com/*`. Point DNS in Cloudflare to the Worker.
8. Build with OpenNext, then deploy only when you intend to:
   - Sandbox: `pnpm exec opennextjs-cloudflare build && pnpm exec wrangler deploy --env sandbox`
   - Production: `pnpm exec opennextjs-cloudflare build && pnpm exec wrangler deploy`
   This repository's CI/agent must not run those commands.

## Stripe steps (human)

1. Create a Stripe account. Stay on **test mode** until `ZCV_ALLOW_LIVE_PAYMENTS=true`.
2. Create a webhook endpoint:
   `https://zombiecouplevideo.com/api/webhooks/stripe`
   (sandbox: `https://<sandbox>.workers.dev/api/webhooks/stripe`)
3. Events: `checkout.session.completed`, `checkout.session.expired`,
   `checkout.session.async_payment_failed`, `payment_intent.payment_failed`.
4. Copy the webhook signing secret into `STRIPE_WEBHOOK_SECRET`.
5. Copy the secret key into `STRIPE_API_KEY` (`sk_test_...` first).
6. Optional: create a one-time Price for Single `$9.99` and set
   `STRIPE_PRICE_ID_SINGLE`. If unset, Checkout uses `price_data` from the
   server pack table. Do not create Plus or Bundle prices.
7. Success URL is `/success?orderId=...`. That page never grants the video;
   the webhook does.

## Database and storage

1. Provision PostgreSQL and run template migrations plus
   `src/db/migrations/0001_zcv.sql` and `0002_zcv_reconciliation_lease.sql`.
2. Create a **private** R2 bucket. Paid videos are not public objects.
3. Apply `src/db/migrations` before the first paid order.

## Cloudflare bindings (Hyperdrive + Images)

- PostgreSQL goes through Hyperdrive. `wrangler.jsonc` binds `HYPERDRIVE` with a
  placeholder id `00000000-0000-0000-0000-000000000000`. Create a Hyperdrive
  config in Cloudflare and replace the id. The connection string stays in
  Cloudflare, never in git.
- On Workers a new Postgres.js client (`postgres` >= 3.4.5, `max: 5`,
  `fetch_types: false`) is created per request from
  `env.HYPERDRIVE.connectionString`. Local Node keeps using `DATABASE_URL`.
- Watermarked previews use the Cloudflare Images binding `IMAGES`. `sharp` was
  removed.
- `nodejs_compat` stays on. Agents must not deploy; a human runs the deploy
  steps above.
