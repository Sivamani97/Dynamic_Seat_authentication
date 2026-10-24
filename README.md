# SmartSeat: Dynamic Seat Authentication & Emergency Response System

[![CI Pipeline](https://github.com/your-username/smartseat/actions/workflows/ci.yml/badge.svg)](https://github.com/your-username/smartseat/actions/workflows/ci.yml)
[![Vercel Deployment](https://img.shields.io/badge/Vercel-Deployed-black?logo=vercel)](https://vercel.com)
[![Supabase Database](https://img.shields.io/badge/Supabase-PostgreSQL%20%2B%20Realtime-3ECF8E?logo=supabase)](https://supabase.com)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.6-blue?logo=typescript)](https://www.typescriptlang.org)
[![Vitest](https://img.shields.io/badge/Vitest-Passing-729B1B?logo=vitest)](https://vitest.dev)

> **100% Software Architecture**: Zero physical hardware, IoT devices, ESP32 boards, or physical sensors. Every capability—from dynamic cryptographic ticket generation to simulated weight telemetry and instant emergency sirens—is implemented entirely in software running across standard mobile browsers and desktop displays.

---

## Table of Contents
1. [System Architecture Diagram](#1-system-architecture-diagram)
2. [Core Innovations & Capabilities](#2-core-innovations--capabilities)
3. [Interactive Portals & Roles](#3-interactive-portals--roles)
4. [API Endpoints Reference](#4-api-endpoints-reference)
5. [End-to-End Test Suite](#5-end-to-end-test-suite)
6. [Complete Step-by-Step Deployment Guide](#6-complete-step-by-step-deployment-guide)
   - [Step 1: GitHub Repository & Actions](#step-1-github-repository--actions)
   - [Step 2: Supabase Setup, Migrations & Realtime](#step-2-supabase-setup-migrations--realtime)
   - [Step 3: Vercel Deployment & Serverless Cron](#step-3-vercel-deployment--serverless-cron)
   - [Step 4: Post-Deployment & Phone Testing Checklist](#step-4-post-deployment--phone-testing-checklist)
7. [Vercel Hobby vs Pro Plan Cron Strategy](#7-vercel-hobby-vs-pro-plan-cron-strategy)
8. [Security & Cryptographic Audit Integrity](#8-security--cryptographic-audit-integrity)

---

## 1. System Architecture Diagram

```
 +-----------------------------------------------------------------------------------------------+
 |                                  SMARTSEAT CLIENT ECOSYSTEM                                   |
 |                                                                                               |
 |  [Phone 1: Passenger]             [Phone 2: Gate / Seat Scanner]     [Laptop: Staff Dashboard]|
 |  - Dynamic 30s QR (/t/[token])    - Camera Scanner (/staff/scan)     - 2D Live Realtime Map   |
 |  - Seat Awareness Warning         - html5-qrcode camera capture      - Audio Siren & Flashing |
 |  - Single In-App Assist/SOS       - Instant Green/Red Feedback       - Alert Acknowledge/Resolve|
 +-----------------------------------+----------------------------------+------------------------+
                  │                                  │                               │
                  ▼                                  ▼                               ▼
 +-----------------------------------------------------------------------------------------------+
 |                              VERCEL SERVERLESS NEXT.JS 14 APP                                 |
 |                                                                                               |
 |  Route Handlers (/app/api/...):                                                               |
 |  ├── GET  /api/ticket/[token]/qr  ──> Issues fresh HMAC-SHA256 signed dynamic QR (30s)       |
 |  ├── POST /api/scan/entry         ──> Turnstile verification, skew check, nonce replay filter|
 |  ├── POST /api/scan/seat          ──> Seat unit auth, checks token.sid == unit.seat_id        |
 |  ├── POST /api/seat-units/[id]/occupancy  ──> Pure Engine evaluates weight & 15s timer        |
 |  ├── POST /api/seat-units/[id]/assist    ──> Dispatches Emergency SOS alert & siren          |
 |  ├── POST /api/seat-units/[id]/heartbeat ──> 10s ping, detects sensor/tamper hardware faults  |
 |  └── GET  /api/cron/evaluate      ──> Evaluates mismatch thresholds & cleans expired holds    |
 |                                                                                               |
 |  Pure Engine Core (/lib/engine.ts):                                                           |
 |  - Weight < 20 kg: EMPTY                                                                      |
 |  - Weight 20-59 kg: UNCERTAIN (Luggage/Bag Filter: NEVER raises wrong-seat alert)             |
 |  - Weight >= 60 kg: OCCUPIED (Triggers 15s mismatch grace timer before silent staff alert)   |
 +-----------------------------------------------------------------------------------------------+
                  │                                  ▲                               │
         Database │ RPC Append                       │ Realtime Push                 │ Admin Key
         & Auth   │ Hash Chain                       │ (postgres_changes)            │ Isolation
                  ▼                                  │                               ▼
 +-----------------------------------------------------------------------------------------------+
 |                                  SUPABASE POSTGRESQL CLOUD                                    |
 |                                                                                               |
 |  Tables with Strict Row-Level Security (RLS):                                                 |
 |  - profiles, venues, screens, seats, seat_units, events, bookings, seat_holds                 |
 |  - seat_states, used_tokens (nonce PK), alerts, email_outbox, settings, rate_limits           |
 |                                                                                               |
 |  Cryptographic Audit Chain (audit_log):                                                       |
 |  - append_audit_log() with pg_advisory_xact_lock to prevent concurrent forks                  |
 |  - Canonical hash: SHA256(prev_hash | epoch | event_type | booking_ref | seat | meta)         |
 +-----------------------------------------------------------------------------------------------+
```

---

## 2. Core Innovations & Capabilities

1. **Gate-to-Seat Dynamic Authentication**:
   - Tickets are not static barcodes. Every 30 seconds, the passenger's screen renders a newly signed HMAC-SHA256 token containing a 128-bit cryptographic nonce.
   - Screenshots and forwarded photos expire within 30 seconds (+5s clock skew tolerance).
   - Used nonces are atomically recorded in `used_tokens` with `nonce` as the Primary Key, instantly preventing replay attacks.
2. **Strict Seat-Level Verification**:
   - Scanning a ticket booked for **Seat A12** at unit **Seat A13** immediately fails with `WRONG_SEAT_SCAN` and records an immutable audit log entry.
3. **Weight & Luggage Discrimination**:
   - A backpack, purse, or winter coat placed on the seat (20–59 kg) is categorized as `UNCERTAIN` and **never** triggers an unauthorized occupancy alert.
   - Human occupancy (≥60 kg) begins an internal 15-second mismatch delay timer (`mismatch_since`).
4. **Silent Wrong-Seat Alerting vs Audible Emergency Sirens**:
   - Wrong-seat passengers receive a private, low-key notice: *"This seat is not associated with your booking. Please verify your assigned seat."*
   - Staff map shows a silent visual blink (⚠) without disturbing the auditorium.
   - Emergency SOS presses trigger a full-screen banner, haptic vibration, and Web Audio siren chime on staff displays.
5. **Software "Virtual Seat Unit"**:
   - Replaces physical hardware with `/seat-unit/[seatId]`, featuring a live pressure slider, mini headrest OLED display, passenger scanner, and fault injector (sensor fault, power cut, comms loss, tamper switch).
6. **Tamper-Evident Hash Chain Audit Log**:
   - Every system event is appended to an immutable SHA-256 hash chain verified with one click in the Admin Console.

---

## 3. Interactive Portals & Roles

| Portal | URL | Demo Account | Role Description |
| :--- | :--- | :--- | :--- |
| **Guided 2-Min Demo** | `/demo` | *No login needed* | Hands-on walkthrough of booking, entry scan, seat scan, wrong seat, bag filter, SOS, and audit hash proof. |
| **Passenger Portal** | `/events`, `/tickets` | `user1@demo.com` / `User@123` | Interactive 2D seat map with 2-minute checkout holds, dynamic QR tickets (`/t/[token]`), in-app email outbox (`/outbox`). |
| **Staff Command Map** | `/staff` | `staff@demo.com` / `Staff@123` | Live 2D auditorium map via Supabase Realtime, visual seat blinking, audio siren toggle, and alert workflow management. |
| **Gate Scanner** | `/staff/scan` | `staff@demo.com` / `Staff@123` | Turns any smartphone camera into a ticket turnstile validator using `html5-qrcode` + fallback token input. |
| **Virtual Seat Unit** | `/seat-unit/SCREEN2-A12` | *API Key Auth* | Software emulation of seat hardware with pressure slider (Sit, Stand, Bag), mini OLED display, and fault injector. |
| **Admin Console** | `/admin` | `admin@demo.com` / `Admin@123` | Operational KPIs, seat-unit telemetry fleet, analytics charts, settings editor, and SHA-256 audit verifier. |
| **PWA Alert Receiver** | `/local-alert` | *Resilient PWA* | Lightweight, zero-external-asset page with auto-reconnecting Supabase channel + polling fallback for poor connectivity. |

---

## 4. API Endpoints Reference

| Method | Endpoint | Description | Auth / Rate Limit |
| :--- | :--- | :--- | :--- |
| `GET` | `/api/ticket/[token]/qr` | Generates a fresh 30s HMAC-SHA256 dynamic token and expiry | Public opaque token link |
| `POST` | `/api/scan/entry` | Validates gate ticket, rejects replays/cancelled tickets, transitions to `CHECKED_IN` | 30 req / 60s per IP |
| `POST` | `/api/scan/seat` | Authenticates seat unit and verifies token matches unit's seat | 40 req / 60s per Unit |
| `POST` | `/api/seat-units/[id]/occupancy`| Ingests simulated pressure (0-100), runs Pure Engine, updates seat state | Unit Secret Key |
| `POST` | `/api/seat-units/[id]/assist` | Physical seat SOS button; raises CRITICAL/MEDIUM alert with Realtime push | 5 req / 30s per Unit |
| `POST` | `/api/user/assist` | Passenger in-app assistance request with category selection | 5 req / 30s per Booking |
| `POST` | `/api/seat-units/[id]/heartbeat`| 10s hardware ping reporting sensor, scanner, power, comms, and tamper | Unit Secret Key |
| `GET` | `/api/cron/evaluate` | Serverless scheduled evaluator for 15s mismatches and missed heartbeats | `CRON_SECRET` Bearer Token |
| `POST` | `/api/engine/tick` | Client-side 5s evaluation fallback for Vercel Hobby tier | Service Role / Authenticated |
| `GET` | `/api/admin/audit/verify` | Cryptographically verifies SHA-256 hash chain and checks for row tampering | ADMIN / STAFF |
| `POST` | `/api/bookings/hold` | Places a temporary 2-minute checkout hold on a seat | Authenticated |
| `POST` | `/api/bookings` | Confirms booking, creates ticket link token, and generates simulated email | Authenticated |
| `DELETE`| `/api/bookings` | Cancels booking, releases seat state, and logs cancellation to audit chain | Authenticated |
| `POST` | `/api/staff/alerts/[id]` | Staff actions: `ACKNOWLEDGE`, `RESOLVE`, or `ESCALATE` | STAFF / ADMIN |
| `POST` | `/api/staff/override` | Manual seat reassignment or visual verification override with mandatory note | STAFF / ADMIN |

---

## 5. End-to-End Test Suite

SmartSeat includes a Vitest test suite and an End-to-End security test script proving all acceptance criteria:

```bash
# 1. Run Vitest Unit Tests (Engine, Tokens, and Hash Chain)
npm run test

# 2. Run End-to-End Security Scenarios Script
npm run test:scenarios
```

### Proved Test Scenarios:
- ✅ **Dynamic 30s Token Lifecycle**: Token payload issued with opaque IDs, timestamp, and 128-bit random nonce.
- ✅ **Expired Token Rejection**: QR older than 35s strictly rejected with `TOKEN_EXPIRED`.
- ✅ **Replay Attack Rejected**: Reusing a captured screenshot nonce rejected via database Primary Key collision (`REPLAYED_TOKEN`).
- ✅ **Seat Mismatch Rejection**: Credential for Seat A12 scanned at Seat A13 rejected with `WRONG_SEAT_SCAN`.
- ✅ **Double Check-In Rejection**: Second gate entry scan rejected with `ALREADY_CHECKED_IN`.
- ✅ **Cancelled Ticket Rejected**: Cancelled booking returns HTTP 410 `TICKET_CANCELLED`.
- ✅ **Luggage Filter**: 35 kg weight classified as `UNCERTAIN` and produces **zero** wrong-seat alerts.
- ✅ **15-Second Mismatch Timer**: Unauthorized seating creates `MISMATCH_PENDING` under 15s; triggers silent alert after 15s.
- ✅ **Cryptographic Hash Chain Integrity**: Mathematical proof of sequential SHA-256 links and instant pinpointing of tampered rows.

---

## 6. Complete Step-by-Step Deployment Guide

Follow these exact steps to deploy SmartSeat to GitHub, Supabase, and Vercel.

### Step 1: GitHub Repository & Actions

1. **Initialize Git & Commit**:
   ```bash
   git init
   git add .
   git commit -m "feat: initial commit of SmartSeat Dynamic Seat Authentication System"
   ```
2. **Push to GitHub**:
   ```bash
   git branch -M main
   git remote add origin https://github.com/<your-username>/smartseat.git
   git push -u origin main
   ```
3. **Verify GitHub Actions CI**:
   - Go to your repository's **Actions** tab on GitHub.
   - The `.github/workflows/ci.yml` pipeline will automatically run: `npm ci`, `npm run test`, `npm run test:scenarios`, `npm run typecheck`, and `npm run build`.

---

### Step 2: Supabase Setup, Migrations & Realtime

1. **Create a Supabase Project**:
   - Log in to [Supabase](https://supabase.com) and click **New Project**.
   - Note your **Project URL** and choose a secure database password.
2. **Apply Database Migration**:
   - **Method A (SQL Editor - Recommended)**:
     - In your Supabase Dashboard, navigate to the **SQL Editor**.
     - Open [`supabase/migrations/20240101000000_init_schema.sql`](file:///c:/Users/tamil/OneDrive/Desktop/EDUCATION/sem7/Dynamic%20Seat%20Authentication/supabase/migrations/20240101000000_init_schema.sql) from this repository.
     - Paste the SQL content into the SQL Editor and click **Run**.
   - **Method B (Supabase CLI)**:
     ```bash
     npx supabase login
     npx supabase link --project-ref <your-project-id>
     npx supabase db push
     ```
3. **Apply Seed Data**:
   - In the Supabase **SQL Editor**, open [`supabase/seed.sql`](file:///c:/Users/tamil/OneDrive/Desktop/EDUCATION/sem7/Dynamic%20Seat%20Authentication/supabase/seed.sql), paste into the editor, and click **Run**.
   - This seeds the Grand Cinema Screen 2 (A1 to E14), bus, train, and the pre-booked Seat A12 for Movie XYZ (`BK829173`).
4. **Provision Demo Users & Roles**:
   - In your `.env.local` file, enter your real `NEXT_PUBLIC_SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY`.
   - Run the user provisioning script:
     ```bash
     npm run seed:users
     ```
   - This automatically creates the 4 demo accounts:
     - `admin@demo.com` / `Admin@123` (ADMIN)
     - `staff@demo.com` / `Staff@123` (STAFF)
     - `user1@demo.com` / `User@123` (USER)
     - `user2@demo.com` / `User@123` (USER)
5. **Verify Realtime Tables**:
   - In Supabase Dashboard, go to **Database** -> **Replication**.
   - Verify that `supabase_realtime` has the following tables enabled: `seat_states`, `alerts`, `seat_units`, and `bookings`.
6. **Configure Supabase Auth URL**:
   - Go to **Authentication** -> **URL Configuration**.
   - Set **Site URL** to your Vercel deployment URL (e.g., `https://smartseat.vercel.app`).
   - Add `https://smartseat.vercel.app/**` to **Redirect URLs**.
7. **Copy API Keys**:
   - Go to **Project Settings** -> **API**.
   - Copy `Project URL`, `anon public` key, and `service_role secret` key.

---

### Step 3: Vercel Deployment & Serverless Cron

1. **Import Repository to Vercel**:
   - Log in to [Vercel](https://vercel.com) and click **Add New...** -> **Project**.
   - Select your GitHub repository `smartseat`.
2. **Configure Environment Variables**:
   In the Vercel **Environment Variables** panel, add the following variables for both **Production** and **Preview**:

   | Name | Value | Description |
   | :--- | :--- | :--- |
   | `NEXT_PUBLIC_SUPABASE_URL` | `https://xxxx.supabase.co` | Your Supabase Project URL |
   | `NEXT_PUBLIC_SUPABASE_ANON_KEY` | `eyJhbGciOi...` | Supabase Public Anonymous Key |
   | `SUPABASE_SERVICE_ROLE_KEY` | `eyJhbGciOi...` | Supabase Service Role Key (**Server Only**) |
   | `TOKEN_SIGNING_SECRET` | `4f8b9e2c6a1d3f5e...` | High-entropy 32+ character random hex string |
   | `CRON_SECRET` | `your-secure-cron-secret` | Secret authorization token for cron route |
   | `NEXT_PUBLIC_APP_URL` | `https://your-vercel-domain.vercel.app` | Production Vercel base URL |
   | `UPSTASH_REDIS_REST_URL` | *(Optional)* | Upstash Redis URL (omit to use DB limiter) |
   | `UPSTASH_REDIS_REST_TOKEN` | *(Optional)* | Upstash Redis Token |
   | `RESEND_API_KEY` | *(Optional)* | Resend API key (omit to use in-app outbox) |

3. **Deploy**:
   - Click **Deploy**.
   - Vercel automatically detects Next.js 14, compiles App Router routes, and activates serverless functions.
   - Vercel also reads [`vercel.json`](file:///c:/Users/tamil/OneDrive/Desktop/EDUCATION/sem7/Dynamic%20Seat%20Authentication/vercel.json) to configure the serverless evaluation cron job `/api/cron/evaluate`.

---

### Step 4: Post-Deployment & Phone Testing Checklist

- [ ] **HTTPS Mobile Camera Test**: Open the deployed URL on your smartphone browser (Chrome on Android or Safari on iOS). Navigate to `/staff/scan` and click **Activate Camera Scanner**. Verify that the browser prompts for camera permissions and the viewfinder streams smoothly over HTTPS.
- [ ] **Two-Phone End-to-End Verification**:
  1. **Phone 1 (Passenger)**: Navigate to `/t/tok_bk829173_secure_demo_link`. Observe the 30-second countdown ring dynamically refreshing the QR.
  2. **Phone 2 (Gate Scanner)**: Navigate to `/staff/scan`. Scan Phone 1's dynamic QR code. Confirm the green **"ENTRY AUTHORIZED"** notification.
  3. **Laptop (Staff Map)**: Navigate to `/staff`. Observe Seat A12 update live from `EMPTY` to `CHECKED_IN` without refreshing the page.
  4. **Seat Scan**: On Phone 2, navigate to `/seat-unit/SCREEN2-A12` and scan Phone 1's QR code. Confirm **"SEAT AUTHORIZED"**.
  5. **Seating Telemetry**: On the seat unit, click **"Sit Down (75 kg)"**. Confirm the headrest display updates to **"✓ Seat Verified - Occupancy Confirmed"**.
- [ ] **Wrong-Seat Rejection Test**:
  - Open `/seat-unit/SCREEN2-A13` (Seat A13).
  - Attempt to scan Seat A12's ticket. Verify that it is immediately rejected with `WRONG_SEAT_SCAN`.
  - Click **"Sit Down (75 kg)"** on Seat A13 without authorizing. Wait 15 seconds. Observe the silent yellow alert (⚠) appear on the Staff Map!
- [ ] **Bag / Luggage Discrimination Test**:
  - Open `/seat-unit/SCREEN2-A14`. Click **"Place Bag (35 kg)"**.
  - Confirm the headrest OLED displays *"Luggage / Object Detected"* and **no** staff alert is generated.
- [ ] **Emergency SOS Test**:
  - On Phone 1, press **"Request Assistance / SOS"** and select **"Medical Emergency"**.
  - Confirm the staff laptop plays an audible siren wail and displays a full-screen critical banner within 1 second.
- [ ] **Cryptographic Audit Check**:
  - Log in to `/admin/audit` as `admin@demo.com`.
  - Click **"Verify Log Integrity"**. Confirm that 100% of the SHA-256 hash links are mathematically intact.

---

## 7. Vercel Hobby vs Pro Plan Cron Strategy

| Environment | Mechanism | Evaluation Frequency | Behavior |
| :--- | :--- | :--- | :--- |
| **Vercel Pro** | Vercel Cron (`vercel.json`) | Every 60 seconds (`* * * * *`) | Vercel automatically invokes `/api/cron/evaluate` with `Authorization: Bearer <CRON_SECRET>`. Evaluates 15s mismatches, missed heartbeats, and purges expired holds. |
| **Vercel Hobby** | Client-Side Engine Tick Fallback | Every 5 seconds | Because the Hobby tier limits cron jobs to once per day, SmartSeat includes an automatic client poll to `/api/engine/tick` that fires every 5s whenever a staff dashboard or demo session is active. Mismatches and heartbeats evaluate in real time without any paid upgrade! |

---

## 8. Security & Cryptographic Audit Integrity

1. **Service Role Key Isolation**:
   - `SUPABASE_SERVICE_ROLE_KEY` is referenced exclusively within server-side Route Handlers (`/app/api/...`).
   - The browser client uses only the public anonymous key (`NEXT_PUBLIC_SUPABASE_ANON_KEY`) subject to PostgreSQL Row Level Security (RLS).
2. **HMAC-SHA256 Token Signing**:
   - Dynamic tokens use a dual-secret model: `TOKEN_SIGNING_SECRET` (server environment) combined with `booking_secret` (per-ticket random 256-bit secret stored in database).
   - Signatures are verified using timing-safe comparisons (`crypto.timingSafeEqual`) to eliminate timing side-channel attacks.
3. **Database-Enforced Anti-Replay**:
   - The 128-bit nonce in each token is inserted into `used_tokens` where `nonce` is the Primary Key. Duplicate presentations fail atomically at the database layer.
4. **Append-Only Hash Chain**:
   - The `audit_log` table cannot be modified or reordered.
   - The PostgreSQL stored procedure `append_audit_log` uses `pg_advisory_xact_lock(987654321)` to serialize concurrent serverless calls, preventing hash chain forks.
   - Each entry computes `hash = SHA256(prev_hash | epoch | event_type | booking_ref | seat | role | status | meta)`.
