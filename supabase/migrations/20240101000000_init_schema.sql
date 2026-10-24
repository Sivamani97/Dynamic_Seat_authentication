-- ============================================================================
-- SmartSeat: Dynamic Seat Authentication and Emergency Response System
-- Initial Migration: Complete Database Schema, RLS, Audit Hash Chain, and Realtime
-- ============================================================================

CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- ----------------------------------------------------------------------------
-- 1. Profiles Table & Auth Integration
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.profiles (
    id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    role TEXT NOT NULL CHECK (role IN ('USER', 'STAFF', 'ADMIN')) DEFAULT 'USER',
    active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Trigger to create profile automatically on auth.users insert
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
    INSERT INTO public.profiles (id, name, role, active)
    VALUES (
        NEW.id,
        COALESCE(NEW.raw_user_meta_data->>'name', split_part(NEW.email, '@', 1)),
        COALESCE(NEW.raw_user_meta_data->>'role', 'USER'),
        TRUE
    )
    ON CONFLICT (id) DO UPDATE
    SET name = EXCLUDED.name,
        role = EXCLUDED.role;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
    AFTER INSERT ON auth.users
    FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- ----------------------------------------------------------------------------
-- 2. Venues, Screens & Seat Layouts
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.venues (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT NOT NULL,
    type TEXT NOT NULL CHECK (type IN ('THEATRE', 'BUS', 'TRAIN', 'STADIUM')),
    address TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.screens (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    venue_id UUID NOT NULL REFERENCES public.venues(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    rows INTEGER NOT NULL,
    cols INTEGER NOT NULL,
    layout_json JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.seats (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    screen_id UUID NOT NULL REFERENCES public.screens(id) ON DELETE CASCADE,
    label TEXT NOT NULL, -- e.g. 'A12'
    row TEXT NOT NULL,   -- e.g. 'A'
    col INTEGER NOT NULL, -- e.g. 12
    unit_id TEXT UNIQUE NOT NULL, -- e.g. 'SCREEN2-A12'
    type TEXT NOT NULL DEFAULT 'STANDARD' CHECK (type IN ('STANDARD', 'VIP', 'ACCESSIBLE')),
    price NUMERIC(10,2) NOT NULL DEFAULT 15.00,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE(screen_id, label)
);

CREATE TABLE IF NOT EXISTS public.seat_units (
    id TEXT PRIMARY KEY, -- matches seats.unit_id
    seat_id UUID NOT NULL REFERENCES public.seats(id) ON DELETE CASCADE,
    secret_hash TEXT NOT NULL,
    status_json JSONB NOT NULL DEFAULT '{"sensor":"OK","scanner":"OK","power":"OK","comms":"OK","tamper":false}'::jsonb,
    last_heartbeat TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ----------------------------------------------------------------------------
-- 3. Events & Bookings
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.events (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    screen_id UUID NOT NULL REFERENCES public.screens(id) ON DELETE CASCADE,
    title TEXT NOT NULL,
    type TEXT NOT NULL DEFAULT 'MOVIE',
    start_time TIMESTAMPTZ NOT NULL,
    end_time TIMESTAMPTZ NOT NULL,
    status TEXT NOT NULL DEFAULT 'UPCOMING' CHECK (status IN ('UPCOMING', 'LIVE', 'COMPLETED', 'CANCELLED')),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.bookings (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    booking_ref TEXT UNIQUE NOT NULL, -- e.g. 'BK829173'
    user_id UUID,
    event_id UUID NOT NULL REFERENCES public.events(id) ON DELETE CASCADE,
    seat_id UUID NOT NULL REFERENCES public.seats(id) ON DELETE CASCADE,
    status TEXT NOT NULL DEFAULT 'BOOKED' CHECK (status IN ('BOOKED', 'CHECKED_IN', 'SEAT_AUTHORIZED', 'COMPLETED', 'CANCELLED')),
    ticket_link_token TEXT UNIQUE NOT NULL DEFAULT encode(gen_random_bytes(24), 'hex'),
    booking_secret TEXT NOT NULL DEFAULT encode(gen_random_bytes(32), 'hex'),
    checked_in_at TIMESTAMPTZ,
    seat_authorized_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.seat_holds (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    event_id UUID NOT NULL REFERENCES public.events(id) ON DELETE CASCADE,
    seat_id UUID NOT NULL REFERENCES public.seats(id) ON DELETE CASCADE,
    user_id UUID,
    expires_at TIMESTAMPTZ NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (event_id, seat_id)
);

-- ----------------------------------------------------------------------------
-- 4. Dynamic Seat States & Tokens
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.seat_states (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    seat_id UUID NOT NULL REFERENCES public.seats(id) ON DELETE CASCADE,
    event_id UUID NOT NULL REFERENCES public.events(id) ON DELETE CASCADE,
    occupancy TEXT NOT NULL DEFAULT 'EMPTY' CHECK (occupancy IN ('EMPTY', 'OCCUPIED', 'UNCERTAIN', 'TEMPORARILY_VACATED')),
    "authorization" TEXT NOT NULL DEFAULT 'UNAUTHORIZED' CHECK ("authorization" IN ('UNAUTHORIZED', 'AUTHORIZED')),
    state TEXT NOT NULL DEFAULT 'NORMAL' CHECK (state IN ('NORMAL', 'AUTHORIZED', 'MISMATCH_PENDING', 'WRONG_SEAT', 'SOS', 'FAULT', 'CLAIMED_VACATED')),
    pressure INTEGER NOT NULL DEFAULT 0,
    mismatch_since TIMESTAMPTZ,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (seat_id, event_id)
);

CREATE TABLE IF NOT EXISTS public.used_tokens (
    nonce TEXT PRIMARY KEY,
    booking_id UUID NOT NULL REFERENCES public.bookings(id) ON DELETE CASCADE,
    used_for TEXT NOT NULL CHECK (used_for IN ('ENTRY', 'SEAT')),
    scanned_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    expires_at TIMESTAMPTZ NOT NULL
);

-- ----------------------------------------------------------------------------
-- 5. Alerts & Notifications
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.alerts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    event_id UUID REFERENCES public.events(id) ON DELETE SET NULL,
    seat_id UUID REFERENCES public.seats(id) ON DELETE SET NULL,
    unit_id TEXT REFERENCES public.seat_units(id) ON DELETE SET NULL,
    booking_id UUID REFERENCES public.bookings(id) ON DELETE SET NULL,
    type TEXT NOT NULL, -- 'WRONG_SEAT', 'SOS', 'UNCERTAIN_PROLONGED', 'SENSOR_FAILURE', 'SCANNER_FAILURE', 'COMM_FAILURE', 'TAMPER', 'POWER_FAILURE'
    priority TEXT NOT NULL CHECK (priority IN ('LOW', 'MEDIUM', 'HIGH', 'CRITICAL')),
    status TEXT NOT NULL DEFAULT 'NEW' CHECK (status IN ('NEW', 'ACKNOWLEDGED', 'RESOLVED')),
    message TEXT NOT NULL,
    meta JSONB DEFAULT '{}'::jsonb,
    acknowledged_by UUID REFERENCES auth.users(id),
    acknowledged_at TIMESTAMPTZ,
    resolved_by UUID REFERENCES auth.users(id),
    resolved_at TIMESTAMPTZ,
    resolution_note TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ----------------------------------------------------------------------------
-- 6. Tamper-Evident Hash-Chained Audit Log
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.audit_log (
    id BIGSERIAL PRIMARY KEY,
    ts TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    event_type TEXT NOT NULL,
    booking_id UUID REFERENCES public.bookings(id) ON DELETE SET NULL,
    booking_ref TEXT,
    seat_id UUID REFERENCES public.seats(id) ON DELETE SET NULL,
    seat_label TEXT,
    unit_id TEXT,
    actor_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    actor_role TEXT,
    status TEXT NOT NULL DEFAULT 'SUCCESS',
    meta JSONB NOT NULL DEFAULT '{}'::jsonb,
    prev_hash TEXT NOT NULL,
    hash TEXT NOT NULL
);

-- Atomic Hash-Chain Append Function
CREATE OR REPLACE FUNCTION public.append_audit_log(
    p_event_type TEXT,
    p_booking_id UUID,
    p_booking_ref TEXT,
    p_seat_id UUID,
    p_seat_label TEXT,
    p_unit_id TEXT,
    p_actor_id UUID,
    p_actor_role TEXT,
    p_status TEXT,
    p_meta JSONB
)
RETURNS BIGINT AS $$
DECLARE
    v_last_hash TEXT;
    v_new_id BIGINT;
    v_ts TIMESTAMPTZ := NOW();
    v_calc_hash TEXT;
    v_raw_content TEXT;
BEGIN
    -- Advisory xact lock prevents concurrent transactions from forking the hash chain
    PERFORM pg_advisory_xact_lock(987654321);

    -- Find the hash of the latest row
    SELECT hash INTO v_last_hash
    FROM public.audit_log
    ORDER BY id DESC
    LIMIT 1;

    IF v_last_hash IS NULL THEN
        v_last_hash := 'GENESIS_000000000000000000000000000000000000000000000000000000000000';
    END IF;

    -- Canonical content string for SHA-256 calculation
    v_raw_content := v_last_hash || '|' ||
                     EXTRACT(EPOCH FROM v_ts)::TEXT || '|' ||
                     p_event_type || '|' ||
                     COALESCE(p_booking_ref, '') || '|' ||
                     COALESCE(p_seat_label, '') || '|' ||
                     COALESCE(p_unit_id, '') || '|' ||
                     COALESCE(p_actor_role, '') || '|' ||
                     p_status || '|' ||
                     p_meta::TEXT;

    v_calc_hash := encode(digest(v_raw_content, 'sha256'), 'hex');

    INSERT INTO public.audit_log (
        ts, event_type, booking_id, booking_ref, seat_id, seat_label,
        unit_id, actor_id, actor_role, status, meta, prev_hash, hash
    ) VALUES (
        v_ts, p_event_type, p_booking_id, p_booking_ref, p_seat_id, p_seat_label,
        p_unit_id, p_actor_id, p_actor_role, p_status, p_meta, v_last_hash, v_calc_hash
    ) RETURNING id INTO v_new_id;

    RETURN v_new_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ----------------------------------------------------------------------------
-- 7. Email Outbox, Settings & Rate Limiter Fallback
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.email_outbox (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    booking_id UUID REFERENCES public.bookings(id) ON DELETE CASCADE,
    recipient_email TEXT NOT NULL,
    subject TEXT NOT NULL,
    body_html TEXT NOT NULL,
    ticket_link TEXT NOT NULL,
    sent_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.settings (
    key TEXT PRIMARY KEY,
    value JSONB NOT NULL,
    description TEXT,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.rate_limits (
    key TEXT PRIMARY KEY,
    count INTEGER NOT NULL DEFAULT 1,
    reset_at TIMESTAMPTZ NOT NULL
);

-- Seed Default Settings
INSERT INTO public.settings (key, value, description)
VALUES
    ('token_lifetime_sec', '30'::jsonb, 'Dynamic QR token lifetime in seconds'),
    ('mismatch_delay_sec', '15'::jsonb, 'Delay in seconds before unauthorized occupancy triggers staff alert'),
    ('pressure_empty_max', '19'::jsonb, 'Maximum pressure sensor reading considered empty (0-19)'),
    ('pressure_uncertain_max', '59'::jsonb, 'Maximum pressure sensor reading considered uncertain bag/item (20-59)'),
    ('pressure_occupied_min', '60'::jsonb, 'Minimum pressure sensor reading considered human occupancy (60-100)'),
    ('heartbeat_timeout_sec', '30'::jsonb, 'Virtual seat unit heartbeat timeout threshold')
ON CONFLICT (key) DO NOTHING;

-- ----------------------------------------------------------------------------
-- 8. Row Level Security (RLS) Policies
-- ----------------------------------------------------------------------------
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.venues ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.screens ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.seats ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.seat_units ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.bookings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.seat_holds ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.seat_states ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.used_tokens ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.alerts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.audit_log ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.email_outbox ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.rate_limits ENABLE ROW LEVEL SECURITY;

-- Helper function to check role in RLS
CREATE OR REPLACE FUNCTION public.current_user_role()
RETURNS TEXT AS $$
    SELECT role FROM public.profiles WHERE id = auth.uid() LIMIT 1;
$$ LANGUAGE sql STABLE SECURITY DEFINER;

-- Profiles: Users see themselves, Staff & Admin see all
CREATE POLICY profiles_select ON public.profiles
    FOR SELECT USING (
        auth.uid() = id OR public.current_user_role() IN ('STAFF', 'ADMIN')
    );
CREATE POLICY profiles_update ON public.profiles
    FOR UPDATE USING (
        auth.uid() = id OR public.current_user_role() = 'ADMIN'
    );

-- Venues, Screens, Seats, Events: Readable by everyone
CREATE POLICY venues_read ON public.venues FOR SELECT USING (true);
CREATE POLICY screens_read ON public.screens FOR SELECT USING (true);
CREATE POLICY seats_read ON public.seats FOR SELECT USING (true);
CREATE POLICY events_read ON public.events FOR SELECT USING (true);

-- Seat Units: Read by Staff/Admin, Service Role has full access
CREATE POLICY seat_units_read ON public.seat_units
    FOR SELECT USING (public.current_user_role() IN ('STAFF', 'ADMIN'));

-- Bookings: Users see own, Staff/Admin see all
CREATE POLICY bookings_select ON public.bookings
    FOR SELECT USING (
        auth.uid() = user_id OR public.current_user_role() IN ('STAFF', 'ADMIN')
    );
CREATE POLICY bookings_insert ON public.bookings
    FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY bookings_update ON public.bookings
    FOR UPDATE USING (
        auth.uid() = user_id OR public.current_user_role() IN ('STAFF', 'ADMIN')
    );

-- Seat Holds: Users see & manage own
CREATE POLICY seat_holds_select ON public.seat_holds
    FOR SELECT USING (auth.uid() = user_id OR public.current_user_role() IN ('STAFF', 'ADMIN'));
CREATE POLICY seat_holds_all ON public.seat_holds
    FOR ALL USING (auth.uid() = user_id OR public.current_user_role() IN ('STAFF', 'ADMIN'));

-- Seat States: Readable by anyone (so seat maps can render), mutable by Staff/Admin & Service Role
CREATE POLICY seat_states_select ON public.seat_states FOR SELECT USING (true);
CREATE POLICY seat_states_update ON public.seat_states
    FOR UPDATE USING (public.current_user_role() IN ('STAFF', 'ADMIN'));

-- Alerts: Staff/Admin manage, Users can insert assistance request
CREATE POLICY alerts_select ON public.alerts
    FOR SELECT USING (public.current_user_role() IN ('STAFF', 'ADMIN'));
CREATE POLICY alerts_insert ON public.alerts
    FOR INSERT WITH CHECK (true);
CREATE POLICY alerts_update ON public.alerts
    FOR UPDATE USING (public.current_user_role() IN ('STAFF', 'ADMIN'));

-- Audit Log: Insert only through service_role / procedure, Readable only by Admin
CREATE POLICY audit_log_select ON public.audit_log
    FOR SELECT USING (public.current_user_role() IN ('ADMIN', 'STAFF'));

-- Email Outbox: Users see their own
CREATE POLICY email_outbox_select ON public.email_outbox
    FOR SELECT USING (auth.uid() = user_id OR public.current_user_role() IN ('STAFF', 'ADMIN'));

-- Settings: Read by all authenticated users, updated only by Admin
CREATE POLICY settings_select ON public.settings FOR SELECT USING (true);
CREATE POLICY settings_update ON public.settings
    FOR UPDATE USING (public.current_user_role() = 'ADMIN');

-- ----------------------------------------------------------------------------
-- 9. Realtime Publication
-- ----------------------------------------------------------------------------
DO $$
BEGIN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.seat_states;
EXCEPTION WHEN duplicate_object THEN
    -- Table already in publication
END $$;

DO $$
BEGIN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.alerts;
EXCEPTION WHEN duplicate_object THEN
END $$;

DO $$
BEGIN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.seat_units;
EXCEPTION WHEN duplicate_object THEN
END $$;

DO $$
BEGIN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.bookings;
EXCEPTION WHEN duplicate_object THEN
END $$;

-- ----------------------------------------------------------------------------
-- 10. Performance Indexes
-- ----------------------------------------------------------------------------
CREATE INDEX IF NOT EXISTS idx_bookings_user_id ON public.bookings(user_id);
CREATE INDEX IF NOT EXISTS idx_bookings_event_id ON public.bookings(event_id);
CREATE INDEX IF NOT EXISTS idx_bookings_ticket_link ON public.bookings(ticket_link_token);
CREATE INDEX IF NOT EXISTS idx_seat_states_event_seat ON public.seat_states(event_id, seat_id);
CREATE INDEX IF NOT EXISTS idx_alerts_event_status ON public.alerts(event_id, status);
CREATE INDEX IF NOT EXISTS idx_audit_log_event_type ON public.audit_log(event_type);
CREATE INDEX IF NOT EXISTS idx_audit_log_booking_id ON public.audit_log(booking_id);
CREATE INDEX IF NOT EXISTS idx_audit_log_seat_id ON public.audit_log(seat_id);
CREATE INDEX IF NOT EXISTS idx_seat_holds_expiry ON public.seat_holds(expires_at);
