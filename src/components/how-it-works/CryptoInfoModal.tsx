"use client";

/**
 * "What is cryptocurrency?" educational popup for the How It Works page.
 *
 * A well-sized, scrollable, readable modal that explains — in plain English —
 * what cryptocurrency is, how it came to have value, and the core concepts a
 * newcomer needs (blockchain, wallets, keys, supply, decentralisation).
 *
 * Purely educational. Nothing here is financial advice.
 */

import { useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import {
  Bitcoin,
  BookOpen,
  Boxes,
  KeyRound,
  Wallet,
  Globe,
  Gauge,
  ShieldQuestion,
} from "lucide-react";

const CONCEPTS: { icon: React.ElementType; term: string; def: string }[] = [
  {
    icon: Boxes,
    term: "Blockchain",
    def: "A shared digital ledger copied across thousands of computers worldwide. Every transaction is grouped into a “block” and permanently chained to the last, so the record can't be quietly altered by any single party.",
  },
  {
    icon: Globe,
    term: "Decentralisation",
    def: "No bank, company or government runs the network. Instead, a global community of participants validate transactions by consensus — which is why the system keeps running 24/7 with no central off-switch.",
  },
  {
    icon: Wallet,
    term: "Wallet",
    def: "Software (or a hardware device) that stores your access to coins. It doesn't hold the coins themselves — those live on the blockchain — it holds the keys that prove the coins are yours.",
  },
  {
    icon: KeyRound,
    term: "Private key",
    def: "A secret code that authorises spending from your wallet. Whoever holds the private key controls the funds — which is why “not your keys, not your coins” is the golden rule of self-custody.",
  },
  {
    icon: Gauge,
    term: "Supply & scarcity",
    def: "Many coins have a capped or predictable supply written into their code. Bitcoin, for example, will only ever have 21 million coins — a built-in scarcity that underpins its “digital gold” narrative.",
  },
  {
    icon: ShieldQuestion,
    term: "Volatility",
    def: "Crypto prices can move sharply in both directions. That potential for reward comes with real risk — position sizes should reflect what you can genuinely afford to hold through a downturn.",
  },
];

export function CryptoInfoModal({
  triggerLabel = "What is cryptocurrency?",
  className,
}: {
  triggerLabel?: string;
  className?: string;
}) {
  const [open, setOpen] = useState(false);

  return (
    <>
      <Button
        variant="outline"
        onClick={() => setOpen(true)}
        className={className}
      >
        <BookOpen className="mr-1.5 size-4" /> {triggerLabel}
      </Button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-h-[88vh] w-full overflow-y-auto border-border/70 bg-card/95 backdrop-blur-xl sm:max-w-2xl">
          <DialogHeader>
            <div className="mb-1 flex size-12 items-center justify-center rounded-2xl border border-amber-500/30 bg-gradient-to-br from-amber-500/20 to-transparent">
              <Bitcoin className="size-6 text-amber-400" />
            </div>
            <DialogTitle className="font-display text-2xl font-bold">
              Cryptocurrency, explained simply
            </DialogTitle>
            <DialogDescription className="text-sm leading-relaxed">
              A plain-English primer on what crypto is, how it came to have value, and the core
              ideas behind it. Educational only — never financial advice.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-6 pt-2">
            {/* What it is */}
            <section>
              <h4 className="font-display text-base font-bold text-foreground">What it actually is</h4>
              <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
                Cryptocurrency is digital money that exists purely as entries on a shared, tamper-resistant
                ledger called a <span className="font-medium text-foreground">blockchain</span>. Unlike the
                dollars in your bank account — which a single institution tracks — a cryptocurrency&apos;s
                record is maintained simultaneously by thousands of independent computers around the world.
                That design means it can be sent person-to-person, anywhere, at any hour, without needing a
                bank to approve or process it.
              </p>
            </section>

            {/* How it became valuable */}
            <section>
              <h4 className="font-display text-base font-bold text-foreground">How it came to have value</h4>
              <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
                Bitcoin launched in 2009, just after the global financial crisis, as an experiment in money
                that no central authority could inflate or freeze. Value grew gradually and for familiar
                reasons: it is <span className="font-medium text-foreground">genuinely scarce</span> (a fixed
                21-million-coin cap), <span className="font-medium text-foreground">verifiably authentic</span>{" "}
                (impossible to counterfeit), and <span className="font-medium text-foreground">useful</span>{" "}
                (borderless, censorship-resistant transfer). As more people, businesses and eventually large
                institutions agreed it was worth holding and accepting, that shared belief — the same force
                that gives gold or any currency its worth — translated into a market price. Thousands of other
                projects followed, many adding programmable features like smart contracts (Ethereum) that
                power lending, trading and digital ownership.
              </p>
            </section>

            {/* Core concepts grid */}
            <section>
              <h4 className="font-display text-base font-bold text-foreground">The core concepts</h4>
              <div className="mt-3 grid gap-3 sm:grid-cols-2">
                {CONCEPTS.map((c) => (
                  <div
                    key={c.term}
                    className="rounded-2xl border border-border/60 bg-background/40 p-4"
                  >
                    <div className="flex items-center gap-2.5">
                      <span className="grid size-8 shrink-0 place-items-center rounded-lg bg-primary/12 text-primary">
                        <c.icon className="size-4" />
                      </span>
                      <p className="font-semibold text-foreground">{c.term}</p>
                    </div>
                    <p className="mt-2 text-[13px] leading-relaxed text-muted-foreground">{c.def}</p>
                  </div>
                ))}
              </div>
            </section>

            {/* Where AetherForge fits */}
            <section className="rounded-2xl border border-primary/25 bg-primary/[0.06] p-4">
              <p className="text-sm leading-relaxed text-muted-foreground">
                <span className="font-semibold text-foreground">Where AetherForge fits in:</span> you buy and
                custody crypto on your own exchange or wallet. AetherForge never touches your coins — our{" "}
                <span className="font-medium text-foreground">Koins</span> bot simply analyses the market and
                your holdings, then hands you clear, plain-English guidance.
              </p>
            </section>

            <p className="text-xs leading-relaxed text-muted-foreground/80">
              Digital assets are volatile and can lose value. This information is general and educational only,
              and is not financial advice under the Financial Markets Conduct Act 2013.
            </p>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
