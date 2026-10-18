/**
 * Cent rounding from decimal text.
 * Quantity, price and FX are kept at 8 decimal places, then the NZ$ result
 * is rounded half away from zero to the cent. Binary floats are not used
 * for the product.
 */

const SCALE = 8;
const SCALE_DIV = BigInt(10) ** BigInt(SCALE);

export function parseDecimal(raw: string): bigint | null {
  let text = String(raw ?? "")
    .trim()
    .replace(/[$,\s]/g, "")
    .replace(/NZ\$|US\$|AU\$/gi, "")
    .replace(/NZD|USD|AUD/gi, "");
  if (!text || text === "-" || text === "—" || text === "–") return null;
  let neg = false;
  if (text.startsWith("(") && text.endsWith(")")) {
    neg = true;
    text = text.slice(1, -1);
  }
  if (text.startsWith("+")) text = text.slice(1);
  if (text.startsWith("-")) {
    neg = !neg;
    text = text.slice(1);
  }
  if (!/^\d+(\.\d+)?$/.test(text)) return null;
  const [whole, frac = ""] = text.split(".");
  const digits = (frac + "0".repeat(SCALE)).slice(0, SCALE);
  const rest = frac.slice(SCALE);
  let value = BigInt(whole) * SCALE_DIV + BigInt(digits || "0");
  if (rest.length > 0 && rest[0] >= "5") value += BigInt(1);
  return neg ? -value : value;
}

export function scaledToNumber(value: bigint): number {
  const neg = value < BigInt(0);
  let digits = (neg ? -value : value).toString();
  if (digits.length <= SCALE) digits = digits.padStart(SCALE + 1, "0");
  const whole = digits.slice(0, -SCALE) || "0";
  const frac = digits.slice(-SCALE).replace(/0+$/, "");
  const n = Number(frac ? `${whole}.${frac}` : whole);
  return neg ? -n : n;
}

/** Half away from zero, to the cent. `nativeCents` is already in cents. `fx` is scale 8. */
export function fxToCents(nativeCents: bigint, fx: bigint): bigint {
  const neg = (nativeCents < BigInt(0)) !== (fx < BigInt(0));
  const amount = nativeCents < BigInt(0) ? -nativeCents : nativeCents;
  const rate = fx < BigInt(0) ? -fx : fx;
  const product = amount * rate;
  const q = product / SCALE_DIV;
  const r = product % SCALE_DIV;
  const cents = r * BigInt(2) >= SCALE_DIV ? q + BigInt(1) : q;
  return neg ? -cents : cents;
}

/** Quantity times price, in cents of the trade currency. */
export function productCents(quantity: bigint, price: bigint): bigint {
  const neg = (quantity < BigInt(0)) !== (price < BigInt(0));
  const q = quantity < BigInt(0) ? -quantity : quantity;
  const p = price < BigInt(0) ? -price : price;
  const product = q * p;
  const div = BigInt(10) ** BigInt(14);
  const whole = product / div;
  const rest = product % div;
  const cents = rest * BigInt(2) >= div ? whole + BigInt(1) : whole;
  return neg ? -cents : cents;
}

export function centsToNumber(cents: bigint): number {
  const neg = cents < BigInt(0);
  const abs = (neg ? -cents : cents).toString().padStart(3, "0");
  const n = Number(`${abs.slice(0, -2)}.${abs.slice(-2)}`);
  return neg ? -n : n;
}

export function nzdOne(): bigint {
  return SCALE_DIV;
}

/** Scale-8 money to cents, half away from zero. */
export function toCents(scale8: bigint): bigint {
  const neg = scale8 < BigInt(0);
  const v = neg ? -scale8 : scale8;
  const div = BigInt(10) ** BigInt(6);
  const q = v / div;
  const r = v % div;
  const cents = r * BigInt(2) >= div ? q + BigInt(1) : q;
  return neg ? -cents : cents;
}

/**
 * NZ$ cash movement.
 * A buy is minus (quantity × price + fee), converted at NZD per 1 unit.
 * A sell is the proceeds after the fee. A sell whose fee exceeds the proceeds is 0.
 */
export function cashCents(input: {
  side: "buy" | "sell";
  quantity: bigint;
  price: bigint;
  fee: bigint;
  fx: bigint;
}): bigint {
  const gross = productCents(input.quantity < BigInt(0) ? -input.quantity : input.quantity, input.price < BigInt(0) ? -input.price : input.price);
  const fee = input.fee < BigInt(0) ? -input.fee : input.fee;
  const feeCents = toCents(fee);
  if (input.side === "buy") return -fxToCents(gross + feeCents, input.fx);
  const net = gross - feeCents;
  if (net <= BigInt(0)) return BigInt(0);
  return fxToCents(net, input.fx);
}
