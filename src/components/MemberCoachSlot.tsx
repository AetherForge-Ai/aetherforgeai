"use client";

import dynamic from "next/dynamic";
import { useDocumentSessionMode } from "@/components/DocumentSession";

const MemberCoach = dynamic(
  () => import("@/components/portfolio-coach/PortfolioCoach").then((mod) => mod.PortfolioCoach),
  { ssr: false },
);

/** M-1: guest pages do not download the signed-in assistant. */
export function MemberCoachSlot() {
  const mode = useDocumentSessionMode();
  if (mode !== "member") return null;
  return <MemberCoach />;
}
