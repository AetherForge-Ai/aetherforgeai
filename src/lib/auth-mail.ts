import "server-only";
import { sendTransactionalEmail } from "@/lib/send-transactional-mail";
import { passwordResetEmail, verificationEmail } from "@/lib/transactional-mail";

type AuthMailUser = { email?: string | null; name?: string | null };

function recipientEmail(user: AuthMailUser): string | null {
  const email = user.email?.trim();
  return email ? email : null;
}

/**
 * Better Auth 1.3.26 calls sendVerificationEmail from several routes and
 * passes the incoming Request. Email sign-up is POST /sign-up/email and
 * awaits the callback after the user row exists. The explicit resend is
 * POST /send-verification-email.
 */
export function isExplicitVerificationResend(request?: Request): boolean {
  return request?.url?.includes("/send-verification-email") ?? false;
}

export async function sendAuthVerificationEmail(
  data: { user: AuthMailUser; url: string; token?: string },
  request?: Request,
): Promise<void> {
  const email = recipientEmail(data.user);
  if (!email) {
    console.error("[auth] Verification email skipped: user has no email");
    return;
  }
  console.log(`[auth] Sending verification email to ${email}`);
  try {
    await sendTransactionalEmail(verificationEmail({ to: email, name: data.user.name, url: data.url }));
    console.log(`[auth] Verification email sent to ${email}`);
  } catch (e) {
    console.error(`[auth] Failed to send verification email to ${email}:`, e);
    if (isExplicitVerificationResend(request)) throw e;
  }
}

export async function sendAuthResetPassword(
  data: { user: AuthMailUser; url: string; token?: string },
  _request?: Request,
): Promise<void> {
  const email = recipientEmail(data.user);
  if (!email) {
    console.error("[auth] Password reset email skipped: user has no email");
    return;
  }
  console.log(`[auth] Sending password reset email to ${email}`);
  try {
    await sendTransactionalEmail(passwordResetEmail({ to: email, name: data.user.name, url: data.url }));
    console.log(`[auth] Password reset email sent to ${email}`);
  } catch (e) {
    console.error(`[auth] Failed to send password reset email to ${email}:`, e);
  }
}
