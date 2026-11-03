-- ============================================================================
-- SmartSeat: Clean Slate Teardown Script
-- Safely drops old tables, triggers, and functions in public schema
-- Dropping tables with CASCADE automatically clears publications and references.
-- ============================================================================

-- 1. Drop auth triggers
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
DROP FUNCTION IF EXISTS public.handle_new_user() CASCADE;

-- 2. Drop helper and audit functions
DROP FUNCTION IF EXISTS public.append_audit_log(TEXT, UUID, TEXT, UUID, TEXT, TEXT, UUID, TEXT, TEXT, JSONB) CASCADE;
DROP FUNCTION IF EXISTS public.current_user_role() CASCADE;

-- 3. Drop all application tables with CASCADE in reverse dependency order
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

SELECT 'SmartSeat old database schema and seed data removed successfully.' AS status;
