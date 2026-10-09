import React, { useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { ArrowRight, CheckCircle2, KeyRound } from "lucide-react";
import { BrandWordmark } from "@/components/BrandLogo";
import { ThemeToggle } from "@/components/ThemeToggle";
import { api, DEMO_MODE, delay } from "@/lib/api";

export default function StaffPasswordResetComplete() {
  const [params] = useSearchParams();
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState("");

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    if (password.length < 12) { setError("Password must be at least 12 characters."); return; }
    if (password !== confirm) { setError("Passwords do not match."); return; }
    const token = params.get("token") ?? "";
    if (!token) { setError("This reset link is missing its token."); return; }
    setBusy(true);
    try {
      if (DEMO_MODE) await delay(300);
      else await api.post("/staff/password-reset/complete", { token, password });
      setDone(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Reset link is invalid or expired");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-phantix-950 px-4">
      <div className="fixed right-6 top-6"><ThemeToggle /></div>
      <div className="w-full max-w-[420px]">
        <div className="mb-8 text-center"><BrandWordmark className="mx-auto block h-11" /><h1 className="mt-5 font-display text-2xl font-bold text-white">Choose a new password</h1></div>
        <div className="card p-7">
          {done ? (
            <div className="text-center"><CheckCircle2 size={30} className="mx-auto text-emerald-400" /><h2 className="mt-3 font-display text-lg font-semibold text-white">Password updated</h2><p className="mt-2 text-sm text-slate-400">Your staff password is reset.</p><Link to="/login" className="btn-primary mt-6 w-full"><ArrowRight size={15} /> Sign in</Link></div>
          ) : (
            <form onSubmit={submit} className="space-y-4">
              <div><label className="label">New password</label><div className="relative"><KeyRound size={15} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-500" /><input autoFocus type="password" className="input !pl-10" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="At least 12 characters" /></div></div>
              <div><label className="label">Confirm password</label><input type="password" className="input" value={confirm} onChange={(e) => setConfirm(e.target.value)} placeholder="Repeat your password" /></div>
              {error && <p className="text-sm text-severity-critical">{error}</p>}
              <button className="btn-primary w-full !py-3" disabled={busy}>{busy ? "Updating..." : "Update password"} <ArrowRight size={15} /></button>
            </form>
          )}
        </div>
      </div>
    </div>
  );
}
