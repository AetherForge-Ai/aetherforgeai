import Script from "next/script";

/**
 * Google tag (gtag.js) — loaded once here and rendered from the root layout, so
 * it is injected into the <head> of EVERY page/route automatically (no need to
 * edit each page individually).
 *
 * The measurement / tag ID is read from the public env var
 * NEXT_PUBLIC_GOOGLE_TAG_ID (e.g. "G-XXXXXXXXXX" for GA4, "GT-XXXXXXX" for a
 * Google tag, or "AW-XXXXXXXXX" for Google Ads). If the variable is not set the
 * component renders nothing — so the site keeps working until the ID is added.
 *
 * strategy="afterInteractive" is the Google-recommended load timing: the tag
 * loads right after the page becomes interactive, keeping it out of the critical
 * render path while still firing on the initial page view.
 */
export function GoogleTag() {
  const tagId = process.env.NEXT_PUBLIC_GOOGLE_TAG_ID;

  if (!tagId) {
    // No ID configured yet — nothing to inject. Logged to aid debugging setup.
    if (process.env.NODE_ENV !== "production") {
      console.warn(
        "[GoogleTag] NEXT_PUBLIC_GOOGLE_TAG_ID is not set — Google tag not injected."
      );
    }
    return null;
  }

  return (
    <>
      <Script
        id="gtag-src"
        src={`https://www.googletagmanager.com/gtag/js?id=${tagId}`}
        strategy="afterInteractive"
      />
      <Script id="gtag-init" strategy="afterInteractive">
        {`
          window.dataLayer = window.dataLayer || [];
          function gtag(){dataLayer.push(arguments);}
          gtag('js', new Date());
          gtag('config', '${tagId}');
        `}
      </Script>
    </>
  );
}
