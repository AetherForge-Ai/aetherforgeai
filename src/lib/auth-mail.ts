import "server-only";
import { sendTransactionalEmail } from "@/lib/send-transactional-mail";
import { passwordResetEmail, verificationEmail } from "@/lib/transactional-mail";

type AuthMailUser = { email: string; name?: string | null };

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
  data: { user: AuthMailUser; url: string },
  request?: Request,
): Promise<void> {
  console.log(`[auth] Sending verification email to ${data.user.email}`);
  try {
    await sendTransactionalEmail(
      verificationEmail({ to: data.user.email, name: data.user.name, url: data.url }),
    );
    console.log(`[auth] Verification email sent to ${data.user.email}`);
  } catch (e) {
    console.error(`[auth] Failed to send verification email to ${data.user.email}:`, e);
    if (isExplicitVerificationResend(request)) throw e;
  }
}

export async function sendAuthResetPassword(
  data: { user: AuthMailUser; url: string },
  _request?: Request,
): Promise<void> {
  console.log(`[auth] Sending password reset email to ${data.user.email}`);
  try {
    await sendTransactionalEmail(
      passwordResetEmail({ to: data.user.email, name: data.user.name, url: data.url }),
    );
    console.log(`[auth] Password reset email sent to ${data.user.email}`);
  } catch (e) {
    console.error(`[auth] Failed to send password reset email to ${data.user.email}:`, e);
  }
}
