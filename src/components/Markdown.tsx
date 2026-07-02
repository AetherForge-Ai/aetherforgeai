import { Fragment, ReactNode } from "react";

/**
 * Minimal, dependency-free Markdown renderer tailored to the AI output we
 * produce (headings, bold, bullet/numbered lists, paragraphs, horizontal rules).
 * Intentionally small — not a general-purpose Markdown engine.
 */

function renderInline(text: string, keyBase: string): ReactNode[] {
  const nodes: ReactNode[] = [];
  // Split on **bold** and `code`
  const regex = /(\*\*[^*]+\*\*|`[^`]+`)/g;
  const parts = text.split(regex);
  parts.forEach((part, i) => {
    if (!part) return;
    if (part.startsWith("**") && part.endsWith("**")) {
      nodes.push(
        <strong key={`${keyBase}-b-${i}`} className="font-semibold text-foreground">
          {part.slice(2, -2)}
        </strong>
      );
    } else if (part.startsWith("`") && part.endsWith("`")) {
      nodes.push(
        <code
          key={`${keyBase}-c-${i}`}
          className="rounded bg-muted px-1.5 py-0.5 font-mono text-[0.85em] text-primary"
        >
          {part.slice(1, -1)}
        </code>
      );
    } else {
      nodes.push(<Fragment key={`${keyBase}-t-${i}`}>{part}</Fragment>);
    }
  });
  return nodes;
}

export function Markdown({ content, className }: { content: string; className?: string }) {
  const lines = (content || "").split("\n");
  const blocks: ReactNode[] = [];
  let listBuffer: { ordered: boolean; items: string[] } | null = null;

  const flushList = (key: string) => {
    if (!listBuffer) return;
    const { ordered, items } = listBuffer;
    const ListTag = ordered ? "ol" : "ul";
    blocks.push(
      <ListTag
        key={key}
        className={ordered ? "my-3 list-decimal space-y-1.5 pl-5" : "my-3 list-disc space-y-1.5 pl-5"}
      >
        {items.map((it, i) => (
          <li key={i} className="text-sm leading-relaxed text-muted-foreground marker:text-primary">
            {renderInline(it, `${key}-li-${i}`)}
          </li>
        ))}
      </ListTag>
    );
    listBuffer = null;
  };

  lines.forEach((raw, idx) => {
    const line = raw.trimEnd();
    const key = `blk-${idx}`;

    if (!line.trim()) {
      flushList(key);
      return;
    }

    const bullet = line.match(/^\s*[-*]\s+(.*)$/);
    const ordered = line.match(/^\s*\d+\.\s+(.*)$/);
    if (bullet) {
      if (listBuffer && listBuffer.ordered) flushList(key);
      listBuffer = listBuffer && !listBuffer.ordered ? listBuffer : { ordered: false, items: [] };
      listBuffer.items.push(bullet[1]);
      return;
    }
    if (ordered) {
      if (listBuffer && !listBuffer.ordered) flushList(key);
      listBuffer = listBuffer && listBuffer.ordered ? listBuffer : { ordered: true, items: [] };
      listBuffer.items.push(ordered[1]);
      return;
    }

    flushList(key);

    if (/^###\s+/.test(line)) {
      blocks.push(
        <h4 key={key} className="mt-5 mb-1.5 font-display text-sm font-semibold uppercase tracking-wide text-primary">
          {renderInline(line.replace(/^###\s+/, ""), key)}
        </h4>
      );
    } else if (/^##\s+/.test(line)) {
      blocks.push(
        <h3 key={key} className="mt-6 mb-2 font-display text-lg font-bold text-foreground">
          {renderInline(line.replace(/^##\s+/, ""), key)}
        </h3>
      );
    } else if (/^#\s+/.test(line)) {
      blocks.push(
        <h2 key={key} className="mt-6 mb-2 font-display text-xl font-bold text-foreground">
          {renderInline(line.replace(/^#\s+/, ""), key)}
        </h2>
      );
    } else if (/^(-{3,}|_{3,}|\*{3,})$/.test(line.trim())) {
      blocks.push(<hr key={key} className="my-4 border-border/60" />);
    } else {
      blocks.push(
        <p key={key} className="my-2.5 text-sm leading-relaxed text-muted-foreground">
          {renderInline(line, key)}
        </p>
      );
    }
  });

  flushList("final");

  return <div className={className}>{blocks}</div>;
}
