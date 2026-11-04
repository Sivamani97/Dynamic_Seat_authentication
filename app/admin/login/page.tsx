"use client";

import { useState, Suspense } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { LayoutDashboard, Mail, Lock, RefreshCw, Eye, EyeOff, ShieldCheck, UserX } from "lucide-react";
import { createClient } from "@/lib/supabase/client";

function AdminLoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const redirectTarget = searchParams.get("redirect");

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const handleAdminLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setErrorMsg(null);

    try {
      const supabase = createClient();

      // 1. Authenticate credentials with Supabase Auth
      const { data, error } = await supabase.auth.signInWithPassword({
        email: email.trim(),
        password,
      });

      if (error) {
        setErrorMsg(error.message || "Invalid administrator credentials.");
        setLoading(false);
        return;
      }

      if (!data?.user) {
        setErrorMsg("Authentication failed. No user identity returned.");
        setLoading(false);
        return;
      }

      // 2. Authoritative Server-Side Role Verification
      // SECURITY: Must verify ADMIN role strictly from trusted database profile public.profiles.role
      const authRes = await fetch("/api/auth/me");
      const authData = await authRes.json();
      const verifiedRole = authData?.user?.role;

      if (!authData?.authenticated || !verifiedRole) {
        await supabase.auth.signOut();
        setErrorMsg("Failed to verify administrative authorization. Please try again.");
        setLoading(false);
        return;
      }

      // 3. Strict Admin Role Guard
      // Both USER and STAFF accounts are strictly rejected from Admin Command!
      if (verifiedRole !== "ADMIN") {
        // Sign out immediately and clear session cookies
        await supabase.auth.signOut();
        setErrorMsg(
          "Access denied: Administrator privileges required. Your account does not have executive governance permissions."
        );
        setLoading(false);
        return;
      }

      // 4. Authorized Admin -> Route to Executive Admin Dashboard
      const destination = redirectTarget || "/admin";
      router.push(destination);
    } catch (err: any) {
      setErrorMsg(err.message || "An unexpected error occurred during admin login.");
      setLoading(false);
    }
  };

  return (
    <div className="max-w-md mx-auto px-4 py-12 space-y-6">
      <div className="glass-panel p-8 rounded-3xl border border-purple-500/20 bg-slate-950/80 space-y-6 shadow-2xl">
        {/* Brand Header */}
        <div className="text-center space-y-2">
          <div className="w-12 h-12 rounded-2xl bg-purple-500/10 border border-purple-500/30 flex items-center justify-center mx-auto text-purple-400 shadow-md shadow-purple-500/10">
            <LayoutDashboard className="w-6 h-6" />
          </div>
          <div className="inline-block px-2.5 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider bg-purple-500/10 text-purple-400 border border-purple-500/20">
            Executive Governance
          </div>
          <h1 className="text-2xl font-black text-white">SmartSeat Admin Command</h1>
          <p className="text-xs text-slate-400 max-w-xs mx-auto">
            Restricted access for system administrators, audit verification officers, and platform architects.
          </p>
        </div>

        {/* Error Notification */}
        {errorMsg && (
          <div className="p-3.5 rounded-xl bg-rose-500/10 border border-rose-500/30 text-rose-300 text-xs text-center font-medium flex items-start gap-2.5">
            <UserX className="w-4 h-4 shrink-0 text-rose-400 mt-0.5" />
            <span className="text-left leading-relaxed">{errorMsg}</span>
          </div>
        )}

        <form onSubmit={handleAdminLogin} className="space-y-4">
          <div>
            <label htmlFor="admin-email" className="text-xs font-semibold text-slate-300 block mb-1">
              Administrator Email Address
            </label>
            <div className="relative">
              <Mail className="w-4 h-4 text-slate-500 absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                id="admin-email"
                type="email"
                required
                autoComplete="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="admin@smartseat.io"
                className="w-full pl-9 pr-3 py-2.5 rounded-xl bg-slate-900 border border-slate-700 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-purple-500 transition-colors"
              />
            </div>
          </div>

          <div>
            <label htmlFor="admin-password" className="text-xs font-semibold text-slate-300 block mb-1">
              Administrator Password
            </label>
            <div className="relative">
              <Lock className="w-4 h-4 text-slate-500 absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                id="admin-password"
                type={showPassword ? "text" : "password"}
                required
                autoComplete="current-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
                className="w-full pl-9 pr-10 py-2.5 rounded-xl bg-slate-900 border border-slate-700 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-purple-500 transition-colors"
              />
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-500 hover:text-slate-300 focus:outline-none"
                aria-label={showPassword ? "Hide password" : "Show password"}
              >
                {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </div>
          </div>

          <button
            type="submit"
            disabled={loading}
            className="w-full py-2.5 rounded-xl bg-purple-600 hover:bg-purple-500 disabled:bg-purple-800 disabled:cursor-not-allowed text-white font-bold text-xs flex items-center justify-center gap-2 shadow-md shadow-purple-600/30 transition-all"
          >
            {loading ? <RefreshCw className="w-4 h-4 animate-spin" /> : <ShieldCheck className="w-4 h-4" />}
            <span>{loading ? "Authenticating Admin..." : "Sign In to Admin Command"}</span>
          </button>
        </form>

        <div className="p-3 rounded-xl bg-slate-900/50 border border-slate-800 text-[11px] text-slate-400 space-y-1">
          <div className="font-semibold text-slate-300">Security Policy:</div>
          <div>All administrative sessions are logged to the cryptographic hash chain. Zero default or hardcoded credentials are permitted.</div>
        </div>

        {/* Quick Nav back to Passenger / Staff */}
        <div className="pt-2 flex items-center justify-between text-[11px] text-slate-400 border-t border-slate-800/80">
          <Link href="/login" className="text-indigo-400 hover:text-indigo-300 transition-colors">
            ← Passenger Login
          </Link>
          <Link href="/staff/login" className="text-amber-400 hover:text-amber-300 transition-colors">
            Staff Portal →
          </Link>
        </div>
      </div>
    </div>
  );
}

export default function AdminLoginPage() {
  return (
    <Suspense fallback={<div className="text-center py-24 text-slate-400 text-xs">Loading SmartSeat Admin Portal...</div>}>
      <AdminLoginForm />
    </Suspense>
  );
}

