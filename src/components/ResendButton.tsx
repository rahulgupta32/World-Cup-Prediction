"use client";

import { useState, useEffect } from "react";
import { resendVerification } from "@/app/actions/auth";
import { Loader2, Send } from "lucide-react";

interface ResendButtonProps {
  email: string;
}

export default function ResendButton({ email }: ResendButtonProps) {
  const [isPending, setIsPending] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [cooldown, setCooldown] = useState(0);

  useEffect(() => {
    if (cooldown <= 0) return;
    const timer = setTimeout(() => {
      setCooldown((prev) => prev - 1);
    }, 1000);
    return () => clearTimeout(timer);
  }, [cooldown]);

  const handleResend = async () => {
    if (cooldown > 0) return;
    setIsPending(true);
    setMessage(null);
    setError(null);

    try {
      const res = await resendVerification(email);
      if (res.success) {
        setMessage(res.message || "A verification link has been sent!");
        setCooldown(120); // 120s cooldown
      } else {
        setError(res.error || "An error occurred");
        // Check if error message contains secondary time, e.g. "wait 45 seconds"
        const match = res.error?.match(/(\d+)\s+seconds/);
        if (match) {
          setCooldown(parseInt(match[1], 10));
        }
      }
    } catch (err) {
      setError("An unexpected error occurred. Please try again.");
    } finally {
      setIsPending(false);
    }
  };

  return (
    <div className="space-y-3 w-full">
      <button
        onClick={handleResend}
        disabled={isPending || cooldown > 0}
        type="button"
        className="w-full flex justify-center items-center py-2.5 px-4 border border-transparent rounded-xl shadow-sm text-sm font-bold text-slate-950 bg-gradient-to-r from-emerald-400 to-teal-300 hover:from-emerald-350 hover:to-teal-250 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-offset-slate-900 focus:ring-emerald-500 transition-all disabled:opacity-60 disabled:cursor-not-allowed cursor-pointer"
      >
        {isPending ? (
          <>
            <Loader2 className="animate-spin -ml-1 mr-2 h-4.5 w-4.5 text-slate-950" />
            Sending...
          </>
        ) : cooldown > 0 ? (
          `Resend in ${cooldown}s`
        ) : (
          <>
            <Send className="mr-2 h-4 w-4 text-slate-950" />
            Resend Email
          </>
        )}
      </button>

      {message && (
        <p className="text-sm font-medium text-emerald-400 mt-2">
          {message}
        </p>
      )}

      {error && (
        <p className="text-sm font-medium text-red-400 mt-2">
          {error}
        </p>
      )}
    </div>
  );
}
