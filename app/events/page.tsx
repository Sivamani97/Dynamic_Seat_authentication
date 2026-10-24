"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Film, Bus, Train, Clock, MapPin, ArrowRight, ShieldCheck } from "lucide-react";
import { formatDate } from "@/lib/utils";

interface EventItem {
  id: string;
  title: string;
  type: string;
  start_time: string;
  end_time: string;
  status: string;
  screen?: {
    name: string;
    venue?: {
      name: string;
      address: string;
      type: string;
    };
  };
}

export default function EventsPage() {
  const [events, setEvents] = useState<EventItem[]>([
    {
      id: "eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee",
      title: "Movie XYZ: The Quantum Paradox (Dolby Cinema)",
      type: "MOVIE",
      start_time: new Date(Date.now() - 30 * 60000).toISOString(),
      end_time: new Date(Date.now() + 150 * 60000).toISOString(),
      status: "LIVE",
      screen: {
        name: "Screen 2",
        venue: {
          name: "Grand Cinema Multiplex",
          address: "700 Broadway, New York, NY",
          type: "THEATRE",
        },
      },
    },
    {
      id: "ffffffff-ffff-ffff-ffff-ffffffffffff",
      title: "InterCity Superliner 402 - Express Journey",
      type: "BUS",
      start_time: new Date(Date.now() + 60 * 60000).toISOString(),
      end_time: new Date(Date.now() + 360 * 60000).toISOString(),
      status: "UPCOMING",
      screen: {
        name: "Bus Coach Express 402",
        venue: {
          name: "Metro InterCity Superliner",
          address: "Bay 4, Central Transit Terminal",
          type: "BUS",
        },
      },
    },
    {
      id: "dddddddd-dddd-dddd-dddd-dddddddddddd",
      title: "Rajdhani Express Overnight - Coach B3",
      type: "TRAIN",
      start_time: new Date(Date.now() + 180 * 60000).toISOString(),
      end_time: new Date(Date.now() + 720 * 60000).toISOString(),
      status: "UPCOMING",
      screen: {
        name: "Train Coach B3",
        venue: {
          name: "Express Rail Services",
          address: "Platform 9, Grand Central",
          type: "TRAIN",
        },
      },
    },
  ]);

  return (
    <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-10 space-y-8">
      <div className="space-y-2">
        <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full text-xs font-semibold bg-indigo-500/10 text-indigo-400 border border-indigo-500/20">
          <ShieldCheck className="w-3.5 h-3.5" />
          <span>Select an Event to Choose Seats</span>
        </div>
        <h1 className="text-3xl font-black text-white tracking-tight">Available Events & Trips</h1>
        <p className="text-sm text-slate-400">
          Every seat booking is bound to a single seat with dynamic cryptographic verification and 2-minute checkout holds.
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {events.map((evt) => {
          const Icon = evt.type === "MOVIE" ? Film : evt.type === "BUS" ? Bus : Train;
          return (
            <div
              key={evt.id}
              className="glass-card rounded-2xl border border-slate-800 p-6 flex flex-col justify-between hover:border-indigo-500/40 transition-all group"
            >
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <div className="w-12 h-12 rounded-xl bg-slate-900 border border-slate-700/60 flex items-center justify-center text-indigo-400 group-hover:scale-105 transition-transform">
                    <Icon className="w-6 h-6" />
                  </div>
                  <span
                    className={`px-2.5 py-0.5 text-[10px] font-bold rounded-full ${
                      evt.status === "LIVE"
                        ? "bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 animate-pulse"
                        : "bg-slate-800 text-slate-400"
                    }`}
                  >
                    {evt.status}
                  </span>
                </div>

                <div>
                  <h3 className="font-bold text-lg text-white group-hover:text-indigo-300 transition-colors">
                    {evt.title}
                  </h3>
                  <div className="mt-2 space-y-1.5 text-xs text-slate-400">
                    <div className="flex items-center gap-2">
                      <MapPin className="w-3.5 h-3.5 text-slate-500" />
                      <span>
                        {evt.screen?.venue?.name} • {evt.screen?.name}
                      </span>
                    </div>
                    <div className="flex items-center gap-2">
                      <Clock className="w-3.5 h-3.5 text-slate-500" />
                      <span>{formatDate(evt.start_time)}</span>
                    </div>
                  </div>
                </div>
              </div>

              <div className="pt-6">
                <Link
                  href={`/events/${evt.id}`}
                  className="w-full py-2.5 px-4 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white font-bold text-xs flex items-center justify-center gap-2 shadow-md shadow-indigo-600/20 transition-all"
                >
                  <span>Select Seats</span>
                  <ArrowRight className="w-3.5 h-3.5" />
                </Link>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
