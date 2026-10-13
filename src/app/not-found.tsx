import type { Metadata } from "next";
import Link from "next/link";
import { SiteHeader } from "@/components/SiteHeader";
import { Button } from "@/components/ui/button";
import { pageTitle } from "@/lib/page-title";

export const metadata: Metadata = {
  title: { absolute: pageTitle("Page not found") },
  description: "That page is not on AetherForge AI.",
  robots: { index: false, follow: false },
  openGraph: {
    title: pageTitle("Page not found"),
    description: "That page is not on AetherForge AI.",
    type: "website",
  },
};

export default function NotFound() {
  return (
    <div className="chrome-dark min-h-screen bg-background">
      <SiteHeader />
      <div className="content-light mx-auto my-8 flex max-w-lg items-center justify-center rounded-2xl px-4 py-16">
      <div className="text-center">
        <h1 className="font-display text-6xl font-bold">404</h1>
        <h2 className="mt-2 text-3xl font-semibold text-gray-800 dark:text-gray-200">
          Page not found
        </h2>
        <p className="mt-4 text-gray-600 dark:text-gray-400 max-w-md mx-auto">
          Sorry, we couldn't find the page you're looking for. Please check the URL or navigate back to the homepage.
        </p>
        <div className="mt-8">
          <Link href="/">
            <Button>
              Go back home
            </Button>
          </Link>
        </div>
      </div>
      </div>
    </div>
  );
}