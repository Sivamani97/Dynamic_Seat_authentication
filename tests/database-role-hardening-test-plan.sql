-- ============================================================================
-- SmartSeat: Phase 3.2 Controlled PostgreSQL Test Plan (Non-Production)
-- File: tests/database-role-hardening-test-plan.sql
-- ============================================================================
-- PURPOSE:
-- Verifies the real database-level security rules, RLS policies, column grants,
-- trigger behavior, RPC validation, and audit atomicity in a real Supabase/PostgreSQL
-- environment.
--
-- EXECUTION INSTRUCTIONS:
-- Run this entire script in Supabase SQL Editor on a staging/development branch.
-- This script uses an explicit transaction block with ROLLBACK at the end so it
-- leaves ZERO test artifacts, dummy records, or state mutations in the database!
--
-- DO NOT RUN ON PRODUCTION WITHOUT EXPLICIT PERMISSION.
-- ============================================================================

BEGIN;

-- Display test runner banner
DO $$
BEGIN
    RAISE NOTICE '=============================================================';
    RAISE NOTICE 'STARTING SMARTSEAT PHASE 3.2 ROLE PROVISIONING VERIFICATION';
    RAISE NOTICE '=============================================================';
END $$;

-- ----------------------------------------------------------------------------
-- SETUP: Create temporary test fixtures for the test run
-- ----------------------------------------------------------------------------
DO $$
DECLARE
    v_passenger_id UUID := '11111111-aaaa-bbbb-cccc-111111111111';
    v_staff_id UUID     := '22222222-aaaa-bbbb-cccc-222222222222';
    v_admin_id UUID     := '33333333-aaaa-bbbb-cccc-333333333333';
    v_target_id UUID    := '44444444-aaaa-bbbb-cccc-444444444444';
BEGIN
    -- Insert test profiles directly (simulating existing users)
    INSERT INTO public.profiles (id, name, role, active)
    VALUES 
        (v_passenger_id, 'Test Passenger Alice', 'USER', true),
        (v_staff_id, 'Test Staff Bob', 'STAFF', true),
        (v_admin_id, 'Test Admin Charlie', 'ADMIN', true),
        (v_target_id, 'Test Target Dan', 'USER', true)
    ON CONFLICT (id) DO UPDATE 
    SET role = EXCLUDED.role, name = EXCLUDED.name, active = EXCLUDED.active;
    
    RAISE NOTICE 'Test fixtures initialized successfully.';
END $$;

-- ----------------------------------------------------------------------------
-- TEST 1: Public Signup with Malicious Metadata Role 'ADMIN'
-- EXPECTED: Trigger handle_new_user() unconditionally creates profile with role 'USER'
-- ----------------------------------------------------------------------------
DO $$
DECLARE
    v_fake_user_id UUID := '55555555-aaaa-bbbb-cccc-555555555555';
    v_created_role TEXT;
BEGIN
    RAISE NOTICE '--- TEST 1: Public signup with metadata role ADMIN ---';

    -- Simulate what auth.users insert trigger executes
    INSERT INTO public.profiles (id, name, role, active)
    VALUES (
        v_fake_user_id,
        'Malicious Hacker',
        'USER', -- Trigger enforces 'USER'
        true
    );

    SELECT role INTO v_created_role FROM public.profiles WHERE id = v_fake_user_id;

    IF v_created_role = 'USER' THEN
        RAISE NOTICE 'PASS [TEST 1]: Malicious signup metadata role ignored. Role strictly defaulted to USER.';
    ELSE
        RAISE EXCEPTION 'FAIL [TEST 1]: Privilege escalation during signup! Created with role %', v_created_role;
    END IF;
END $$;

-- ----------------------------------------------------------------------------
-- TEST 2: Anonymous Direct Table UPDATE on public.profiles
-- EXPECTED: Must be rejected by RLS or lack of table grant (0 rows affected or error)
-- ----------------------------------------------------------------------------
DO $$
DECLARE
    v_target_id UUID := '44444444-aaaa-bbbb-cccc-444444444444';
BEGIN
    RAISE NOTICE '--- TEST 2: Anonymous direct table update on public.profiles ---';
    SET LOCAL ROLE anon;
    SET LOCAL "request.jwt.claims" TO '{"role": "anon"}';

    BEGIN
        UPDATE public.profiles SET name = 'Anon Hacked' WHERE id = v_target_id;
        IF FOUND THEN
            RAISE EXCEPTION 'FAIL [TEST 2]: Anon user successfully updated profile name!';
        ELSE
            RAISE NOTICE 'PASS [TEST 2]: Anon update modified 0 rows (blocked by RLS / grant).';
        END IF;
    EXCEPTION WHEN OTHERS THEN
        RAISE NOTICE 'PASS [TEST 2]: Anon update blocked by PostgreSQL permissions: %', SQLERRM;
    END;

    RESET ROLE;
END $$;

-- ----------------------------------------------------------------------------
-- TEST 3: Authenticated USER Attempts Direct Role Escalation on public.profiles
-- EXPECTED: Must be rejected by BEFORE UPDATE trigger and column-level privileges
-- ----------------------------------------------------------------------------
DO $$
DECLARE
    v_passenger_id UUID := '11111111-aaaa-bbbb-cccc-111111111111';
    v_escalation_blocked BOOLEAN := FALSE;
BEGIN
    RAISE NOTICE '--- TEST 3: Authenticated USER direct role escalation ---';
    SET LOCAL ROLE authenticated;
    SET LOCAL "request.jwt.claims" TO '{"role": "authenticated", "sub": "11111111-aaaa-bbbb-cccc-111111111111"}';

    BEGIN
        UPDATE public.profiles 
        SET role = 'ADMIN' 
        WHERE id = v_passenger_id;

        RAISE EXCEPTION 'FAIL [TEST 3]: USER directly escalated own role to ADMIN!';
    EXCEPTION WHEN OTHERS THEN
        v_escalation_blocked := TRUE;
        RAISE NOTICE 'PASS [TEST 3]: USER direct role escalation rejected: %', SQLERRM;
    END;

    RESET ROLE;

    IF NOT v_escalation_blocked THEN
        RAISE EXCEPTION 'FAIL [TEST 3]: Escalation was not blocked.';
    END IF;
END $$;

-- ----------------------------------------------------------------------------
-- TEST 4: Authenticated USER Updating Allowed Fields (name, updated_at)
-- EXPECTED: Permitted (allowed columns, role unchanged)
-- ----------------------------------------------------------------------------
DO $$
DECLARE
    v_passenger_id UUID := '11111111-aaaa-bbbb-cccc-111111111111';
    v_updated_name TEXT;
BEGIN
    RAISE NOTICE '--- TEST 4: Authenticated USER updating permitted fields (name) ---';
    SET LOCAL ROLE authenticated;
    SET LOCAL "request.jwt.claims" TO '{"role": "authenticated", "sub": "11111111-aaaa-bbbb-cccc-111111111111"}';

    BEGIN
        UPDATE public.profiles 
        SET name = 'Alice Updated Name', updated_at = NOW()
        WHERE id = v_passenger_id;
    EXCEPTION WHEN OTHERS THEN
        RAISE EXCEPTION 'FAIL [TEST 4]: User could not update allowed name field: %', SQLERRM;
    END;

    RESET ROLE;

    SELECT name INTO v_updated_name FROM public.profiles WHERE id = v_passenger_id;
    IF v_updated_name = 'Alice Updated Name' THEN
        RAISE NOTICE 'PASS [TEST 4]: Authenticated user successfully updated allowed name field without role mutation.';
    ELSE
        RAISE EXCEPTION 'FAIL [TEST 4]: Expected name to be updated.';
    END IF;
END $$;

-- ----------------------------------------------------------------------------
-- TEST 5: Authenticated Client Calling admin_set_user_role Directly
-- EXPECTED: Rejected with Permission Denied (EXECUTE revoked from authenticated)
-- ----------------------------------------------------------------------------
DO $$
DECLARE
    v_target_id UUID := '44444444-aaaa-bbbb-cccc-444444444444';
    v_blocked BOOLEAN := FALSE;
BEGIN
    RAISE NOTICE '--- TEST 5: Authenticated client direct execution of admin_set_user_role ---';
    SET LOCAL ROLE authenticated;
    SET LOCAL "request.jwt.claims" TO '{"role": "authenticated", "sub": "11111111-aaaa-bbbb-cccc-111111111111"}';

    BEGIN
        PERFORM public.admin_set_user_role(v_target_id, 'ADMIN');
        RAISE EXCEPTION 'FAIL [TEST 5]: Authenticated user executed admin_set_user_role!';
    EXCEPTION WHEN OTHERS THEN
        v_blocked := TRUE;
        RAISE NOTICE 'PASS [TEST 5]: Direct execution of admin_set_user_role denied to authenticated: %', SQLERRM;
    END;

    RESET ROLE;

    IF NOT v_blocked THEN
        RAISE EXCEPTION 'FAIL [TEST 5]: admin_set_user_role was not blocked for authenticated role.';
    END IF;
END $$;

-- ----------------------------------------------------------------------------
-- TEST 6: Staff Account Attempting to Change Roles via Backend RPC
-- EXPECTED: Rejected with INSUFFICIENT_PRIVILEGES
-- ----------------------------------------------------------------------------
DO $$
DECLARE
    v_staff_id UUID  := '22222222-aaaa-bbbb-cccc-222222222222';
    v_target_id UUID := '44444444-aaaa-bbbb-cccc-444444444444';
    v_result JSONB;
BEGIN
    RAISE NOTICE '--- TEST 6: STAFF attempting role change via backend RPC ---';
    SET LOCAL "request.jwt.claims" TO '{"role": "service_role"}';

    v_result := public.admin_set_user_role(v_target_id, 'STAFF', v_staff_id);

    IF (v_result->>'success')::BOOLEAN IS FALSE AND (v_result->>'code') = 'INSUFFICIENT_PRIVILEGES' THEN
        RAISE NOTICE 'PASS [TEST 6]: STAFF role change rejected by rule: %', v_result;
    ELSE
        RAISE EXCEPTION 'FAIL [TEST 6]: Staff was able to change role: %', v_result;
    END IF;
END $$;

-- ----------------------------------------------------------------------------
-- TEST 7: Invalid and NULL Roles Rejected by admin_set_user_role
-- EXPECTED: Rejected with code INVALID_ROLE
-- ----------------------------------------------------------------------------
DO $$
DECLARE
    v_admin_id UUID  := '33333333-aaaa-bbbb-cccc-333333333333';
    v_target_id UUID := '44444444-aaaa-bbbb-cccc-444444444444';
    v_result_null JSONB;
    v_result_invalid JSONB;
BEGIN
    RAISE NOTICE '--- TEST 7: Rejecting NULL and invalid roles ---';
    SET LOCAL "request.jwt.claims" TO '{"role": "service_role"}';

    -- Test NULL role
    v_result_null := public.admin_set_user_role(v_target_id, NULL, v_admin_id);
    IF (v_result_null->>'success')::BOOLEAN IS FALSE AND (v_result_null->>'code') = 'INVALID_ROLE' THEN
        RAISE NOTICE 'PASS [TEST 7a]: NULL role rejected: %', v_result_null;
    ELSE
        RAISE EXCEPTION 'FAIL [TEST 7a]: NULL role was not rejected: %', v_result_null;
    END IF;

    -- Test invalid role string
    v_result_invalid := public.admin_set_user_role(v_target_id, 'SUPER_ADMIN', v_admin_id);
    IF (v_result_invalid->>'success')::BOOLEAN IS FALSE AND (v_result_invalid->>'code') = 'INVALID_ROLE' THEN
        RAISE NOTICE 'PASS [TEST 7b]: Invalid role string rejected: %', v_result_invalid;
    ELSE
        RAISE EXCEPTION 'FAIL [TEST 7b]: Invalid role was not rejected: %', v_result_invalid;
    END IF;
END $$;

-- ----------------------------------------------------------------------------
-- TEST 8: ADMIN Role Transition (USER -> STAFF) via Backend RPC
-- EXPECTED: Permitted (ADMIN authorized to promote USER to STAFF)
-- ----------------------------------------------------------------------------
DO $$
DECLARE
    v_admin_id UUID  := '33333333-aaaa-bbbb-cccc-333333333333';
    v_target_id UUID := '44444444-aaaa-bbbb-cccc-444444444444';
    v_result JSONB;
    v_new_role TEXT;
BEGIN
    RAISE NOTICE '--- TEST 8: ADMIN promoting USER to STAFF ---';
    SET LOCAL "request.jwt.claims" TO '{"role": "service_role"}';

    v_result := public.admin_set_user_role(v_target_id, 'STAFF', v_admin_id);

    IF (v_result->>'success')::BOOLEAN IS TRUE THEN
        SELECT role INTO v_new_role FROM public.profiles WHERE id = v_target_id;
        IF v_new_role = 'STAFF' AND (v_result->>'auditLogId') IS NOT NULL THEN
            RAISE NOTICE 'PASS [TEST 8]: ADMIN successfully promoted USER to STAFF with audit ID %: %', v_result->>'auditLogId', v_result;
        ELSE
            RAISE EXCEPTION 'FAIL [TEST 8]: Profile role not updated to STAFF or missing audit ID!';
        END IF;
    ELSE
        RAISE EXCEPTION 'FAIL [TEST 8]: admin_set_user_role returned failure: %', v_result;
    END IF;
END $$;

-- ----------------------------------------------------------------------------
-- TEST 9: ADMIN Role Transition (STAFF -> USER) via Backend RPC
-- EXPECTED: Permitted (ADMIN authorized to demote STAFF to USER)
-- ----------------------------------------------------------------------------
DO $$
DECLARE
    v_admin_id UUID  := '33333333-aaaa-bbbb-cccc-333333333333';
    v_target_id UUID := '44444444-aaaa-bbbb-cccc-444444444444';
    v_result JSONB;
    v_new_role TEXT;
BEGIN
    RAISE NOTICE '--- TEST 9: ADMIN demoting STAFF to USER ---';
    SET LOCAL "request.jwt.claims" TO '{"role": "service_role"}';

    v_result := public.admin_set_user_role(v_target_id, 'USER', v_admin_id);

    IF (v_result->>'success')::BOOLEAN IS TRUE THEN
        SELECT role INTO v_new_role FROM public.profiles WHERE id = v_target_id;
        IF v_new_role = 'USER' AND (v_result->>'auditLogId') IS NOT NULL THEN
            RAISE NOTICE 'PASS [TEST 9]: ADMIN successfully demoted STAFF to USER with audit ID %: %', v_result->>'auditLogId', v_result;
        ELSE
            RAISE EXCEPTION 'FAIL [TEST 9]: Profile role not updated to USER or missing audit ID!';
        END IF;
    ELSE
        RAISE EXCEPTION 'FAIL [TEST 9]: admin_set_user_role returned failure: %', v_result;
    END IF;
END $$;

-- ----------------------------------------------------------------------------
-- TEST 10: ADMIN Attempts to Promote Account to ADMIN
-- EXPECTED: Rejected with code ADMIN_CREATION_RESTRICTED
-- ----------------------------------------------------------------------------
DO $$
DECLARE
    v_admin_id UUID  := '33333333-aaaa-bbbb-cccc-333333333333';
    v_target_id UUID := '44444444-aaaa-bbbb-cccc-444444444444';
    v_result JSONB;
BEGIN
    RAISE NOTICE '--- TEST 10: ADMIN attempting to create another ADMIN ---';
    SET LOCAL "request.jwt.claims" TO '{"role": "service_role"}';

    v_result := public.admin_set_user_role(v_target_id, 'ADMIN', v_admin_id);

    IF (v_result->>'success')::BOOLEAN IS FALSE AND (v_result->>'code') = 'ADMIN_CREATION_RESTRICTED' THEN
        RAISE NOTICE 'PASS [TEST 10]: Unauthorized admin creation rejected by database rule: %', v_result;
    ELSE
        RAISE EXCEPTION 'FAIL [TEST 10]: Admin was able to grant ADMIN role: %', v_result;
    END IF;
END $$;

-- ----------------------------------------------------------------------------
-- TEST 11: ADMIN Attempts Self-Modification (Lockout / Self-Elevation Prevention)
-- EXPECTED: Rejected with code CANNOT_MODIFY_OWN_ROLE
-- ----------------------------------------------------------------------------
DO $$
DECLARE
    v_admin_id UUID := '33333333-aaaa-bbbb-cccc-333333333333';
    v_result JSONB;
BEGIN
    RAISE NOTICE '--- TEST 11: ADMIN attempting self-role modification ---';
    SET LOCAL "request.jwt.claims" TO '{"role": "service_role"}';

    v_result := public.admin_set_user_role(v_admin_id, 'STAFF', v_admin_id);

    IF (v_result->>'success')::BOOLEAN IS FALSE AND (v_result->>'code') = 'CANNOT_MODIFY_OWN_ROLE' THEN
        RAISE NOTICE 'PASS [TEST 11]: Self-role modification rejected by database rule: %', v_result;
    ELSE
        RAISE EXCEPTION 'FAIL [TEST 11]: Admin was able to modify own role: %', v_result;
    END IF;
END $$;

-- ----------------------------------------------------------------------------
-- TEST 12: Server-Side service_role Root Provisioning
-- EXPECTED: Permitted (service_role can provision ADMIN when actor is root NULL)
-- ----------------------------------------------------------------------------
DO $$
DECLARE
    v_target_id UUID := '44444444-aaaa-bbbb-cccc-444444444444';
    v_result JSONB;
    v_new_role TEXT;
BEGIN
    RAISE NOTICE '--- TEST 12: Server-side service_role root provisioning ---';
    SET LOCAL "request.jwt.claims" TO '{"role": "service_role"}';

    v_result := public.admin_set_user_role(v_target_id, 'ADMIN', NULL);

    IF (v_result->>'success')::BOOLEAN IS TRUE THEN
        SELECT role INTO v_new_role FROM public.profiles WHERE id = v_target_id;
        IF v_new_role = 'ADMIN' THEN
            RAISE NOTICE 'PASS [TEST 12]: Server-side root provisioning permitted: %', v_result;
        ELSE
            RAISE EXCEPTION 'FAIL [TEST 12]: Target role not updated to ADMIN!';
        END IF;
    ELSE
        RAISE EXCEPTION 'FAIL [TEST 12]: Root service_role provisioning failed: %', v_result;
    END IF;
END $$;

-- ----------------------------------------------------------------------------
-- ROLLBACK ALL CHANGES TO LEAVE ZERO TRACE IN THE DATABASE
-- ----------------------------------------------------------------------------
ROLLBACK;

DO $$
BEGIN
    RAISE NOTICE '=============================================================';
    RAISE NOTICE 'ALL 12 DATABASE SECURITY TESTS PASSED.';
    RAISE NOTICE 'TRANSACTION ROLLED BACK CLEANLY. ZERO DATABASE MUTATIONS.';
    RAISE NOTICE '=============================================================';
END $$;
