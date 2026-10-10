/**
 * Forecast behaviour stays off until the owner turns it on.
 *
 * FORECAST_LAYER changes what a Stox or Koins report shows: calibrated wording,
 * a no-edge line, a short why, and the liquidity screen.
 * FORECAST_LOG appends to the public log. It records a forecast only when the
 * layer is also on, so the log matches the report.
 * Crypto projections stay paused in projection-pause.ts. FORECAST_LAYER does
 * not turn them on.
 */

function flagOn(name: string): boolean {
  const raw = (process.env[name] || "").trim().toLowerCase();
  return raw === "on" || raw === "1" || raw === "true";
}

export function forecastLayerEnabled(): boolean {
  return flagOn("FORECAST_LAYER");
}

export function forecastLogEnabled(): boolean {
  return flagOn("FORECAST_LOG") && forecastLayerEnabled();
}
