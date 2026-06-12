import crypto from "crypto";

export function generateVerificationToken(): string {
  return crypto.randomBytes(32).toString("hex");
}

export function hashToken(token: string): string {
  return crypto.createHash("sha256").update(token).digest("hex");
}

export async function sendVerificationEmail(email: string, token: string): Promise<boolean> {
  const appUrl = (process.env.APP_URL || "http://localhost:3000").replace(/\/$/, "");
  const verificationLink = `${appUrl}/verify-email?token=${token}`;

  console.log(`[EMAIL VERIFICATION] Verification link for ${email}: ${verificationLink}`);

  const apiKey = process.env.RESEND_API_KEY;
  const fromEmail = process.env.EMAIL_FROM || "onboarding@resend.dev";

  if (!apiKey) {
    console.log("[EMAIL VERIFICATION] No RESEND_API_KEY found, skipped sending email. Link was logged above.");
    return true;
  }

  const subject = "Verify your email for World Cup Predictor League";
  const htmlContent = `
    <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; border: 1px solid #e2e8f0; border-radius: 12px; background-color: #ffffff; color: #1a202c;">
      <div style="text-align: center; margin-bottom: 24px;">
        <h1 style="color: #0f172a; font-size: 24px; font-weight: 700; margin: 0;">⚽ World Cup Predictor League</h1>
      </div>
      <div style="line-height: 1.6; font-size: 16px; color: #334155;">
        <p>Hello,</p>
        <p>Thank you for signing up! Please verify your email address to active your account and start making your World Cup predictions.</p>
        
        <div style="text-align: center; margin: 32px 0;">
          <a href="${verificationLink}" style="background-color: #2563eb; color: #ffffff; padding: 12px 24px; border-radius: 6px; text-decoration: none; font-weight: 600; display: inline-block; box-shadow: 0 4px 6px -1px rgba(37, 99, 235, 0.1), 0 2px 4px -1px rgba(37, 99, 235, 0.06);">
            Verify Email Address
          </a>
        </div>
        
        <p style="font-size: 14px; color: #64748b; margin-top: 24px;">
          Or copy and paste this link into your browser:
          <br />
          <a href="${verificationLink}" style="color: #2563eb; word-break: break-all;">${verificationLink}</a>
        </p>
        
        <hr style="border: 0; border-top: 1px solid #e2e8f0; margin: 24px 0;" />
        
        <p style="font-size: 12px; color: #94a3b8; text-align: center;">
          This link will expire in 24 hours. If you did not request this email, you can safely ignore it.
        </p>
      </div>
    </div>
  `;

  try {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: fromEmail,
        to: email,
        subject: subject,
        html: htmlContent,
      }),
    });

    if (!res.ok) {
      const errorText = await res.text();
      console.error(`Resend API error: Status ${res.status}. Body: ${errorText}`);
      return false;
    }

    const data = await res.json();
    console.log(`Email successfully sent via Resend: ${data.id}`);
    return true;
  } catch (error) {
    console.error("Failed to send verification email through Resend API:", error);
    return false;
  }
}
