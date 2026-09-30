import React, { useState } from "react";
import { Link } from "react-router-dom";
import { ArrowRight, KeyRound, Mail, ShieldCheck } from "lucide-react";
import { BrandWordmark } from "@/components/BrandLogo";
import { ThemeToggle } from "@/components/ThemeToggle";
import { api, DEMO_MODE, delay } from "@/lib/api";

export default function StaffPasswordResetRequest() {
  const [email, setEmail] = useState("");
  const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState("");

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email.trim()) return;
    setBusy(true);
    setError("");
    try {
      if (DEMO_MODE) await delay(300);
      else await api.post("/staff/password-reset/request", { email: email.trim() });
      setSent(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not request a reset link");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-phantix-950 px-4">
      <div className="fixed right-6 top-6"><ThemeToggle /></div>
      <div className="w-full max-w-[420px]">
        <div className="mb-8 text-center">
          <BrandWordmark className="mx-auto block h-11" />
          <h1 className="mt-5 font-display text-2xl font-bold text-white">Reset your password</h1>
          <p className="mt-1.5 text-sm text-slate-400">Staff portal password recovery</p>
        </div>
        <div className="card p-7">
          {sent ? (
            <div className="text-center">
              <ShieldCheck size={28} className="mx-auto text-emerald-400" />
              <h2 className="mt-3 font-display text-lg font-semibold text-white">Check your email</h2>
              <p className="mt-2 text-sm leading-6 text-slate-400">If that staff account exists, the system sends a reset link. The link expires in 30 minutes.</p>
              <Link to="/login" className="btn-primary mt-6 w-full"><ArrowRight size={15} /> Return to sign in</Link>
            </div>
          ) : (
            <form onSubmit={submit} className="space-y-4">
              <div>
                <label className="label">Staff email</label>
                <div className="relative">
                  <Mail size={15} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-500" />
                  <input autoFocus className="input !pl-10" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="staff@phantix.ng" />
                </div>
              </div>
              {error && <p className="text-sm text-severity-critical">{error}</p>}
              <button className="btn-primary w-full !py-3" disabled={busy || !email.trim()}>
                {busy ? "Sending..." : "Send reset link"} <KeyRound size={15} />
              </button>
              <Link to="/login" className="block text-center text-xs text-slate-500 hover:text-slate-300">Back to sign in</Link>
            </form>
          )}
        </div>
      </div>
    </div>
  );
}
