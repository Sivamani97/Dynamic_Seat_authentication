-- ============================================================================
-- SmartSeat Migration: Phase 2.1 - Critical Database Integrity, RPC Hardening & RLS
-- Migration File: supabase/migrations/20261103000000_phase2_integrity_rls.sql
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. Database-Enforced Active Booking Integrity (Partial Unique Index)
-- ----------------------------------------------------------------------------
-- Prevents two active bookings for the same seat and event simultaneously.
-- Covers all active reservation statuses: 'BOOKED', 'CHECKED_IN', 'SEAT_AUTHORIZED'.
-- Cancelled and completed bookings do not conflict.
CREATE UNIQUE INDEX IF NOT EXISTS idx_unique_active_booking 
ON public.bookings (event_id, seat_id) 
WHERE status IN ('BOOKED', 'CHECKED_IN', 'SEAT_AUTHORIZED');

-- ----------------------------------------------------------------------------
-- 2. Database-Enforced Single Active SOS Alert Per Booking (Partial Unique Index)
-- ----------------------------------------------------------------------------
-- Prevents race conditions and duplicate concurrent active SOS alerts for a booking.
-- Covers active alert statuses: 'NEW', 'ACKNOWLEDGED'.
-- Once an alert is 'RESOLVED', it leaves this index and permits a subsequent SOS.
CREATE UNIQUE INDEX IF NOT EXISTS idx_unique_active_sos_alert
ON public.alerts (booking_id)
WHERE type = 'SOS' AND status IN ('NEW', 'ACKNOWLEDGED');

-- ----------------------------------------------------------------------------
-- 3. Atomic Transactional Booking Confirmation RPC (confirm_booking_atomic)
-- ----------------------------------------------------------------------------
-- Coordinates event validation, seat-event relationship check, seat availability,
-- hold verification, booking creation, hold deletion, and non-destructive seat-state
-- initialization in a single atomic PostgreSQL transaction.
CREATE OR REPLACE FUNCTION public.confirm_booking_atomic(
    p_event_id UUID,
    p_seat_id UUID,
    p_user_id UUID,
    p_booking_ref TEXT,
    p_ticket_link_token TEXT,
    p_booking_secret TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_event RECORD;
    v_seat RECORD;
    v_existing_booking_id UUID;
    v_active_hold RECORD;
    v_new_booking RECORD;
    v_now TIMESTAMPTZ := NOW();
BEGIN
    -- 1. Validate that the event exists and is eligible for booking
    SELECT id, screen_id, status INTO v_event
    FROM public.events
    WHERE id = p_event_id;

    IF v_event.id IS NULL THEN
        RETURN jsonb_build_object(
            'success', false,
            'code', 'EVENT_NOT_FOUND',
            'message', 'The requested event does not exist.'
        );
    END IF;

    IF v_event.status NOT IN ('UPCOMING', 'LIVE') THEN
        RETURN jsonb_build_object(
            'success', false,
            'code', 'EVENT_NOT_BOOKABLE',
            'message', 'Bookings are closed for this event.'
        );
    END IF;

    -- 2. Validate that the seat exists and belongs to the requested event screen
    SELECT id, screen_id, label INTO v_seat
    FROM public.seats
    WHERE id = p_seat_id;

    IF v_seat.id IS NULL THEN
        RETURN jsonb_build_object(
            'success', false,
            'code', 'SEAT_NOT_FOUND',
            'message', 'The requested seat does not exist.'
        );
    END IF;

    IF v_seat.screen_id <> v_event.screen_id THEN
        RETURN jsonb_build_object(
            'success', false,
            'code', 'INVALID_EVENT_SEAT',
            'message', 'The requested seat does not belong to the event venue screen.'
        );
    END IF;

    -- 3. Lock and verify seat does not already have an active reservation for this event
    SELECT id INTO v_existing_booking_id
    FROM public.bookings
    WHERE event_id = p_event_id
      AND seat_id = p_seat_id
      AND status IN ('BOOKED', 'CHECKED_IN', 'SEAT_AUTHORIZED')
    FOR UPDATE;

    IF v_existing_booking_id IS NOT NULL THEN
        RETURN jsonb_build_object(
            'success', false,
            'code', 'SEAT_ALREADY_RESERVED',
            'message', 'Seat already reserved.'
        );
    END IF;

    -- 4. Lock and verify dynamic seat hold
    SELECT id, user_id, expires_at INTO v_active_hold
    FROM public.seat_holds
    WHERE event_id = p_event_id
      AND seat_id = p_seat_id
      AND expires_at > v_now
    FOR UPDATE;

    IF v_active_hold.id IS NOT NULL THEN
        IF v_active_hold.user_id IS NOT NULL AND v_active_hold.user_id <> p_user_id THEN
            RETURN jsonb_build_object(
                'success', false,
                'code', 'SEAT_HELD_BY_ANOTHER',
                'message', 'This seat is temporarily held by another passenger during checkout.'
            );
        END IF;
    END IF;

    -- 5. Insert new booking record (also physically protected by idx_unique_active_booking)
    INSERT INTO public.bookings (
        booking_ref,
        user_id,
        event_id,
        seat_id,
        status,
        ticket_link_token,
        booking_secret,
        created_at,
        updated_at
    )
    VALUES (
        p_booking_ref,
        p_user_id,
        p_event_id,
        p_seat_id,
        'BOOKED',
        p_ticket_link_token,
        p_booking_secret,
        v_now,
        v_now
    )
    RETURNING * INTO v_new_booking;

    -- 6. Delete any active hold for this seat and event
    DELETE FROM public.seat_holds
    WHERE event_id = p_event_id
      AND seat_id = p_seat_id;

    -- 7. Initialize seat state ONLY if no record exists for this seat & event.
    -- DO NOT overwrite existing occupancy, authorization, or SOS state!
    INSERT INTO public.seat_states (
        seat_id,
        event_id,
        occupancy,
        "authorization",
        state,
        pressure,
        mismatch_since,
        updated_at
    )
    VALUES (
        p_seat_id,
        p_event_id,
        'EMPTY',
        'UNAUTHORIZED',
        'NORMAL',
        0,
        NULL,
        v_now
    )
    ON CONFLICT (seat_id, event_id) DO NOTHING;

    RETURN jsonb_build_object(
        'success', true,
        'booking', row_to_json(v_new_booking)
    );
EXCEPTION
    WHEN unique_violation THEN
        RETURN jsonb_build_object(
            'success', false,
            'code', 'CONCURRENT_CONFLICT',
            'message', 'Seat already reserved.'
        );
    WHEN OTHERS THEN
        -- Log internal diagnostic details securely on server without exposing SQLERRM to client
        RAISE WARNING 'confirm_booking_atomic failure: % (State: %)', SQLERRM, SQLSTATE;
        RETURN jsonb_build_object(
            'success', false,
            'code', 'DATABASE_ERROR',
            'message', 'Booking confirmation encountered an internal database error.'
        );
END;
$$;

-- Security hardening: explicitly revoke execute from public, anon, authenticated
REVOKE EXECUTE ON FUNCTION public.confirm_booking_atomic(UUID, UUID, UUID, TEXT, TEXT, TEXT) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.confirm_booking_atomic(UUID, UUID, UUID, TEXT, TEXT, TEXT) TO service_role;

-- ----------------------------------------------------------------------------
-- 4. Atomic Transactional Booking Cancellation RPC (cancel_booking_atomic)
-- ----------------------------------------------------------------------------
-- Coordinates ownership check, status update to CANCELLED, and conditional
-- seat-state reset preventing stale cancellations from overwriting newer seat states.
CREATE OR REPLACE FUNCTION public.cancel_booking_atomic(
    p_booking_id UUID,
    p_user_id UUID,
    p_is_privileged BOOLEAN
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_booking RECORD;
    v_active_subsequent_booking_exists BOOLEAN;
    v_now TIMESTAMPTZ := NOW();
BEGIN
    -- 1. Lock the booking row for update
    SELECT id, booking_ref, user_id, event_id, seat_id, status, updated_at
    INTO v_booking
    FROM public.bookings
    WHERE id = p_booking_id
    FOR UPDATE;

    IF v_booking.id IS NULL THEN
        RETURN jsonb_build_object(
            'success', false,
            'code', 'BOOKING_NOT_FOUND',
            'message', 'Booking not found.'
        );
    END IF;

    -- 2. Verify authorization: owner or staff/admin
    IF NOT p_is_privileged AND (v_booking.user_id IS NULL OR v_booking.user_id <> p_user_id) THEN
        RETURN jsonb_build_object(
            'success', false,
            'code', 'FORBIDDEN',
            'message', 'Forbidden: You are not authorized to cancel this booking.'
        );
    END IF;

    -- 3. Check if already cancelled
    IF v_booking.status = 'CANCELLED' THEN
        RETURN jsonb_build_object(
            'success', false,
            'code', 'ALREADY_CANCELLED',
            'message', 'Booking is already cancelled.'
        );
    END IF;

    -- 4. Mark booking as CANCELLED
    UPDATE public.bookings
    SET status = 'CANCELLED',
        updated_at = v_now
    WHERE id = p_booking_id;

    -- 5. Coordinate seat_states transition:
    -- Prevent stale cancellation from overwriting newer seat state!
    -- Check if another active booking exists for this seat/event
    SELECT EXISTS (
        SELECT 1 FROM public.bookings
        WHERE event_id = v_booking.event_id
          AND seat_id = v_booking.seat_id
          AND id <> p_booking_id
          AND status IN ('BOOKED', 'CHECKED_IN', 'SEAT_AUTHORIZED')
    ) INTO v_active_subsequent_booking_exists;

    -- Only reset seat state if no other active booking exists
    -- and the seat state was not modified after this booking's last update
    IF NOT v_active_subsequent_booking_exists THEN
        UPDATE public.seat_states
        SET "authorization" = 'UNAUTHORIZED',
            occupancy = 'EMPTY',
            state = 'NORMAL',
            pressure = 0,
            mismatch_since = NULL,
            updated_at = v_now
        WHERE seat_id = v_booking.seat_id
          AND event_id = v_booking.event_id
          AND updated_at <= v_booking.updated_at;
    END IF;

    RETURN jsonb_build_object(
        'success', true,
        'booking', jsonb_build_object(
            'id', v_booking.id,
            'booking_ref', v_booking.booking_ref,
            'seat_id', v_booking.seat_id,
            'event_id', v_booking.event_id,
            'user_id', v_booking.user_id,
            'status', 'CANCELLED'
        )
    );
EXCEPTION
    WHEN OTHERS THEN
        RAISE WARNING 'cancel_booking_atomic failure: % (State: %)', SQLERRM, SQLSTATE;
        RETURN jsonb_build_object(
            'success', false,
            'code', 'DATABASE_ERROR',
            'message', 'Cancellation encountered an internal database error.'
        );
END;
$$;

-- Security hardening: explicitly revoke execute from public, anon, authenticated
REVOKE EXECUTE ON FUNCTION public.cancel_booking_atomic(UUID, UUID, BOOLEAN) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.cancel_booking_atomic(UUID, UUID, BOOLEAN) TO service_role;

-- ----------------------------------------------------------------------------
-- 5. Hardened Table Privileges & Row Level Security (RLS)
-- ----------------------------------------------------------------------------

-- Bookings table: REVOKE all direct mutations from browser/client roles.
-- Direct INSERT, UPDATE, DELETE are forbidden; bookings must be managed
-- exclusively through protected server-side operations using service_role.
REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON public.bookings FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.bookings TO authenticated;
GRANT ALL ON public.bookings TO service_role;

ALTER TABLE public.bookings ENABLE ROW LEVEL SECURITY;

-- Drop prior mutable policies
DROP POLICY IF EXISTS bookings_insert ON public.bookings;
DROP POLICY IF EXISTS bookings_update ON public.bookings;
DROP POLICY IF EXISTS bookings_delete ON public.bookings;
DROP POLICY IF EXISTS bookings_manage ON public.bookings;

-- Only SELECT is permitted for authenticated users: passengers see own, staff/admin see all
DROP POLICY IF EXISTS bookings_select ON public.bookings;
CREATE POLICY bookings_select ON public.bookings
    FOR SELECT TO authenticated
    USING (
        auth.uid() = user_id OR public.current_user_role() IN ('STAFF', 'ADMIN')
    );

-- Seat Holds RLS: Passengers manage only their own; staff/admin manage all
ALTER TABLE public.seat_holds ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS seat_holds_select ON public.seat_holds;
CREATE POLICY seat_holds_select ON public.seat_holds
    FOR SELECT TO authenticated
    USING (
        auth.uid() = user_id OR public.current_user_role() IN ('STAFF', 'ADMIN')
    );

DROP POLICY IF EXISTS seat_holds_all ON public.seat_holds;
DROP POLICY IF EXISTS seat_holds_manage ON public.seat_holds;
CREATE POLICY seat_holds_manage ON public.seat_holds
    FOR ALL TO authenticated
    USING (
        auth.uid() = user_id OR public.current_user_role() IN ('STAFF', 'ADMIN')
    );

-- Alerts RLS: Passengers can ONLY view alerts associated with their own booking!
-- Staff and Admin can view and update all alerts.
ALTER TABLE public.alerts ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS alerts_select ON public.alerts;
CREATE POLICY alerts_select ON public.alerts
    FOR SELECT TO authenticated
    USING (
        public.current_user_role() IN ('STAFF', 'ADMIN')
        OR EXISTS (
            SELECT 1 FROM public.bookings b
            WHERE b.id = alerts.booking_id
              AND b.user_id = auth.uid()
        )
    );

DROP POLICY IF EXISTS alerts_update ON public.alerts;
CREATE POLICY alerts_update ON public.alerts
    FOR UPDATE TO authenticated
    USING (
        public.current_user_role() IN ('STAFF', 'ADMIN')
    );

-- Seat States RLS: Anyone can view seat states for occupancy display.
-- Direct modifications restricted to staff/admin and service_role.
ALTER TABLE public.seat_states ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS seat_states_select ON public.seat_states;
CREATE POLICY seat_states_select ON public.seat_states
    FOR SELECT USING (true);

DROP POLICY IF EXISTS seat_states_modify ON public.seat_states;
CREATE POLICY seat_states_modify ON public.seat_states
    FOR ALL TO authenticated
    USING (
        public.current_user_role() IN ('STAFF', 'ADMIN')
    );
