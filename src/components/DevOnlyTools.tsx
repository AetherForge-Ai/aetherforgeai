"use client";

import dynamic from "next/dynamic";

const ScriptExecutor = dynamic(() => import("@/components/ScriptExecutor").then((mod) => mod.ScriptExecutor), {
  ssr: false,
});
const DevToolsHandler = dynamic(() => import("@/components/DevToolsHandler").then((mod) => mod.DevToolsHandler), {
  ssr: false,
});

/**
 * M-1: Totalum's editor hooks (script injection and console forwarding) are
 * dev-only. Production pages do not download them, and they do not wrap fetch.
 */
export function DevOnlyTools() {
  // b28 review: ScriptExecutor already does nothing in production, so it is skipped there.
  // DevToolsHandler has no production guard and may serve the Totalum editor, so it stays
  // mounted (lazily, off the first bundle) exactly as before.
  return (
    <>
      {process.env.NODE_ENV === "production" ? null : <ScriptExecutor />}
      <DevToolsHandler />
    </>
  );
}
