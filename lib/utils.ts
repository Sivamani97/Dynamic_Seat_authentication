import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";
import { AlertPriority, BookingStatus, SeatStateKind } from "./types";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function formatCurrency(amount: number): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
  }).format(amount);
}

export function formatDate(dateString: string): string {
  return new Date(dateString).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function getStatusBadge(status: BookingStatus) {
  switch (status) {
    case "BOOKED":
      return {
        label: "Booked",
        bg: "bg-blue-500/10 text-blue-400 border-blue-500/30",
        icon: "Ticket",
      };
    case "CHECKED_IN":
      return {
        label: "Checked In (Gate)",
        bg: "bg-amber-500/10 text-amber-400 border-amber-500/30",
        icon: "DoorOpen",
      };
    case "SEAT_AUTHORIZED":
      return {
        label: "Seat Verified",
        bg: "bg-emerald-500/10 text-emerald-400 border-emerald-500/30",
        icon: "CheckCircle",
      };
    case "COMPLETED":
      return {
        label: "Completed",
        bg: "bg-slate-500/10 text-slate-400 border-slate-500/30",
        icon: "Check",
      };
    case "CANCELLED":
      return {
        label: "Cancelled",
        bg: "bg-rose-500/10 text-rose-400 border-rose-500/30",
        icon: "XCircle",
      };
  }
}

export function getSeatVisualStatus(state: SeatStateKind, isOccupied: boolean) {
  switch (state) {
    case "AUTHORIZED":
      return {
        icon: "✓",
        label: "Authorized",
        colorClass: "bg-emerald-600 border-emerald-400 text-white shadow-emerald-500/50 shadow-md",
        ariaLabel: "Authorized seat, passenger confirmed",
      };
    case "WRONG_SEAT":
      return {
        icon: "⚠",
        label: "Wrong / Unauthorized Occupancy",
        colorClass: "bg-amber-600 border-amber-300 text-white animate-blink-alert shadow-amber-500/60 shadow-lg",
        ariaLabel: "Seat warning: unauthorized occupancy detected",
      };
    case "SOS":
      return {
        icon: "🚨",
        label: "Emergency SOS Active",
        colorClass: "bg-rose-600 border-rose-300 text-white animate-beacon shadow-rose-500/80 shadow-xl",
        ariaLabel: "Emergency SOS assistance requested at this seat",
      };
    case "FAULT":
      return {
        icon: "🔧",
        label: "Unit Fault",
        colorClass: "bg-purple-600 border-purple-400 text-white shadow-purple-500/50 shadow-md",
        ariaLabel: "Virtual seat unit hardware degraded or offline",
      };
    case "MISMATCH_PENDING":
      return {
        icon: "❔",
        label: "Pending Verification",
        colorClass: "bg-yellow-600 border-yellow-400 text-white",
        ariaLabel: "Occupied seat pending ticket authentication",
      };
    case "CLAIMED_VACATED":
      return {
        icon: "■",
        label: "Claimed (Vacated)",
        colorClass: "bg-cyan-700 border-cyan-400 text-white",
        ariaLabel: "Authorized seat temporarily vacated by passenger",
      };
    default:
      if (isOccupied) {
        return {
          icon: "❔",
          label: "Occupied / Checking",
          colorClass: "bg-slate-700 border-slate-500 text-slate-200",
          ariaLabel: "Seat occupied",
        };
      }
      return {
        icon: "○",
        label: "Empty",
        colorClass: "bg-slate-900 border-slate-800 text-slate-400 hover:border-slate-600",
        ariaLabel: "Empty seat available",
      };
  }
}

export function getAlertPriorityBadge(priority: AlertPriority) {
  switch (priority) {
    case "CRITICAL":
      return "bg-rose-500/20 text-rose-300 border-rose-500/40 animate-pulse-fast";
    case "HIGH":
      return "bg-orange-500/20 text-orange-300 border-orange-500/40";
    case "MEDIUM":
      return "bg-amber-500/20 text-amber-300 border-amber-500/40";
    case "LOW":
      return "bg-blue-500/20 text-blue-300 border-blue-500/40";
  }
}
