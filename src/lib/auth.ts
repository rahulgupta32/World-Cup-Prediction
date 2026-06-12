import { SignJWT, jwtVerify } from "jose";
import bcrypt from "bcryptjs";
import { prisma } from "./db";

// Use standard "next/headers"
import { cookies as nextCookies } from "next/headers";

const JWT_SECRET = new TextEncoder().encode(
  process.env.JWT_SECRET || "super-secret-key-change-me-in-production-12345678"
);

export interface JWTPayload {
  userId: string;
  email: string;
  name: string;
  role: "USER" | "ADMIN";
}

export async function signToken(payload: JWTPayload): Promise<string> {
  return await new SignJWT({ ...payload })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime("24h")
    .sign(JWT_SECRET);
}

export async function verifyToken(token: string): Promise<JWTPayload | null> {
  try {
    const { payload } = await jwtVerify(token, JWT_SECRET);
    return payload as unknown as JWTPayload;
  } catch (error) {
    return null;
  }
}

export async function hashPassword(password: string): Promise<string> {
  return await bcrypt.hash(password, 10);
}

export async function comparePassword(password: string, hash: string): Promise<boolean> {
  return await bcrypt.compare(password, hash);
}

export async function getSessionUser(): Promise<JWTPayload | null> {
  try {
    const cookieStore = await nextCookies();
    const token = cookieStore.get("session")?.value;
    if (!token) return null;
    const payload = await verifyToken(token);
    if (!payload) return null;

    // Strict check: make sure user exists and is email verified in DB
    const dbUser = await prisma.user.findUnique({
      where: { id: payload.userId },
      select: { emailVerifiedAt: true },
    });

    if (!dbUser || !dbUser.emailVerifiedAt) {
      return null;
    }

    return payload;
  } catch (error) {
    return null;
  }
}

// Sensitive action verification from DB
export async function getDbUser(userId: string) {
  return await prisma.user.findUnique({
    where: { id: userId },
    select: {
      id: true,
      name: true,
      email: true,
      role: true,
    },
  });
}

export async function verifyAdminAction(): Promise<{ authenticated: boolean; user: any }> {
  const sessionUser = await getSessionUser();
  if (!sessionUser) {
    return { authenticated: false, user: null };
  }

  const dbUser = await getDbUser(sessionUser.userId);
  if (!dbUser || dbUser.role !== "ADMIN") {
    return { authenticated: false, user: null };
  }

  return { authenticated: true, user: dbUser };
}
