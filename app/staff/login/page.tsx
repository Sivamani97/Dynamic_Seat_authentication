"use client";

import { useState, Suspense } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { ShieldAlert, Mail, Lock, ArrowRight, RefreshCw, Eye, EyeOff, ShieldCheck, UserX } from "lucide-react";
import { createClient } from "@/lib/supabase/client";

function StaffLoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const redirectTarget = searchParams.get("redirect");

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const handleStaffLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setErrorMsg(null);

    try {
      const supabase = createClient();

      // 1. Authenticate credentials against Supabase Auth
      const { data, error } = await supabase.auth.signInWithPassword({
        email: email.trim(),
        password,
      });

      if (error) {
        setErrorMsg(error.message || "Invalid staff credentials.");
        setLoading(false);
        return;
      }

      if (!data?.user) {
        setErrorMsg("Authentication failed. No user record returned.");
        setLoading(false);
        return;
      }

      // 2. Authoritative Server-Side Role Verification
      // SECURITY: Never rely on client-side state. Verify role strictly from server-verified database profile.
      const authRes = await fetch("/api/auth/me");
      const authData = await authRes.json();
      const verifiedRole = authData?.user?.role;

      if (!authData?.authenticated || !verifiedRole) {
        await supabase.auth.signOut();
        setErrorMsg("Failed to verify staff authorization. Please try again.");
        setLoading(false);
        return;
      }

      // 3. Strict Staff/Admin Role Guard
      // Passenger (USER) accounts are strictly forbidden from entering staff operations!
      if (verifiedRole !== "STAFF" && verifiedRole !== "ADMIN") {
        // Sign out immediately and clear session cookies
        await supabase.auth.signOut();
        setErrorMsg(
          "Access denied: This portal is restricted to authorized venue staff and administrators. Passenger accounts cannot access staff operations."
        );
        setLoading(false);
        return;
      }

      // 4. Authorized Staff or Admin -> Route to Staff Live Command Map
      const destination =
        verifiedRole === "ADMIN"
          ? redirectTarget || "/staff"
          : redirectTarget && !redirectTarget.startsWith("/admin")
          ? redirectTarget
          : "/staff";
      router.push(destination);
    } catch (err: any) {
      setErrorMsg(err.message || "An unexpected error occurred during staff login.");
      setLoading(false);
    }
  };

  return (
    <div className="max-w-md mx-auto px-4 py-12 space-y-6">
      <div className="glass-panel p-8 rounded-3xl border border-amber-500/20 bg-slate-950/80 space-y-6 shadow-2xl">
        {/* Brand Header */}
        <div className="text-center space-y-2">
          <div className="w-12 h-12 rounded-2xl bg-amber-500/10 border border-amber-500/30 flex items-center justify-center mx-auto text-amber-400 shadow-md shadow-amber-500/10">
            <ShieldAlert className="w-6 h-6" />
          </div>
          <div className="inline-block px-2.5 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider bg-amber-500/10 text-amber-400 border border-amber-500/20">
            Venue Operations
          </div>
          <h1 className="text-2xl font-black text-white">SmartSeat Staff Portal</h1>
          <p className="text-xs text-slate-400 max-w-xs mx-auto">
            Authorized access for venue ushers, turnstile gate scanners, and live emergency response officers.
          </p>
        </div>

        {/* Error Notification */}
        {errorMsg && (
          <div className="p-3.5 rounded-xl bg-rose-500/10 border border-rose-500/30 text-rose-300 text-xs text-center font-medium flex items-start gap-2.5">
            <UserX className="w-4 h-4 shrink-0 text-rose-400 mt-0.5" />
            <span className="text-left leading-relaxed">{errorMsg}</span>
          </div>
        )}

        <form onSubmit={handleStaffLogin} className="space-y-4">
          <div>
            <label htmlFor="staff-email" className="text-xs font-semibold text-slate-300 block mb-1">
              Staff Email Address
            </label>
            <div className="relative">
              <Mail className="w-4 h-4 text-slate-500 absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                id="staff-email"
                type="email"
                required
                autoComplete="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="staff@venue.com"
                className="w-full pl-9 pr-3 py-2.5 rounded-xl bg-slate-900 border border-slate-700 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-amber-500 transition-colors"
              />
            </div>
          </div>

          <div>
            <label htmlFor="staff-password" className="text-xs font-semibold text-slate-300 block mb-1">
              Staff Password
            </label>
            <div className="relative">
              <Lock className="w-4 h-4 text-slate-500 absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                id="staff-password"
                type={showPassword ? "text" : "password"}
                required
                autoComplete="current-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
                className="w-full pl-9 pr-10 py-2.5 rounded-xl bg-slate-900 border border-slate-700 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-amber-500 transition-colors"
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
            className="w-full py-2.5 rounded-xl bg-amber-600 hover:bg-amber-500 disabled:bg-amber-800 disabled:cursor-not-allowed text-white font-bold text-xs flex items-center justify-center gap-2 shadow-md shadow-amber-600/30 transition-all"
          >
            {loading ? <RefreshCw className="w-4 h-4 animate-spin" /> : <ShieldCheck className="w-4 h-4" />}
            <span>{loading ? "Verifying Authorization..." : "Sign In to Staff Operations"}</span>
          </button>
        </form>

        <div className="p-3 rounded-xl bg-slate-900/50 border border-slate-800 text-[11px] text-slate-400 space-y-1">
          <div className="font-semibold text-slate-300">Staff Account Notice:</div>
          <div>Public registration is disabled. Staff accounts are provisioned exclusively through venue administrative procedures.</div>
        </div>

        {/* Quick Nav back to Passenger / Admin */}
        <div className="pt-2 flex items-center justify-between text-[11px] text-slate-400 border-t border-slate-800/80">
          <Link href="/login" className="text-indigo-400 hover:text-indigo-300 transition-colors">
            ← Passenger Login
          </Link>
          <Link href="/admin/login" className="text-purple-400 hover:text-purple-300 transition-colors">
            Admin Command Portal →
          </Link>
        </div>
      </div>
    </div>
  );
}

export default function StaffLoginPage() {
  return (
    <Suspense fallback={<div className="text-center py-24 text-slate-400 text-xs">Loading SmartSeat Staff Portal...</div>}>
      <StaffLoginForm />
    </Suspense>
  );
}

