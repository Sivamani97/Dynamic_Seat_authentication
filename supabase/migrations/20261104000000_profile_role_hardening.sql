-- ============================================================================
-- SmartSeat Migration: Phase 3.2 - Complete Profile Role Hardening,
-- Privilege Lockdown, Policy Purge & Atomic Audit Chain Enforcement
-- Migration File: supabase/migrations/20261104000000_profile_role_hardening.sql
-- ============================================================================

-- ----------------------------------------------------------------------------
-- PREFLIGHT VERIFICATION QUERIES (Read-Only)
-- Run these in Supabase SQL Editor to inspect live database configuration:
-- ----------------------------------------------------------------------------
-- 1. Inspect existing profile counts by role:
--    SELECT role, count(*) FROM public.profiles GROUP BY role;
--
-- 2. Inspect active triggers on auth.users and public.profiles:
--    SELECT event_object_schema, event_object_table, trigger_name, action_timing, event_manipulation 
--    FROM information_schema.triggers 
--    WHERE event_object_table IN ('users', 'profiles');
--
-- 3. Inspect active RLS policies on public.profiles:
--    SELECT schemaname, tablename, policyname, permissive, roles, cmd, qual, with_check 
--    FROM pg_policies 
--    WHERE tablename = 'profiles';
--
-- 4. Inspect table and column privileges on public.profiles:
--    SELECT grantee, privilege_type, is_grantable 
--    FROM information_schema.table_privileges 
--    WHERE table_schema = 'public' AND table_name = 'profiles';
--
--    SELECT grantee, privilege_type, column_name 
--    FROM information_schema.column_privileges 
--    WHERE table_schema = 'public' AND table_name = 'profiles';
--
-- 5. Inspect SECURITY DEFINER functions in public schema:
--    SELECT routine_name, security_type 
--    FROM information_schema.routines 
--    WHERE routine_schema = 'public' AND security_type = 'DEFINER';

-- ----------------------------------------------------------------------------
-- 1. Hardened handle_new_user Trigger Function
-- ----------------------------------------------------------------------------
-- CRITICAL SECURITY FIX: Eliminate client-controlled privilege escalation during signup.
-- Public signups are strictly defaulted to 'USER' (Passenger).
-- Promoted roles (STAFF, ADMIN) must be provisioned exclusively via trusted
-- server-side service-role operations or direct DBA management.
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER 
LANGUAGE plpgsql 
SECURITY DEFINER 
SET search_path = public, pg_temp
AS $$
BEGIN
    INSERT INTO public.profiles (id, name, role, active)
    VALUES (
        NEW.id,
        COALESCE(NEW.raw_user_meta_data->>'name', split_part(NEW.email, '@', 1)),
        'USER', -- HARDENED: All new public registrations are strictly USER (Passenger).
        TRUE
    )
    ON CONFLICT (id) DO UPDATE
    SET name = EXCLUDED.name; -- HARDENED: Never overwrite profile role or active status from metadata!
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
    AFTER INSERT ON auth.users
    FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- ----------------------------------------------------------------------------
-- 2. Database-Enforced Role Immutable Trigger on public.profiles
-- ----------------------------------------------------------------------------
-- Defense-in-depth: Even if a permissive RLS policy exists, this BEFORE UPDATE
-- trigger prevents any non-service_role / non-DBA client from mutating the 'role'
-- or 'active' columns via direct table UPDATE statements.
--
-- SECURITY CONTEXT & PRIVILEGE EXPLANATION:
-- In a SECURITY DEFINER function, PostgreSQL sets current_user to the function owner (postgres),
-- so checking `current_user <> 'service_role'` is invalid and would never match.
--
-- Instead, the trigger correctly inspects:
-- A) auth.role() and request.jwt.claims for 'service_role' (trusted server backend)
-- B) session_user IN ('postgres', 'supabase_admin') when no JWT claims exist (direct DBA in SQL Editor)
--
-- Direct table updates of 'role' by authenticated users (even administrators) are rejected.
-- Role transitions MUST use the dedicated admin_set_user_role RPC via the server API.
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.protect_profile_role_elevation()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_jwt_role TEXT;
    v_is_service_role BOOLEAN;
    v_is_dba BOOLEAN;
BEGIN
    -- Evaluate when role or active status is being modified
    IF (NEW.role IS DISTINCT FROM OLD.role) OR (NEW.active IS DISTINCT FROM OLD.active) THEN
        -- 1. Extract the JWT role from request context safely
        BEGIN
            v_jwt_role := COALESCE(
                auth.role(),
                current_setting('request.jwt.claims', true)::jsonb ->> 'role',
                ''
            );
        EXCEPTION WHEN OTHERS THEN
            v_jwt_role := '';
        END;

        -- 2. Check if caller is Supabase service_role (server backend)
        v_is_service_role := (v_jwt_role = 'service_role');

        -- 3. Check if caller is direct DBA (psql, SQL Editor, or migrations without JWT claims)
        v_is_dba := (
            session_user IN ('postgres', 'supabase_admin') AND
            current_setting('request.jwt.claims', true) IS NULL
        );

        -- 4. If neither service_role nor direct DBA -> REJECT!
        IF NOT (v_is_service_role OR v_is_dba) THEN
            RAISE EXCEPTION 'Privilege escalation rejected: Direct modification of profile role or active status is forbidden. Role assignments must use the admin_set_user_role RPC through the authorized server API.';
        END IF;
    END IF;

    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_protect_profile_role ON public.profiles;
CREATE TRIGGER trg_protect_profile_role
    BEFORE UPDATE ON public.profiles
    FOR EACH ROW EXECUTE FUNCTION public.protect_profile_role_elevation();

-- ----------------------------------------------------------------------------
-- 3. Dedicated Administrative Role Provisioning RPC (admin_set_user_role)
-- ----------------------------------------------------------------------------
-- Provides an explicit, atomic, audit-safe procedure for administrators
-- and backend server operations to promote, demote, or assign account roles.
--
-- TASK 1 AUDIT FIX:
-- Audit logging and role updates occur in the SAME transaction.
-- If append_audit_log fails for any reason, the transaction immediately fails
-- and rolls back. A role change is NEVER committed without a valid audit entry.
--
-- TASK 3 ROLE VALIDATION:
-- Strictly rejects NULL and invalid roles.
-- Permitted transitions:
-- - ADMIN can promote USER to STAFF.
-- - ADMIN can demote STAFF to USER.
-- - ADMIN cannot create another ADMIN (ADMIN_CREATION_RESTRICTED).
-- - ADMIN cannot modify their own role (CANNOT_MODIFY_OWN_ROLE).
-- - ADMIN cannot modify another ADMIN (CANNOT_MODIFY_ADMIN).
-- - Only trusted server-side service-role provisioning can create ADMIN accounts.
-- - All other transitions are strictly REJECTED (DISALLOWED_ROLE_TRANSITION).
--
-- PERMISSION LOCKDOWN:
-- EXECUTE is explicitly REVOKED from PUBLIC, anon, and authenticated.
-- EXECUTE is granted EXCLUSIVELY to service_role.
-- Browser clients CANNOT invoke this RPC directly via PostgREST.
-- ----------------------------------------------------------------------------

DROP FUNCTION IF EXISTS public.admin_set_user_role(UUID, TEXT);
DROP FUNCTION IF EXISTS public.admin_set_user_role(UUID, TEXT, UUID);

CREATE OR REPLACE FUNCTION public.admin_set_user_role(
    p_target_user_id UUID,
    p_new_role TEXT,
    p_actor_user_id UUID DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_jwt_role TEXT;
    v_is_service_role BOOLEAN;
    v_is_dba BOOLEAN;
    v_actor_id UUID;
    v_actor_role TEXT;
    v_actor_active BOOLEAN;
    v_target_profile RECORD;
    v_audit_id BIGINT;
BEGIN
    -- 1. Explicitly reject NULL and invalid roles
    IF p_new_role IS NULL THEN
        RETURN jsonb_build_object(
            'success', false,
            'code', 'INVALID_ROLE',
            'message', 'Invalid role: role cannot be NULL.'
        );
    END IF;

    IF p_new_role NOT IN ('USER', 'STAFF', 'ADMIN') THEN
        RETURN jsonb_build_object(
            'success', false,
            'code', 'INVALID_ROLE',
            'message', 'Invalid role: must be USER, STAFF, or ADMIN.'
        );
    END IF;

    -- 2. Extract JWT role safely
    BEGIN
        v_jwt_role := COALESCE(
            auth.role(),
            current_setting('request.jwt.claims', true)::jsonb ->> 'role',
            ''
        );
    EXCEPTION WHEN OTHERS THEN
        v_jwt_role := '';
    END;

    -- 3. Verify RPC caller execution context
    -- Only service_role or direct DBA can invoke this function
    v_is_service_role := (v_jwt_role = 'service_role');
    v_is_dba := (
        session_user IN ('postgres', 'supabase_admin') AND 
        current_setting('request.jwt.claims', true) IS NULL
    );

    IF NOT (v_is_service_role OR v_is_dba) THEN
        RETURN jsonb_build_object(
            'success', false,
            'code', 'FORBIDDEN',
            'message', 'Forbidden: Only service-role operations or direct database administrators can invoke admin_set_user_role.'
        );
    END IF;

    -- 4. Verify target profile exists
    SELECT id, name, role, active INTO v_target_profile
    FROM public.profiles
    WHERE id = p_target_user_id;

    IF v_target_profile.id IS NULL THEN
        RETURN jsonb_build_object(
            'success', false,
            'code', 'USER_NOT_FOUND',
            'message', 'Target profile does not exist.'
        );
    END IF;

    IF v_target_profile.role IS NULL THEN
        RETURN jsonb_build_object(
            'success', false,
            'code', 'INVALID_TARGET_ROLE',
            'message', 'Target profile has an invalid NULL role state.'
        );
    END IF;

    -- 5. Determine effective actor identity:
    -- If auth.uid() is set in JWT, it overrides client-supplied actor ID (anti-spoofing).
    -- Otherwise, use p_actor_user_id supplied by the verified server backend.
    v_actor_id := COALESCE(auth.uid(), p_actor_user_id);

    -- 6. Enforce Role Transition Matrix if an actor is identified
    IF v_actor_id IS NOT NULL THEN
        -- Rule: User cannot modify their own role
        IF v_actor_id = p_target_user_id THEN
            RETURN jsonb_build_object(
                'success', false,
                'code', 'CANNOT_MODIFY_OWN_ROLE',
                'message', 'Users cannot modify their own role. Administrative role changes must be performed by a different administrator.'
            );
        END IF;

        -- Fetch actor profile
        SELECT role, active INTO v_actor_role, v_actor_active
        FROM public.profiles
        WHERE id = v_actor_id;

        IF v_actor_role IS NULL OR v_actor_active IS NOT TRUE THEN
            RETURN jsonb_build_object(
                'success', false,
                'code', 'ACTOR_NOT_FOUND',
                'message', 'Acting user does not exist or is inactive.'
            );
        END IF;

        -- Rule: USER and STAFF cannot alter account roles
        IF v_actor_role IN ('USER', 'STAFF') THEN
            RETURN jsonb_build_object(
                'success', false,
                'code', 'INSUFFICIENT_PRIVILEGES',
                'message', 'Insufficient privileges: Only administrators can modify user roles.'
            );
        END IF;

        -- Rule: Strict ADMIN constraints
        IF v_actor_role = 'ADMIN' THEN
            -- ADMIN cannot modify another ADMIN account
            IF v_target_profile.role = 'ADMIN' THEN
                RETURN jsonb_build_object(
                    'success', false,
                    'code', 'CANNOT_MODIFY_ADMIN',
                    'message', 'Forbidden: Administrators cannot demote or alter other administrator accounts.'
                );
            END IF;

            -- ADMIN cannot promote any user to ADMIN
            IF p_new_role = 'ADMIN' THEN
                RETURN jsonb_build_object(
                    'success', false,
                    'code', 'ADMIN_CREATION_RESTRICTED',
                    'message', 'Forbidden: Administrators cannot grant ADMIN privileges. Administrator creation requires root service_role authorization.'
                );
            END IF;

            -- Strictly allowed transitions for ADMIN:
            -- 1. USER -> STAFF (Promote passenger to staff)
            -- 2. STAFF -> USER (Demote staff to passenger)
            -- 3. Identical role (No-op)
            IF NOT (
                (v_target_profile.role = 'USER' AND p_new_role = 'STAFF') OR
                (v_target_profile.role = 'STAFF' AND p_new_role = 'USER') OR
                (v_target_profile.role = p_new_role)
            ) THEN
                RETURN jsonb_build_object(
                    'success', false,
                    'code', 'DISALLOWED_ROLE_TRANSITION',
                    'message', 'Forbidden: Disallowed role transition. Administrators can only promote USER to STAFF or demote STAFF to USER.'
                );
            END IF;
        END IF;
    ELSE
        -- No actor specified: Only permitted for direct service_role / DBA root provisioning
        IF NOT (v_is_service_role OR v_is_dba) THEN
            RETURN jsonb_build_object(
                'success', false,
                'code', 'FORBIDDEN',
                'message', 'Missing actor identity.'
            );
        END IF;
    END IF;

    -- 7. Execute role update
    UPDATE public.profiles
    SET role = p_new_role,
        updated_at = NOW()
    WHERE id = p_target_user_id;

    -- 8. Record audit log entry (TASK 1: STRICT ATOMICITY)
    -- Both role update and audit log occur in the SAME transaction.
    -- If append_audit_log raises any error, this block DOES NOT catch or swallow it;
    -- the transaction aborts and the role update rolls back automatically!
    v_audit_id := public.append_audit_log(
        p_event_type  => 'ROLE_CHANGED',
        p_booking_id  => NULL,
        p_booking_ref => NULL,
        p_seat_id     => NULL,
        p_seat_label  => NULL,
        p_unit_id     => NULL,
        p_actor_id    => v_actor_id,
        p_actor_role  => COALESCE(v_actor_role, 'service_role'),
        p_status      => 'SUCCESS',
        p_meta        => jsonb_build_object(
            'targetUserId', p_target_user_id,
            'previousRole', v_target_profile.role,
            'newRole', p_new_role,
            'actorUserId', v_actor_id,
            'isServiceRoleProvisioning', (v_actor_id IS NULL)
        )
    );

    -- Ensure an audit entry was actually generated
    IF v_audit_id IS NULL OR v_audit_id <= 0 THEN
        RAISE EXCEPTION 'Audit logging failed: No audit entry generated. Transaction rolled back.';
    END IF;

    RETURN jsonb_build_object(
        'success', true,
        'userId', p_target_user_id,
        'previousRole', v_target_profile.role,
        'newRole', p_new_role,
        'actorUserId', v_actor_id,
        'auditLogId', v_audit_id,
        'message', 'User role successfully updated.'
    );
END;
$$;

-- LOCKDOWN RPC PERMISSIONS:
REVOKE ALL ON FUNCTION public.admin_set_user_role(UUID, TEXT, UUID) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.admin_set_user_role(UUID, TEXT, UUID) FROM anon;
REVOKE ALL ON FUNCTION public.admin_set_user_role(UUID, TEXT, UUID) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.admin_set_user_role(UUID, TEXT, UUID) TO service_role;

-- ----------------------------------------------------------------------------
-- 4. Purge ALL Existing Policies on public.profiles (Task 4)
-- ----------------------------------------------------------------------------
-- Do not assume dropping a few policy names removes all dangerous policies.
-- Dynamically query pg_policies and drop EVERY policy on public.profiles.
-- ----------------------------------------------------------------------------
DO $$
DECLARE
    pol RECORD;
BEGIN
    FOR pol IN
        SELECT policyname
        FROM pg_policies
        WHERE schemaname = 'public' AND tablename = 'profiles'
    LOOP
        EXECUTE format('DROP POLICY IF EXISTS %I ON public.profiles', pol.policyname);
    END LOOP;
END $$;

-- Enable Row Level Security
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

-- ----------------------------------------------------------------------------
-- 5. Re-create Minimal, Airtight RLS Policies on public.profiles
-- ----------------------------------------------------------------------------
-- SELECT Policy: Users see only their own profile; Staff and Admin see all.
CREATE POLICY profiles_select_policy ON public.profiles
    FOR SELECT TO authenticated
    USING (
        auth.uid() = id OR public.current_user_role() IN ('STAFF', 'ADMIN')
    );

-- UPDATE Policy: Authenticated users can only update their own row.
-- WITH CHECK ensures users cannot mutate the row id to hijack other profiles.
CREATE POLICY profiles_update_own ON public.profiles
    FOR UPDATE TO authenticated
    USING (auth.uid() = id)
    WITH CHECK (auth.uid() = id);

-- ZERO INSERT or DELETE policies for authenticated or anon.
-- (Profile creation is handled exclusively by handle_new_user SECURITY DEFINER trigger).

-- ----------------------------------------------------------------------------
-- 6. Fix Database Privileges & Column-Level Grants (Task 2)
-- ----------------------------------------------------------------------------
-- In PostgreSQL, privileges are additive. If table-level UPDATE is granted to
-- PUBLIC, anon, or authenticated, column-level restrictions are ineffective.
-- We must revoke ALL table-level privileges first!
-- ----------------------------------------------------------------------------

-- Revoke all table-level privileges from PUBLIC, anon, and authenticated
REVOKE ALL PRIVILEGES ON TABLE public.profiles FROM PUBLIC;
REVOKE ALL PRIVILEGES ON TABLE public.profiles FROM anon;
REVOKE ALL PRIVILEGES ON TABLE public.profiles FROM authenticated;

-- Explicitly revoke table-level UPDATE
REVOKE UPDATE ON TABLE public.profiles FROM PUBLIC, anon, authenticated;

-- Grant SELECT strictly to authenticated
GRANT SELECT ON TABLE public.profiles TO authenticated;

-- Grant column-level UPDATE ONLY for permitted fields: 'name' and 'updated_at'.
-- Columns 'role', 'active', 'id', and 'created_at' CANNOT be updated by authenticated users!
GRANT UPDATE (name, updated_at) ON TABLE public.profiles TO authenticated;

-- Grant full table permissions to administrative backend roles
GRANT ALL PRIVILEGES ON TABLE public.profiles TO service_role;
GRANT ALL PRIVILEGES ON TABLE public.profiles TO postgres;

-- ----------------------------------------------------------------------------
-- 7. Pinned Search Path on Key Functions (Anti-Search-Path Hijacking)
-- ----------------------------------------------------------------------------
ALTER FUNCTION public.current_user_role() SET search_path = public, pg_temp;
ALTER FUNCTION public.append_audit_log(
    TEXT, UUID, TEXT, UUID, TEXT, TEXT, UUID, TEXT, TEXT, JSONB
) SET search_path = public, pg_temp;
