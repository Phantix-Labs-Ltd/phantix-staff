import React, { useEffect, useState } from "react";
import { Link, useNavigate, Navigate } from "react-router-dom";
import { motion } from "framer-motion";
import { Shield, Mail, Lock, Eye, EyeOff, Loader2, AlertTriangle } from "lucide-react";
import { useStore } from "@/lib/store";
import { DEMO_MODE, ApiError, throttleSeconds } from "@/lib/api";
import { BrandWordmark } from "@/components/BrandLogo";
import { ThemeToggle } from "@/components/ThemeToggle";

export default function Login() {
  const { session, login } = useStore();
  const navigate = useNavigate();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPw, setShowPw] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  // 429 login throttle (§8) — wait out the lock, never present as a wrong password.
  const [lockedUntil, setLockedUntil] = useState<number | null>(null);
  const [now, setNow] = useState(() => Date.now());
  const locked = lockedUntil != null;
  useEffect(() => {
    if (!locked) return;
    const t = window.setInterval(() => setNow(Date.now()), 500);
    return () => window.clearInterval(t);
  }, [locked]);
  const retryIn = lockedUntil != null ? Math.max(0, Math.ceil((lockedUntil - now) / 1000)) : 0;

  if (session?.authenticated) return <Navigate to="/dashboard" replace />;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    if (!email || !password) {
      setError("Enter your staff email and password");
      return;
    }
    setLoading(true);
    try {
      await login(email, password);
      navigate("/dashboard", { replace: true });
    } catch (err) {
      const apiErr = err instanceof ApiError ? err : null;
      if (apiErr?.status === 429) {
        const secs = throttleSeconds(apiErr) ?? 60;
        setLockedUntil(Date.now() + secs * 1000);
        setError("Too many failed attempts. Try again in a moment.");
      } else {
        setLockedUntil(null);
        setError(err instanceof Error ? err.message : "Login failed. Check your credentials.");
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="relative min-h-screen flex items-center justify-center p-4 bg-phantix-950">
      <div className="absolute right-6 top-6 z-20"><ThemeToggle /></div>
      <motion.div
        initial={{ opacity: 0, y: 24 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5, ease: [0.22, 1, 0.36, 1] }}
        className="w-full max-w-sm"
      >
        {/* Logo */}
        <div className="flex flex-col items-center mb-8">
          <BrandWordmark className="mb-4 h-12" />
          <h1 className="font-display text-xl font-bold text-slate-100">Staff Portal</h1>
          <p className="text-sm text-slate-500 mt-1">Sign in with your staff account</p>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="card p-6 space-y-4">
          {DEMO_MODE && (
            <div className="flex items-center gap-2 rounded-lg bg-severity-medium/10 border border-severity-medium/30 px-3 py-2 text-xs text-severity-medium">
              <AlertTriangle size={14} />
              Demo mode. Any email and any password works.
            </div>
          )}

          {/* Always mounted — reserves the alert's footprint (border included, so
              width never changes either) so a failed login doesn't shove the
              form down a beat after the user already started reading it. */}
          <div
            className={
              "flex min-h-[2.25rem] items-center gap-2 rounded-lg border px-3 py-2 text-xs transition-colors " +
              (error
                ? "border-severity-critical/30 bg-severity-critical/10 text-severity-critical"
                : "border-transparent")
            }
          >
            {error && (
              <>
                <AlertTriangle size={14} className="shrink-0" />
                {retryIn > 0 ? `Too many failed attempts. Try again in ${retryIn}s.` : error}
              </>
            )}
          </div>

          <div>
            <label className="label">Staff Email</label>
            <div className="relative">
              <Mail size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" />
              <input
                type="email"
                className="input pl-9"
                placeholder="admin@phantixlabs.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                autoFocus
              />
            </div>
          </div>

          <div>
            <label className="label">Password</label>
            <div className="relative">
              <Lock size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" />
              <input
                type={showPw ? "text" : "password"}
                className="input pl-9 pr-9"
                placeholder="Enter your password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />
              <button
                type="button"
                className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-500 hover:text-slate-300"
                onClick={() => setShowPw(!showPw)}
              >
                {showPw ? <EyeOff size={14} /> : <Eye size={14} />}
              </button>
            </div>
          </div>

          <button type="submit" disabled={loading || retryIn > 0} className="btn-primary w-full">
            {loading && <Loader2 size={16} className="animate-spin" />}
            {retryIn > 0 ? `Try again in ${retryIn}s` : "Sign In"}
          </button>
          <p className="mt-3 text-center text-xs">
            <Link to="/password-reset" className="text-slate-500 hover:text-slate-300">Forgot password?</Link>
          </p>
        </form>

        <p className="text-center text-xs text-slate-500 mt-6">
          Staff accounts only, for internal use
        </p>
      </motion.div>
    </div>
  );
}
