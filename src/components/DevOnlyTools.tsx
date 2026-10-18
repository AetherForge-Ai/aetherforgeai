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
  if (process.env.NODE_ENV === "production") return null;
  return (
    <>
      <ScriptExecutor />
      <DevToolsHandler />
    </>
  );
}
