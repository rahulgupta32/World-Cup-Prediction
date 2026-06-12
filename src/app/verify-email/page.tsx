import { prisma } from "@/lib/db";
import { hashToken } from "@/lib/email";
import Link from "next/link";
import { Trophy, CheckCircle, AlertTriangle, ArrowRight } from "lucide-react";
import VerificationResendForm from "@/components/VerificationResendForm";

interface PageProps {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}

export default async function VerifyEmailPage({ searchParams }: PageProps) {
  const params = await searchParams;
  const token = typeof params.token === "string" ? params.token : undefined;

  let isVerified = false;
  let errorMsg: string | null = null;

  if (!token) {
    errorMsg = "Verification token is missing. Please click the link in your email.";
  } else {
    try {
      const hashed = hashToken(token);
      const user = await prisma.user.findFirst({
        where: {
          verificationToken: hashed,
        },
      });

      if (!user) {
        errorMsg = "Invalid or expired verification link. Please request a new one.";
      } else {
        // Check expiry
        if (user.verificationTokenExpiresAt && user.verificationTokenExpiresAt < new Date()) {
          errorMsg = "This verification link has expired. Please request a new one.";
        } else {
          // Verify user
          await prisma.user.update({
            where: { id: user.id },
            data: {
              emailVerifiedAt: new Date(),
              verificationToken: null,
              verificationTokenExpiresAt: null,
            },
          });
          isVerified = true;
        }
      }
    } catch (e) {
      console.error("Verification error:", e);
      errorMsg = "An unexpected error occurred during verification. Please try again.";
    }
  }

  return (
    <div className="min-h-screen bg-slate-950 flex flex-col justify-center py-12 sm:px-6 lg:px-8 relative overflow-hidden font-sans">
      {/* Background patterns */}
      <div className="absolute top-0 left-0 w-full h-full bg-[radial-gradient(ellipse_at_top_right,_var(--tw-gradient-stops))] from-emerald-900/20 via-slate-950 to-slate-950 z-0" />
      <div className="absolute -top-40 -left-40 w-80 h-80 bg-emerald-500/10 rounded-full blur-3xl z-0" />
      <div className="absolute top-1/2 right-0 w-96 h-96 bg-teal-500/10 rounded-full blur-3xl z-0" />

      <div className="sm:mx-auto sm:w-full sm:max-w-md z-10">
        <div className="flex justify-center">
          <div className="h-14 w-14 rounded-2xl bg-emerald-500/10 flex items-center justify-center border border-emerald-500/20 shadow-emerald-500/5 shadow-lg">
            <Trophy className="h-8 w-8 text-amber-400" />
          </div>
        </div>
        <h2 className="mt-6 text-center text-3xl font-extrabold tracking-tight bg-gradient-to-r from-emerald-400 to-teal-300 bg-clip-text text-transparent">
          World Cup Prediction League
        </h2>
      </div>

      <div className="mt-8 sm:mx-auto sm:w-full sm:max-w-md z-10">
        <div className="bg-slate-900/80 backdrop-blur-md py-8 px-4 border border-slate-800/80 shadow-2xl rounded-2xl sm:px-10 text-center">
          {isVerified ? (
            <div className="space-y-6">
              <div className="flex justify-center">
                <div className="h-16 w-16 rounded-full bg-emerald-500/10 flex items-center justify-center border border-emerald-500/20 shadow-emerald-500/10 shadow-lg">
                  <CheckCircle className="h-10 w-10 text-emerald-400 animate-bounce" />
                </div>
              </div>

              <div className="space-y-2">
                <h3 className="text-xl font-bold text-slate-100">Email Verified!</h3>
                <p className="text-sm text-slate-400 leading-relaxed px-2">
                  Thank you! Your email address has been successfully verified. You can now sign in and make predictions.
                </p>
              </div>

              <div className="pt-2">
                <Link
                  href="/login"
                  className="w-full flex justify-center items-center py-3 px-4 border border-transparent rounded-xl shadow-sm text-sm font-bold text-slate-950 bg-gradient-to-r from-emerald-400 to-teal-300 hover:from-emerald-350 hover:to-teal-250 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-offset-slate-900 focus:ring-emerald-500 transition-all cursor-pointer"
                >
                  Go to Login
                  <ArrowRight className="ml-2 h-4 w-4 text-slate-950" />
                </Link>
              </div>
            </div>
          ) : (
            <div className="space-y-6">
              <div className="flex justify-center">
                <div className="h-16 w-16 rounded-full bg-red-500/10 flex items-center justify-center border border-red-500/20 shadow-red-500/10 shadow-lg">
                  <AlertTriangle className="h-9 w-9 text-red-400" />
                </div>
              </div>

              <div className="space-y-2">
                <h3 className="text-xl font-bold text-slate-100">Verification Failed</h3>
                <p className="text-sm text-red-400 font-medium">
                  {errorMsg}
                </p>
              </div>

              <div className="border-t border-slate-800/80 pt-6">
                <VerificationResendForm />
              </div>

              <div className="border-t border-slate-800/80 pt-4">
                <Link
                  href="/login"
                  className="text-sm font-semibold text-slate-400 hover:text-slate-300 transition-colors"
                >
                  Back to Login
                </Link>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
