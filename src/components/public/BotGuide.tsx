import Image from "next/image";
import Link from "next/link";
import { SiteHeader } from "@/components/SiteHeader";
import { DisclaimerNotice } from "@/components/legal/DisclaimerNotice";

export function ExampleBook() {
  return (
    <section className="mt-10" aria-label="Example book">
      <h2 className="font-display text-2xl font-bold">Example book</h2>
      <p className="mt-3 text-sm leading-relaxed text-muted-foreground">
        Example. Not a member book. These rows are synthetic. This page does not look up a price, so no market value
        and no profit are shown.
      </p>
      <table className="mt-4 w-full text-sm">
        <thead>
          <tr className="border-b border-border/60 text-left text-xs uppercase tracking-wide text-muted-foreground">
            <th className="py-2 font-medium">Name</th>
            <th className="py-2 font-medium">Quantity</th>
            <th className="py-2 font-medium">Note</th>
          </tr>
        </thead>
        <tbody>
          <tr className="border-b border-border/40">
            <td className="py-2">EXAMPLE.NZ</td>
            <td className="py-2">10</td>
            <td className="py-2">Example only</td>
          </tr>
          <tr>
            <td className="py-2">EXAMPLE-COIN</td>
            <td className="py-2">1</td>
            <td className="py-2">Example only</td>
          </tr>
        </tbody>
      </table>
      <h3 className="mt-6 font-display text-lg font-semibold">Example report</h3>
      <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
        Example report. This is not a member result. The note says a paper row named EXAMPLE.NZ is on the book. It does
        not say whether to buy or sell. No profit figure is included.
      </p>
    </section>
  );
}

export function BotGuide({
  title,
  lede,
  body,
  images,
}: {
  title: string;
  lede: string;
  body: string;
  images: { src: string; alt: string }[];
}) {
  return (
    <div className="relative min-h-screen bg-grid">
      <div className="pointer-events-none absolute inset-0 bg-aurora" />
      <div className="relative">
        <SiteHeader />
        <article className="mx-auto max-w-3xl px-4 py-14 sm:px-6">
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-primary">AetherForge AI</p>
          <h1 className="mt-3 font-display text-4xl font-bold">{title}</h1>
          <p className="mt-4 text-lg leading-relaxed text-muted-foreground">{lede}</p>
          <div className="mt-8 grid gap-4 sm:grid-cols-2">
            {images.map((image) => (
              <Image key={image.src} src={image.src} alt={image.alt} width={512} height={512} className="h-auto w-full rounded-2xl border border-border/70" />
            ))}
          </div>
          <div className="mt-8 space-y-4 text-sm leading-relaxed text-muted-foreground">
            {body.split(/(?<=\.)\s+/).map((sentence) => (
              <p key={sentence.slice(0, 48)}>{sentence}</p>
            ))}
          </div>
          <ExampleBook />
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
