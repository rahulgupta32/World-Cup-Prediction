"use server";

import { prisma } from "@/lib/db";
import { comparePassword, hashPassword, signToken } from "@/lib/auth";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { generateVerificationToken, hashToken, sendVerificationEmail } from "@/lib/email";

export async function login(prevState: any, formData: FormData) {
  const email = formData.get("email")?.toString().trim();
  const password = formData.get("password")?.toString();

  if (!email || !password) {
    return { success: false, error: "Please fill in all fields" };
  }

  try {
    const user = await prisma.user.findUnique({
      where: { email },
    });

    if (!user) {
      return { success: false, error: "Invalid email or password" };
    }

    const isValid = await comparePassword(password, user.passwordHash);
    if (!isValid) {
      return { success: false, error: "Invalid email or password" };
    }

    // Block login until verified
    if (!user.emailVerifiedAt) {
      return { 
        success: false, 
        error: "Please verify your email address before logging in.", 
        needsVerification: true, 
        email: user.email 
      };
    }

    const token = await signToken({
      userId: user.id,
      email: user.email,
      name: user.name,
      role: user.role,
    });

    const cookieStore = await cookies();
    cookieStore.set("session", token, {
      httpOnly: true,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
      maxAge: 24 * 60 * 60, // 24 hours
      path: "/",
    });
  } catch (error) {
    console.error("Login error:", error);
    return { success: false, error: "An unexpected error occurred" };
  }

  redirect("/dashboard");
}

export async function register(prevState: any, formData: FormData) {
  const name = formData.get("name")?.toString().trim();
  const email = formData.get("email")?.toString().trim();
  const password = formData.get("password")?.toString();
  const confirmPassword = formData.get("confirmPassword")?.toString();

  if (!name || !email || !password || !confirmPassword) {
    return { success: false, error: "Please fill in all fields" };
  }

  if (password.length < 6) {
    return { success: false, error: "Password must be at least 6 characters long" };
  }

  if (password !== confirmPassword) {
    return { success: false, error: "Passwords do not match" };
  }

  try {
    const existingUser = await prisma.user.findUnique({
      where: { email },
    });

    if (existingUser) {
      return { success: false, error: "Email is already registered" };
    }

    const passwordHash = await hashPassword(password);
    
    // First user is Admin if none exists, otherwise normal user
    const userCount = await prisma.user.count();
    const role = userCount === 0 ? "ADMIN" : "USER";

    const rawToken = generateVerificationToken();
    const hashed = hashToken(rawToken);
    const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000); // 24 hours

    const user = await prisma.user.create({
      data: {
        name,
        email,
        passwordHash,
        role,
        emailVerifiedAt: null,
        verificationToken: hashed,
        verificationTokenExpiresAt: expiresAt,
        verificationEmailLastSentAt: new Date(),
      },
    });

    // Send verification email
    const emailSent = await sendVerificationEmail(email, rawToken);
    if (!emailSent) {
      console.warn("Failed to send initial verification email during registration.");
    }

    return { 
      success: true, 
      needsVerification: true, 
      email: user.email,
      message: "Registration successful! A verification email has been sent. Please verify your email before logging in."
    };
  } catch (error) {
    console.error("Registration error:", error);
    return { success: false, error: "An unexpected error occurred" };
  }
}

export async function resendVerification(email: string) {
  if (!email) {
    return { success: false, error: "Email is required" };
  }

  try {
    const user = await prisma.user.findUnique({
      where: { email },
    });

    // Return generic success to prevent user enumeration
    if (!user) {
      return { 
        success: true, 
        message: "If a matching unverified account exists, a new verification link has been sent." 
      };
    }

    // Return generic success if already verified
    if (user.emailVerifiedAt) {
      return { 
        success: true, 
        message: "If a matching unverified account exists, a new verification link has been sent." 
      };
    }

    // Rate limiting check (120s cooldown)
    if (user.verificationEmailLastSentAt) {
      const lastSent = new Date(user.verificationEmailLastSentAt).getTime();
      const diffSeconds = (Date.now() - lastSent) / 1000;
      if (diffSeconds < 120) {
        const remaining = Math.ceil(120 - diffSeconds);
        return { 
          success: false, 
          error: `Please wait ${remaining} seconds before requesting another email.` 
        };
      }
    }

    // Generate new token
    const rawToken = generateVerificationToken();
    const hashed = hashToken(rawToken);
    const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000); // 24 hours

    await prisma.user.update({
      where: { id: user.id },
      data: {
        verificationToken: hashed,
        verificationTokenExpiresAt: expiresAt,
        verificationEmailLastSentAt: new Date(),
      },
    });

    await sendVerificationEmail(user.email, rawToken);

    return { 
      success: true, 
      message: "If a matching unverified account exists, a new verification link has been sent." 
    };
  } catch (error) {
    console.error("Resend verification error:", error);
    return { success: false, error: "An unexpected error occurred" };
  }
}

export async function logout() {
  const cookieStore = await cookies();
  cookieStore.delete("session");
  redirect("/login");
}
