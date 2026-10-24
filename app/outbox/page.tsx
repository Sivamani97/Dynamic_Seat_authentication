"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Mail, ArrowRight, ExternalLink, RefreshCw, Send, CheckCircle2 } from "lucide-react";
import { formatDate } from "@/lib/utils";

interface OutboxItem {
  id: string;
  recipient_email: string;
  subject: string;
  body_html: string;
  ticket_link: string;
  sent_at: string;
}

export default function EmailOutboxPage() {
  const [emails, setEmails] = useState<OutboxItem[]>([]);
  const [selectedEmail, setSelectedEmail] = useState<OutboxItem | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // In production, queries email_outbox from Supabase.
    // Pre-seeds sample outbox email for BK829173
    setEmails([
      {
        id: "em-001",
        recipient_email: "user1@demo.com",
        subject: "Your SmartSeat Confirmation: Movie XYZ (Seat A12) [BK829173]",
        ticket_link: "/t/tok_bk829173_secure_demo_link",
        sent_at: new Date().toISOString(),
        body_html: `
          <div style="font-family: sans-serif; padding: 16px; color: #f8fafc;">
            <h2 style="color: #6366f1;">SmartSeat Booking Confirmation</h2>
            <p>Your seat has been reserved at Grand Cinema Multiplex.</p>
            <div style="background: #1e293b; padding: 16px; border-radius: 8px; margin: 16px 0;">
              <p><strong>Booking Ref:</strong> BK829173</p>
              <p><strong>Event:</strong> Movie XYZ: The Quantum Paradox</p>
              <p><strong>Seat:</strong> A12 (Dolby Atmos)</p>
            </div>
            <p>
              <a href="/t/tok_bk829173_secure_demo_link" style="color: #38bdf8; font-weight: bold;">
                Click here to view your 30s Dynamic Ticket
              </a>
            </p>
          </div>
        `,
      },
    ]);
    setLoading(false);
  }, []);

  return (
    <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-10 space-y-8">
      <div>
        <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full text-xs font-semibold bg-indigo-500/10 text-indigo-400 border border-indigo-500/20">
          <Mail className="w-3.5 h-3.5" />
          <span>Simulated & Real Outbox</span>
        </div>
        <h1 className="text-3xl font-black text-white tracking-tight mt-1">
          In-App Email Outbox
        </h1>
        <p className="text-sm text-slate-400">
          Emails generated upon ticket booking are stored here with direct access links. Real delivery activates automatically when RESEND_API_KEY is configured.
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Email List */}
        <div className="space-y-3">
          <h2 className="text-xs font-bold uppercase tracking-wider text-slate-400">
            Dispatched Emails ({emails.length})
          </h2>

          {emails.map((email) => (
            <div
              key={email.id}
              onClick={() => setSelectedEmail(email)}
              className={`p-4 rounded-2xl glass-card border cursor-pointer transition-all ${
                selectedEmail?.id === email.id
                  ? "border-indigo-500 bg-indigo-950/20 shadow-md"
                  : "border-slate-800 hover:border-slate-700"
              }`}
            >
              <div className="flex items-center justify-between text-xs text-slate-400 mb-1">
                <span className="font-semibold text-slate-200">{email.recipient_email}</span>
                <span>{formatDate(email.sent_at)}</span>
              </div>
              <h3 className="font-bold text-sm text-white line-clamp-1">{email.subject}</h3>
              <p className="text-xs text-indigo-400 mt-2 flex items-center gap-1">
                <span>View Email</span>
                <ArrowRight className="w-3 h-3" />
              </p>
            </div>
          ))}
        </div>

        {/* Email Preview Drawer */}
        <div className="lg:col-span-2 glass-panel rounded-2xl border border-slate-800 p-6 space-y-6">
          {selectedEmail || emails[0] ? (
            (() => {
              const current = selectedEmail || emails[0];
              return (
                <div className="space-y-4">
                  <div className="border-b border-slate-800 pb-4 space-y-2">
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-mono text-indigo-400">
                        To: {current.recipient_email}
                      </span>
                      <span className="text-xs text-slate-400">
                        Sent: {formatDate(current.sent_at)}
                      </span>
                    </div>
                    <h2 className="text-lg font-bold text-white">{current.subject}</h2>
                  </div>

                  {/* Render simulated email body */}
                  <div
                    className="p-6 rounded-xl bg-slate-950/90 border border-slate-800/80 prose prose-invert max-w-none text-sm text-slate-300"
                    dangerouslySetInnerHTML={{ __html: current.body_html }}
                  />

                  {/* Direct Launch Button */}
                  <div className="pt-2">
                    <Link
                      href={current.ticket_link}
                      className="inline-flex items-center gap-2 py-3 px-5 rounded-xl bg-gradient-to-r from-indigo-600 to-purple-600 text-white font-bold text-xs shadow-md shadow-indigo-600/30 hover:scale-[1.02] transition-all"
                    >
                      <ExternalLink className="w-4 h-4" />
                      <span>Open Secure Dynamic Ticket Directly</span>
                    </Link>
                  </div>
                </div>
              );
            })()
          ) : (
            <div className="h-64 flex items-center justify-center text-slate-500 text-sm">
              Select an email to view contents
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
