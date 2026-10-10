"use client";

import { useEffect, useState } from "react";
import Script from "next/script";
import {
  CONSENT_CHANGE_EVENT,
  googleMeasurementId,
  readAnalyticsChoice,
  shouldLoadGtag,
} from "@/lib/analytics-consent";

/**
 * Google Analytics loads only after Accept. The first render never includes gtag.js.
 * Consent Mode v2 default denied is the inline script in the root layout.
 */
export function GoogleTag() {
  const tagId = googleMeasurementId();
  const [allowed, setAllowed] = useState(false);

  useEffect(() => {
    const apply = () => {
      const choice = readAnalyticsChoice();
      setAllowed(shouldLoadGtag(choice, tagId));
      const gtag = (window as Window & { gtag?: (...args: unknown[]) => void }).gtag;
      if (choice === "denied" && typeof gtag === "function") {
        gtag("consent", "update", {
          ad_storage: "denied",
          ad_user_data: "denied",
          ad_personalization: "denied",
          analytics_storage: "denied",
          functionality_storage: "denied",
          personalization_storage: "denied",
        });
      }
    };
    apply();
    window.addEventListener(CONSENT_CHANGE_EVENT, apply);
    return () => window.removeEventListener(CONSENT_CHANGE_EVENT, apply);
  }, [tagId]);

  if (!allowed || !tagId) return null;

  return (
    <>
      <Script id="gtag-src" src={`https://www.googletagmanager.com/gtag/js?id=${tagId}`} strategy="afterInteractive" />
      <Script id="gtag-init" strategy="afterInteractive">
        {`
          gtag('consent', 'update', { analytics_storage: 'granted' });
          gtag('js', new Date());
          gtag('config', '${tagId}');
        `}
      </Script>
    </>
  );
}
