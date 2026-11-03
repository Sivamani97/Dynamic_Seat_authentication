-- ============================================================================
-- SmartSeat: Fast Data-Only Wipe & Re-Seed
-- Keeps the existing database tables, RLS policies, and triggers intact.
-- Safely truncates old test bookings, alerts, and audit logs, then re-seeds fresh data.
-- ============================================================================

-- 1. Truncate all application data in cascade order
TRUNCATE TABLE
    public.rate_limits,
    public.email_outbox,
    public.audit_log,
    public.alerts,
    public.used_tokens,
    public.seat_states,
    public.seat_holds,
    public.bookings,
    public.events,
    public.seat_units,
    public.seats,
    public.screens,
    public.venues
RESTART IDENTITY CASCADE;

-- 2. Venues
INSERT INTO public.venues (id, name, type, address)
VALUES
    ('11111111-1111-1111-1111-111111111111', 'Grand Cinema Multiplex', 'THEATRE', '700 Broadway, New York, NY'),
    ('22222222-2222-2222-2222-222222222222', 'Metro InterCity Superliner', 'BUS', 'Bay 4, Central Transit Terminal'),
    ('33333333-3333-3333-3333-333333333333', 'Express Rail Services', 'TRAIN', 'Platform 9, Grand Central');

-- 3. Screens
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

-- 4. Seats & Seat Units for Screen 2
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

-- 5. Events
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

-- 6. Seat States
INSERT INTO public.seat_states (seat_id, event_id, occupancy, "authorization", state, pressure)
SELECT s.id, 'eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee', 'EMPTY', 'UNAUTHORIZED', 'NORMAL', 0
FROM public.seats s
WHERE s.screen_id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';

-- 7. Audit Genesis
INSERT INTO public.audit_log (id, ts, event_type, status, meta, prev_hash, hash)
VALUES (
    0,
    NOW(),
    'SYSTEM_GENESIS',
    'SUCCESS',
    '{"system":"SmartSeat data re-seeded"}'::jsonb,
    '0000000000000000000000000000000000000000000000000000000000000000',
    'GENESIS_00000000000000000000000000000000000000000000000000000000'
);

SELECT 'SmartSeat: Data cleanly purged and freshly re-seeded!' AS result;

