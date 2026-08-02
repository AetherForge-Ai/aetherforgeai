import type { Metadata } from "next";
import { Cormorant_Garamond, Jost } from "next/font/google";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/session";
import { STUDIO_EMAIL } from "@/lib/website-design-content";
import { WelcomePackageClient } from "@/components/website-design/WelcomePackageClient";

/**
 * PRIVATE, OWNER-ONLY area for the Website Design service.
 *
 * The Formal Welcome Letter and the Full Welcome Email live here and are NEVER
 * shown to enquiring visitors. The route is deliberately NOT in the
 * `publicRoutes` allow-list in src/middleware.ts, so the middleware already
 * requires a valid session to reach it. On top of that we gate on an admin
 * email allow-list, so only the site owner can view these documents.
 *
 * Access is granted to STUDIO_EMAIL plus any address listed (comma-separated)
 * in the optional WEBSITE_DESIGN_ADMIN_EMAILS environment variable.
 */

const displaySerif = Cormorant_Garamond({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
  variable: "--font-studio-serif",
  display: "swap",
});

const bodySans = Jost({
  subsets: ["latin"],
  weight: ["300", "400", "500", "600"],
  variable: "--font-studio-sans",
  display: "swap",
});

export const metadata: Metadata = {
  title: "Welcome Package — Private",
  robots: { index: false, follow: false },
};

/** Build the set of allowed admin emails (lowercased) from env + default. */
function adminEmails(): string[] {
  const fromEnv = (process.env.WEBSITE_DESIGN_ADMIN_EMAILS || "")
    .split(/[,\s]+/)
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean);
  return Array.from(new Set([STUDIO_EMAIL.toLowerCase(), ...fromEnv]));
}

export default async function WelcomePackagePage() {
  const user = await getCurrentUser();

  // Middleware should already have redirected unauthenticated users, but guard
  // here too so this page can never render its private content without a session.
  if (!user) {
    redirect("/login");
  }

  const allowed = adminEmails();
  const isAdmin = !!user.email && allowed.includes(user.email.toLowerCase());

  if (!isAdmin) {
    console.warn(`[welcome-package] Access denied for ${user.email}`);
    return (
      <div className={`${displaySerif.variable} ${bodySans.variable}`}>
        <main
          className="grid min-h-screen place-items-center bg-[#F7F1E8] px-6 text-center text-[#2B2724]"
          style={{ fontFamily: "var(--font-studio-sans), ui-sans-serif, system-ui, sans-serif" }}
        >
          <div className="max-w-md">
            <h1
              className="text-3xl text-[#211E1B]"
              style={{ fontFamily: "var(--font-studio-serif), serif", fontWeight: 600 }}
            >
              This area is private.
            </h1>
            <p className="mt-4 font-light leading-relaxed text-[#5C5346]">
              These onboarding documents are reserved for the site owner. If this is your account,
              add your email to the <code className="text-[#9A7B44]">WEBSITE_DESIGN_ADMIN_EMAILS</code>{" "}
              environment variable.
            </p>
            <a
              href="/website-design"
              className="mt-8 inline-flex items-center justify-center rounded-full bg-[#2B2724] px-6 py-3 text-sm font-medium text-[#F7F1E8] transition-colors hover:bg-[#9A7B44]"
            >
              Back to Website Design
            </a>
          </div>
        </main>
      </div>
    );
  }

  return (
    <div className={`${displaySerif.variable} ${bodySans.variable}`}>
      <WelcomePackageClient />
    </div>
  );
}
