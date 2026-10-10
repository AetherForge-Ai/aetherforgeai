import { notFound } from "next/navigation";

/** Internal rewrite target. Middleware sends unknown paths here so Next can render the 404. */
export default function MissingPage() {
  notFound();
}
