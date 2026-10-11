"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import type { HelpArticle } from "@/lib/help-index";
import { searchHelp } from "@/lib/help-index";

export function HelpSearch({ articles }: { articles: HelpArticle[] }) {
  const [query, setQuery] = useState("");
  const matches = useMemo(() => searchHelp(query, articles), [articles, query]);

  return (
    <div>
      <label htmlFor="help-search" className="text-sm font-semibold">
        Search docs and questions
      </label>
      <input
        id="help-search"
        value={query}
        onChange={(event) => setQuery(event.target.value)}
        className="mt-2 w-full rounded-lg border border-border/70 bg-background px-3 py-2 text-sm"
        placeholder="Search"
      />
      <ul className="mt-6 space-y-3">
        {matches.length === 0 ? (
          <li className="text-sm text-muted-foreground">No matching note.</li>
        ) : (
          matches.map((article) => (
            <li key={`${article.href}-${article.title}`} className="rounded-2xl border border-border/70 px-4 py-3">
              <Link href={article.href} className="font-display text-base font-bold text-primary underline-offset-2 hover:underline">
                {article.title}
              </Link>
              <p className="mt-1 text-sm leading-relaxed text-muted-foreground">{article.body}</p>
            </li>
          ))
        )}
      </ul>
    </div>
  );
}
