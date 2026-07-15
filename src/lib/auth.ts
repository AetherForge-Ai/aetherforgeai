import "server-only";
import { betterAuth } from "better-auth";
import { bearer } from "better-auth/plugins";
import { nextCookies } from "better-auth/next-js";
import { totalumAdapter } from "@/lib/better-auth-totalum-adapter";
import { totalumSdk } from "@/lib/totalum";

// TESTING_MODE is set only by the test:serve script (npm run test:serve).
// When active, use LOCAL_NEXTJS_PROJECT_TESTING_URL so that CORS, baseURL,
// and cookie security all work correctly on localhost.
const effectiveUrl =
  process.env.TESTING_MODE === "true"
    ? (process.env.LOCAL_NEXTJS_PROJECT_TESTING_URL || "http://localhost:3000")
    : (process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000");

export const auth = betterAuth({
  // Database adapter
  database: totalumAdapter(totalumSdk, {
    debugLogs: true,
  }),

  // Email and password authentication
  emailAndPassword: {
    enabled: true,
    autoSignIn: true,
    minPasswordLength: 6,
    maxPasswordLength: 128,
    // Enforce email verification before a session is granted. New sign-ups are
    // NOT auto-signed-in until they click the verification link; existing
    // unverified users are blocked at login and automatically re-sent a
    // verification email (handled gracefully by the login page). This is what
    // guarantees no one reaches the dashboard/portfolio with an unverified email.
    requireEmailVerification: true,
    // =========================================================================
    // PASSWORD RECOVERY - Enabled. Sends a branded reset email via TotalumSDK.
    // Powers /forgot-password and /reset-password pages.
    // =========================================================================
    sendResetPassword: async ({ user, url }) => {
      console.log(`[auth] Sending password reset email to ${user.email}`);
      try {
        await totalumSdk.email.sendEmail({
          to: [user.email],
          subject: "Reset your AetherForge password",
          fromName: "AetherForge AI",
          html: `
            <div style="margin:0;padding:0;background-color:#070b16;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;">
              <div style="max-width:520px;margin:0 auto;padding:40px 24px;">
                <div style="text-align:center;margin-bottom:28px;">
                  <span style="font-size:22px;font-weight:800;letter-spacing:-0.5px;background:linear-gradient(90deg,#22d3ee,#a78bfa);-webkit-background-clip:text;background-clip:text;color:#22d3ee;">AetherForge AI</span>
                </div>
                <div style="background:linear-gradient(180deg,#0d1424,#0a101e);border:1px solid rgba(34,211,238,0.18);border-radius:18px;padding:34px 30px;">
                  <h2 style="margin:0 0 14px;font-size:22px;color:#f1f5f9;">Reset your password</h2>
                  <p style="margin:0 0 10px;font-size:15px;line-height:1.6;color:#a9b4c7;">
                    Hi ${user.name || "there"}, we received a request to reset the password for your AetherForge account.
                  </p>
                  <p style="margin:0 0 26px;font-size:15px;line-height:1.6;color:#a9b4c7;">
                    Click the button below to choose a new password. This secure link expires in 1 hour.
                  </p>
                  <div style="text-align:center;margin:0 0 26px;">
                    <a href="${url}" style="display:inline-block;padding:14px 34px;border-radius:12px;background:linear-gradient(90deg,#22d3ee,#a78bfa);color:#070b16;font-weight:700;font-size:15px;text-decoration:none;">Reset Password</a>
                  </div>
                  <p style="margin:0 0 8px;font-size:13px;line-height:1.6;color:#7c8598;">
                    If the button doesn't work, copy and paste this link into your browser:
                  </p>
                  <p style="margin:0 0 22px;font-size:12px;line-height:1.5;word-break:break-all;color:#22d3ee;">${url}</p>
                  <p style="margin:0;font-size:13px;line-height:1.6;color:#7c8598;border-top:1px solid rgba(148,163,184,0.14);padding-top:18px;">
                    If you didn't request a password reset, you can safely ignore this email — your password will stay the same.
                  </p>
                </div>
                <p style="text-align:center;margin:22px 0 0;font-size:12px;color:#5b6478;">© AetherForge AI · Automated security message</p>
              </div>
            </div>
          `,
        });
        console.log(`[auth] Password reset email sent to ${user.email}`);
      } catch (e) {
        console.error(`[auth] Failed to send password reset email to ${user.email}:`, e);
        throw e;
      }
    },
    resetPasswordTokenExpiresIn: 3600,
  },

  // ===========================================================================
  // EMAIL VERIFICATION - Uncomment to enable email verification
  // ===========================================================================
  // sendOnSignUp: sends verification email automatically after registration
  // autoSignInAfterVerification: logs user in after clicking verification link
  // Required: Create /verify-email page to handle the callback
  // To require verification before login, set requireEmailVerification: true
  // in emailAndPassword config above
  // ---------------------------------------------------------------------------
  emailVerification: {
    sendOnSignUp: true,
    autoSignInAfterVerification: true,
    // The `url` Better Auth builds points at /api/auth/verify-email?token=...&
    // callbackURL=/verify-email — clicking it verifies the address then redirects
    // the browser to our branded /verify-email success page.
    sendVerificationEmail: async ({ user, url }) => {
      console.log(`[auth] Sending verification email to ${user.email}`);
      try {
        await totalumSdk.email.sendEmail({
          to: [user.email],
          subject: "Verify your email to activate AetherForge AI",
          fromName: "AetherForge AI",
          html: `
            <div style="margin:0;padding:0;background-color:#070b16;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;">
              <div style="max-width:520px;margin:0 auto;padding:40px 24px;">
                <div style="text-align:center;margin-bottom:28px;">
                  <span style="font-size:22px;font-weight:800;letter-spacing:-0.5px;background:linear-gradient(90deg,#22d3ee,#a78bfa);-webkit-background-clip:text;background-clip:text;color:#22d3ee;">AetherForge AI</span>
                </div>
                <div style="background:linear-gradient(180deg,#0d1424,#0a101e);border:1px solid rgba(34,211,238,0.18);border-radius:18px;padding:34px 30px;">
                  <h2 style="margin:0 0 14px;font-size:22px;color:#f1f5f9;">Confirm your email address</h2>
                  <p style="margin:0 0 10px;font-size:15px;line-height:1.6;color:#a9b4c7;">
                    Welcome${user.name ? `, ${user.name}` : ""}! You're one step away from your AetherForge portfolio command center.
                  </p>
                  <p style="margin:0 0 26px;font-size:15px;line-height:1.6;color:#a9b4c7;">
                    Verify your email to activate your account and unlock your dashboard, holdings and projections.
                  </p>
                  <div style="text-align:center;margin:0 0 26px;">
                    <a href="${url}" style="display:inline-block;padding:14px 34px;border-radius:12px;background:linear-gradient(90deg,#22d3ee,#a78bfa);color:#070b16;font-weight:700;font-size:15px;text-decoration:none;">Verify My Email</a>
                  </div>
                  <p style="margin:0 0 8px;font-size:13px;line-height:1.6;color:#7c8598;">
                    If the button doesn't work, copy and paste this link into your browser:
                  </p>
                  <p style="margin:0 0 22px;font-size:12px;line-height:1.5;word-break:break-all;color:#22d3ee;">${url}</p>
                  <p style="margin:0;font-size:13px;line-height:1.6;color:#7c8598;border-top:1px solid rgba(148,163,184,0.14);padding-top:18px;">
                    If you didn't create an AetherForge account, you can safely ignore this email.
                  </p>
                </div>
                <p style="text-align:center;margin:22px 0 0;font-size:12px;color:#5b6478;">© AetherForge AI · Automated security message</p>
              </div>
            </div>
          `,
        });
        console.log(`[auth] Verification email sent to ${user.email}`);
      } catch (e) {
        console.error(`[auth] Failed to send verification email to ${user.email}:`, e);
        throw e;
      }
    },
  },

  // ===========================================================================
  // SOCIAL PROVIDERS - Uncomment to enable Google/GitHub/etc sign-in
  // ===========================================================================
  // Required env vars: GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET
  // Google Cloud Console callback URL: {NEXT_PUBLIC_APP_URL}/api/auth/callback/google
  // ---------------------------------------------------------------------------
  // socialProviders: {
  //   google: {
  //     clientId: process.env.GOOGLE_CLIENT_ID!,
  //     clientSecret: process.env.GOOGLE_CLIENT_SECRET!,
  //   },
  //   // github: {
  //   //   clientId: process.env.GITHUB_CLIENT_ID!,
  //   //   clientSecret: process.env.GITHUB_CLIENT_SECRET!,
  //   // },
  // },

  // Session configuration
  session: {
    expiresIn: 60 * 60 * 24 * 7, // 7 days
    updateAge: 60 * 60 * 24, // Update session once per day
    cookieCache: {
      enabled: true,
      maxAge: 30, // 30 seconds - reduced for faster role/permission updates
    },
  },

  // Security
  secret: process.env.BETTER_AUTH_SECRET,
  baseURL: effectiveUrl,
  basePath: "/api/auth",

  // Trusted origins for CORS
  // Uses a dynamic function so both the default subdomain and custom domains
  // are trusted without needing a re-deploy after adding a custom domain.
  trustedOrigins: (request: Request) => {
    const origin = request.headers.get("origin");
    if (!origin) return [];

    // Development: trust any origin
    if (process.env.NODE_ENV !== "production") return [origin];

    // Trust the configured app URL
    if (process.env.NEXT_PUBLIC_APP_URL && origin === new URL(process.env.NEXT_PUBLIC_APP_URL).origin) {
      return [origin];
    }

    // Trust testing URL (only when server is started via npm run test:serve)
    if (process.env.TESTING_MODE === "true" && process.env.LOCAL_NEXTJS_PROJECT_TESTING_URL && origin === new URL(process.env.LOCAL_NEXTJS_PROJECT_TESTING_URL).origin) {
      return [origin];
    }

    // Trust any *.totalum-project.com subdomain
    if (/^https:\/\/[^/]+\.totalum-project\.com$/.test(origin)) return [origin];

    // Trust same-host requests (custom domain served by this same worker)
    const host = request.headers.get("host");
    if (host && origin === `https://${host}`) return [origin];

    return [];
  },

  // Advanced security options — cookie security is based on whether effectiveUrl is HTTPS.
  // In testing mode (TESTING_MODE=true via test:serve), effectiveUrl is localhost HTTP,
  // so cookies use http-compatible settings (no __Secure- prefix, secure=false, sameSite=lax).
  advanced: (() => {
    const isHttps = effectiveUrl.startsWith("https://");
    const sameSiteValue = isHttps ? "none" as const : "lax" as const;
    return {
      cookiePrefix: "better-auth",
      defaultCookieAttributes: {
        httpOnly: true,
        secure: isHttps,
        sameSite: sameSiteValue,
        path: "/",
      },
      crossSubDomainCookies: {
        enabled: false,
      },
      cookies: {
        session_token: {
          attributes: {
            sameSite: sameSiteValue,
            secure: isHttps,
            httpOnly: true,
            path: "/",
          },
        },
        session_data: {
          attributes: {
            sameSite: sameSiteValue,
            secure: isHttps,
            httpOnly: true,
            path: "/",
          },
        },
      },
      useSecureCookies: isHttps,
    };
  })(),

  // Plugins
  plugins: [
    bearer(), // Bearer token support for API clients
    nextCookies(), // Auto-set cookies in server actions (must be last)
  ],

  // ============================================================================
  // USER ADDITIONAL FIELDS - Multi-role / Multi-type User Systems (only if is needed)
  // ============================================================================
  //
  // To add custom user fields (e.g., role, user_type, company_id):
  //
  // 1. Add the field to additionalFields below
  // 2. Add the same field (snake_case) to the Totalum "user" table
  // 3. Create an ExtendedUser interface below for type safety
  //
  // EXAMPLE - Adding a "role" field:
  // ---------------------------------
  // additionalFields: {
  //   role: {
  //     type: "string",        // "string" | "number" | "boolean"
  //     required: false,       // true = required at registration
  //     defaultValue: "user",  // default value if not provided
  //     input: true,           // true = can be set during signUp
  //   },
  // },
  //
  // EXAMPLE - Multiple fields (role + user_type):
  // ----------------------------------------------
  // additionalFields: {
  //   role: {
  //     type: "string",
  //     required: false,
  //     defaultValue: "user",
  //     input: true,
  //   },
  //   user_type: {
  //     type: "string",
  //     required: false,
  //     input: true,
  //   },
  //   company_id: {
  //     type: "string",
  //     required: false,
  //     input: true,
  //   },
  // },
  //
  // IMPORTANT: After adding fields here, create an ExtendedUser interface:
  // ----------------------------------------------------------------------
  // export interface ExtendedUser {
  //   id: string;
  //   email: string;
  //   name: string;
  //   image?: string | null;
  //   emailVerified: boolean;
  //   createdAt: Date;
  //   updatedAt: Date;
  //   role?: string;        // <-- your custom field
  //   user_type?: string;   // <-- your custom field
  // }
  //
  // USAGE in components:
  // --------------------
  // import { useSession } from '@/lib/auth-client';
  // import type { ExtendedUser } from '@/lib/auth';
  //
  // const { data: session } = useSession();
  // const user = session?.user as ExtendedUser;
  // if (user?.role === 'admin') { /* admin logic */ }
  //
  // ============================================================================
  user: {
    // Allow users to update their email from Settings. No verification email is
    // sent (email delivery isn't configured), so the change applies directly.
    changeEmail: {
      enabled: true,
    },
    additionalFields: {
      stripe_customer_id: {
        type: "string",
        required: false,
        input: false,
      },
      subscription_status: {
        type: "string",
        required: false,
        defaultValue: "none",
        input: false,
      },
      subscription_plan: {
        type: "string",
        required: false,
        defaultValue: "none",
        input: false,
      },
    },
  },
});

// Base types from Better Auth
export type Session = typeof auth.$Infer.Session;
export type User = Session["user"];

// Extended user with subscription/billing fields (from additionalFields above)
export interface ExtendedUser {
  id: string;
  email: string;
  name: string;
  image?: string | null;
  emailVerified: boolean;
  createdAt: Date;
  updatedAt: Date;
  stripe_customer_id?: string | null;
  subscription_status?: "active" | "canceled" | "past_due" | "none" | null;
  subscription_plan?: "monthly" | "yearly" | "none" | null;
}
