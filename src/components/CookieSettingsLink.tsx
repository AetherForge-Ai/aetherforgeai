"use client";

import { OPEN_COOKIE_SETTINGS_EVENT } from "@/lib/analytics-consent";

/** Opens the analytics choice again. Same weight as the other footer links. */
export function CookieSettingsLink() {
  return (
    <button
      type="button"
      className="bg-transparent p-0 text-left text-sm text-muted-foreground hover:text-foreground"
      onClick={() => window.dispatchEvent(new Event(OPEN_COOKIE_SETTINGS_EVENT))}
    >
      Cookie settings
    </button>
  );
}
