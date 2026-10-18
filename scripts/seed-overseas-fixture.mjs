#!/usr/bin/env node
// b30 H-9: sign in as the allow-listed fixture account and seed the overseas FIF fixture.
// Reads FIXTURE_BASE_URL, FIXTURE_EMAIL and FIXTURE_PASSWORD from the environment only.
const base = process.env.FIXTURE_BASE_URL || "http://localhost:3000";
const email = process.env.FIXTURE_EMAIL;
const password = process.env.FIXTURE_PASSWORD;
if (!email || !password) {
  console.error("Set FIXTURE_EMAIL and FIXTURE_PASSWORD in the environment.");
  process.exit(1);
}
const login = await fetch(`${base}/api/auth/sign-in/email`, {
  method: "POST",
  headers: { "content-type": "application/json", origin: base },
  body: JSON.stringify({ email, password }),
});
if (!login.ok) {
  console.error(`Sign-in failed (${login.status}).`);
  process.exit(1);
}
const cookie = (login.headers.getSetCookie?.() || []).map((c) => c.split(";")[0]).join("; ");
const res = await fetch(`${base}/api/test-hooks/seed-overseas`, { method: "POST", headers: { cookie, origin: base } });
console.log(res.status, await res.text());
