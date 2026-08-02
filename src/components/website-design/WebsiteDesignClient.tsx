"use client";

import { useEffect, useRef, useState } from "react";
import { WEBSITE_DESIGN_LIVE_SHOT } from "../../../assets/files";
import { formatUsdApprox } from "@/lib/currency";
import { useFxRates } from "@/hooks/useFxRates";
import { api } from "@/lib/api";
import {
  ArrowRight,
  ArrowUpRight,
  Check,
  Sparkles,
  Layout,
  Bot,
  Code2,
  ShieldCheck,
  LayoutDashboard,
  Layers,
  MessageSquare,
  Users,
  Gauge,
  Search,
  Smartphone,
  PenTool,
  Rocket,
  Menu,
  X,
  Mail,
  ExternalLink,
  Facebook,
  Linkedin,
  Loader2,
  UploadCloud,
  CheckCircle2,
  Paperclip,
  Send,
} from "lucide-react";

/* -------------------------------------------------------------------------- */
/*  Data                                                                       */
/* -------------------------------------------------------------------------- */

const LIVE_SITE_URL = "https://www.aetherforgeai.co.nz";

const CONTACT = {
  email: "admin@aetherforgeai.co.nz",
  facebook: "https://www.facebook.com/profile.php?id=61591701002008",
  x: "https://x.com/aetherforgeAi_",
  linkedin: "https://www.linkedin.com/in/aether-forge-ai-27659b423/",
};

type Capability = {
  icon: React.ComponentType<{ className?: string }>;
  title: string;
  body: string;
};

const CAPABILITIES: Capability[] = [
  {
    icon: Layout,
    title: "Professional website design",
    body: "Beautifully composed, fully responsive websites — considered typography, generous space and a refined finish that makes a business look genuinely world-class.",
  },
  {
    icon: Bot,
    title: "Custom Python AI bots",
    body: "Bespoke AI assistants and automation, built in Python and woven directly into your site. Available on request and tailored precisely to how your business works.",
  },
  {
    icon: Code2,
    title: "Advanced coding, anything possible",
    body: "Portals, dashboards, live data, integrations, bespoke tooling — advanced engineering that turns an ambitious brief into a site that simply works.",
  },
];

type PackageTier = {
  key: "standard" | "premium" | "ultimate";
  name: string;
  tagline: string;
  priceNzd: number;
  /** Optional glyph shown right after the figure, e.g. "+" for "from" pricing. */
  priceSuffix?: string;
  priceNote: string;
  paymentLink: string;
  ctaLabel: string;
  featured?: boolean;
  ribbon?: string;
  features: { icon: React.ComponentType<{ className?: string }>; label: string }[];
};

const PACKAGES: PackageTier[] = [
  {
    key: "standard",
    name: "Standard Professional",
    tagline: "A clean, polished company website that earns instant trust.",
    priceNzd: 2500,
    priceNote: "one-time · complete build",
    paymentLink: "https://buy.stripe.com/9B66oB3EjfEr61Vg5V1440r",
    ctaLabel: "Begin the Standard build",
    features: [
      { icon: Layout, label: "Multi-page site — Home, About Us, Expertise, Contact" },
      { icon: Smartphone, label: "Fully responsive across every device" },
      { icon: Gauge, label: "Fast-loading, performance-tuned pages" },
      { icon: Search, label: "SEO-ready foundation, built in from day one" },
      { icon: PenTool, label: "Refined, on-brand visual design" },
    ],
  },
  {
    key: "premium",
    name: "Premium Business",
    tagline: "Everything polished, plus a private, members-only experience.",
    priceNzd: 4500,
    priceNote: "one-time · complete build",
    paymentLink: "https://buy.stripe.com/5kQfZb8YD0Jx4XR1b11440s",
    ctaLabel: "Begin the Premium build",
    featured: true,
    ribbon: "Most popular",
    features: [
      { icon: Check, label: "Everything in Standard Professional" },
      { icon: ShieldCheck, label: "Secure customer login portal" },
      { icon: Users, label: "Members-only area for your clients" },
      { icon: LayoutDashboard, label: "Clean, intuitive dashboard experience" },
    ],
  },
  {
    key: "ultimate",
    name: "Ultimate Custom",
    tagline: "A fully bespoke build — no limits, tailored entirely to your brief.",
    priceNzd: 8000,
    priceSuffix: "+",
    priceNote: "starting price · fully bespoke",
    paymentLink: "https://buy.stripe.com/14A9ANeiXgIvbmff1R1440t",
    ctaLabel: "Commission an Ultimate build",
    ribbon: "Bespoke",
    features: [
      { icon: Layers, label: "Multiple, elegantly interconnected pages" },
      { icon: Layout, label: "Expandable preview windows that open pages in-place" },
      { icon: Bot, label: "Integrated AI chatbot, tuned to your business" },
      { icon: Users, label: "Dual portals — Customer login & Staff login" },
      { icon: Code2, label: "Advanced, fully custom functionality" },
      { icon: Sparkles, label: "Anything else your brief requires" },
    ],
  },
];

const PROCESS = [
  {
    icon: MessageSquare,
    step: "01",
    title: "Discover",
    body: "We talk through your goals, audience and the impression you want to make. Every build starts with clarity.",
  },
  {
    icon: PenTool,
    step: "02",
    title: "Design",
    body: "A considered visual direction — typography, colour and layout crafted to feel unmistakably yours.",
  },
  {
    icon: Code2,
    step: "03",
    title: "Build",
    body: "Clean, fast, modern code. Portals, AI and integrations engineered to work flawlessly.",
  },
  {
    icon: Rocket,
    step: "04",
    title: "Launch",
    body: "Polished, tested and published — with the same care you can see on my own live site.",
  },
];

/* -------------------------------------------------------------------------- */
/*  Enquiry form options (values MUST match the Totalum table option values)   */
/* -------------------------------------------------------------------------- */

const PACKAGE_OPTIONS: { value: string; label: string }[] = [
  { value: "standard_professional", label: "Standard Professional" },
  { value: "premium_business", label: "Premium Business (includes Customer Login Portal)" },
  { value: "ultimate_custom", label: "Ultimate Custom (fully tailored + AI + dual portals)" },
  { value: "not_sure", label: "Not sure yet — please advise" },
];

const STYLE_OPTIONS: { value: string; label: string }[] = [
  { value: "executive_minimal", label: "Executive Minimal" },
  { value: "modern_professional", label: "Modern Professional" },
  { value: "warm_elegant", label: "Warm Elegant" },
  { value: "bold_creative", label: "Bold Creative" },
  { value: "luxury_dark_mode", label: "Luxury Dark Mode" },
  { value: "clean_tech_saas", label: "Clean Tech / SaaS" },
  { value: "portfolio_agency", label: "Portfolio / Agency Showcase" },
  { value: "ecommerce_focused", label: "E-commerce Focused" },
  { value: "custom_other", label: "Custom / Other (please describe)" },
];

const FEATURE_OPTIONS: { value: string; label: string }[] = [
  { value: "ai_chatbot", label: "AI Chatbot" },
  { value: "customer_login_portal", label: "Customer Login Portal" },
  { value: "staff_login_portal", label: "Staff Login Portal" },
  { value: "online_booking", label: "Online Booking / Appointments" },
  { value: "ecommerce_payments", label: "E-commerce / Payments" },
  { value: "blog_news", label: "Blog / News Section" },
  { value: "other", label: "Other (please specify)" },
];

const BUDGET_OPTIONS: { value: string; label: string }[] = [
  { value: "under_1500", label: "Under $1,500" },
  { value: "1500_3000", label: "$1,500 – $3,000" },
  { value: "3000_6000", label: "$3,000 – $6,000" },
  { value: "6000_plus", label: "$6,000+" },
  { value: "prefer_discuss", label: "Prefer to discuss" },
];

const MAX_FILE_BYTES = 8 * 1024 * 1024; // 8MB per file
const MAX_FILES = 6;

type EnquiryState = {
  full_name: string;
  email: string;
  phone: string;
  company_name: string;
  website_purpose: string;
  interested_package: string;
  design_styles: string[];
  custom_style_note: string;
  required_features: string[];
  other_feature_note: string;
  budget_range: string;
  timeline: string;
  additional_notes: string;
};

const EMPTY_ENQUIRY: EnquiryState = {
  full_name: "",
  email: "",
  phone: "",
  company_name: "",
  website_purpose: "",
  interested_package: "",
  design_styles: [],
  custom_style_note: "",
  required_features: [],
  other_feature_note: "",
  budget_range: "",
  timeline: "",
  additional_notes: "",
};

/** Read a File into raw base64 (no data-URL prefix) for JSON transport. */
function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = String(reader.result || "");
      const comma = result.indexOf(",");
      resolve(comma >= 0 ? result.slice(comma + 1) : result);
    };
    reader.onerror = () => reject(reader.error || new Error("Could not read file"));
    reader.readAsDataURL(file);
  });
}

/* -------------------------------------------------------------------------- */
/*  Shared field primitives — keep the warm identity consistent                */
/* -------------------------------------------------------------------------- */

const LABEL_CLASS =
  "mb-2 block text-sm font-medium tracking-wide text-[#4A4237]";
const FIELD_CLASS =
  "w-full rounded-xl border border-[#E0D2BB] bg-[#FFFDF9] px-4 py-3 text-[15px] text-[#2B2724] placeholder:text-[#B0A48F] outline-none transition-colors focus:border-[#9A7B44] focus:ring-2 focus:ring-[#C8A96A]/30";

function RequiredMark() {
  return <span className="text-[#C57B57]"> *</span>;
}

/* -------------------------------------------------------------------------- */
/*  Enquiry form                                                               */
/* -------------------------------------------------------------------------- */

function EnquiryForm() {
  const [form, setForm] = useState<EnquiryState>(EMPTY_ENQUIRY);
  const [files, setFiles] = useState<File[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const set = <K extends keyof EnquiryState>(key: K, value: EnquiryState[K]) =>
    setForm((f) => ({ ...f, [key]: value }));

  const toggleInArray = (key: "design_styles" | "required_features", value: string) =>
    setForm((f) => {
      const arr = f[key];
      return {
        ...f,
        [key]: arr.includes(value) ? arr.filter((v) => v !== value) : [...arr, value],
      };
    });

  const onPickFiles = (list: FileList | null) => {
    if (!list) return;
    setError(null);
    const incoming = Array.from(list);
    const merged = [...files];
    for (const file of incoming) {
      if (file.size > MAX_FILE_BYTES) {
        setError(`"${file.name}" is larger than 8MB. Please attach a smaller file.`);
        continue;
      }
      if (merged.length >= MAX_FILES) {
        setError(`You can attach up to ${MAX_FILES} files.`);
        break;
      }
      if (!merged.some((f) => f.name === file.name && f.size === file.size)) {
        merged.push(file);
      }
    }
    setFiles(merged);
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  const removeFile = (idx: number) => setFiles((prev) => prev.filter((_, i) => i !== idx));

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    // Client-side validation of the three required fields.
    if (!form.full_name.trim()) return setError("Please enter your full name.");
    if (!form.email.trim() || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email.trim()))
      return setError("Please enter a valid email address.");
    if (!form.interested_package)
      return setError("Please choose the package you're most interested in.");

    setSubmitting(true);
    console.log("[EnquiryForm] Submitting enquiry…", { package: form.interested_package, files: files.length });
    try {
      const attachments = await Promise.all(
        files.map(async (file) => ({
          filename: file.name,
          contentType: file.type || "application/octet-stream",
          base64: await fileToBase64(file),
        }))
      );

      const res = await api.post<{ id: string | null }>("/api/website-design/enquiry", {
        ...form,
        full_name: form.full_name.trim(),
        email: form.email.trim(),
        attachments,
      });

      if (!res.ok) {
        console.error("[EnquiryForm] Submission failed:", res.error);
        setError(typeof res.error === "string" ? res.error : "Something went wrong. Please try again or email us directly.");
        return;
      }

      console.log("[EnquiryForm] Enquiry submitted successfully", res.data);
      setSubmitted(true);
      setForm(EMPTY_ENQUIRY);
      setFiles([]);
    } catch (err) {
      console.error("[EnquiryForm] Unexpected submission error:", err);
      setError("Something went wrong sending your enquiry. Please try again, or email us directly.");
    } finally {
      setSubmitting(false);
    }
  };

  if (submitted) {
    return (
      <div className="rounded-[1.6rem] border border-[#C8A96A]/60 bg-[#FFFDF9] p-10 text-center shadow-[0_30px_60px_-30px_rgba(154,123,68,0.5)] sm:p-14">
        <span className="mx-auto grid size-16 place-items-center rounded-full bg-[#C8A96A]/18 text-[#9A7B44]">
          <CheckCircle2 className="size-8" />
        </span>
        <h3
          className="mt-6 text-3xl text-[#211E1B]"
          style={{ fontFamily: "var(--font-studio-serif), serif", fontWeight: 600 }}
        >
          Thank you.
        </h3>
        <p className="mx-auto mt-4 max-w-xl text-lg font-light leading-relaxed text-[#5C5346]">
          Your request has been passed on to Admin and someone will be in touch with you shortly.
        </p>
        <button
          onClick={() => setSubmitted(false)}
          className="mt-8 inline-flex items-center gap-2 rounded-full border border-[#CDBEA3] px-6 py-3 text-sm font-medium text-[#4A4237] transition-colors hover:border-[#9A7B44] hover:text-[#9A7B44]"
        >
          Submit another enquiry
        </button>
      </div>
    );
  }

  return (
    <form
      onSubmit={handleSubmit}
      className="rounded-[1.6rem] border border-[#E6D9C4] bg-[#FFFDF9] p-6 shadow-[0_30px_60px_-32px_rgba(43,39,36,0.3)] sm:p-9"
      noValidate
    >
      <div className="grid gap-5 sm:grid-cols-2">
        {/* 1 — Full name */}
        <div>
          <label htmlFor="wd-name" className={LABEL_CLASS}>
            Full Name<RequiredMark />
          </label>
          <input
            id="wd-name"
            type="text"
            autoComplete="name"
            className={FIELD_CLASS}
            placeholder="Jane Doe"
            value={form.full_name}
            onChange={(e) => set("full_name", e.target.value)}
            required
          />
        </div>

        {/* 2 — Email */}
        <div>
          <label htmlFor="wd-email" className={LABEL_CLASS}>
            Email Address<RequiredMark />
          </label>
          <input
            id="wd-email"
            type="email"
            autoComplete="email"
            className={FIELD_CLASS}
            placeholder="you@company.com"
            value={form.email}
            onChange={(e) => set("email", e.target.value)}
            required
          />
        </div>

        {/* 3 — Phone */}
        <div>
          <label htmlFor="wd-phone" className={LABEL_CLASS}>
            Phone Number
          </label>
          <input
            id="wd-phone"
            type="tel"
            autoComplete="tel"
            className={FIELD_CLASS}
            placeholder="+64 …"
            value={form.phone}
            onChange={(e) => set("phone", e.target.value)}
          />
        </div>

        {/* 4 — Company */}
        <div>
          <label htmlFor="wd-company" className={LABEL_CLASS}>
            Company / Business Name
          </label>
          <input
            id="wd-company"
            type="text"
            autoComplete="organization"
            className={FIELD_CLASS}
            placeholder="Your business"
            value={form.company_name}
            onChange={(e) => set("company_name", e.target.value)}
          />
        </div>
      </div>

      {/* 5 — Purpose */}
      <div className="mt-5">
        <label htmlFor="wd-purpose" className={LABEL_CLASS}>
          What is the main purpose of your website?
        </label>
        <textarea
          id="wd-purpose"
          rows={4}
          className={`${FIELD_CLASS} resize-y`}
          placeholder="Tell me what you'd like your website to achieve — the impression, the audience, and the outcomes that matter most."
          value={form.website_purpose}
          onChange={(e) => set("website_purpose", e.target.value)}
        />
      </div>

      {/* 6 — Package (single choice, required) */}
      <fieldset className="mt-7">
        <legend className={LABEL_CLASS}>
          Which package are you most interested in?<RequiredMark />
        </legend>
        <div className="grid gap-3 sm:grid-cols-2">
          {PACKAGE_OPTIONS.map((opt) => {
            const active = form.interested_package === opt.value;
            return (
              <label
                key={opt.value}
                className={[
                  "flex cursor-pointer items-start gap-3 rounded-xl border p-4 text-sm transition-colors",
                  active
                    ? "border-[#9A7B44] bg-[#C8A96A]/12 text-[#2B2724]"
                    : "border-[#E0D2BB] bg-[#FFFDF9] text-[#5C5346] hover:border-[#C8A96A]/70",
                ].join(" ")}
              >
                <input
                  type="radio"
                  name="interested_package"
                  value={opt.value}
                  checked={active}
                  onChange={() => set("interested_package", opt.value)}
                  className="mt-0.5 size-4 accent-[#9A7B44]"
                />
                <span className="font-light leading-snug">{opt.label}</span>
              </label>
            );
          })}
        </div>
      </fieldset>

      {/* 7 — Design styles (multiple) */}
      <fieldset className="mt-7">
        <legend className={LABEL_CLASS}>Preferred Design Style(s)</legend>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {STYLE_OPTIONS.map((opt) => {
            const active = form.design_styles.includes(opt.value);
            return (
              <label
                key={opt.value}
                className={[
                  "flex cursor-pointer items-center gap-3 rounded-xl border p-3 text-sm transition-colors",
                  active
                    ? "border-[#9A7B44] bg-[#C8A96A]/12 text-[#2B2724]"
                    : "border-[#E0D2BB] bg-[#FFFDF9] text-[#5C5346] hover:border-[#C8A96A]/70",
                ].join(" ")}
              >
                <input
                  type="checkbox"
                  checked={active}
                  onChange={() => toggleInArray("design_styles", opt.value)}
                  className="size-4 accent-[#9A7B44]"
                />
                <span className="font-light leading-snug">{opt.label}</span>
              </label>
            );
          })}
        </div>
        {form.design_styles.includes("custom_other") && (
          <input
            type="text"
            className={`${FIELD_CLASS} mt-3`}
            placeholder="Please describe your custom / other style…"
            value={form.custom_style_note}
            onChange={(e) => set("custom_style_note", e.target.value)}
          />
        )}
      </fieldset>

      {/* 8 — Features (multiple) */}
      <fieldset className="mt-7">
        <legend className={LABEL_CLASS}>Do you require any of the following features?</legend>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {FEATURE_OPTIONS.map((opt) => {
            const active = form.required_features.includes(opt.value);
            return (
              <label
                key={opt.value}
                className={[
                  "flex cursor-pointer items-center gap-3 rounded-xl border p-3 text-sm transition-colors",
                  active
                    ? "border-[#9A7B44] bg-[#C8A96A]/12 text-[#2B2724]"
                    : "border-[#E0D2BB] bg-[#FFFDF9] text-[#5C5346] hover:border-[#C8A96A]/70",
                ].join(" ")}
              >
                <input
                  type="checkbox"
                  checked={active}
                  onChange={() => toggleInArray("required_features", opt.value)}
                  className="size-4 accent-[#9A7B44]"
                />
                <span className="font-light leading-snug">{opt.label}</span>
              </label>
            );
          })}
        </div>
        {form.required_features.includes("other") && (
          <input
            type="text"
            className={`${FIELD_CLASS} mt-3`}
            placeholder="Please specify the other feature you need…"
            value={form.other_feature_note}
            onChange={(e) => set("other_feature_note", e.target.value)}
          />
        )}
      </fieldset>

      <div className="mt-7 grid gap-5 sm:grid-cols-2">
        {/* 9 — Budget (single) */}
        <div>
          <label htmlFor="wd-budget" className={LABEL_CLASS}>
            Approximate Budget Range
          </label>
          <select
            id="wd-budget"
            className={FIELD_CLASS}
            value={form.budget_range}
            onChange={(e) => set("budget_range", e.target.value)}
          >
            <option value="">Select a range…</option>
            {BUDGET_OPTIONS.map((opt) => (
              <option key={opt.value} value={opt.value}>
                {opt.label}
              </option>
            ))}
          </select>
        </div>

        {/* 10 — Timeline */}
        <div>
          <label htmlFor="wd-timeline" className={LABEL_CLASS}>
            Ideal Timeline
          </label>
          <input
            id="wd-timeline"
            type="text"
            className={FIELD_CLASS}
            placeholder="e.g. Within 6–8 weeks"
            value={form.timeline}
            onChange={(e) => set("timeline", e.target.value)}
          />
        </div>
      </div>

      {/* 11 — Additional notes */}
      <div className="mt-5">
        <label htmlFor="wd-notes" className={LABEL_CLASS}>
          Any additional notes or special requirements
        </label>
        <textarea
          id="wd-notes"
          rows={4}
          className={`${FIELD_CLASS} resize-y`}
          placeholder="Anything else you'd like me to know…"
          value={form.additional_notes}
          onChange={(e) => set("additional_notes", e.target.value)}
        />
      </div>

      {/* 12 — File upload */}
      <div className="mt-5">
        <label className={LABEL_CLASS}>
          File Upload{" "}
          <span className="font-light text-[#8A7E6E]">(optional — logo, brand guidelines, or reference images)</span>
        </label>
        <button
          type="button"
          onClick={() => fileInputRef.current?.click()}
          className="flex w-full flex-col items-center justify-center gap-2 rounded-xl border border-dashed border-[#CDBEA3] bg-[#FBF6EE] px-4 py-8 text-center transition-colors hover:border-[#9A7B44] hover:bg-[#F3E9D8]"
        >
          <UploadCloud className="size-7 text-[#9A7B44]" />
          <span className="text-sm font-medium text-[#4A4237]">Click to upload files</span>
          <span className="text-xs font-light text-[#8A7E6E]">Up to {MAX_FILES} files · 8MB each · images or PDFs</span>
        </button>
        <input
          ref={fileInputRef}
          type="file"
          multiple
          accept="image/*,.pdf,.doc,.docx"
          className="hidden"
          onChange={(e) => onPickFiles(e.target.files)}
        />
        {files.length > 0 && (
          <ul className="mt-3 space-y-2">
            {files.map((file, idx) => (
              <li
                key={`${file.name}-${idx}`}
                className="flex items-center justify-between gap-3 rounded-lg border border-[#E6D9C4] bg-[#FBF6EE] px-3 py-2 text-sm"
              >
                <span className="flex min-w-0 items-center gap-2 text-[#4A4237]">
                  <Paperclip className="size-4 shrink-0 text-[#9A7B44]" />
                  <span className="truncate font-light">{file.name}</span>
                  <span className="shrink-0 text-xs text-[#8A7E6E]">
                    {(file.size / 1024 / 1024).toFixed(1)}MB
                  </span>
                </span>
                <button
                  type="button"
                  onClick={() => removeFile(idx)}
                  className="grid size-6 shrink-0 place-items-center rounded-full text-[#8A7E6E] transition-colors hover:bg-[#EFE4D2] hover:text-[#C57B57]"
                  aria-label={`Remove ${file.name}`}
                >
                  <X className="size-4" />
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>

      {error && (
        <p className="mt-6 rounded-xl border border-[#C57B57]/40 bg-[#C57B57]/10 px-4 py-3 text-sm font-medium text-[#A65438]">
          {error}
        </p>
      )}

      <button
        type="submit"
        disabled={submitting}
        className="mt-8 inline-flex w-full items-center justify-center gap-2.5 rounded-full bg-[#2B2724] px-8 py-4 text-sm font-medium tracking-wide text-[#F7F1E8] transition-colors hover:bg-[#9A7B44] disabled:cursor-not-allowed disabled:opacity-70 sm:w-auto"
      >
        {submitting ? (
          <>
            <Loader2 className="size-4 animate-spin" /> Sending…
          </>
        ) : (
          <>
            Submit Enquiry <Send className="size-4" />
          </>
        )}
      </button>
      <p className="mt-4 text-xs font-light leading-relaxed text-[#8A7E6E]">
        Your details are used only to prepare your proposal and are never shared. Fields marked
        <span className="text-[#C57B57]"> *</span> are required.
      </p>
    </form>
  );
}

/* -------------------------------------------------------------------------- */
/*  Component                                                                  */
/* -------------------------------------------------------------------------- */

export function WebsiteDesignClient() {
  const { rates: fx } = useFxRates();
  const [menuOpen, setMenuOpen] = useState(false);
  const [previewOpen, setPreviewOpen] = useState(false);

  // Lock body scroll while the live-site preview modal is open.
  useEffect(() => {
    if (previewOpen) {
      const prev = document.body.style.overflow;
      document.body.style.overflow = "hidden";
      return () => {
        document.body.style.overflow = prev;
      };
    }
  }, [previewOpen]);

  const nav = [
    { href: "#work", label: "Work" },
    { href: "/website-design/showcase", label: "Showcase" },
    { href: "#services", label: "Services" },
    { href: "#packages", label: "Packages" },
    { href: "#enquire", label: "Enquire" },
    { href: "#contact", label: "Contact" },
  ];

  return (
    <main
      className="min-h-screen bg-[#F7F1E8] text-[#2B2724] antialiased selection:bg-[#C8A96A]/30"
      style={{ fontFamily: "var(--font-studio-sans), ui-sans-serif, system-ui, sans-serif" }}
    >
      {/* ------------------------------------------------------------------ */}
      {/*  Header                                                            */}
      {/* ------------------------------------------------------------------ */}
      <header className="sticky top-0 z-40 border-b border-[#E6D9C4]/70 bg-[#F7F1E8]/85 backdrop-blur-md">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-5">
          <a href="#top" className="group flex items-center gap-2.5">
            <span className="grid size-9 place-items-center rounded-full border border-[#C8A96A]/60 bg-[#FFFDF9] text-[#9A7B44]">
              <PenTool className="size-4" />
            </span>
            <span
              className="text-lg tracking-wide text-[#2B2724]"
              style={{ fontFamily: "var(--font-studio-serif), serif", fontWeight: 600 }}
            >
              Website Design
            </span>
          </a>

          <nav className="hidden items-center gap-9 md:flex">
            {nav.map((n) => (
              <a
                key={n.href}
                href={n.href}
                className="text-sm font-medium tracking-wide text-[#6B6152] transition-colors hover:text-[#9A7B44]"
              >
                {n.label}
              </a>
            ))}
            <a
              href="#enquire"
              className="inline-flex items-center gap-1.5 rounded-full bg-[#2B2724] px-5 py-2.5 text-sm font-medium text-[#F7F1E8] transition-colors hover:bg-[#9A7B44]"
            >
              Start your project <ArrowRight className="size-3.5" />
            </a>
          </nav>

          <button
            onClick={() => setMenuOpen((v) => !v)}
            className="grid size-10 place-items-center rounded-full border border-[#E6D9C4] text-[#6B6152] md:hidden"
            aria-label="Toggle menu"
          >
            {menuOpen ? <X className="size-5" /> : <Menu className="size-5" />}
          </button>
        </div>

        {menuOpen && (
          <div className="border-t border-[#E6D9C4]/70 bg-[#F7F1E8] px-6 py-4 md:hidden">
            <nav className="flex flex-col gap-1">
              {nav.map((n) => (
                <a
                  key={n.href}
                  href={n.href}
                  onClick={() => setMenuOpen(false)}
                  className="rounded-lg px-2 py-3 text-sm font-medium text-[#6B6152] hover:bg-[#EFE4D2] hover:text-[#9A7B44]"
                >
                  {n.label}
                </a>
              ))}
              <a
                href="#enquire"
                onClick={() => setMenuOpen(false)}
                className="mt-2 inline-flex items-center justify-center gap-1.5 rounded-full bg-[#2B2724] px-5 py-3 text-sm font-medium text-[#F7F1E8]"
              >
                Start your project <ArrowRight className="size-3.5" />
              </a>
            </nav>
          </div>
        )}
      </header>

      {/* ------------------------------------------------------------------ */}
      {/*  Hero                                                              */}
      {/* ------------------------------------------------------------------ */}
      <section id="top" className="relative overflow-hidden">
        {/* soft warm glow */}
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0"
          style={{
            background:
              "radial-gradient(60% 55% at 78% 8%, rgba(200,169,106,0.20), transparent 60%), radial-gradient(50% 45% at 8% 92%, rgba(197,123,87,0.10), transparent 60%)",
          }}
        />
        <div className="relative mx-auto grid max-w-6xl items-center gap-14 px-6 py-20 md:py-28 lg:grid-cols-[1.05fr_0.95fr]">
          <div>
            <span className="inline-flex items-center gap-2 rounded-full border border-[#C8A96A]/50 bg-[#FFFDF9]/70 px-4 py-1.5 text-xs font-medium uppercase tracking-[0.18em] text-[#9A7B44]">
              <Sparkles className="size-3.5" /> Premium website design studio
            </span>

            <h1
              className="mt-7 text-[2.7rem] leading-[1.05] text-[#211E1B] sm:text-6xl"
              style={{ fontFamily: "var(--font-studio-serif), serif", fontWeight: 600 }}
            >
              Websites crafted to
              <span className="block italic text-[#9A7B44]">look world-class</span>
              and quietly convert.
            </h1>

            <p className="mt-6 max-w-xl text-lg font-light leading-relaxed text-[#5C5346]">
              I design and build refined, results-driven websites for businesses that care about
              the impression they make — from polished company sites to secure customer portals,
              integrated AI and fully bespoke builds. Elegant on the surface, seriously capable
              underneath.
            </p>

            <div className="mt-9 flex flex-wrap items-center gap-4">
              <a
                href="#packages"
                className="inline-flex items-center gap-2 rounded-full bg-[#2B2724] px-7 py-3.5 text-sm font-medium tracking-wide text-[#F7F1E8] transition-colors hover:bg-[#9A7B44]"
              >
                View packages <ArrowRight className="size-4" />
              </a>
              <a
                href="#work"
                className="inline-flex items-center gap-2 rounded-full border border-[#CDBEA3] px-7 py-3.5 text-sm font-medium tracking-wide text-[#4A4237] transition-colors hover:border-[#9A7B44] hover:text-[#9A7B44]"
              >
                See live work
              </a>
            </div>

            <div className="mt-10 flex flex-wrap items-center gap-x-8 gap-y-3 text-sm font-light text-[#6B6152]">
              <span className="inline-flex items-center gap-2">
                <Check className="size-4 text-[#9A7B44]" /> Fully responsive
              </span>
              <span className="inline-flex items-center gap-2">
                <Check className="size-4 text-[#9A7B44]" /> SEO-ready
              </span>
              <span className="inline-flex items-center gap-2">
                <Check className="size-4 text-[#9A7B44]" /> Built to convert
              </span>
            </div>
          </div>

          {/* Framed live-site showcase */}
          <div className="relative">
            <div
              aria-hidden
              className="absolute -inset-4 rounded-[2rem] bg-gradient-to-br from-[#C8A96A]/25 via-transparent to-[#C57B57]/15 blur-2xl"
            />
            <figure className="relative overflow-hidden rounded-[1.6rem] border border-[#E6D9C4] bg-[#FFFDF9] p-3 shadow-[0_30px_60px_-25px_rgba(43,39,36,0.35)]">
              <div className="overflow-hidden rounded-[1.15rem] border border-[#EFE4D2]">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={WEBSITE_DESIGN_LIVE_SHOT}
                  alt="Live website designed and built by the studio — aetherforgeai.co.nz"
                  className="block w-full"
                />
              </div>
              <figcaption className="flex items-center justify-between px-2 py-3">
                <span className="text-xs font-medium uppercase tracking-[0.15em] text-[#9A7B44]">
                  Live client site
                </span>
                <button
                  onClick={() => setPreviewOpen(true)}
                  className="inline-flex items-center gap-1.5 text-xs font-medium text-[#4A4237] transition-colors hover:text-[#9A7B44]"
                >
                  Preview in-page <ArrowUpRight className="size-3.5" />
                </button>
              </figcaption>
            </figure>
          </div>
        </div>
      </section>

      {/* ------------------------------------------------------------------ */}
      {/*  Work / live example                                               */}
      {/* ------------------------------------------------------------------ */}
      <section id="work" className="border-y border-[#E6D9C4]/70 bg-[#FBF6EE]">
        <div className="mx-auto grid max-w-6xl items-center gap-12 px-6 py-20 md:py-24 lg:grid-cols-2">
          <div className="order-2 lg:order-1">
            <div className="overflow-hidden rounded-[1.4rem] border border-[#E6D9C4] bg-[#FFFDF9] p-2.5 shadow-[0_24px_50px_-28px_rgba(43,39,36,0.35)]">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={WEBSITE_DESIGN_LIVE_SHOT}
                alt="AetherForge AI — a live, production website designed and built in-house"
                className="block w-full rounded-[1rem] border border-[#EFE4D2]"
              />
            </div>
          </div>

          <div className="order-1 lg:order-2">
            <span className="text-xs font-medium uppercase tracking-[0.2em] text-[#9A7B44]">
              Proof, not promises
            </span>
            <h2
              className="mt-4 text-4xl leading-tight text-[#211E1B] sm:text-5xl"
              style={{ fontFamily: "var(--font-studio-serif), serif", fontWeight: 600 }}
            >
              My own live site is the reference.
            </h2>
            <p className="mt-5 text-lg font-light leading-relaxed text-[#5C5346]">
              <span className="font-medium text-[#4A4237]">aetherforgeai.co.nz</span> is a real,
              working product I designed and built end-to-end — live market data, secure logins, a
              members dashboard and integrated AI. The same standard of craft goes into every
              website I create for a client.
            </p>

            <ul className="mt-7 space-y-3">
              {[
                "Designed, coded and shipped to production",
                "Live data, secure portals and integrated AI",
                "Fast, responsive and built to the finest detail",
              ].map((item) => (
                <li key={item} className="flex items-start gap-3 text-[#5C5346]">
                  <span className="mt-1 grid size-5 shrink-0 place-items-center rounded-full bg-[#C8A96A]/20 text-[#9A7B44]">
                    <Check className="size-3" />
                  </span>
                  <span className="font-light">{item}</span>
                </li>
              ))}
            </ul>

            <div className="mt-8 flex flex-wrap gap-4">
              <a
                href={LIVE_SITE_URL}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-2 rounded-full bg-[#2B2724] px-6 py-3 text-sm font-medium text-[#F7F1E8] transition-colors hover:bg-[#9A7B44]"
              >
                Visit the live site <ExternalLink className="size-4" />
              </a>
              <button
                onClick={() => setPreviewOpen(true)}
                className="inline-flex items-center gap-2 rounded-full border border-[#CDBEA3] px-6 py-3 text-sm font-medium text-[#4A4237] transition-colors hover:border-[#9A7B44] hover:text-[#9A7B44]"
              >
                Preview without leaving <ArrowUpRight className="size-4" />
              </button>
            </div>

            <div className="mt-8 rounded-2xl border border-[#E6D9C4] bg-[#FFFDF9] p-5">
              <p className="text-sm font-medium text-[#4A4237]">
                Prefer to see a range of styles?
              </p>
              <p className="mt-1 text-sm font-light text-[#5C5346]">
                Browse a showcase of five example websites — service, hospitality, portfolio,
                community and product brands — each explorable live.
              </p>
              <a
                href="/website-design/showcase"
                className="mt-4 inline-flex items-center gap-2 rounded-full bg-[#9A7B44] px-6 py-3 text-sm font-medium text-[#FFFDF9] transition-colors hover:bg-[#816231]"
              >
                Explore the design showcase <ArrowUpRight className="size-4" />
              </a>
            </div>
          </div>
        </div>
      </section>

      {/* ------------------------------------------------------------------ */}
      {/*  Services / capabilities                                           */}
      {/* ------------------------------------------------------------------ */}
      <section id="services" className="mx-auto max-w-6xl px-6 py-20 md:py-28">
        <div className="mx-auto max-w-2xl text-center">
          <span className="text-xs font-medium uppercase tracking-[0.2em] text-[#9A7B44]">
            What I do
          </span>
          <h2
            className="mt-4 text-4xl leading-tight text-[#211E1B] sm:text-5xl"
            style={{ fontFamily: "var(--font-studio-serif), serif", fontWeight: 600 }}
          >
            Design taste, engineering depth.
          </h2>
          <p className="mt-5 text-lg font-light leading-relaxed text-[#5C5346]">
            A rare combination — the eye of a designer with the capability of an advanced developer,
            so nothing about your ambition has to be compromised.
          </p>
        </div>

        <div className="mt-14 grid gap-6 md:grid-cols-3">
          {CAPABILITIES.map((c) => (
            <div
              key={c.title}
              className="group rounded-2xl border border-[#E6D9C4] bg-[#FFFDF9] p-8 transition-all duration-300 hover:-translate-y-1 hover:border-[#C8A96A]/70 hover:shadow-[0_24px_45px_-28px_rgba(154,123,68,0.5)]"
            >
              <span className="grid size-12 place-items-center rounded-xl bg-[#C8A96A]/15 text-[#9A7B44] transition-colors group-hover:bg-[#C8A96A]/25">
                <c.icon className="size-6" />
              </span>
              <h3
                className="mt-6 text-2xl text-[#211E1B]"
                style={{ fontFamily: "var(--font-studio-serif), serif", fontWeight: 600 }}
              >
                {c.title}
              </h3>
              <p className="mt-3 font-light leading-relaxed text-[#5C5346]">{c.body}</p>
            </div>
          ))}
        </div>
      </section>

      {/* ------------------------------------------------------------------ */}
      {/*  Packages                                                          */}
      {/* ------------------------------------------------------------------ */}
      <section id="packages" className="border-y border-[#E6D9C4]/70 bg-[#FBF6EE]">
        <div className="mx-auto max-w-6xl px-6 py-20 md:py-28">
          <div className="mx-auto max-w-2xl text-center">
            <span className="text-xs font-medium uppercase tracking-[0.2em] text-[#9A7B44]">
              Packages
            </span>
            <h2
              className="mt-4 text-4xl leading-tight text-[#211E1B] sm:text-5xl"
              style={{ fontFamily: "var(--font-studio-serif), serif", fontWeight: 600 }}
            >
              Three ways to begin.
            </h2>
            <p className="mt-5 text-lg font-light leading-relaxed text-[#5C5346]">
              Clear, considered options — from a polished company site to a fully bespoke build.
              Secure payment is handled by Stripe; every project starts the moment you&apos;re ready.
            </p>
          </div>

          <div className="mt-14 grid items-stretch gap-6 lg:grid-cols-3">
            {PACKAGES.map((pkg) => (
              <div
                key={pkg.key}
                className={[
                  "relative flex h-full flex-col rounded-[1.4rem] border p-8 transition-all duration-300",
                  pkg.featured
                    ? "border-[#C8A96A] bg-[#FFFDF9] shadow-[0_34px_70px_-32px_rgba(154,123,68,0.55)] lg:-mt-4 lg:mb-4 lg:pb-11"
                    : "border-[#E6D9C4] bg-[#FFFDF9]/70 hover:border-[#C8A96A]/70 hover:shadow-[0_24px_50px_-30px_rgba(43,39,36,0.4)]",
                ].join(" ")}
              >
                {pkg.ribbon && (
                  <span
                    className={[
                      "absolute -top-3 left-1/2 -translate-x-1/2 whitespace-nowrap rounded-full px-4 py-1 text-[0.68rem] font-semibold uppercase tracking-[0.14em]",
                      pkg.featured
                        ? "bg-[#2B2724] text-[#F7F1E8]"
                        : "border border-[#C8A96A]/50 bg-[#FFFDF9] text-[#9A7B44]",
                    ].join(" ")}
                  >
                    {pkg.ribbon}
                  </span>
                )}

                <h3
                  className="text-2xl text-[#211E1B]"
                  style={{ fontFamily: "var(--font-studio-serif), serif", fontWeight: 600 }}
                >
                  {pkg.name}
                </h3>
                <p className="mt-2 min-h-[3rem] font-light leading-relaxed text-[#6B6152]">
                  {pkg.tagline}
                </p>

                {/* Price — NZD primary, live US$ underneath */}
                <div className="mt-6 border-t border-[#EFE4D2] pt-6">
                  <div className="flex items-end gap-1.5">
                    <span className="text-xl font-medium text-[#8A7E6E]">NZ$</span>
                    <span
                      className="text-5xl leading-none text-[#211E1B]"
                      style={{ fontFamily: "var(--font-studio-serif), serif", fontWeight: 700 }}
                    >
                      {pkg.priceNzd.toLocaleString("en-NZ")}
                      {pkg.priceSuffix && (
                        <span className="text-[#9A7B44]">{pkg.priceSuffix}</span>
                      )}
                    </span>
                  </div>
                  <p className="mt-2 text-sm font-light text-[#8A7E6E]">
                    {formatUsdApprox(pkg.priceNzd, fx)}
                    {pkg.priceSuffix ? "+" : ""} today · {pkg.priceNote}
                  </p>
                </div>

                <ul className="mt-6 flex-1 space-y-3">
                  {pkg.features.map((f) => (
                    <li key={f.label} className="flex items-start gap-3 text-[#5C5346]">
                      <span className="mt-0.5 grid size-5 shrink-0 place-items-center rounded-full bg-[#C8A96A]/18 text-[#9A7B44]">
                        <f.icon className="size-3" />
                      </span>
                      <span className="font-light leading-snug">{f.label}</span>
                    </li>
                  ))}
                </ul>

                <a
                  href={pkg.paymentLink}
                  target="_blank"
                  rel="noopener noreferrer"
                  className={[
                    "mt-8 inline-flex items-center justify-center gap-2 rounded-full px-6 py-3.5 text-sm font-medium tracking-wide transition-colors",
                    pkg.featured
                      ? "bg-[#2B2724] text-[#F7F1E8] hover:bg-[#9A7B44]"
                      : "border border-[#2B2724]/80 text-[#2B2724] hover:border-[#9A7B44] hover:bg-[#9A7B44] hover:text-[#F7F1E8]",
                  ].join(" ")}
                >
                  {pkg.ctaLabel} <ArrowRight className="size-4" />
                </a>
              </div>
            ))}
          </div>

          <p className="mx-auto mt-10 max-w-2xl text-center text-sm font-light leading-relaxed text-[#8A7E6E]">
            All prices are in New Zealand Dollars (NZD) and processed securely through Stripe. US$
            figures are indicative at today&apos;s exchange rate. Not sure which fits? Just{" "}
            <a href="#contact" className="font-medium text-[#9A7B44] underline underline-offset-4">
              get in touch
            </a>{" "}
            and we&apos;ll find the right path together.
          </p>
        </div>
      </section>

      {/* ------------------------------------------------------------------ */}
      {/*  Process                                                           */}
      {/* ------------------------------------------------------------------ */}
      <section className="mx-auto max-w-6xl px-6 py-20 md:py-28">
        <div className="mx-auto max-w-2xl text-center">
          <span className="text-xs font-medium uppercase tracking-[0.2em] text-[#9A7B44]">
            How it works
          </span>
          <h2
            className="mt-4 text-4xl leading-tight text-[#211E1B] sm:text-5xl"
            style={{ fontFamily: "var(--font-studio-serif), serif", fontWeight: 600 }}
          >
            A calm, considered process.
          </h2>
        </div>

        <div className="mt-14 grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
          {PROCESS.map((p) => (
            <div
              key={p.step}
              className="rounded-2xl border border-[#E6D9C4] bg-[#FFFDF9] p-7"
            >
              <div className="flex items-center justify-between">
                <span className="grid size-11 place-items-center rounded-xl bg-[#C8A96A]/15 text-[#9A7B44]">
                  <p.icon className="size-5" />
                </span>
                <span
                  className="text-2xl text-[#E0CFB0]"
                  style={{ fontFamily: "var(--font-studio-serif), serif", fontWeight: 700 }}
                >
                  {p.step}
                </span>
              </div>
              <h3
                className="mt-5 text-xl text-[#211E1B]"
                style={{ fontFamily: "var(--font-studio-serif), serif", fontWeight: 600 }}
              >
                {p.title}
              </h3>
              <p className="mt-2 text-sm font-light leading-relaxed text-[#5C5346]">{p.body}</p>
            </div>
          ))}
        </div>
      </section>

      {/* ------------------------------------------------------------------ */}
      {/*  Enquiry form                                                      */}
      {/* ------------------------------------------------------------------ */}
      <section id="enquire" className="border-y border-[#E6D9C4]/70 bg-[#FBF6EE]">
        <div className="mx-auto max-w-4xl px-6 py-20 md:py-28">
          <div className="mx-auto max-w-2xl text-center">
            <span className="text-xs font-medium uppercase tracking-[0.2em] text-[#9A7B44]">
              Start your project
            </span>
            <h2
              className="mt-4 text-4xl leading-tight text-[#211E1B] sm:text-5xl"
              style={{ fontFamily: "var(--font-studio-serif), serif", fontWeight: 600 }}
            >
              Tell me about your vision.
            </h2>
            <p className="mt-5 text-lg font-light leading-relaxed text-[#5C5346]">
              Share a few details and I&apos;ll personally review them within one business day, then
              reply with a clear, tailored proposal. No obligation — just a considered starting point.
            </p>
          </div>

          <div className="mt-12">
            <EnquiryForm />
          </div>
        </div>
      </section>

      {/* ------------------------------------------------------------------ */}
      {/*  Contact details                                                   */}
      {/* ------------------------------------------------------------------ */}
      <section id="contact" className="border-t border-[#E6D9C4]/70 bg-[#2B2724] text-[#F2E9DA]">
        <div className="mx-auto max-w-4xl px-6 py-20 text-center md:py-28">
          <span className="text-xs font-medium uppercase tracking-[0.2em] text-[#C8A96A]">
            Contact
          </span>
          <h2
            className="mt-4 text-4xl leading-tight text-[#FBF6EE] sm:text-5xl"
            style={{ fontFamily: "var(--font-studio-serif), serif", fontWeight: 600 }}
          >
            Prefer to reach out directly?
          </h2>
          <p className="mx-auto mt-5 max-w-xl text-lg font-light leading-relaxed text-[#C9BCA6]">
            I reply personally to every message. Email me, or connect on any of the channels below —
            I&apos;d love to help you make a genuinely lasting impression.
          </p>

          <a
            href={`mailto:${CONTACT.email}`}
            className="mt-9 inline-flex items-center gap-2.5 rounded-full bg-[#C8A96A] px-8 py-4 text-sm font-medium tracking-wide text-[#2B2724] transition-colors hover:bg-[#D8BC80]"
          >
            <Mail className="size-4" /> {CONTACT.email}
          </a>

          <div className="mt-12 flex items-center justify-center gap-4">
            <a
              href={CONTACT.facebook}
              target="_blank"
              rel="noopener noreferrer"
              aria-label="Facebook"
              className="grid size-12 place-items-center rounded-full border border-[#C8A96A]/40 text-[#E9DDC8] transition-colors hover:border-[#C8A96A] hover:bg-[#C8A96A]/15 hover:text-[#FBF6EE]"
            >
              <Facebook className="size-5" />
            </a>
            <a
              href={CONTACT.x}
              target="_blank"
              rel="noopener noreferrer"
              aria-label="X (formerly Twitter)"
              className="grid size-12 place-items-center rounded-full border border-[#C8A96A]/40 text-[#E9DDC8] transition-colors hover:border-[#C8A96A] hover:bg-[#C8A96A]/15 hover:text-[#FBF6EE]"
            >
              {/* X wordmark glyph */}
              <svg viewBox="0 0 24 24" className="size-4 fill-current" aria-hidden>
                <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24h-6.66l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231 5.45-6.231Zm-1.161 17.52h1.833L7.084 4.126H5.117L17.083 19.77Z" />
              </svg>
            </a>
            <a
              href={CONTACT.linkedin}
              target="_blank"
              rel="noopener noreferrer"
              aria-label="LinkedIn"
              className="grid size-12 place-items-center rounded-full border border-[#C8A96A]/40 text-[#E9DDC8] transition-colors hover:border-[#C8A96A] hover:bg-[#C8A96A]/15 hover:text-[#FBF6EE]"
            >
              <Linkedin className="size-5" />
            </a>
          </div>
        </div>
      </section>

      {/* ------------------------------------------------------------------ */}
      {/*  Footer                                                            */}
      {/* ------------------------------------------------------------------ */}
      <footer className="bg-[#211E1B] text-[#9A8F7D]">
        <div className="mx-auto flex max-w-6xl flex-col items-center justify-between gap-4 px-6 py-8 sm:flex-row">
          <span
            className="text-base text-[#E9DDC8]"
            style={{ fontFamily: "var(--font-studio-serif), serif", fontWeight: 600 }}
          >
            Website Design
          </span>
          <p className="text-xs font-light tracking-wide">
            Designed &amp; built with care · Powered by secure Stripe payments
          </p>
        </div>
      </footer>

      {/* ------------------------------------------------------------------ */}
      {/*  Live-site preview modal (demonstrates the "preview window" idea)  */}
      {/* ------------------------------------------------------------------ */}
      {previewOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-[#1A1714]/70 p-4 backdrop-blur-sm"
          onClick={() => setPreviewOpen(false)}
        >
          <div
            className="flex h-[85vh] w-full max-w-5xl flex-col overflow-hidden rounded-2xl border border-[#C8A96A]/40 bg-[#FFFDF9] shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between border-b border-[#E6D9C4] px-5 py-3">
              <div className="flex items-center gap-2 text-sm text-[#6B6152]">
                <span className="size-2.5 rounded-full bg-[#C57B57]/70" />
                <span className="size-2.5 rounded-full bg-[#C8A96A]/70" />
                <span className="size-2.5 rounded-full bg-[#9AAE86]/70" />
                <span className="ml-3 font-light">aetherforgeai.co.nz</span>
              </div>
              <div className="flex items-center gap-3">
                <a
                  href={LIVE_SITE_URL}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1.5 text-xs font-medium text-[#9A7B44] hover:underline"
                >
                  Open in new tab <ExternalLink className="size-3.5" />
                </a>
                <button
                  onClick={() => setPreviewOpen(false)}
                  className="grid size-8 place-items-center rounded-full text-[#6B6152] hover:bg-[#EFE4D2]"
                  aria-label="Close preview"
                >
                  <X className="size-4" />
                </button>
              </div>
            </div>
            <iframe
              src={LIVE_SITE_URL}
              title="Live preview — aetherforgeai.co.nz"
              className="h-full w-full flex-1 bg-white"
              loading="lazy"
            />
          </div>
        </div>
      )}
    </main>
  );
}
