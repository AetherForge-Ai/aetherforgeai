import type { ReactNode } from "react";
import Image from "next/image";
import Link from "next/link";
import { cn } from "@/lib/utils";
import { SiteHeader } from "@/components/SiteHeader";
import { DisclaimerNotice } from "@/components/legal/DisclaimerNotice";
import { BOT_EXAMPLES, BOT_GUIDE_PARAGRAPHS, BOT_PAGE_NOTES, BOT_PAGE_POSITIONING, type BotGuideKind } from "@/lib/bot-guides";

export function ExampleBook({ kind = "headmaster" }: { kind?: BotGuideKind }) {
  const example = BOT_EXAMPLES[kind];
  return (
    <section className="mt-10" aria-label="Example book">
      <h2 className="font-display text-2xl font-bold">Example book</h2>
      <p className="mt-3 text-sm leading-relaxed text-muted-foreground">
        Example. Not a member book. These rows are synthetic, so no market value and no profit are shown.
      </p>
      <table className="mt-4 w-full text-sm">
        <thead>
          <tr className="border-b border-border/60 text-left text-xs uppercase tracking-wide text-muted-foreground">
            <th scope="col" className="py-2 font-medium">Name</th>
            <th scope="col" className="py-2 font-medium">Quantity</th>
            <th scope="col" className="py-2 font-medium">Note</th>
          </tr>
        </thead>
        <tbody>
          {example.rows.map((row) => (
            <tr key={row.name} className="border-b border-border/40 last:border-0">
              <td className="py-2">{row.name}</td>
              <td className="py-2">{row.quantity}</td>
              <td className="py-2">{row.note}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <h3 className="mt-6 font-display text-lg font-semibold">Example report</h3>
      <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{example.report}</p>
    </section>
  );
}

export function BotGuide({
  title,
  lede,
  body,
  images,
  extra,
  kind,
  screenshots,
}: {
  title: string;
  lede: string;
  body: string;
  images: { src: string; alt: string }[];
  extra?: ReactNode;
  kind?: BotGuideKind;
  /** Goal b10 G-06: product screenshots (synthetic example data only). */
  screenshots?: { src: string; alt: string; caption: string; width: number; height: number }[];
}) {
  const allParagraphs: readonly string[] = kind ? BOT_GUIDE_PARAGRAPHS[kind] : body.split(/(?<=\.)\s+/);
  // b35 M-3 (GOAL-LOCK #10): each bot page repeated its lede as the first body paragraph
  // ("Stox is the share-market bot. …" twice). Drop the opening sentence of a first paragraph that repeats with the lede's
  // first sentence.
  const paragraphs = dropRepeatedLede(lede, allParagraphs);
  return (
    <div className="relative min-h-screen bg-grid">
      <div className="pointer-events-none absolute inset-0 bg-aurora" />
      <div className="relative">
        <SiteHeader />
        <article className="mx-auto max-w-3xl px-4 py-14 sm:px-6">
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-primary">AetherForge AI</p>
          <h1 className="mt-3 font-display text-4xl font-bold">{title}</h1>
          <p className="mt-4 text-lg leading-relaxed text-muted-foreground">{lede}</p>
          {/* b6 M-3: transparent cut-outs only. No mask, opacity or blend mode, so faces and hands render solid. */}
          <div className={cn("mt-8 grid gap-4", images.length > 1 ? "sm:grid-cols-2" : "mx-auto max-w-sm")}>
            {images.map((image) => (
              <Image key={image.src} src={image.src} alt={image.alt} width={512} height={512} className="h-auto w-full object-contain" />
            ))}
          </div>
          <div className="mt-8 space-y-4 text-sm leading-relaxed text-muted-foreground">
            {paragraphs.map((paragraph) => (
              <p key={paragraph.slice(0, 48)}>{paragraph}</p>
            ))}
          </div>
          {extra}
          <p className="mt-8 text-sm leading-relaxed text-muted-foreground">
            {kind ? `${BOT_PAGE_NOTES[kind]} ` : null}
            {BOT_PAGE_POSITIONING}{" "}
            <Link href="/how-it-works" className="font-medium text-primary underline-offset-2 hover:underline">
              How the paper book works
            </Link>
            .
          </p>
          {screenshots?.length ? (
            <section className="mt-10" aria-label="Screenshots">
              <h2 className="font-display text-2xl font-bold">Screenshots</h2>
              <div className="mt-4 grid gap-6">
                {screenshots.map((shot) => (
                  <figure key={shot.src}>
                    <Image src={shot.src} alt={shot.alt} width={shot.width} height={shot.height} className="h-auto w-full rounded-lg border border-border/60" />
                    <figcaption className="mt-2 text-xs text-muted-foreground">{shot.caption}</figcaption>
                  </figure>
                ))}
              </div>
            </section>
          ) : null}
          <ExampleBook kind={kind} />
          <p className="mt-4 text-sm">
            <Link href="/demo" className="font-semibold text-primary underline-offset-2 hover:underline">
              Open the read-only example book
            </Link>
          </p>
          <p className="mt-8 text-sm">
            <Link href="/how-it-works" className="font-semibold text-primary underline-offset-2 hover:underline">
              How it works
            </Link>
          </p>
          <DisclaimerNotice variant="full" className="mt-10" />
        </article>
      </div>
    </div>
  );
}

/** b35 M-3: the body never repeats the lede's opening sentence. */
export function dropRepeatedLede(lede: string, paragraphs: readonly string[]): readonly string[] {
  const first = (t: string) => (t.split(/(?<=\.)\s+/)[0] || "").trim().toLowerCase();
  const opening = first(lede).replace(/\s+for the paper book\.$/, ".");
  const a = opening.replace(/\.$/, "");
  const b = paragraphs.length ? first(paragraphs[0]).replace(/\.$/, "") : "";
  if (!b || !(a.startsWith(b) || b.startsWith(a))) return paragraphs;
  const rest = paragraphs[0].split(/(?<=\.)\s+/).slice(1).join(" ").trim();
  return rest ? [rest, ...paragraphs.slice(1)] : paragraphs.slice(1);
}
