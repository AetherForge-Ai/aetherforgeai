"use client";

import { useEffect, useState } from "react";

/**
 * A mailto link that Cloudflare's email obfuscation does not rewrite (M-2).
 * The server HTML never contains "user@host" as one string: the visible text
 * puts the @ in its own span, and the mailto href is set after hydration.
 * Without scripts the address is still readable as text.
 */
export function EmailAddress({ email, className }: { email: string; className?: string }) {
  const at = email.indexOf("@");
  const user = at === -1 ? email : email.slice(0, at);
  const host = at === -1 ? "" : email.slice(at + 1);
  const [href, setHref] = useState<string | undefined>(undefined);
  useEffect(() => setHref(`mailto:${user}${host ? `\u0040${host}` : ""}`), [user, host]);
  return (
    <span className={className}>
      <a href={href} className="underline-offset-2 hover:underline" data-email-user={user} data-email-host={host}>
        {user}
        {host ? (
          <>
            <span>@</span>
            {host}
          </>
        ) : null}
      </a>
    </span>
  );
}
