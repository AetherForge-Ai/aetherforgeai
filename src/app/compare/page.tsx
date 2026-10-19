import { redirect } from "next/navigation";
import { COMPARISONS } from "@/data/learn-content";

/** b46 P3 (TT b45): bare /compare was a 404. It goes to the first comparison page. */
export default function CompareIndex() {
  const first = COMPARISONS[0];
  redirect(first ? `/compare/${first.slug}` : "/learn");
}
