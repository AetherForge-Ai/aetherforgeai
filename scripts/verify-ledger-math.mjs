/**
 * Pure math mirror of src/lib/transactions.ts buy/sell/deposit/withdraw
 * (no Totalum) — proves cash + holdings stay consistent.
 */
function round(n, decimals = 2) {
  const f = 10 ** decimals;
  return Math.round((n + Number.EPSILON) * f) / f;
}

function step(label, state) {
  console.log("\n=== " + label + " ===");
  console.log(
    JSON.stringify(
      {
        cashNZD: state.cash,
        shares: state.shares,
        avgCost: state.avgCost,
        marketPrice: state.marketPrice,
        holdingsValue: round(state.shares * state.marketPrice),
        netWorth: round(state.cash + state.shares * state.marketPrice),
        realizedTotal: state.realized,
        lastTxn: state.lastTxn,
      },
      null,
      2
    )
  );
}

function assert(cond, msg) {
  if (!cond) throw new Error("ASSERT: " + msg);
  console.log("OK:", msg);
}

const state = {
  cash: 0,
  shares: 0,
  avgCost: 0,
  marketPrice: 0,
  realized: 0,
  lastTxn: null,
};

// 1) Deposit NZ$10,000
{
  const amount = 10000;
  state.cash = round(state.cash + amount);
  state.lastTxn = { type: "deposit", total: amount };
  step("1. Deposit NZ$10,000", state);
  assert(state.cash === 10000, "cash = 10000 after deposit");
  assert(state.shares === 0, "no holdings yet");
}

// 2) Buy 100 shares @ $50, fees $10  (NZD ticker for simplicity)
{
  const qty = 100;
  const price = 50;
  const fees = 10;
  const cost = qty * price + fees; // 5010
  assert(state.cash + 1e-9 >= cost, "enough cash for buy");
  const newShares = state.shares + qty;
  const newAvg =
    newShares > 0
      ? (state.shares * state.avgCost + qty * price + fees) / newShares
      : price;
  state.cash = round(state.cash - cost);
  state.shares = round(newShares, 6);
  state.avgCost = round(newAvg, 6);
  state.marketPrice = 50; // mark at buy for a moment
  state.lastTxn = { type: "buy", qty, price, fees, total: -cost };
  step("2. Buy 100 @ $50 + $10 fees", state);
  assert(state.cash === 4990, "cash 10000 - 5010 = 4990");
  assert(state.shares === 100, "shares = 100");
  assert(Math.abs(state.avgCost - 50.1) < 1e-6, "avg cost = (5000+10)/100 = 50.10");
  assert(round(state.cash + state.shares * state.marketPrice) === 9990, "NW at cost before mark move = 4990+5000=9990 (fees burned)");
}

// 3) Market rises to $60 — dashboard "Value in Stocks" marks to market
{
  state.marketPrice = 60;
  step("3. Mark to market $60 (dashboard value box)", state);
  assert(round(state.shares * state.marketPrice) === 6000, "stock value box = 6000");
  assert(round(state.cash + state.shares * state.marketPrice) === 10990, "net worth = 4990+6000=10990");
  // Note: cash still 4990 — unrealized gain is NOT cash until sold
  assert(state.cash === 4990, "unrealized gain does not change cash");
}

// 4) Sell 40 @ $60, fees $5
{
  const qty = 40;
  const price = 60;
  const fees = 5;
  assert(qty <= state.shares + 1e-9, "cannot oversell");
  const proceeds = qty * price - fees; // 2395
  const realized = qty * (price - state.avgCost) - fees; // 40*(60-50.1)-5 = 391
  state.cash = round(state.cash + proceeds);
  state.shares = round(state.shares - qty, 6);
  state.realized = round(state.realized + realized);
  state.lastTxn = { type: "sell", qty, price, fees, total: proceeds, realized };
  step("4. Sell 40 @ $60 - $5 fees", state);
  assert(state.cash === 7385, "cash 4990 + 2395 = 7385");
  assert(state.shares === 60, "shares left = 60");
  assert(Math.abs(state.realized - 391) < 0.01, "realized ≈ 40*(60-50.1)-5 = 391");
  assert(round(state.shares * state.marketPrice) === 3600, "remaining stock value = 3600");
  assert(round(state.cash + state.shares * state.marketPrice) === 10985, "NW 7385+3600=10985 (another $5 fee burned)");
}

// 5) Identity check: cash movements sum
{
  const deposits = 10000;
  const buyCashOut = 5010;
  const sellCashIn = 2395;
  const expectedCash = round(deposits - buyCashOut + sellCashIn);
  assert(state.cash === expectedCash, "cash == sum of ledger cash legs (" + expectedCash + ")");
}

// 6) Withdraw 1000
{
  const amount = 1000;
  assert(amount <= state.cash + 1e-9, "enough cash to withdraw");
  state.cash = round(state.cash - amount);
  state.lastTxn = { type: "withdraw", total: -amount };
  step("5. Withdraw NZ$1,000", state);
  assert(state.cash === 6385, "cash after withdraw = 6385");
}

console.log("\nALL CHECKS PASSED — deposit → buy → mark → sell → withdraw is consistent.");
console.log("Dashboard mapping:");
console.log("  Cash Bal box          = cash");
console.log("  Value in Stocks box   = shares * live market price");
console.log("  Total net worth       = cash + holdings market value");
console.log("  Transactions ledger   = each deposit/buy/sell/withdraw row");
