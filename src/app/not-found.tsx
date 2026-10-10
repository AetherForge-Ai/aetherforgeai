import type { Metadata } from "next";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { pageTitle } from "@/lib/page-title";

export const metadata: Metadata = {
  title: { absolute: pageTitle("Page not found") },
  description: "That page is not on AetherForge AI.",
  robots: { index: false, follow: false },
  alternates: { canonical: "/404" },
  openGraph: {
    title: pageTitle("Page not found"),
    description: "That page is not on AetherForge AI.",
    url: "/404",
    type: "website",
  },
};

export default function NotFound() {
  return (
    <div className="min-h-screen flex items-center justify-center px-4">
      <div className="text-center">
        <h1 className="text-6xl font-bold text-gray-900 dark:text-gray-100">404</h1>
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
  );
}