-- ============================================================================
-- SmartSeat: Complete Safe Reset & Seed Migration
-- 1. Safely teardowns old schema & seed data (with CASCADE)
-- 2. Creates complete updated schema, RLS policies, Realtime, & triggers
-- 3. Seeds fresh venues, screens, seats A1-E14, seat units, events, & genesis audit log
-- ============================================================================

CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- ============================================================================
-- PHASE 1: SAFE TEARDOWN OF OLD SCHEMA
-- ============================================================================

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
DROP FUNCTION IF EXISTS public.handle_new_user() CASCADE;
DROP FUNCTION IF EXISTS public.append_audit_log(TEXT, UUID, TEXT, UUID, TEXT, TEXT, UUID, TEXT, TEXT, JSONB) CASCADE;
DROP FUNCTION IF EXISTS public.current_user_role() CASCADE;

-- Drop all application tables with CASCADE
-- (PostgreSQL CASCADE automatically detaches all dropped tables from publications)
DROP TABLE IF EXISTS public.rate_limits CASCADE;
DROP TABLE IF EXISTS public.settings CASCADE;
DROP TABLE IF EXISTS public.email_outbox CASCADE;
DROP TABLE IF EXISTS public.audit_log CASCADE;
DROP TABLE IF EXISTS public.alerts CASCADE;
DROP TABLE IF EXISTS public.used_tokens CASCADE;
DROP TABLE IF EXISTS public.seat_states CASCADE;
DROP TABLE IF EXISTS public.seat_holds CASCADE;
DROP TABLE IF EXISTS public.bookings CASCADE;
DROP TABLE IF EXISTS public.events CASCADE;
DROP TABLE IF EXISTS public.seat_units CASCADE;
DROP TABLE IF EXISTS public.seats CASCADE;
DROP TABLE IF EXISTS public.screens CASCADE;
DROP TABLE IF EXISTS public.venues CASCADE;
DROP TABLE IF EXISTS public.profiles CASCADE;

-- ============================================================================
-- PHASE 2: CREATE FRESH SCHEMA
-- ============================================================================

-- 1. Profiles Table & Auth Integration
CREATE TABLE public.profiles (
    id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    role TEXT NOT NULL CHECK (role IN ('USER', 'STAFF', 'ADMIN')) DEFAULT 'USER',
    active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

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

CREATE TRIGGER on_auth_user_created
    AFTER INSERT ON auth.users
    FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- 2. Venues, Screens & Seat Layouts
CREATE TABLE public.venues (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT NOT NULL,
    type TEXT NOT NULL CHECK (type IN ('THEATRE', 'BUS', 'TRAIN', 'STADIUM')),
    address TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE public.screens (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    venue_id UUID NOT NULL REFERENCES public.venues(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    rows INTEGER NOT NULL,
    cols INTEGER NOT NULL,
    layout_json JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE public.seats (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    screen_id UUID NOT NULL REFERENCES public.screens(id) ON DELETE CASCADE,
    label TEXT NOT NULL,
    row TEXT NOT NULL,
    col INTEGER NOT NULL,
    unit_id TEXT UNIQUE NOT NULL,
    type TEXT NOT NULL DEFAULT 'STANDARD' CHECK (type IN ('STANDARD', 'VIP', 'ACCESSIBLE')),
    price NUMERIC(10,2) NOT NULL DEFAULT 15.00,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE(screen_id, label)
);

CREATE TABLE public.seat_units (
    id TEXT PRIMARY KEY,
    seat_id UUID NOT NULL REFERENCES public.seats(id) ON DELETE CASCADE,
    secret_hash TEXT NOT NULL,
    status_json JSONB NOT NULL DEFAULT '{"sensor":"OK","scanner":"OK","power":"OK","comms":"OK","tamper":false}'::jsonb,
    last_heartbeat TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 3. Events & Bookings
CREATE TABLE public.events (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    screen_id UUID NOT NULL REFERENCES public.screens(id) ON DELETE CASCADE,
    title TEXT NOT NULL,
    type TEXT NOT NULL DEFAULT 'MOVIE',
    start_time TIMESTAMPTZ NOT NULL,
    end_time TIMESTAMPTZ NOT NULL,
    status TEXT NOT NULL DEFAULT 'UPCOMING' CHECK (status IN ('UPCOMING', 'LIVE', 'COMPLETED', 'CANCELLED')),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE public.bookings (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    booking_ref TEXT UNIQUE NOT NULL,
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

CREATE TABLE public.seat_holds (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    event_id UUID NOT NULL REFERENCES public.events(id) ON DELETE CASCADE,
    seat_id UUID NOT NULL REFERENCES public.seats(id) ON DELETE CASCADE,
    user_id UUID,
    expires_at TIMESTAMPTZ NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (event_id, seat_id)
);

-- 4. Dynamic Seat States & Used Tokens
CREATE TABLE public.seat_states (
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

CREATE TABLE public.used_tokens (
    nonce TEXT PRIMARY KEY,
    booking_id UUID NOT NULL REFERENCES public.bookings(id) ON DELETE CASCADE,
    used_for TEXT NOT NULL CHECK (used_for IN ('ENTRY', 'SEAT')),
    scanned_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    expires_at TIMESTAMPTZ NOT NULL
);

-- 5. Alerts & Notifications
CREATE TABLE public.alerts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    event_id UUID REFERENCES public.events(id) ON DELETE SET NULL,
    seat_id UUID REFERENCES public.seats(id) ON DELETE SET NULL,
    unit_id TEXT REFERENCES public.seat_units(id) ON DELETE SET NULL,
    booking_id UUID REFERENCES public.bookings(id) ON DELETE SET NULL,
    type TEXT NOT NULL,
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

-- 6. Tamper-Evident Hash-Chained Audit Log
CREATE TABLE public.audit_log (
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
    PERFORM pg_advisory_xact_lock(987654321);

    SELECT hash INTO v_last_hash
    FROM public.audit_log
    ORDER BY id DESC
    LIMIT 1;

    IF v_last_hash IS NULL THEN
        v_last_hash := 'GENESIS_000000000000000000000000000000000000000000000000000000000000';
    END IF;

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

-- 7. Email Outbox, Settings & Rate Limiter
CREATE TABLE public.email_outbox (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    booking_id UUID REFERENCES public.bookings(id) ON DELETE CASCADE,
    recipient_email TEXT NOT NULL,
    subject TEXT NOT NULL,
    body_html TEXT NOT NULL,
    ticket_link TEXT NOT NULL,
    sent_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE public.settings (
    key TEXT PRIMARY KEY,
    value JSONB NOT NULL,
    description TEXT,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE public.rate_limits (
    key TEXT PRIMARY KEY,
    count INTEGER NOT NULL DEFAULT 1,
    reset_at TIMESTAMPTZ NOT NULL
);

INSERT INTO public.settings (key, value, description)
VALUES
    ('token_lifetime_sec', '30'::jsonb, 'Dynamic QR token lifetime in seconds'),
    ('mismatch_delay_sec', '15'::jsonb, 'Delay in seconds before unauthorized occupancy triggers staff alert'),
    ('pressure_empty_max', '19'::jsonb, 'Maximum pressure sensor reading considered empty (0-19)'),
    ('pressure_uncertain_max', '59'::jsonb, 'Maximum pressure sensor reading considered uncertain bag/item (20-59)'),
    ('pressure_occupied_min', '60'::jsonb, 'Minimum pressure sensor reading considered human occupancy (60-100)'),
    ('heartbeat_timeout_sec', '30'::jsonb, 'Virtual seat unit heartbeat timeout threshold')
ON CONFLICT (key) DO NOTHING;

-- ============================================================================
-- PHASE 3: ROW LEVEL SECURITY POLICIES
-- ============================================================================

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

CREATE OR REPLACE FUNCTION public.current_user_role()
RETURNS TEXT AS $$
    SELECT role FROM public.profiles WHERE id = auth.uid() LIMIT 1;
$$ LANGUAGE sql STABLE SECURITY DEFINER;

CREATE POLICY profiles_select ON public.profiles FOR SELECT USING (auth.uid() = id OR public.current_user_role() IN ('STAFF', 'ADMIN'));
CREATE POLICY profiles_update ON public.profiles FOR UPDATE USING (auth.uid() = id OR public.current_user_role() = 'ADMIN');

CREATE POLICY venues_read ON public.venues FOR SELECT USING (true);
CREATE POLICY screens_read ON public.screens FOR SELECT USING (true);
CREATE POLICY seats_read ON public.seats FOR SELECT USING (true);
CREATE POLICY events_read ON public.events FOR SELECT USING (true);
CREATE POLICY seat_units_read ON public.seat_units FOR SELECT USING (public.current_user_role() IN ('STAFF', 'ADMIN'));

CREATE POLICY bookings_select ON public.bookings FOR SELECT USING (auth.uid() = user_id OR public.current_user_role() IN ('STAFF', 'ADMIN'));
CREATE POLICY bookings_insert ON public.bookings FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY bookings_update ON public.bookings FOR UPDATE USING (auth.uid() = user_id OR public.current_user_role() IN ('STAFF', 'ADMIN'));

CREATE POLICY seat_holds_select ON public.seat_holds FOR SELECT USING (auth.uid() = user_id OR public.current_user_role() IN ('STAFF', 'ADMIN'));
CREATE POLICY seat_holds_all ON public.seat_holds FOR ALL USING (auth.uid() = user_id OR public.current_user_role() IN ('STAFF', 'ADMIN'));

CREATE POLICY seat_states_select ON public.seat_states FOR SELECT USING (true);
CREATE POLICY seat_states_update ON public.seat_states FOR UPDATE USING (public.current_user_role() IN ('STAFF', 'ADMIN'));

CREATE POLICY alerts_select ON public.alerts FOR SELECT USING (public.current_user_role() IN ('STAFF', 'ADMIN'));
CREATE POLICY alerts_insert ON public.alerts FOR INSERT WITH CHECK (true);
CREATE POLICY alerts_update ON public.alerts FOR UPDATE USING (public.current_user_role() IN ('STAFF', 'ADMIN'));

CREATE POLICY audit_log_select ON public.audit_log FOR SELECT USING (public.current_user_role() IN ('ADMIN', 'STAFF'));
CREATE POLICY email_outbox_select ON public.email_outbox FOR SELECT USING (auth.uid() = user_id OR public.current_user_role() IN ('STAFF', 'ADMIN'));

CREATE POLICY settings_select ON public.settings FOR SELECT USING (true);
CREATE POLICY settings_update ON public.settings FOR UPDATE USING (public.current_user_role() = 'ADMIN');

-- Realtime Publications (Safe check)
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_publication_tables
        WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = 'seat_states'
    ) THEN
        ALTER PUBLICATION supabase_realtime ADD TABLE public.seat_states;
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM pg_publication_tables
        WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = 'alerts'
    ) THEN
        ALTER PUBLICATION supabase_realtime ADD TABLE public.alerts;
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM pg_publication_tables
        WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = 'seat_units'
    ) THEN
        ALTER PUBLICATION supabase_realtime ADD TABLE public.seat_units;
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM pg_publication_tables
        WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = 'bookings'
    ) THEN
        ALTER PUBLICATION supabase_realtime ADD TABLE public.bookings;
    END IF;
EXCEPTION WHEN OTHERS THEN
    NULL;
END $$;

-- Indexes
CREATE INDEX IF NOT EXISTS idx_bookings_user_id ON public.bookings(user_id);
CREATE INDEX IF NOT EXISTS idx_bookings_event_id ON public.bookings(event_id);
CREATE INDEX IF NOT EXISTS idx_bookings_ticket_link ON public.bookings(ticket_link_token);
CREATE INDEX IF NOT EXISTS idx_seat_states_event_seat ON public.seat_states(event_id, seat_id);
CREATE INDEX IF NOT EXISTS idx_alerts_event_status ON public.alerts(event_id, status);
CREATE INDEX IF NOT EXISTS idx_audit_log_event_type ON public.audit_log(event_type);
CREATE INDEX IF NOT EXISTS idx_audit_log_booking_id ON public.audit_log(booking_id);
CREATE INDEX IF NOT EXISTS idx_audit_log_seat_id ON public.audit_log(seat_id);
CREATE INDEX IF NOT EXISTS idx_seat_holds_expiry ON public.seat_holds(expires_at);

-- ============================================================================
-- PHASE 4: FRESH SEED DATA (VENUES, SCREENS, SEATS, EVENTS, UNITS)
-- ============================================================================

-- 1. Venues
INSERT INTO public.venues (id, name, type, address)
VALUES
    ('11111111-1111-1111-1111-111111111111', 'Grand Cinema Multiplex', 'THEATRE', '700 Broadway, New York, NY'),
    ('22222222-2222-2222-2222-222222222222', 'Metro InterCity Superliner', 'BUS', 'Bay 4, Central Transit Terminal'),
    ('33333333-3333-3333-3333-333333333333', 'Express Rail Services', 'TRAIN', 'Platform 9, Grand Central');

-- 2. Screens
INSERT INTO public.screens (id, venue_id, name, rows, cols, layout_json)
VALUES
    (
        'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
        '11111111-1111-1111-1111-111111111111',
        'Screen 2',
        5,
        14,
        '{"aisles": [4, 10], "vip_rows": ["D", "E"], "description": "Dolby Atmos 4K Auditorium"}'::jsonb
    ),
    (
        'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb',
        '22222222-2222-2222-2222-222222222222',
        'Bus Coach Express 402',
        10,
        4,
        '{"aisles": [2], "description": "Luxury Sleeper / Recliner (2+2)"}'::jsonb
    ),
    (
        'cccccccc-cccc-cccc-cccc-cccccccccccc',
        '33333333-3333-3333-3333-333333333333',
        'Train Coach B3',
        8,
        6,
        '{"aisles": [3], "description": "AC 3-Tier Sleeper Coach"}'::jsonb
    );

-- 3. Seats & Seat Units for Screen 2 (Rows A through E, Columns 1 through 14)
DO $$
DECLARE
    r TEXT;
    c INT;
    v_seat_id UUID;
    v_unit_id TEXT;
    v_type TEXT;
    v_price NUMERIC(10,2);
BEGIN
    FOR r IN SELECT unnest(ARRAY['A', 'B', 'C', 'D', 'E']) LOOP
        FOR c IN 1..14 LOOP
            v_unit_id := 'SCREEN2-' || r || c;
            v_seat_id := gen_random_uuid();
            v_type := CASE WHEN r IN ('D', 'E') THEN 'VIP' ELSE 'STANDARD' END;
            v_price := CASE WHEN r IN ('D', 'E') THEN 22.50 ELSE 16.00 END;

            IF r = 'A' AND c = 12 THEN
                v_seat_id := 'a1200000-0000-0000-0000-000000000a12';
            ELSIF r = 'A' AND c = 13 THEN
                v_seat_id := 'a1300000-0000-0000-0000-000000000a13';
            ELSIF r = 'A' AND c = 14 THEN
                v_seat_id := 'a1400000-0000-0000-0000-000000000a14';
            ELSIF r = 'B' AND c = 4 THEN
                v_seat_id := 'b0400000-0000-0000-0000-000000000b04';
            END IF;

            INSERT INTO public.seats (id, screen_id, label, row, col, unit_id, type, price)
            VALUES (v_seat_id, 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', r || c, r, c, v_unit_id, v_type, v_price);

            INSERT INTO public.seat_units (id, seat_id, secret_hash, status_json, last_heartbeat)
            VALUES (
                v_unit_id,
                v_seat_id,
                encode(digest('smartseat_secret_' || v_unit_id, 'sha256'), 'hex'),
                '{"sensor":"OK","scanner":"OK","power":"OK","comms":"OK","tamper":false}'::jsonb,
                NOW()
            );
        END LOOP;
    END LOOP;
END $$;

-- 4. Events
INSERT INTO public.events (id, screen_id, title, type, start_time, end_time, status)
VALUES
    (
        'eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee',
        'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
        'Movie XYZ: The Quantum Paradox (Dolby Cinema)',
        'MOVIE',
        NOW() - INTERVAL '30 minutes',
        NOW() + INTERVAL '2 hours 30 minutes',
        'LIVE'
    ),
    (
        'ffffffff-ffff-ffff-ffff-ffffffffffff',
        'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb',
        'InterCity Superliner 402 - Express Journey',
        'BUS',
        NOW() + INTERVAL '1 hour',
        NOW() + INTERVAL '6 hours',
        'UPCOMING'
    ),
    (
        'dddddddd-dddd-dddd-dddd-dddddddddddd',
        'cccccccc-cccc-cccc-cccc-cccccccccccc',
        'Rajdhani Express Overnight - Coach B3',
        'TRAIN',
        NOW() + INTERVAL '3 hours',
        NOW() + INTERVAL '12 hours',
        'UPCOMING'
    );

-- 5. Seat States
INSERT INTO public.seat_states (seat_id, event_id, occupancy, "authorization", state, pressure)
SELECT s.id, 'eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee', 'EMPTY', 'UNAUTHORIZED', 'NORMAL', 0
FROM public.seats s
WHERE s.screen_id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';

-- 6. Audit Genesis
INSERT INTO public.audit_log (id, ts, event_type, status, meta, prev_hash, hash)
VALUES (
    0,
    NOW(),
    'SYSTEM_GENESIS',
    'SUCCESS',
    '{"system":"SmartSeat fresh reset & migration initialized"}'::jsonb,
    '0000000000000000000000000000000000000000000000000000000000000000',
    'GENESIS_00000000000000000000000000000000000000000000000000000000'
);

SELECT 'SmartSeat: Database successfully wiped, re-created, and freshly seeded!' AS result;
