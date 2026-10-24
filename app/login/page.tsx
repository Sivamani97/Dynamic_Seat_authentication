"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Lock, Mail, ArrowRight, ShieldCheck, RefreshCw, KeyRound, UserCheck } from "lucide-react";
import { createClient } from "@/lib/supabase/client";

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const demoLogins = [
    { role: "ADMIN", email: "admin@demo.com", pass: "Admin@123", label: "Admin Console", path: "/admin" },
    { role: "STAFF", email: "staff@demo.com", pass: "Staff@123", label: "Staff Live Map", path: "/staff" },
    { role: "USER", email: "user1@demo.com", pass: "User@123", label: "User 1 (Seat A12)", path: "/tickets" },
    { role: "USER", email: "user2@demo.com", pass: "User@123", label: "User 2", path: "/events" },
  ];

  const handleQuickLogin = async (demo: typeof demoLogins[0]) => {
    setEmail(demo.email);
    setPassword(demo.pass);
    setLoading(true);
    setErrorMsg(null);

    try {
      const supabase = createClient();
      const { error } = await supabase.auth.signInWithPassword({
        email: demo.email,
        password: demo.pass,
      });

      // Save role in local storage for local fast preview
      localStorage.setItem("smartseat_role", demo.role);

      if (error) {
        // If Supabase project is dummy or local mock, still navigate for presentation!
        console.warn("Supabase Auth notice:", error.message);
      }

      router.push(demo.path);
    } catch {
      localStorage.setItem("smartseat_role", demo.role);
      router.push(demo.path);
    } finally {
      setLoading(false);
    }
  };

  const handleStandardLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setErrorMsg(null);

    try {
      const supabase = createClient();
      const { data, error } = await supabase.auth.signInWithPassword({
        email,
        password,
      });

      if (error) {
        setErrorMsg(error.message);
        setLoading(false);
        return;
      }

      router.push("/tickets");
    } catch (err: any) {
      setErrorMsg(err.message || "Failed to log in");
      setLoading(false);
    }
  };

  return (
    <div className="max-w-md mx-auto px-4 py-12 space-y-6">
      <div className="glass-panel p-8 rounded-3xl border border-slate-800 space-y-6 shadow-2xl">
        <div className="text-center space-y-2">
          <div className="w-12 h-12 rounded-2xl bg-indigo-600/20 border border-indigo-500/30 flex items-center justify-center mx-auto text-indigo-400">
            <Lock className="w-6 h-6" />
          </div>
          <h1 className="text-2xl font-black text-white">SmartSeat Access</h1>
          <p className="text-xs text-slate-400">
            Sign in with your role-assigned credentials
          </p>
        </div>

        {errorMsg && (
          <div className="p-3 rounded-xl bg-rose-500/10 border border-rose-500/30 text-rose-300 text-xs text-center">
            {errorMsg}
          </div>
        )}

        {/* 1-Click Demo Accounts */}
        <div className="space-y-2">
          <span className="text-[11px] uppercase tracking-wider font-bold text-slate-400 block text-center">
            One-Click Demo Switcher
          </span>
          <div className="grid grid-cols-2 gap-2">
            {demoLogins.map((demo) => (
              <button
                key={demo.email}
                type="button"
                onClick={() => handleQuickLogin(demo)}
                className="p-2.5 rounded-xl bg-slate-900 hover:bg-slate-800 border border-slate-800 text-left transition-all group"
              >
                <div className="flex items-center justify-between">
                  <span className="text-[10px] font-bold text-indigo-400">{demo.role}</span>
                  <KeyRound className="w-3 h-3 text-slate-500 group-hover:text-white" />
                </div>
                <div className="text-xs font-bold text-white mt-0.5">{demo.label}</div>
              </button>
            ))}
          </div>
        </div>

        <div className="relative flex py-2 items-center">
          <div className="flex-grow border-t border-slate-800"></div>
          <span className="flex-shrink mx-4 text-[10px] uppercase font-bold text-slate-500">
            Or standard email
          </span>
          <div className="flex-grow border-t border-slate-800"></div>
        </div>

        <form onSubmit={handleStandardLogin} className="space-y-4">
          <div>
            <label className="text-xs font-semibold text-slate-300 block mb-1">
              Email Address
            </label>
            <div className="relative">
              <Mail className="w-4 h-4 text-slate-500 absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="name@example.com"
                className="w-full pl-9 pr-3 py-2 rounded-xl bg-slate-900 border border-slate-700 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-indigo-500"
              />
            </div>
          </div>

          <div>
            <label className="text-xs font-semibold text-slate-300 block mb-1">
              Password
            </label>
            <div className="relative">
              <Lock className="w-4 h-4 text-slate-500 absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                type="password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
                className="w-full pl-9 pr-3 py-2 rounded-xl bg-slate-900 border border-slate-700 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-indigo-500"
              />
            </div>
          </div>

          <button
            type="submit"
            disabled={loading}
            className="w-full py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white font-bold text-xs flex items-center justify-center gap-2 shadow-md shadow-indigo-600/30"
          >
            {loading ? <RefreshCw className="w-4 h-4 animate-spin" /> : <ArrowRight className="w-4 h-4" />}
            <span>Sign In</span>
          </button>
        </form>

        <div className="text-center text-xs text-slate-400">
          Need an account?{" "}
          <Link href="/signup" className="text-indigo-400 hover:text-indigo-300 font-semibold underline">
            Sign up here
          </Link>
        </div>
      </div>
    </div>
  );
}
