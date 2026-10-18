
import { registerDurableAttemptStore, recordCryptoAttempt, readSharedCryptoAttempt, flushCryptoAttempt } from "@/lib/crypto-attempts";
import { describe as d2, it as i2, expect as e2 } from "vitest";
d2("b28 G-05 durable attempt store", () => {
  i2("a later attempt on another instance is what /status reads, and older never overwrites newer", async () => {
    let body: string | null = null;
    registerDurableAttemptStore({ read: async () => body, write: async (b) => { body = b; } });
    recordCryptoAttempt(false, new Error("CoinGecko unavailable"), Date.parse("2026-10-19T00:00:00Z"));
    await flushCryptoAttempt(1000);
    body = JSON.stringify({ last: { at: "2026-10-19T00:05:00.000Z", ok: true, code: "ok" }, lastSuccess: "2026-10-19T00:05:00.000Z" });
    const seen = await readSharedCryptoAttempt();
    e2(seen.scope).toBe("shared");
    e2(seen.last?.ok).toBe(true);
    recordCryptoAttempt(false, new Error("timeout"), Date.parse("2026-10-19T00:01:00Z"));
    await flushCryptoAttempt(1000);
    e2(JSON.parse(body!).last.at).toBe("2026-10-19T00:05:00.000Z");
    registerDurableAttemptStore(null);
  });
});
