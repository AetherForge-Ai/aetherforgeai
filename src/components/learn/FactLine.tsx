import { formatDisplayDate } from "@/lib/currency";
import { CHECKED_ON, type Fact } from "@/data/learn-content";

/** One sourced fact: the source link and the date it was checked, or "—" with the reason. */
export function FactLine({ fact }: { fact: Fact }) {
  if (!fact.source) {
    return (
      <span>
        {fact.text === "—" ? "—" : fact.text}{" "}
        <span className="block text-xs text-muted-foreground">Source: — ({fact.missingReason ?? "not sourced"}).</span>
      </span>
    );
  }
  const external = fact.source.url.startsWith("http");
  return (
    <span>
      {fact.text}
      <span className="block text-xs text-muted-foreground">
        Source:{" "}
        <a href={fact.source.url} className="underline underline-offset-2 hover:text-primary" {...(external ? { rel: "noopener noreferrer nofollow", target: "_blank" } : {})}>
          {fact.source.title}
        </a>
        {fact.source.published ? ` · published ${formatDisplayDate(fact.source.published)}` : ""} · checked {formatDisplayDate(CHECKED_ON)}
      </span>
    </span>
  );
}
