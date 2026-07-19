"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import {
  ArrowRight,
  ShieldCheck,
  MapPin,
  HandCoins,
  HeartHandshake,
  Mail,
  Phone,
  Menu,
  X,
  Sparkles,
  Send,
  CheckCircle2,
  Facebook,
  Quote,
} from "lucide-react";
import { api } from "@/lib/api";
import { LOGO_MARK_IMG, ABOUT_HERO_IMG, FOUNDER_PORTRAIT_IMG } from "../../../assets/files";

/** Official X (Twitter) mark — lucide dropped brand icons. */
function XLogo({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden className={className}>
      <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-4.714-6.231-5.401 6.231H2.744l7.727-8.835L1.254 2.25H8.08l4.253 5.622L18.244 2.25zm-1.161 17.52h1.833L7.084 4.126H5.117L17.083 19.77z" />
    </svg>
  );
}

/* -------------------------------------------------------------------------- */
/*  Brand palette (self-contained light theme for this marketing page)        */
/*  navy #0F172A · emerald #059669 · off-white #F8FAFC · bronze/gold #B0894F  */
/* -------------------------------------------------------------------------- */

const NAV_LINKS: { label: string; href: string; anchor?: boolean }[] = [
  { label: "Home", href: "/" },
  { label: "About", href: "#top", anchor: true },
  { label: "How It Works", href: "/how-it-works" },
  { label: "Contact", href: "#contact", anchor: true },
];

const STORY: { text: string; pull?: boolean }[] = [
  {
    text: "I was born and raised right here in New Zealand, on a farm in the North Island. I left school at 15 and worked hard in various labouring roles through my early twenties before training as a butcher and travelling around the country.",
  },
  {
    text: "Traditional jobs never quite felt right for me. In my free time I poured my energy into tinkering with computers — software, hardware, anything I could get my hands on. There was no grand plan; I was simply fascinated by how things worked.",
  },
  {
    text: "When AI started becoming accessible to everyone, I had an idea. What if I could build my own AI tool to keep an eye on the New Zealand and Australian stock markets? I began with a simple bot designed to monitor the NZX and ASX and alert on news that could move the markets.",
  },
  {
    text: "After fine-tuning it through several experimental phases and rigorously checking its accuracy, I realised the true power of what I had created. I spent weeks strengthening the system, making it as robust and dependable as possible.",
  },
  {
    text: "I looked at what else was available. Plenty of AI tools want to take over your trading decisions completely. That wasn't my vision at all.",
  },
  { pull: true, text: "I want you to stay in control." },
  {
    text: "My goal is to give you the same high-quality insights and cause-and-effect analysis that professional traders use — but you make every decision. You add your portfolio, set your alerts and stop levels, and execute your own trades. The satisfaction of watching your wealth grow because of your own informed choices is something no automated system can ever give you.",
  },
  {
    text: "After searching extensively, I discovered there was nothing quite like this available in New Zealand — nothing built specifically for our local markets with this empowering philosophy.",
  },
  {
    text: "So I built AetherForge AI for my fellow New Zealanders. To stand beside you, offering clear guidance and support so we can all move forward together.",
  },
  {
    pull: true,
    text: "I'm not here to take a cut of your success. I genuinely want to see everyday Kiwis do well.",
  },
  {
    text: "It's time we, the 95% who hold just 5% of the wealth, had access to tools that help us break into that top tier. This is my answer to that.",
  },
  {
    text: "It is with real pride and honour that I launch AetherForge AI — created in New Zealand, for New Zealanders, owned and operated 100% by New Zealanders.",
  },
];

const PILLARS = [
  {
    icon: ShieldCheck,
    title: "We don't trade for you — we empower you",
    desc: "You stay in complete control. We surface professional-grade insight and cause-and-effect analysis; every buy, sell, alert and stop level is your call.",
  },
  {
    icon: MapPin,
    title: "Built specifically for NZX & ASX",
    desc: "Not a generic global screener. AetherForge AI is tuned from the ground up for New Zealand and Australian markets — the ones that matter to you.",
  },
  {
    icon: HandCoins,
    title: "No profit share, ever. Completely transparent",
    desc: "We never take a cut of your gains. What you earn is entirely yours. Clear, honest and straightforward — the way it should be.",
  },
  {
    icon: HeartHandshake,
    title: "A genuine desire to see everyday Kiwis succeed",
    desc: "This was built by one of you, for all of us — to stand beside everyday New Zealanders and help us move forward together.",
  },
];

/* -------------------------------------------------------------------------- */
/*  Reveal — subtle on-scroll fade / rise, respects reduced-motion            */
/* -------------------------------------------------------------------------- */

function Reveal({
  children,
  delay = 0,
  className = "",
}: {
  children: React.ReactNode;
  delay?: number;
  className?: string;
}) {
  const ref = useRef<HTMLDivElement | null>(null);
  const [shown, setShown] = useState(false);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const io = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            setShown(true);
            io.disconnect();
          }
        });
      },
      { threshold: 0.15, rootMargin: "0px 0px -60px 0px" }
    );
    io.observe(el);
    return () => io.disconnect();
  }, []);

  return (
    <div
      ref={ref}
      style={{ transitionDelay: `${delay}ms` }}
      className={[
        "transition-all duration-700 ease-out motion-reduce:transition-none",
        shown ? "translate-y-0 opacity-100" : "translate-y-6 opacity-0",
        className,
      ].join(" ")}
    >
      {children}
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/*  Contact form                                                              */
/* -------------------------------------------------------------------------- */

function ContactForm() {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [message, setMessage] = useState("");
  const [status, setStatus] = useState<"idle" | "sending" | "success" | "error">("idle");
  const [error, setError] = useState("");

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");

    if (!name.trim() || !email.trim() || !message.trim()) {
      setError("Please fill in your name, email and message.");
      setStatus("error");
      return;
    }

    setStatus("sending");
    console.log("[about/contact] Submitting message from", email);
    const res = await api.post<{ _id?: string }>("/api/contact", {
      name: name.trim(),
      email: email.trim(),
      message: message.trim(),
    });

    if (res.ok) {
      console.log("[about/contact] Message sent successfully");
      setStatus("success");
      setName("");
      setEmail("");
      setMessage("");
    } else {
      const msg =
        typeof res.error === "string" ? res.error : "Something went wrong. Please try again.";
      console.error("[about/contact] Submit failed:", res.error);
      setError(msg);
      setStatus("error");
    }
  }

  if (status === "success") {
    return (
      <div className="flex h-full min-h-[22rem] flex-col items-center justify-center rounded-3xl border border-[#059669]/20 bg-white p-10 text-center shadow-xl shadow-[#0F172A]/5">
        <div className="grid size-16 place-items-center rounded-full bg-[#059669]/10">
          <CheckCircle2 className="size-9 text-[#059669]" />
        </div>
        <h3 className="mt-6 font-display text-2xl font-bold text-[#0F172A]">Message sent — thank you!</h3>
        <p className="mt-3 max-w-sm text-[15px] leading-relaxed text-[#475569]">
          We really appreciate you reaching out. We&apos;ll be in touch as soon as we can — we read every
          single message personally.
        </p>
        <button
          type="button"
          onClick={() => setStatus("idle")}
          className="mt-7 inline-flex items-center gap-2 rounded-full border border-[#0F172A]/15 px-5 py-2.5 text-sm font-semibold text-[#0F172A] transition-colors hover:bg-[#F8FAFC]"
        >
          Send another message
        </button>
      </div>
    );
  }

  const inputBase =
    "w-full rounded-xl border border-[#0F172A]/12 bg-[#F8FAFC] px-4 py-3 text-[15px] text-[#0F172A] placeholder:text-[#94A3B8] outline-none transition-all focus:border-[#059669] focus:bg-white focus:ring-4 focus:ring-[#059669]/12";

  return (
    <form
      onSubmit={handleSubmit}
      className="rounded-3xl border border-[#0F172A]/8 bg-white p-6 shadow-xl shadow-[#0F172A]/5 sm:p-8"
    >
      <h3 className="font-display text-xl font-bold text-[#0F172A]">Send us a message</h3>
      <p className="mt-1.5 text-sm text-[#64748B]">We&apos;d genuinely love to hear from you.</p>

      <div className="mt-6 space-y-4">
        <div>
          <label htmlFor="cf-name" className="mb-1.5 block text-sm font-semibold text-[#334155]">
            Name
          </label>
          <input
            id="cf-name"
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Your name"
            autoComplete="name"
            className={inputBase}
          />
        </div>
        <div>
          <label htmlFor="cf-email" className="mb-1.5 block text-sm font-semibold text-[#334155]">
            Email
          </label>
          <input
            id="cf-email"
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="you@example.com"
            autoComplete="email"
            className={inputBase}
          />
        </div>
        <div>
          <label htmlFor="cf-message" className="mb-1.5 block text-sm font-semibold text-[#334155]">
            Message
          </label>
          <textarea
            id="cf-message"
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            placeholder="How can we help you on your wealth-building journey?"
            rows={5}
            className={`${inputBase} resize-none`}
          />
        </div>
      </div>

      {status === "error" && error && (
        <p className="mt-4 rounded-lg bg-red-50 px-4 py-2.5 text-sm font-medium text-red-700">{error}</p>
      )}

      <button
        type="submit"
        disabled={status === "sending"}
        className="mt-6 inline-flex w-full items-center justify-center gap-2 rounded-xl bg-[#059669] px-6 py-3.5 text-[15px] font-semibold text-white shadow-lg shadow-[#059669]/25 transition-all hover:bg-[#047857] hover:shadow-xl hover:shadow-[#059669]/30 disabled:cursor-not-allowed disabled:opacity-70"
      >
        {status === "sending" ? (
          <>
            <span className="size-4 animate-spin rounded-full border-2 border-white/40 border-t-white" />
            Sending…
          </>
        ) : (
          <>
            Send Message <Send className="size-4" />
          </>
        )}
      </button>
    </form>
  );
}

/* -------------------------------------------------------------------------- */
/*  Page                                                                      */
/* -------------------------------------------------------------------------- */

export function AboutContent() {
  const [menuOpen, setMenuOpen] = useState(false);
  const [scrolled, setScrolled] = useState(false);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 12);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  function scrollToId(id: string) {
    const el = document.getElementById(id);
    if (!el) {
      window.scrollTo({ top: 0, behavior: "smooth" });
      return;
    }
    const top = el.getBoundingClientRect().top + window.scrollY - 84;
    window.scrollTo({ top, behavior: "smooth" });
  }

  function handleNav(e: React.MouseEvent, href: string, anchor?: boolean) {
    if (anchor) {
      e.preventDefault();
      setMenuOpen(false);
      scrollToId(href.replace("#", ""));
    }
  }

  return (
    <div id="top" className="min-h-screen scroll-smooth bg-[#F8FAFC] font-sans text-[#0F172A]">
      {/* ─────────────────────────  NAV  ───────────────────────── */}
      <header
        className={[
          "fixed inset-x-0 top-0 z-50 transition-all duration-300",
          scrolled
            ? "border-b border-[#0F172A]/8 bg-white/85 backdrop-blur-xl shadow-sm"
            : "border-b border-transparent bg-transparent",
        ].join(" ")}
      >
        <div className="mx-auto flex h-[68px] max-w-7xl items-center justify-between px-4 sm:px-6 lg:px-8">
          <Link href="/" className="flex items-center gap-2.5">
            <span
              className={[
                "grid size-9 place-items-center rounded-xl p-1 ring-1 transition-colors",
                scrolled ? "bg-[#0F172A] ring-[#0F172A]/10" : "bg-white/15 ring-white/25 backdrop-blur",
              ].join(" ")}
            >
              <img src={LOGO_MARK_IMG} alt="AetherForge AI" className="h-full w-full object-contain" />
            </span>
            <span
              className={[
                "font-display text-[1.05rem] font-bold tracking-tight transition-colors",
                scrolled ? "text-[#0F172A]" : "text-white",
              ].join(" ")}
            >
              AetherForge<span className="text-[#059669]"> AI</span>
            </span>
          </Link>

          <nav className="hidden items-center gap-8 md:flex">
            {NAV_LINKS.map((l) =>
              l.anchor ? (
                <a
                  key={l.label}
                  href={l.href}
                  onClick={(e) => handleNav(e, l.href, true)}
                  className={[
                    "text-sm font-medium transition-colors",
                    scrolled ? "text-[#475569] hover:text-[#059669]" : "text-white/85 hover:text-white",
                  ].join(" ")}
                >
                  {l.label}
                </a>
              ) : (
                <Link
                  key={l.label}
                  href={l.href}
                  className={[
                    "text-sm font-medium transition-colors",
                    scrolled ? "text-[#475569] hover:text-[#059669]" : "text-white/85 hover:text-white",
                  ].join(" ")}
                >
                  {l.label}
                </Link>
              )
            )}
          </nav>

          <div className="flex items-center gap-2">
            <Link
              href="/register"
              className="hidden items-center gap-1.5 rounded-full bg-[#059669] px-5 py-2.5 text-sm font-semibold text-white shadow-lg shadow-[#059669]/25 transition-all hover:bg-[#047857] hover:shadow-xl hover:shadow-[#059669]/30 sm:inline-flex"
            >
              Try the AI <ArrowRight className="size-4" />
            </Link>
            <button
              type="button"
              aria-label="Toggle menu"
              onClick={() => setMenuOpen((v) => !v)}
              className={[
                "grid size-10 place-items-center rounded-lg transition-colors md:hidden",
                scrolled ? "text-[#0F172A] hover:bg-[#0F172A]/5" : "text-white hover:bg-white/10",
              ].join(" ")}
            >
              {menuOpen ? <X className="size-6" /> : <Menu className="size-6" />}
            </button>
          </div>
        </div>

        {/* Mobile menu */}
        {menuOpen && (
          <div className="border-t border-[#0F172A]/8 bg-white px-4 py-4 shadow-lg md:hidden">
            <nav className="flex flex-col gap-1">
              {NAV_LINKS.map((l) =>
                l.anchor ? (
                  <a
                    key={l.label}
                    href={l.href}
                    onClick={(e) => handleNav(e, l.href, true)}
                    className="rounded-lg px-3 py-2.5 text-[15px] font-medium text-[#334155] transition-colors hover:bg-[#F8FAFC] hover:text-[#059669]"
                  >
                    {l.label}
                  </a>
                ) : (
                  <Link
                    key={l.label}
                    href={l.href}
                    onClick={() => setMenuOpen(false)}
                    className="rounded-lg px-3 py-2.5 text-[15px] font-medium text-[#334155] transition-colors hover:bg-[#F8FAFC] hover:text-[#059669]"
                  >
                    {l.label}
                  </Link>
                )
              )}
              <Link
                href="/register"
                onClick={() => setMenuOpen(false)}
                className="mt-2 inline-flex items-center justify-center gap-1.5 rounded-full bg-[#059669] px-5 py-3 text-sm font-semibold text-white"
              >
                Try the AI <ArrowRight className="size-4" />
              </Link>
            </nav>
          </div>
        )}
      </header>

      {/* ─────────────────────────  HERO  ───────────────────────── */}
      <section className="relative isolate overflow-hidden">
        {/* Background image */}
        <img
          src={ABOUT_HERO_IMG}
          alt="Serene New Zealand rural landscape at golden hour"
          className="absolute inset-0 -z-20 h-full w-full object-cover"
        />
        {/* Navy cinematic gradient + emerald glow overlays */}
        <div
          className="absolute inset-0 -z-10"
          style={{
            background:
              "linear-gradient(180deg, rgba(15,23,42,0.72) 0%, rgba(15,23,42,0.82) 55%, rgba(15,23,42,0.95) 100%)",
          }}
        />
        <div
          className="pointer-events-none absolute -right-24 top-10 -z-10 size-[32rem] rounded-full opacity-40 blur-3xl"
          style={{ background: "radial-gradient(circle, rgba(5,150,105,0.55), transparent 65%)" }}
        />
        {/* Soft digital grid, echoing the "abstract interface" brief */}
        <div
          className="pointer-events-none absolute inset-0 -z-10 opacity-[0.12]"
          style={{
            backgroundImage:
              "linear-gradient(rgba(255,255,255,0.6) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.6) 1px, transparent 1px)",
            backgroundSize: "48px 48px",
            maskImage: "radial-gradient(ellipse 80% 60% at 70% 30%, black, transparent 75%)",
            WebkitMaskImage: "radial-gradient(ellipse 80% 60% at 70% 30%, black, transparent 75%)",
          }}
        />

        <div className="mx-auto flex min-h-[92vh] max-w-7xl flex-col justify-center px-4 pb-20 pt-32 sm:px-6 lg:px-8">
          <Reveal>
            <span className="inline-flex items-center gap-2 rounded-full border border-white/20 bg-white/10 px-4 py-1.5 text-xs font-semibold tracking-wide text-white backdrop-blur">
              <span className="size-1.5 rounded-full bg-[#059669] shadow-[0_0_10px_2px_rgba(5,150,105,0.7)]" />
              100% NZ Owned &amp; Operated
              <span className="text-white/40">•</span>
              <span style={{ color: "#D9B27C" }}>Freshly Launched 2026</span>
            </span>
          </Reveal>

          <Reveal delay={90}>
            <h1 className="mt-6 max-w-4xl font-display text-4xl font-extrabold leading-[1.05] tracking-tight text-white sm:text-5xl lg:text-6xl">
              About{" "}
              <span className="relative whitespace-nowrap">
                <span style={{ color: "#34D399" }}>AetherForge AI</span>
              </span>
            </h1>
          </Reveal>

          <Reveal delay={160}>
            <p className="mt-6 max-w-2xl text-lg leading-relaxed text-white/85 sm:text-xl">
              Built in New Zealand, for New Zealanders. Powerful AI market intelligence that keeps you in
              complete control of every decision.
            </p>
          </Reveal>

          <Reveal delay={230}>
            <div className="mt-9 flex flex-col gap-3 sm:flex-row">
              <button
                type="button"
                onClick={() => scrollToId("who")}
                className="inline-flex items-center justify-center gap-2 rounded-full bg-[#059669] px-7 py-3.5 text-base font-semibold text-white shadow-xl shadow-[#059669]/30 transition-all hover:bg-[#047857] hover:shadow-2xl hover:shadow-[#059669]/40"
              >
                See How It Works <ArrowRight className="size-5" />
              </button>
              <button
                type="button"
                onClick={() => scrollToId("contact")}
                className="inline-flex items-center justify-center gap-2 rounded-full border border-white/25 bg-white/5 px-7 py-3.5 text-base font-semibold text-white backdrop-blur transition-all hover:border-white/50 hover:bg-white/10"
              >
                Get in Touch
              </button>
            </div>
          </Reveal>
        </div>

        {/* Bottom fade into the page */}
        <div className="pointer-events-none absolute inset-x-0 bottom-0 h-24 bg-gradient-to-b from-transparent to-[#F8FAFC]" />
      </section>

      {/* ─────────────────────────  WHO WE ARE  ───────────────────────── */}
      <section id="who" className="scroll-mt-24 bg-[#F8FAFC] py-20 sm:py-28">
        <div className="mx-auto max-w-4xl px-4 text-center sm:px-6 lg:px-8">
          <Reveal>
            <p className="text-sm font-bold uppercase tracking-[0.2em] text-[#059669]">Who We Are</p>
            <h2 className="mt-4 font-display text-3xl font-bold tracking-tight text-[#0F172A] sm:text-4xl">
              Intelligent insight, made in New Zealand
            </h2>
          </Reveal>
          <Reveal delay={100}>
            <p className="mx-auto mt-7 max-w-3xl text-lg leading-relaxed text-[#475569]">
              AetherForge AI operates under <strong className="font-semibold text-[#0F172A]">Forge
              Intelligence Limited</strong> — a proudly 100% New Zealand-owned and operated company that has
              only just been made available to the public. We are focused exclusively on the{" "}
              <strong className="font-semibold text-[#0F172A]">NZX and ASX markets</strong>, delivering
              intelligent, reliable insights designed specifically to help everyday New Zealanders build
              wealth while staying fully in control of their own trading decisions.
            </p>
          </Reveal>

          <Reveal delay={160}>
            <div className="mx-auto mt-10 flex max-w-2xl flex-wrap items-center justify-center gap-3">
              {[
                { icon: MapPin, label: "NZX & ASX focused" },
                { icon: ShieldCheck, label: "You stay in control" },
                { icon: Sparkles, label: "AI-powered insight" },
              ].map((chip) => (
                <span
                  key={chip.label}
                  className="inline-flex items-center gap-2 rounded-full border border-[#0F172A]/10 bg-white px-4 py-2 text-sm font-semibold text-[#334155] shadow-sm"
                >
                  <chip.icon className="size-4 text-[#059669]" />
                  {chip.label}
                </span>
              ))}
            </div>
          </Reveal>
        </div>
      </section>

      {/* ─────────────────────────  OUR STORY  ───────────────────────── */}
      <section id="story" className="scroll-mt-24 bg-white py-20 sm:py-28">
        <div className="mx-auto max-w-6xl px-4 sm:px-6 lg:px-8">
          <div className="grid gap-12 lg:grid-cols-[minmax(0,1fr)_20rem] lg:gap-16">
            {/* Narrative */}
            <div className="order-2 lg:order-1">
              <Reveal>
                <p className="text-sm font-bold uppercase tracking-[0.2em] text-[#059669]">Our Story</p>
                <h2 className="mt-4 font-display text-3xl font-bold tracking-tight text-[#0F172A] sm:text-4xl">
                  A note from our founder
                </h2>
                <div className="mt-6 h-1 w-16 rounded-full" style={{ backgroundColor: "#B0894F" }} />
              </Reveal>

              <div className="mt-9 space-y-6">
                {STORY.map((p, i) =>
                  p.pull ? (
                    <Reveal key={i} delay={40}>
                      <blockquote
                        className="relative my-2 rounded-2xl border-l-4 bg-[#F8FAFC] py-6 pl-7 pr-6"
                        style={{ borderColor: "#059669" }}
                      >
                        <Quote className="absolute -top-3 left-5 size-7 rotate-180 text-[#059669]/25" />
                        <p className="font-display text-xl font-semibold leading-snug text-[#0F172A] sm:text-2xl">
                          “{p.text}”
                        </p>
                      </blockquote>
                    </Reveal>
                  ) : (
                    <Reveal key={i} delay={20}>
                      <p className="text-[17px] leading-relaxed text-[#334155]">{p.text}</p>
                    </Reveal>
                  )
                )}
              </div>

              <Reveal delay={40}>
                <div className="mt-9 flex items-center gap-3">
                  <div className="h-px flex-1" style={{ backgroundColor: "rgba(15,23,42,0.1)" }} />
                  <span className="font-display text-sm font-semibold italic text-[#64748B]">
                    — The founder, AetherForge AI
                  </span>
                </div>
              </Reveal>
            </div>

            {/* Portrait */}
            <div className="order-1 lg:order-2">
              <Reveal>
                <div className="lg:sticky lg:top-28">
                  <div className="relative overflow-hidden rounded-3xl shadow-2xl shadow-[#0F172A]/15">
                    <img
                      src={FOUNDER_PORTRAIT_IMG}
                      alt="AetherForge AI founder — an approachable New Zealander"
                      className="aspect-[4/5] w-full object-cover"
                    />
                    <div
                      className="absolute inset-0"
                      style={{
                        background:
                          "linear-gradient(180deg, transparent 45%, rgba(15,23,42,0.72) 100%)",
                      }}
                    />
                    <div className="absolute inset-x-0 bottom-0 p-5">
                      <p className="font-display text-base font-bold text-white">Founder &amp; Builder</p>
                      <p className="mt-0.5 text-sm text-white/80">Forge Intelligence Limited</p>
                    </div>
                    <span
                      className="absolute right-4 top-4 inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-bold text-white"
                      style={{ backgroundColor: "rgba(5,150,105,0.92)" }}
                    >
                      <MapPin className="size-3.5" /> North Island, NZ
                    </span>
                  </div>
                </div>
              </Reveal>
            </div>
          </div>
        </div>
      </section>

      {/* ─────────────────────────  WHY AETHERFORGE  ───────────────────────── */}
      <section id="why" className="scroll-mt-24 bg-[#0F172A] py-20 sm:py-28">
        <div className="mx-auto max-w-6xl px-4 sm:px-6 lg:px-8">
          <div className="mx-auto max-w-2xl text-center">
            <Reveal>
              <p className="text-sm font-bold uppercase tracking-[0.2em]" style={{ color: "#34D399" }}>
                Why AetherForge AI?
              </p>
              <h2 className="mt-4 font-display text-3xl font-bold tracking-tight text-white sm:text-4xl">
                A different kind of market intelligence
              </h2>
              <p className="mt-5 text-lg leading-relaxed text-white/70">
                Most tools want to take the wheel. We hand it back to you — with the clarity to drive
                confidently.
              </p>
            </Reveal>
          </div>

          <div className="mt-14 grid gap-5 sm:grid-cols-2">
            {PILLARS.map((p, i) => (
              <Reveal key={p.title} delay={i * 80}>
                <div className="group h-full rounded-2xl border border-white/10 bg-white/[0.04] p-7 transition-all duration-300 hover:-translate-y-1 hover:border-[#059669]/40 hover:bg-white/[0.06]">
                  <div
                    className="grid size-12 place-items-center rounded-xl transition-transform duration-300 group-hover:scale-110"
                    style={{ backgroundColor: "rgba(5,150,105,0.14)" }}
                  >
                    <p.icon className="size-6" style={{ color: "#34D399" }} />
                  </div>
                  <h3 className="mt-5 font-display text-lg font-bold text-white">{p.title}</h3>
                  <p className="mt-2.5 text-[15px] leading-relaxed text-white/65">{p.desc}</p>
                </div>
              </Reveal>
            ))}
          </div>

          {/* 95 / 5 vision */}
          <Reveal delay={120}>
            <div
              className="relative mt-12 overflow-hidden rounded-3xl p-8 text-center sm:p-14"
              style={{
                background:
                  "linear-gradient(135deg, rgba(5,150,105,0.18) 0%, rgba(15,23,42,0.2) 60%), rgba(255,255,255,0.03)",
                border: "1px solid rgba(5,150,105,0.3)",
              }}
            >
              <div
                className="pointer-events-none absolute -left-16 -top-16 size-64 rounded-full opacity-40 blur-3xl"
                style={{ background: "radial-gradient(circle, rgba(5,150,105,0.5), transparent 70%)" }}
              />
              <div className="relative">
                <div className="flex items-end justify-center gap-3">
                  <span className="font-display text-6xl font-extrabold text-white sm:text-7xl">95%</span>
                  <span className="pb-2 text-lg font-medium text-white/60">of us</span>
                </div>
                <p className="mx-auto mt-5 max-w-2xl font-display text-xl font-semibold leading-snug text-white sm:text-2xl">
                  hold just <span style={{ color: "#34D399" }}>5%</span> of the wealth. It&apos;s time we had
                  the tools to break into that top tier.
                </p>
                <p className="mx-auto mt-4 max-w-xl text-[15px] leading-relaxed text-white/60">
                  AetherForge AI is our answer to that — professional-grade insight placed in the hands of
                  everyday Kiwis, so your success stays entirely your own.
                </p>
              </div>
            </div>
          </Reveal>
        </div>
      </section>

      {/* ─────────────────────────  CONTACT  ───────────────────────── */}
      <section id="contact" className="scroll-mt-24 bg-[#F8FAFC] py-20 sm:py-28">
        <div className="mx-auto max-w-6xl px-4 sm:px-6 lg:px-8">
          <div className="mx-auto max-w-2xl text-center">
            <Reveal>
              <p className="text-sm font-bold uppercase tracking-[0.2em] text-[#059669]">Let&apos;s Connect</p>
              <h2 className="mt-4 font-display text-3xl font-bold tracking-tight text-[#0F172A] sm:text-4xl">
                We&apos;re here to support you
              </h2>
              <p className="mt-5 text-lg leading-relaxed text-[#475569]">
                We&apos;re here to support you on your wealth-building journey. Reach out anytime — we&apos;d
                love to hear from you.
              </p>
            </Reveal>
          </div>

          <div className="mt-14 grid gap-8 lg:grid-cols-2">
            {/* Left — details */}
            <div className="space-y-4">
              <Reveal>
                <div className="rounded-3xl border border-[#0F172A]/8 bg-white p-6 shadow-sm sm:p-8">
                  <h3 className="font-display text-lg font-bold text-[#0F172A]">Email us</h3>
                  <div className="mt-4 space-y-3">
                    <a
                      href="mailto:lukas@aetherforgeai.co.nz"
                      className="group flex items-center gap-3 rounded-xl border border-[#0F172A]/8 bg-[#F8FAFC] px-4 py-3.5 transition-all hover:border-[#059669]/40 hover:bg-white"
                    >
                      <span className="grid size-10 place-items-center rounded-lg bg-[#059669]/10 text-[#059669]">
                        <Mail className="size-5" />
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="block text-[11px] font-bold uppercase tracking-[0.14em] text-[#059669]">
                          Enquiries &amp; sign-up
                        </span>
                        <span className="block truncate text-[15px] font-semibold text-[#0F172A]">
                          lukas@aetherforgeai.co.nz
                        </span>
                      </span>
                      <ArrowRight className="size-4 text-[#94A3B8] transition-transform group-hover:translate-x-0.5 group-hover:text-[#059669]" />
                    </a>
                    <a
                      href="mailto:admin@aetherforgeai.co.nz"
                      className="group flex items-center gap-3 rounded-xl border border-[#0F172A]/8 bg-[#F8FAFC] px-4 py-3.5 transition-all hover:border-[#059669]/40 hover:bg-white"
                    >
                      <span className="grid size-10 place-items-center rounded-lg bg-[#059669]/10 text-[#059669]">
                        <Mail className="size-5" />
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="block text-[11px] font-bold uppercase tracking-[0.14em] text-[#94A3B8]">
                          Accounts &amp; support
                        </span>
                        <span className="block truncate text-[15px] font-semibold text-[#0F172A]">
                          admin@aetherforgeai.co.nz
                        </span>
                      </span>
                      <ArrowRight className="size-4 text-[#94A3B8] transition-transform group-hover:translate-x-0.5 group-hover:text-[#059669]" />
                    </a>
                  </div>
                </div>
              </Reveal>

              <Reveal delay={40}>
                <div className="rounded-3xl border border-[#0F172A]/8 bg-white p-6 shadow-sm sm:p-8">
                  <h3 className="font-display text-lg font-bold text-[#0F172A]">Call us — free</h3>
                  <a
                    href="tel:0800238437"
                    className="group mt-4 flex items-center gap-3 rounded-xl border border-[#0F172A]/8 bg-[#F8FAFC] px-4 py-3.5 transition-all hover:border-[#059669]/40 hover:bg-white"
                  >
                    <span className="grid size-10 place-items-center rounded-lg bg-[#059669]/10 text-[#059669]">
                      <Phone className="size-5" />
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block text-[15px] font-bold text-[#0F172A]">0800 AETHER</span>
                      <span className="block text-sm font-semibold tracking-wide text-[#475569]">
                        0800 238 437
                      </span>
                    </span>
                    <ArrowRight className="size-4 text-[#94A3B8] transition-transform group-hover:translate-x-0.5 group-hover:text-[#059669]" />
                  </a>
                  <p
                    className="mt-4 flex items-start gap-2 rounded-xl px-4 py-3 text-sm leading-relaxed"
                    style={{ backgroundColor: "rgba(5,150,105,0.08)", color: "#0F5132" }}
                  >
                    <Sparkles className="mt-0.5 size-4 shrink-0" />
                    <span>
                      Our freephone line is <strong className="font-semibold">up and running now</strong> —
                      call us free from anywhere in New Zealand. We&apos;d love to hear from you.
                    </span>
                  </p>
                </div>
              </Reveal>

              <Reveal delay={80}>
                <div className="rounded-3xl border border-[#0F172A]/8 bg-white p-6 shadow-sm sm:p-8">
                  <h3 className="font-display text-lg font-bold text-[#0F172A]">Follow along</h3>
                  <div className="mt-4 flex flex-col gap-3">
                    <a
                      href="https://x.com/aetherforgeAi_"
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-3 rounded-xl border border-[#0F172A]/8 bg-[#F8FAFC] px-4 py-3 transition-all hover:border-[#059669]/40 hover:bg-white"
                    >
                      <span className="grid size-10 place-items-center rounded-lg bg-[#0F172A] text-white">
                        <XLogo className="size-5" />
                      </span>
                      <span className="text-[15px] font-semibold text-[#0F172A]">@aetherforgeAi_ on X</span>
                    </a>
                    <a
                      href="https://www.facebook.com/profile.php?id=61591701002008"
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-3 rounded-xl border border-[#0F172A]/8 bg-[#F8FAFC] px-4 py-3 transition-all hover:border-[#059669]/40 hover:bg-white"
                    >
                      <span className="grid size-10 place-items-center rounded-lg bg-[#0F172A] text-white">
                        <Facebook className="size-5" />
                      </span>
                      <span className="text-[15px] font-semibold text-[#0F172A]">Our Facebook page</span>
                    </a>
                  </div>
                  <p className="mt-4 text-sm leading-relaxed text-[#64748B]">
                    Follow us on X and Facebook for market updates, product news and what we&apos;re building next.
                  </p>
                  <p className="mt-3 flex items-start gap-2 text-sm leading-relaxed text-[#64748B]">
                    <MapPin className="mt-0.5 size-4 shrink-0 text-[#94A3B8]" />
                    Physical/postal address to be added shortly.
                  </p>
                </div>
              </Reveal>
            </div>

            {/* Right — form */}
            <Reveal delay={120}>
              <ContactForm />
            </Reveal>
          </div>
        </div>
      </section>

      {/* ─────────────────────────  FOOTER  ───────────────────────── */}
      <footer className="bg-[#0F172A] py-14">
        <div className="mx-auto max-w-6xl px-4 sm:px-6 lg:px-8">
          <div className="flex flex-col items-center gap-8 text-center sm:flex-row sm:items-start sm:justify-between sm:text-left">
            <div className="max-w-sm">
              <Link href="/" className="inline-flex items-center gap-2.5">
                <span className="grid size-9 place-items-center rounded-xl bg-white/10 p-1 ring-1 ring-white/15">
                  <img src={LOGO_MARK_IMG} alt="AetherForge AI" className="h-full w-full object-contain" />
                </span>
                <span className="font-display text-[1.05rem] font-bold tracking-tight text-white">
                  AetherForge<span style={{ color: "#34D399" }}> AI</span>
                </span>
              </Link>
              <p className="mt-4 text-sm leading-relaxed text-white/60">
                AetherForge AI — Helping New Zealanders take control of their financial future.
              </p>
              <a
                href="https://x.com/aetherforgeAi_"
                target="_blank"
                rel="noopener noreferrer"
                aria-label="AetherForge AI on X"
                className="mt-4 inline-flex items-center gap-2 rounded-lg border border-white/15 bg-white/5 px-3 py-1.5 text-sm font-medium text-white/80 transition-colors hover:border-white/30 hover:text-white"
              >
                <XLogo className="size-3.5" />
                @aetherforgeAi_
              </a>
            </div>

            <nav className="grid grid-cols-2 gap-x-10 gap-y-2.5 text-sm">
              <Link href="/" className="text-white/70 transition-colors hover:text-white">
                Home
              </Link>
              <Link href="/how-it-works" className="text-white/70 transition-colors hover:text-white">
                How It Works
              </Link>
              <Link href="/pricing" className="text-white/70 transition-colors hover:text-white">
                Pricing
              </Link>
              <a
                href="#contact"
                onClick={(e) => handleNav(e, "#contact", true)}
                className="text-white/70 transition-colors hover:text-white"
              >
                Contact
              </a>
              <Link href="/privacy-policy" className="text-white/70 transition-colors hover:text-white">
                Privacy
              </Link>
              <Link href="/terms-of-service" className="text-white/70 transition-colors hover:text-white">
                Terms
              </Link>
            </nav>
          </div>

          <div className="mt-10 border-t border-white/10 pt-6 text-center">
            <p className="text-xs leading-relaxed text-white/50">
              © 2026 Forge Intelligence Limited. All rights reserved.
            </p>
          </div>
        </div>
      </footer>
    </div>
  );
}
