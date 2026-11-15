/**
 * HOOKS-PROD-OFF. Hooks are fail-closed.
 *
 * On only when the runtime value is exactly "1" and this build is not a
 * production release marker. Missing, "true", "yes", "0", and a "1" that
 * arrived baked into a release build are off.
 *
 * Live b99 (main 178954f0) reported edge=true and runtime=true with no
 * GOAL_TEST_HOOK* secret. OpenNext copies build-time .env files into the
 * Worker with `process.env[key] ??= ...` (see @opennextjs/cloudflare
 * templates/init.js) and defaults the mode to production. A GitHub preview
 * has no .env file, so it stays false. A release build must stay off even
 * if that bake left the string "1".
 */

/** Same text as public/build-version.txt. Do not bump it here. */
export const BUILD_RELEASE_ID = "v3-b102-2026-11-15";

const RELEASE_MARKER = /^v3-b\d+-20\d\d-\d\d-\d\d$/;

export function isProductionRelease(marker: string = BUILD_RELEASE_ID): boolean {
  return RELEASE_MARKER.test(marker.trim());
}

export function goalTestHooksOn(
  env: Record<string, string | undefined> = process.env,
  marker: string = env === process.env ? BUILD_RELEASE_ID : "",
): boolean {
  const nodeEnv = env === process.env ? process.env.NODE_ENV : env.NODE_ENV;
  if (nodeEnv === "production" && isProductionRelease(marker)) return false;
  return env.GOAL_TEST_HOOKS === "1";
}
