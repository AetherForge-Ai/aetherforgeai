# Local signed-in harness (goal b11)

Local only. Nothing here talks to production Totalum, Stripe or email.

1. `node qa/local-harness/mock-totalum.mjs` (in-memory Totalum CRUD on :4555; email calls are recorded at `/__mock/outbox`, never sent).
2. Start the app **without** any real Totalum/Stripe key in the environment:
   `env -u TOTALUM_API_KEY -u TOTALUM_PASSWORD -u STRIPE_SECRET_KEY TOTALUM_API_URL=http://127.0.0.1:4555/ BETTER_AUTH_SECRET=<any local string> BETTER_AUTH_URL=http://localhost:3917 NEXT_PUBLIC_APP_URL=http://localhost:3917 npx next start -p 3917`
3. Sign up a throwaway account (`POST /api/auth/sign-up/email` with `age_confirmed: true`), then mark it verified with
   `POST :4555/__mock/patch {"table":"user","filter":{"email":"…"},"set":{"email_verified":true}}`.
4. `LOGIN_EMAIL=… node --experimental-websocket qa/local-harness/g10-trade.cjs` — G-10 timing (confirm → cash/holding change, no reload).
5. `LOGIN_EMAIL=… PAGES=/dashboard,… node --experimental-websocket qa/local-harness/audit.cjs` — G-11 4xx, G-14 axe/skip link/390 px, G-15 JSON-LD. Needs `axe-core` (set `AXE_PATH`).
