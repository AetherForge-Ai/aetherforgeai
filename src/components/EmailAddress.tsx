/**
 * A mailto link plus a readable "name at host" line.
 * Cloudflare can rewrite an address that contains @. The plain words stay readable without JavaScript.
 */
export function EmailAddress({
  email,
  className,
}: {
  email: string;
  className?: string;
}) {
  const at = email.indexOf("@");
  const user = at === -1 ? email : email.slice(0, at);
  const host = at === -1 ? "" : email.slice(at + 1);
  const spoken = host ? `${user} at ${host}` : email;
  return (
    <span className={className}>
      <a href={`mailto:${email}`} className="underline-offset-2 hover:underline">
        {email}
      </a>{" "}
      <span>({spoken})</span>
    </span>
  );
}
