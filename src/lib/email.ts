import crypto from "crypto";
import nodemailer from "nodemailer";

export function generateVerificationToken(): string {
  return crypto.randomBytes(32).toString("hex");
}

export function hashToken(token: string): string {
  return crypto.createHash("sha256").update(token).digest("hex");
}

function getEmailHtml(verificationLink: string): string {
  return `
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
}

export async function sendVerificationEmail(email: string, token: string): Promise<boolean> {
  const isProduction = process.env.NODE_ENV === "production";
  const provider = (process.env.EMAIL_PROVIDER || "resend").toLowerCase();

  // Safe logs
  console.log(`[EMAIL] Provider active: ${provider}`);
  console.log(`[EMAIL] SMTP Configured - Host: ${process.env.SMTP_HOST ? "yes" : "no"}, User: ${process.env.SMTP_USER ? "yes" : "no"}`);
  
  const maskedToken = token.substring(0, 8) + "...";
  console.log(`[EMAIL] Sending verification email to ${email} (token: ${maskedToken})`);

  const appUrl = (process.env.APP_URL || "http://localhost:3000").replace(/\/$/, "");
  const verificationLink = `${appUrl}/verify-email?token=${token}`;
  const subject = "Verify your email for World Cup Predictor League";
  const htmlContent = getEmailHtml(verificationLink);

  if (provider === "smtp") {
    const host = process.env.SMTP_HOST;
    const portStr = process.env.SMTP_PORT;
    const user = process.env.SMTP_USER;
    const pass = process.env.SMTP_PASSWORD;
    const from = process.env.EMAIL_FROM;

    if (!host || !portStr || !user || !pass || !from) {
      if (isProduction) {
        throw new Error(
          `SMTP Configuration is missing in production. Host: ${host ? "configured" : "missing"}, Port: ${portStr ? "configured" : "missing"}, User: ${user ? "configured" : "missing"}, Pass: ${pass ? "configured" : "missing"}, From: ${from ? "configured" : "missing"}`
        );
      } else {
        console.log(`[DEV FALLBACK] Verification Link for ${email}: ${verificationLink}`);
        return true;
      }
    }

    const port = parseInt(portStr, 10);
    const secure = process.env.SMTP_SECURE === "true";

    try {
      const transporter = nodemailer.createTransport({
        host,
        port,
        secure,
        auth: {
          user,
          pass,
        },
      });

      await transporter.sendMail({
        from,
        to: email,
        subject,
        html: htmlContent,
      });

      console.log(`[EMAIL] Email successfully sent to ${email} via SMTP`);
      return true;
    } catch (error) {
      console.error("[EMAIL] Failed to send email via SMTP:", error);
      return false;
    }
  } else if (provider === "resend") {
    const apiKey = process.env.RESEND_API_KEY;
    const from = process.env.EMAIL_FROM;

    if (!apiKey || !from) {
      if (isProduction) {
        throw new Error(
          `Resend Configuration is missing in production. API Key: ${apiKey ? "configured" : "missing"}, From: ${from ? "configured" : "missing"}`
        );
      } else {
        console.log(`[DEV FALLBACK] Verification Link for ${email}: ${verificationLink}`);
        return true;
      }
    }

    try {
      const res = await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${apiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          from,
          to: email,
          subject,
          html: htmlContent,
        }),
      });

      if (!res.ok) {
        const errorText = await res.text();
        console.error(`[EMAIL] Resend API error: Status ${res.status}. Body: ${errorText}`);
        return false;
      }

      const data = await res.json();
      console.log(`[EMAIL] Email successfully sent to ${email} via Resend (ID: ${data.id})`);
      return true;
    } catch (error) {
      console.error("[EMAIL] Failed to send email via Resend:", error);
      return false;
    }
  } else {
    if (isProduction) {
      throw new Error(`Invalid EMAIL_PROVIDER: "${provider}". Must be "smtp" or "resend" in production.`);
    } else {
      console.log(`[DEV FALLBACK] Verification Link for ${email} (invalid provider "${provider}"): ${verificationLink}`);
      return true;
    }
  }
}
