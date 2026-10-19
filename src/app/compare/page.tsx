import { permanentRedirect } from "next/navigation";
import { COMPARISONS } from "@/data/learn-content";

/** b46 P3 (TT b45): bare /compare was a 404. b47: a 308 (permanent) to the first comparison page. */
export default function CompareIndex() {
  const first = COMPARISONS[0];
  permanentRedirect(first ? `/compare/${first.slug}` : "/learn");
}
