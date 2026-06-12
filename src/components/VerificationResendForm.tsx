"use client";

import { useState } from "react";
import ResendButton from "./ResendButton";

export default function VerificationResendForm() {
  const [email, setEmail] = useState("");

  return (
    <div className="space-y-4 w-full text-left">
      <div>
        <label htmlFor="resend-email" className="block text-xs font-bold text-slate-400 uppercase tracking-wider mb-1.5">
          Email Address
        </label>
        <input
          id="resend-email"
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="name@company.com"
          required
          className="block w-full px-3.5 py-2.5 bg-slate-950 border border-slate-800 rounded-xl text-slate-100 placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 text-sm transition-all"
        />
      </div>
      <ResendButton email={email.trim()} />
    </div>
  );
}
