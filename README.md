# ZombieCoupleVideo

Turn a couple photo into a **zombie couple video**. Site: [zombiecouplevideo.com](https://zombiecouplevideo.com).

Built on the VideoFly / saasfly Next.js template (MIT). This product is a single-purpose generator, not a multi-model video SaaS.

- Brand: **ZombieCoupleVideo**
- H1: **Zombie Couple Video**
- Keyword route: `/zombie-couple-video` (canonical to home)
- Tool on the first screen: upload → one free watermarked preview image → login only at Stripe Checkout
- Credit packs start at **$6.99 Single (10 credits)** for one 5-second video
- Secrets come from env only. Never commit Stripe keys.

See `.env.example` for env **names** and `docs/DEPLOY.md` for Cloudflare + Stripe human steps.

## Local mock preview (no paid APIs)

```bash
ZCV_LOCAL_MOCK=true \
BETTER_AUTH_SECRET=local-only-placeholder \
RESEND_API_KEY=local-only-placeholder \
RESEND_FROM=local@example.test \
NEXT_PUBLIC_APP_URL=http://localhost:3000 \
pnpm dev
```

Open `http://localhost:3000`. The mock preview is your photo with a visible watermark; no AI model is called.

## Tests

```bash
pnpm test
pnpm typecheck
```

## License

Original template license remains MIT. Keep that notice when you fork.
