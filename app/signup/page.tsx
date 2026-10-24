"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Lock, Mail, ArrowRight, User, RefreshCw } from "lucide-react";
import { createClient } from "@/lib/supabase/client";

export default function SignupPage() {
  const router = useRouter();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  const handleSignup = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setMsg(null);

    try {
      const supabase = createClient();
      const { data, error } = await supabase.auth.signUp({
        email,
        password,
        options: {
          data: { name, role: "USER" },
        },
      });

      if (error) {
        setMsg(error.message);
        setLoading(false);
        return;
      }

      setMsg("Account created! Redirecting to events...");
      setTimeout(() => router.push("/events"), 1000);
    } catch (err: any) {
      setMsg(err.message || "Failed to sign up");
      setLoading(false);
    }
  };

  return (
    <div className="max-w-md mx-auto px-4 py-12 space-y-6">
      <div className="glass-panel p-8 rounded-3xl border border-slate-800 space-y-6 shadow-2xl">
        <div className="text-center space-y-2">
          <div className="w-12 h-12 rounded-2xl bg-indigo-600/20 border border-indigo-500/30 flex items-center justify-center mx-auto text-indigo-400">
            <User className="w-6 h-6" />
          </div>
          <h1 className="text-2xl font-black text-white">Create Passenger Account</h1>
          <p className="text-xs text-slate-400">
            Get instant dynamic cryptographic tickets and in-app emergency response.
          </p>
        </div>

        {msg && (
          <div className="p-3 rounded-xl bg-indigo-500/10 border border-indigo-500/30 text-indigo-300 text-xs text-center">
            {msg}
          </div>
        )}

        <form onSubmit={handleSignup} className="space-y-4">
          <div>
            <label className="text-xs font-semibold text-slate-300 block mb-1">
              Full Name
            </label>
            <input
              type="text"
              required
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Alex Johnson"
              className="w-full px-3 py-2 rounded-xl bg-slate-900 border border-slate-700 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-indigo-500"
            />
          </div>

          <div>
            <label className="text-xs font-semibold text-slate-300 block mb-1">
              Email Address
            </label>
            <input
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="alex@example.com"
              className="w-full px-3 py-2 rounded-xl bg-slate-900 border border-slate-700 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-indigo-500"
            />
          </div>

          <div>
            <label className="text-xs font-semibold text-slate-300 block mb-1">
              Password
            </label>
            <input
              type="password"
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="••••••••"
              className="w-full px-3 py-2 rounded-xl bg-slate-900 border border-slate-700 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-indigo-500"
            />
          </div>

          <button
            type="submit"
            disabled={loading}
            className="w-full py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white font-bold text-xs flex items-center justify-center gap-2 shadow-md shadow-indigo-600/30"
          >
            {loading ? <RefreshCw className="w-4 h-4 animate-spin" /> : <ArrowRight className="w-4 h-4" />}
            <span>Sign Up</span>
          </button>
        </form>

        <div className="text-center text-xs text-slate-400">
          Already registered?{" "}
          <Link href="/login" className="text-indigo-400 hover:text-indigo-300 font-semibold underline">
            Sign in here
          </Link>
        </div>
      </div>
    </div>
  );
}
