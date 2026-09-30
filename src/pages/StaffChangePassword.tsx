import React, { useState } from "react";
import { Navigate, useNavigate } from "react-router-dom";
import { motion } from "framer-motion";
import { ShieldCheck, KeyRound, Eye, EyeOff, Loader2, AlertTriangle, LogOut } from "lucide-react";
import { useStore } from "@/lib/store";
import { api, ApiError, DEMO_MODE } from "@/lib/api";
import { BrandWordmark } from "@/components/BrandLogo";
import { ThemeToggle } from "@/components/ThemeToggle";

const MIN_LEN = 12;

export default function StaffChangePassword() {
  const { session, toast, clearMustChangePassword, logout } = useStore();
  const navigate = useNavigate();
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [confirm, setConfirm] = useState("");
  const [show, setShow] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  if (!session?.authenticated) return <Navigate to="/login" replace />;

  const forced = Boolean(session.mustChangePassword);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    if (!current) {
      setError("Enter your current (temporary) password");
      return;
    }
    if (next.length < MIN_LEN) {
      setError(`New password must be at least ${MIN_LEN} characters`);
      return;
    }
    if (next !== confirm) {
      setError("New passwords do not match");
      return;
    }
    if (next === current) {
      setError("Choose a password different from your temporary one");
      return;
    }
    setBusy(true);
    try {
      if (!DEMO_MODE) {
        await api.post("/staff/me/password", { current_password: current, new_password: next });
      }
      clearMustChangePassword();
      toast("success", "Password updated", "You're all set.");
      navigate("/dashboard", { replace: true });
    } catch (err) {
      setError(err instanceof ApiError ? err.message : err instanceof Error ? err.message : "Could not update password");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="relative min-h-screen flex items-center justify-center p-4 bg-phantix-950">
      <div className="absolute right-6 top-6 z-20 flex items-center gap-2">
        <ThemeToggle />
        <button onClick={logout} className="btn-ghost !px-2 !py-1.5 text-xs" title="Sign out">
          <LogOut size={14} />
        </button>
      </div>
      <motion.div
        initial={{ opacity: 0, y: 24 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.45, ease: [0.22, 1, 0.36, 1] }}
        className="w-full max-w-sm"
      >
        <div className="flex flex-col items-center mb-8">
          <BrandWordmark className="mb-4 h-12" />
          <h1 className="font-display text-xl font-bold text-slate-100">
            {forced ? "Set your password" : "Change password"}
          </h1>
          <p className="text-sm text-slate-500 mt-1 text-center">
            {forced
              ? "Your account was created with a temporary password. Choose your own to continue."
              : "Update the password for your staff account."}
          </p>
        </div>

        <form onSubmit={submit} className="card p-6 space-y-4">
          {forced && (
            <div className="flex items-center gap-2 rounded-lg bg-severity-medium/10 border border-severity-medium/30 px-3 py-2 text-xs text-severity-medium">
              <AlertTriangle size={14} />
              You must change this password before using the staff portal.
            </div>
          )}
          {error && (
            <div className="flex items-center gap-2 rounded-lg bg-severity-critical/10 border border-severity-critical/30 px-3 py-2 text-xs text-severity-critical">
              <AlertTriangle size={14} />
              {error}
            </div>
          )}

          <div>
            <label className="label">Temporary / current password</label>
            <div className="relative">
              <KeyRound size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" />
              <input
                type={show ? "text" : "password"}
                className="input pl-9 pr-9"
                value={current}
                onChange={(e) => setCurrent(e.target.value)}
                autoFocus
                autoComplete="current-password"
              />
              <button
                type="button"
                className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-500 hover:text-slate-300"
                onClick={() => setShow((s) => !s)}
              >
                {show ? <EyeOff size={14} /> : <Eye size={14} />}
              </button>
            </div>
          </div>

          <div>
            <label className="label">New password</label>
            <input
              type={show ? "text" : "password"}
              className="input"
              value={next}
              onChange={(e) => setNext(e.target.value)}
              autoComplete="new-password"
            />
            <p className="mt-1 text-[13px] text-slate-500">
              At least {MIN_LEN} characters, with upper and lower case, a number and a symbol.
            </p>
          </div>

          <div>
            <label className="label">Confirm new password</label>
            <input
              type={show ? "text" : "password"}
              className="input"
              value={confirm}
              onChange={(e) => setConfirm(e.target.value)}
              autoComplete="new-password"
            />
          </div>

          <button type="submit" disabled={busy} className="btn-primary w-full">
            {busy ? <Loader2 size={16} className="animate-spin" /> : <ShieldCheck size={16} />}
            {forced ? "Set password and continue" : "Update password"}
          </button>
        </form>
      </motion.div>
    </div>
  );
}
