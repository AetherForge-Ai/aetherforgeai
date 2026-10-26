/**
 * b69 REG-1 (TT b68 P2): one signed-in /tax load hung 30 s on a Cloudflare 520 for a
 * /_next/static chunk. The chunk was fine on retry. When a /_next/static script or a
 * webpack chunk fails, reload the page once (per path, per 60 s) so the user is not left
 * on a half-loaded page. A second failure inside the window is left alone (no reload loop).
 */
export const CHUNK_RETRY_WINDOW_MS = 60_000;
export const CHUNK_RETRY_KEY = "af-chunk-retry";

export const CHUNK_RETRY_SNIPPET = `(function(){try{var K=${JSON.stringify(CHUNK_RETRY_KEY)},W=${CHUNK_RETRY_WINDOW_MS};function retry(){try{var p=location.pathname,r=JSON.parse(sessionStorage.getItem(K)||"{}");if(r.p===p&&Date.now()-r.t<W)return;sessionStorage.setItem(K,JSON.stringify({p:p,t:Date.now()}));location.reload();}catch(e){}}window.addEventListener("error",function(e){var t=e&&e.target;if(t&&t.tagName==="SCRIPT"&&String(t.src||"").indexOf("/_next/static/")!==-1)retry();},true);window.addEventListener("unhandledrejection",function(e){var r=e&&e.reason;var n=r&&(r.name||"");var m=String(r&&r.message||"");if(n==="ChunkLoadError"||/Loading (CSS )?chunk [^ ]+ failed/.test(m))retry();});}catch(e){}})();`;
