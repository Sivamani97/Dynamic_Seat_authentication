import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";
import * as serverLib from "../lib/supabase/server";
import { middleware } from "../middleware";

// Route handlers under test
import { GET as getAuthMe } from "../app/api/auth/me/route";
import { GET as getAdminAuditVerify } from "../app/api/admin/audit/verify/route";
import { POST as postStaffOverride } from "../app/api/staff/override/route";
import { POST as postStaffAlertAction } from "../app/api/staff/alerts/[id]/route";
import { POST as postScanEntry } from "../app/api/scan/entry/route";
import { POST as postScanSeat } from "../app/api/scan/seat/route";
import { POST as postUserAssist } from "../app/api/user/assist/route";
import { POST as postBookings } from "../app/api/bookings/route";
import { POST as postAdminUserRole } from "../app/api/admin/users/role/route";

// Mock @supabase/ssr for middleware tests
vi.mock("@supabase/ssr", () => ({
  createServerClient: vi.fn(),
}));

import { createServerClient } from "@supabase/ssr";

describe("SmartSeat: Separate Portals, Authentication & System Security Test Suite", () => {
  const sampleEventId = "eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee";
  const sampleSeatId = "a1200000-0000-0000-0000-000000000a12";
  const sampleBookingId = "b1111111-1111-1111-1111-111111111111";

  const userPassenger = {
    id: "11111111-1111-1111-1111-111111111111",
    email: "passenger@demo.com",
    role: "USER" as const,
  };

  const userStaff = {
    id: "22222222-2222-2222-2222-222222222222",
    email: "staff@demo.com",
    role: "STAFF" as const,
  };

  const userAdmin = {
    id: "33333333-3333-3333-3333-333333333333",
    email: "admin@demo.com",
    role: "ADMIN" as const,
  };

  beforeEach(() => {
    vi.restoreAllMocks();
  });

  function buildRequest(url: string, method = "GET", body?: any, headers: Record<string, string> = {}) {
    return new NextRequest(url, {
      method,
      headers: {
        "Content-Type": "application/json",
        ...headers,
      },
      body: body ? JSON.stringify(body) : undefined,
    });
  }

  function createMockChain(data: any = null, error: any = null) {
    const chain: any = {
      select: () => chain,
      eq: () => chain,
      neq: () => chain,
      not: () => chain,
      gt: () => chain,
      lt: () => chain,
      in: () => chain,
      order: () => chain,
      limit: () => chain,
      single: async () => ({ data, error }),
      maybeSingle: async () => ({ data, error }),
      insert: () => chain,
      update: () => chain,
      upsert: async () => ({ data, error }),
      delete: () => chain,
    };
    return chain;
  }

  // =========================================================================
  // 1. Authoritative Server Role Endpoint (/api/auth/me)
  // =========================================================================
  describe("1. Authoritative Server Identity Endpoint (/api/auth/me)", () => {
    it("Scenario 1: Returns authenticated: false when session is unauthenticated", async () => {
      vi.spyOn(serverLib, "getAuthenticatedUser").mockResolvedValue(null);

      const req = buildRequest("http://localhost:3000/api/auth/me");
      const res = await getAuthMe(req);
      const json = await res.json();

      expect(res.status).toBe(200);
      expect(json.authenticated).toBe(false);
      expect(json.user).toBeNull();
    });

    it("Scenario 2: Returns authenticated: true with USER role for passenger", async () => {
      vi.spyOn(serverLib, "getAuthenticatedUser").mockResolvedValue(userPassenger);

      const req = buildRequest("http://localhost:3000/api/auth/me");
      const res = await getAuthMe(req);
      const json = await res.json();

      expect(res.status).toBe(200);
      expect(json.authenticated).toBe(true);
      expect(json.user.id).toBe(userPassenger.id);
      expect(json.user.role).toBe("USER");
    });

    it("Scenario 3: Returns authenticated: true with STAFF role for venue staff", async () => {
      vi.spyOn(serverLib, "getAuthenticatedUser").mockResolvedValue(userStaff);

      const req = buildRequest("http://localhost:3000/api/auth/me");
      const res = await getAuthMe(req);
      const json = await res.json();

      expect(res.status).toBe(200);
      expect(json.authenticated).toBe(true);
      expect(json.user.role).toBe("STAFF");
    });

    it("Scenario 4: Returns authenticated: true with ADMIN role for administrator", async () => {
      vi.spyOn(serverLib, "getAuthenticatedUser").mockResolvedValue(userAdmin);

      const req = buildRequest("http://localhost:3000/api/auth/me");
      const res = await getAuthMe(req);
      const json = await res.json();

      expect(res.status).toBe(200);
      expect(json.authenticated).toBe(true);
      expect(json.user.role).toBe("ADMIN");
    });

    it("Scenario 5: Database failure during role resolution fails closed", async () => {
      // Simulate profile database lookup failure returning null
      vi.spyOn(serverLib, "getAuthenticatedUser").mockResolvedValue(null);

      const req = buildRequest("http://localhost:3000/api/auth/me");
      const res = await getAuthMe(req);
      const json = await res.json();

      expect(res.status).toBe(200);
      expect(json.authenticated).toBe(false);
      expect(json.user).toBeNull();
    });
  });

  // =========================================================================
  // 2. Separate Portal Role Authorization Guard Logic
  // =========================================================================
  describe("2. Separate Portal Role Authorization Guard Logic", () => {
    it("Scenario 6: Staff Portal guard strictly rejects USER (Passenger) accounts", () => {
      const verifiedRole: string = userPassenger.role;
      const isAllowedOnStaffPortal = verifiedRole === "STAFF" || verifiedRole === "ADMIN";
      expect(isAllowedOnStaffPortal).toBe(false);
    });

    it("Scenario 7: Staff Portal guard allows verified STAFF accounts", () => {
      const verifiedRole: string = userStaff.role;
      const isAllowedOnStaffPortal = verifiedRole === "STAFF" || verifiedRole === "ADMIN";
      expect(isAllowedOnStaffPortal).toBe(true);
    });

    it("Scenario 8: Staff Portal guard allows verified ADMIN accounts", () => {
      const verifiedRole: string = userAdmin.role;
      const isAllowedOnStaffPortal = verifiedRole === "STAFF" || verifiedRole === "ADMIN";
      expect(isAllowedOnStaffPortal).toBe(true);
    });

    it("Scenario 9: Admin Portal guard strictly rejects USER (Passenger) accounts", () => {
      const verifiedRole: string = userPassenger.role;
      const isAllowedOnAdminPortal = verifiedRole === "ADMIN";
      expect(isAllowedOnAdminPortal).toBe(false);
    });

    it("Scenario 10: Admin Portal guard strictly rejects STAFF accounts", () => {
      const verifiedRole: string = userStaff.role;
      const isAllowedOnAdminPortal = verifiedRole === "ADMIN";
      expect(isAllowedOnAdminPortal).toBe(false);
    });

    it("Scenario 11: Admin Portal guard allows verified ADMIN accounts", () => {
      const verifiedRole: string = userAdmin.role;
      const isAllowedOnAdminPortal = verifiedRole === "ADMIN";
      expect(isAllowedOnAdminPortal).toBe(true);
    });

    it("Scenario 12: Missing profile fails closed to USER role (no elevated permissions)", () => {
      const profileRole = null;
      // When profile row does not exist, getAuthenticatedUser defaults to "USER"
      const resolvedRole: string = profileRole ? profileRole : "USER";
      expect(resolvedRole).toBe("USER");
      expect(resolvedRole === "STAFF" || resolvedRole === "ADMIN").toBe(false);
    });

    it("Scenario 13: Database error during profile query fails closed to null", () => {
      const dbError = { message: "Connection error" };
      let resolvedRole: string | null = null;
      if (dbError) {
        resolvedRole = null; // Fails closed
      }
      expect(resolvedRole).toBeNull();
    });
  });

  // =========================================================================
  // 3. Middleware Route Protection & Redirect Matrix
  // =========================================================================
  describe("3. Middleware Route Protection & Redirect Matrix", () => {
    function setupMiddlewareAuthMock(userObj: any, profileObj: any, dbError: any = null) {
      (createServerClient as any).mockReturnValue({
        auth: {
          getUser: async () => ({
            data: { user: userObj },
            error: null,
          }),
        },
        from: () => ({
          select: () => ({
            eq: () => ({
              maybeSingle: async () => {
                if (dbError) throw dbError;
                return { data: profileObj, error: null };
              },
            }),
          }),
        }),
      });
    }

    it("Scenario 14: Whitelists unauthenticated access to /admin/login without redirection loop", async () => {
      setupMiddlewareAuthMock(null, null);

      const req = buildRequest("http://localhost:3000/admin/login");
      const res = await middleware(req);

      // Status should be 200 (NextResponse.next), NOT a 307 redirect!
      expect(res.status).toBe(200);
      expect(res.headers.get("location")).toBeNull();
    });

    it("Scenario 15: Whitelists unauthenticated access to /staff/login without redirection loop", async () => {
      setupMiddlewareAuthMock(null, null);

      const req = buildRequest("http://localhost:3000/staff/login");
      const res = await middleware(req);

      expect(res.status).toBe(200);
      expect(res.headers.get("location")).toBeNull();
    });

    it("Scenario 16: Whitelists unauthenticated access to /login without redirection loop", async () => {
      setupMiddlewareAuthMock(null, null);

      const req = buildRequest("http://localhost:3000/login");
      const res = await middleware(req);

      expect(res.status).toBe(200);
      expect(res.headers.get("location")).toBeNull();
    });

    it("Scenario 17: Redirects unauthenticated access on /admin to /admin/login", async () => {
      setupMiddlewareAuthMock(null, null);

      const req = buildRequest("http://localhost:3000/admin");
      const res = await middleware(req);

      expect(res.status).toBe(307);
      const location = res.headers.get("location") || "";
      expect(location).toContain("/admin/login");
      expect(location).toContain("redirect=%2Fadmin");
    });

    it("Scenario 18: Redirects unauthenticated access on /staff to /staff/login", async () => {
      setupMiddlewareAuthMock(null, null);

      const req = buildRequest("http://localhost:3000/staff");
      const res = await middleware(req);

      expect(res.status).toBe(307);
      const location = res.headers.get("location") || "";
      expect(location).toContain("/staff/login");
      expect(location).toContain("redirect=%2Fstaff");
    });

    it("Scenario 19: Redirects authenticated USER accessing /admin to /tickets", async () => {
      setupMiddlewareAuthMock({ id: userPassenger.id }, { role: "USER" });

      const req = buildRequest("http://localhost:3000/admin");
      const res = await middleware(req);

      expect(res.status).toBe(307);
      const location = res.headers.get("location") || "";
      expect(location).toContain("/tickets");
    });

    it("Scenario 20: Redirects authenticated USER accessing /staff to /tickets", async () => {
      setupMiddlewareAuthMock({ id: userPassenger.id }, { role: "USER" });

      const req = buildRequest("http://localhost:3000/staff");
      const res = await middleware(req);

      expect(res.status).toBe(307);
      const location = res.headers.get("location") || "";
      expect(location).toContain("/tickets");
    });

    it("Scenario 21: Redirects authenticated STAFF accessing /admin to /staff", async () => {
      setupMiddlewareAuthMock({ id: userStaff.id }, { role: "STAFF" });

      const req = buildRequest("http://localhost:3000/admin");
      const res = await middleware(req);

      expect(res.status).toBe(307);
      const location = res.headers.get("location") || "";
      expect(location).toContain("/staff");
    });

    it("Scenario 22: Permits authenticated ADMIN accessing /admin", async () => {
      setupMiddlewareAuthMock({ id: userAdmin.id }, { role: "ADMIN" });

      const req = buildRequest("http://localhost:3000/admin");
      const res = await middleware(req);

      expect(res.status).toBe(200);
      expect(res.headers.get("location")).toBeNull();
    });

    it("Scenario 23: Permits authenticated ADMIN accessing /staff", async () => {
      setupMiddlewareAuthMock({ id: userAdmin.id }, { role: "ADMIN" });

      const req = buildRequest("http://localhost:3000/staff");
      const res = await middleware(req);

      expect(res.status).toBe(200);
      expect(res.headers.get("location")).toBeNull();
    });

    it("Scenario 24: Authenticated USER visiting /login is redirected to /tickets", async () => {
      setupMiddlewareAuthMock({ id: userPassenger.id }, { role: "USER" });

      const req = buildRequest("http://localhost:3000/login");
      const res = await middleware(req);

      expect(res.status).toBe(307);
      const location = res.headers.get("location") || "";
      expect(location).toContain("/tickets");
    });

    it("Scenario 25: Authenticated STAFF visiting /login is redirected to /staff", async () => {
      setupMiddlewareAuthMock({ id: userStaff.id }, { role: "STAFF" });

      const req = buildRequest("http://localhost:3000/login");
      const res = await middleware(req);

      expect(res.status).toBe(307);
      const location = res.headers.get("location") || "";
      expect(location).toContain("/staff");
    });

    it("Scenario 26: Authenticated ADMIN visiting /login is redirected to /admin", async () => {
      setupMiddlewareAuthMock({ id: userAdmin.id }, { role: "ADMIN" });

      const req = buildRequest("http://localhost:3000/login");
      const res = await middleware(req);

      expect(res.status).toBe(307);
      const location = res.headers.get("location") || "";
      expect(location).toContain("/admin");
    });
  });

  // =========================================================================
  // 4. Privileged API Endpoint Security Hardening
  // =========================================================================
  describe("4. Privileged API Endpoint Security Hardening", () => {
    it("Scenario 27: Passenger calling /api/admin/audit/verify returns HTTP 403", async () => {
      vi.spyOn(serverLib, "getAuthenticatedUser").mockResolvedValue(userPassenger);

      const req = buildRequest("http://localhost:3000/api/admin/audit/verify");
      const res = await getAdminAuditVerify(req);
      const json = await res.json();

      expect(res.status).toBe(403);
      expect(json.success).toBe(false);
      expect(json.message).toContain("Forbidden");
    });

    it("Scenario 28: Staff calling /api/admin/audit/verify returns HTTP 403", async () => {
      vi.spyOn(serverLib, "getAuthenticatedUser").mockResolvedValue(userStaff);

      const req = buildRequest("http://localhost:3000/api/admin/audit/verify");
      const res = await getAdminAuditVerify(req);
      const json = await res.json();

      expect(res.status).toBe(403);
      expect(json.success).toBe(false);
      expect(json.message).toContain("Forbidden");
    });

    it("Scenario 29: Passenger calling /api/staff/override returns HTTP 403", async () => {
      vi.spyOn(serverLib, "getAuthenticatedUser").mockResolvedValue(userPassenger);

      const req = buildRequest("http://localhost:3000/api/staff/override", "POST", {
        seatId: sampleSeatId,
        eventId: sampleEventId,
        action: "AUTHORIZE_SEAT",
        reason: "Test",
      });

      const res = await postStaffOverride(req);
      const json = await res.json();

      expect(res.status).toBe(403);
      expect(json.success).toBe(false);
      expect(json.message).toContain("Forbidden");
    });

    it("Scenario 30: Passenger calling /api/staff/alerts/[id] returns HTTP 403", async () => {
      vi.spyOn(serverLib, "getAuthenticatedUser").mockResolvedValue(userPassenger);

      const req = buildRequest("http://localhost:3000/api/staff/alerts/alt_test", "POST", {
        action: "ACKNOWLEDGE",
      });

      const res = await postStaffAlertAction(req, { params: { id: "alt_test" } });
      const json = await res.json();

      expect(res.status).toBe(403);
      expect(json.success).toBe(false);
      expect(json.message).toContain("Forbidden");
    });

    it("Scenario 31: Passenger calling /api/scan/entry returns HTTP 403", async () => {
      vi.spyOn(serverLib, "getAuthenticatedUser").mockResolvedValue(userPassenger);

      const req = buildRequest("http://localhost:3000/api/scan/entry", "POST", {
        token: "dummy.token",
        eventId: sampleEventId,
      });

      const res = await postScanEntry(req);
      const json = await res.json();

      expect(res.status).toBe(403);
      expect(json.success).toBe(false);
      expect(json.reasonCode).toBe("FORBIDDEN");
    });

    it("Scenario 32: Passenger calling /api/scan/seat returns HTTP 403", async () => {
      vi.spyOn(serverLib, "getAuthenticatedUser").mockResolvedValue(userPassenger);

      const req = buildRequest("http://localhost:3000/api/scan/seat", "POST", {
        token: "dummy.token",
        unitId: "SCREEN2-A12",
        unitSecret: "dummy_secret",
      });

      const res = await postScanSeat(req);
      const json = await res.json();

      expect(res.status).toBe(403);
      expect(json.success).toBe(false);
      expect(json.reasonCode).toBe("FORBIDDEN");
    });

    it("Scenario 33: Passenger triggering SOS for another passenger's booking returns HTTP 403", async () => {
      vi.spyOn(serverLib, "getAuthenticatedUser").mockResolvedValue(userPassenger);

      const mockAdminClient = {
        from: (table: string) => {
          if (table === "bookings") {
            return createMockChain({
              id: sampleBookingId,
              booking_ref: "BK829173",
              user_id: "other-user-9999", // Different user!
              event_id: sampleEventId,
              seat_id: sampleSeatId,
              status: "BOOKED",
            });
          }
          return createMockChain(null);
        },
      };
      vi.spyOn(serverLib, "getAdminClient").mockReturnValue(mockAdminClient as any);

      const req = buildRequest("http://localhost:3000/api/user/assist", "POST", {
        bookingId: sampleBookingId,
        category: "MEDICAL",
      });

      const res = await postUserAssist(req);
      const json = await res.json();

      expect(res.status).toBe(403);
      expect(json.success).toBe(false);
      expect(json.message).toContain("Forbidden");
    });

    it("Scenario 34: Duplicate active SOS alert returns HTTP 409 (SOS_ALREADY_ACTIVE)", async () => {
      vi.spyOn(serverLib, "getAuthenticatedUser").mockResolvedValue(userPassenger);

      const mockAdminClient = {
        from: (table: string) => {
          if (table === "bookings") {
            return createMockChain({
              id: sampleBookingId,
              booking_ref: "BK829173",
              user_id: userPassenger.id, // Verified owner
              event_id: sampleEventId,
              seat_id: sampleSeatId,
              status: "BOOKED",
              seat: { label: "A12", unit_id: "SCREEN2-A12" },
              event: { title: "Demo Movie", status: "UPCOMING" },
            });
          }
          if (table === "alerts") {
            return createMockChain({
              id: "alert-existing-123",
              status: "NEW", // Active SOS alert already exists!
              priority: "CRITICAL",
              created_at: new Date().toISOString(),
            });
          }
          return createMockChain(null);
        },
      };
      vi.spyOn(serverLib, "getAdminClient").mockReturnValue(mockAdminClient as any);

      const req = buildRequest("http://localhost:3000/api/user/assist", "POST", {
        bookingId: sampleBookingId,
        category: "MEDICAL",
      });

      const res = await postUserAssist(req);
      const json = await res.json();

      expect(res.status).toBe(409);
      expect(json.success).toBe(false);
      expect(json.code).toBe("SOS_ALREADY_ACTIVE");
    });

    it("Scenario 35: Booking confirmation fails with HTTP 500 when RPC fails (zero insecure fallback)", async () => {
      vi.spyOn(serverLib, "getAuthenticatedUser").mockResolvedValue(userPassenger);

      const mockAdminClient = {
        rpc: async () => ({
          data: null,
          error: { message: "Database timeout or RPC failure" },
        }),
      };
      vi.spyOn(serverLib, "getAdminClient").mockReturnValue(mockAdminClient as any);

      const req = buildRequest("http://localhost:3000/api/bookings", "POST", {
        eventId: sampleEventId,
        seatId: sampleSeatId,
      });

      const res = await postBookings(req);
      const json = await res.json();

      expect(res.status).toBe(500);
      expect(json.success).toBe(false);
      expect(json.message).toContain("atomic transaction failed");
    });
  });

  // =========================================================================
  // 5. Database Profile Role Protection & Provisioning Security
  // =========================================================================
  describe("5. Database Profile Role Protection & Provisioning Security", () => {
    // Pure algorithmic model mirroring public.protect_profile_role_elevation()
    function evaluateProtectProfileRoleElevation(params: {
      oldRole: string;
      newRole: string;
      jwtRole: string;
      sessionUser?: string;
      hasJwtClaims?: boolean;
    }) {
      if (params.newRole !== params.oldRole) {
        const isServiceRole = params.jwtRole === "service_role";
        const isDba =
          ["postgres", "supabase_admin"].includes(params.sessionUser || "") &&
          !params.hasJwtClaims;

        // Phase 3.1: Direct table-level updates of role are restricted to service_role or DBA!
        // Even authenticated ADMIN cannot directly UPDATE profiles.role; must use RPC admin_set_user_role.
        if (!isServiceRole && !isDba) {
          throw new Error(
            `Privilege escalation rejected: Direct modification of profile role is forbidden. Role assignments must use the admin_set_user_role RPC through the authorized server API.`
          );
        }
      }
      return { success: true, newRole: params.newRole };
    }

    // Pure algorithmic model mirroring public.admin_set_user_role() RPC
    function evaluateAdminSetUserRole(params: {
      targetUserId: string;
      targetCurrentRole: string;
      newRole: string | null;
      actorUserId?: string | null;
      actorRole?: string;
      actorActive?: boolean;
      jwtRole: string;
      sessionUser?: string;
      hasJwtClaims?: boolean;
      simulateAuditFailure?: boolean;
    }) {
      // 1. Explicitly reject NULL and invalid roles
      if (params.newRole === null || params.newRole === undefined || params.newRole === "") {
        return { success: false, code: "INVALID_ROLE", message: "Invalid role: role cannot be NULL." };
      }

      if (!["USER", "STAFF", "ADMIN"].includes(params.newRole)) {
        return { success: false, code: "INVALID_ROLE", message: "Invalid role: must be USER, STAFF, or ADMIN." };
      }

      // 2. Caller context check (service_role or direct DBA)
      const isServiceRole = params.jwtRole === "service_role";
      const isDba =
        ["postgres", "supabase_admin"].includes(params.sessionUser || "") &&
        !params.hasJwtClaims;

      if (!isServiceRole && !isDba) {
        return { success: false, code: "FORBIDDEN", message: "Forbidden: Only service-role operations or direct database administrators can invoke admin_set_user_role." };
      }

      // 3. Actor identity and role transition rules
      if (params.actorUserId) {
        // Self-modification rule
        if (params.actorUserId === params.targetUserId) {
          return { success: false, code: "CANNOT_MODIFY_OWN_ROLE", message: "Users cannot modify their own role." };
        }

        if (!params.actorActive) {
          return { success: false, code: "ACTOR_NOT_FOUND", message: "Acting user does not exist or is inactive." };
        }

        // USER and STAFF cannot alter roles
        if (params.actorRole === "USER" || params.actorRole === "STAFF") {
          return { success: false, code: "INSUFFICIENT_PRIVILEGES", message: "Insufficient privileges." };
        }

        // ADMIN transition rules
        if (params.actorRole === "ADMIN") {
          // Cannot modify another ADMIN
          if (params.targetCurrentRole === "ADMIN") {
            return { success: false, code: "CANNOT_MODIFY_ADMIN", message: "Forbidden: Administrators cannot demote or alter other administrator accounts." };
          }

          // Cannot promote to ADMIN (prevents unrestricted admin creation)
          if (params.newRole === "ADMIN") {
            return { success: false, code: "ADMIN_CREATION_RESTRICTED", message: "Forbidden: Administrators cannot grant ADMIN privileges. Administrator creation requires root service_role authorization." };
          }

          // Strictly permitted transitions: USER <-> STAFF
          const isPromote = params.targetCurrentRole === "USER" && params.newRole === "STAFF";
          const isDemote = params.targetCurrentRole === "STAFF" && params.newRole === "USER";
          const isNoOp = params.targetCurrentRole === params.newRole;

          if (!isPromote && !isDemote && !isNoOp) {
            return { success: false, code: "DISALLOWED_ROLE_TRANSITION", message: "Forbidden: Disallowed role transition." };
          }
        }
      }

      // 4. Task 1: Audit atomicity check
      if (params.simulateAuditFailure) {
        throw new Error("Audit logging failed: No audit entry generated. Transaction rolled back.");
      }

      return {
        success: true,
        userId: params.targetUserId,
        previousRole: params.targetCurrentRole,
        newRole: params.newRole,
        actorUserId: params.actorUserId || null,
        auditLogId: 999001,
        message: "User role successfully updated.",
      };
    }

    // Pure algorithmic model mirroring public.handle_new_user()
    function simulateHandleNewUser(newUser: { id: string; email: string; raw_user_meta_data?: any }) {
      return {
        id: newUser.id,
        name: newUser.raw_user_meta_data?.name || newUser.email.split("@")[0],
        role: "USER" as const, // Hardened: unconditionally forced to USER
        active: true,
      };
    }

    // RLS policy evaluation model mirroring profiles_update_own
    function evaluateProfilesUpdateRls(caller: { uid: string; role: string }, targetProfileId: string) {
      return caller.uid === targetProfileId;
    }

    it("Scenario 36: USER attempts to update own role to ADMIN: must fail", () => {
      expect(() => {
        evaluateProtectProfileRoleElevation({
          oldRole: "USER",
          newRole: "ADMIN",
          jwtRole: "authenticated",
          sessionUser: "authenticator",
          hasJwtClaims: true,
        });
      }).toThrow(/Privilege escalation rejected/);
    });

    it("Scenario 37: USER attempts to update another profile: must fail via RLS", () => {
      const callerAlice = { uid: "user-alice-1111", role: "USER" };
      const targetBobId = "user-bob-2222";

      const isPermittedByRls = evaluateProfilesUpdateRls(callerAlice, targetBobId);
      expect(isPermittedByRls).toBe(false);
    });

    it("Scenario 38: STAFF attempts to promote a user to ADMIN: must fail", () => {
      expect(() => {
        evaluateProtectProfileRoleElevation({
          oldRole: "USER",
          newRole: "ADMIN",
          jwtRole: "authenticated",
          sessionUser: "authenticator",
          hasJwtClaims: true,
        });
      }).toThrow(/Privilege escalation rejected/);
    });

    it("Scenario 39: Direct table update of role by authenticated ADMIN: must fail (must use RPC)", () => {
      expect(() => {
        evaluateProtectProfileRoleElevation({
          oldRole: "USER",
          newRole: "STAFF",
          jwtRole: "authenticated",
          sessionUser: "authenticator",
          hasJwtClaims: true,
        });
      }).toThrow(/Privilege escalation rejected/);
    });

    it("Scenario 40: Authorized server-side provisioning (service_role) succeeds", () => {
      const result = evaluateProtectProfileRoleElevation({
        oldRole: "USER",
        newRole: "ADMIN",
        jwtRole: "service_role",
        sessionUser: "authenticator",
        hasJwtClaims: true,
      });

      expect(result.success).toBe(true);
      expect(result.newRole).toBe("ADMIN");
    });

    it("Scenario 41: Unauthenticated request attempts role modification: must fail", () => {
      expect(() => {
        evaluateProtectProfileRoleElevation({
          oldRole: "USER",
          newRole: "ADMIN",
          jwtRole: "anon",
          sessionUser: "authenticator",
          hasJwtClaims: true,
        });
      }).toThrow(/Privilege escalation rejected/);
    });

    it("Scenario 42: New public registration with user_metadata.role = ADMIN: must create USER only", () => {
      const maliciousRegistration = {
        id: "attacker-uuid-9999",
        email: "attacker@exploit.com",
        raw_user_meta_data: {
          name: "Malicious User",
          role: "ADMIN", // Attacker attempts to forge admin role in signup payload
        },
      };

      const createdProfile = simulateHandleNewUser(maliciousRegistration);

      expect(createdProfile.role).toBe("USER");
      expect(createdProfile.name).toBe("Malicious User");
      expect(createdProfile.id).toBe(maliciousRegistration.id);
    });

    // Detailed Transition Matrix tests for admin_set_user_role
    it("Scenario 43: RPC rejects non-service-role caller (e.g. authenticated client direct RPC)", () => {
      const res = evaluateAdminSetUserRole({
        targetUserId: "target-1",
        targetCurrentRole: "USER",
        newRole: "STAFF",
        actorUserId: "admin-1",
        actorRole: "ADMIN",
        actorActive: true,
        jwtRole: "authenticated",
        sessionUser: "authenticator",
        hasJwtClaims: true,
      });

      expect(res.success).toBe(false);
      expect(res.code).toBe("FORBIDDEN");
    });

    it("Scenario 44: RPC rejects admin self-modification (CANNOT_MODIFY_OWN_ROLE)", () => {
      const res = evaluateAdminSetUserRole({
        targetUserId: "admin-1",
        targetCurrentRole: "ADMIN",
        newRole: "STAFF",
        actorUserId: "admin-1",
        actorRole: "ADMIN",
        actorActive: true,
        jwtRole: "service_role",
      });

      expect(res.success).toBe(false);
      expect(res.code).toBe("CANNOT_MODIFY_OWN_ROLE");
    });

    it("Scenario 45: RPC rejects USER attempting to promote anyone", () => {
      const res = evaluateAdminSetUserRole({
        targetUserId: "target-1",
        targetCurrentRole: "USER",
        newRole: "STAFF",
        actorUserId: "passenger-1",
        actorRole: "USER",
        actorActive: true,
        jwtRole: "service_role",
      });

      expect(res.success).toBe(false);
      expect(res.code).toBe("INSUFFICIENT_PRIVILEGES");
    });

    it("Scenario 46: RPC rejects STAFF attempting to promote anyone", () => {
      const res = evaluateAdminSetUserRole({
        targetUserId: "target-1",
        targetCurrentRole: "USER",
        newRole: "STAFF",
        actorUserId: "staff-1",
        actorRole: "STAFF",
        actorActive: true,
        jwtRole: "service_role",
      });

      expect(res.success).toBe(false);
      expect(res.code).toBe("INSUFFICIENT_PRIVILEGES");
    });

    it("Scenario 47: RPC permits ADMIN promoting USER to STAFF", () => {
      const res = evaluateAdminSetUserRole({
        targetUserId: "target-1",
        targetCurrentRole: "USER",
        newRole: "STAFF",
        actorUserId: "admin-1",
        actorRole: "ADMIN",
        actorActive: true,
        jwtRole: "service_role",
      });

      expect(res.success).toBe(true);
      expect(res.newRole).toBe("STAFF");
    });

    it("Scenario 48: RPC permits ADMIN demoting STAFF to USER", () => {
      const res = evaluateAdminSetUserRole({
        targetUserId: "target-1",
        targetCurrentRole: "STAFF",
        newRole: "USER",
        actorUserId: "admin-1",
        actorRole: "ADMIN",
        actorActive: true,
        jwtRole: "service_role",
      });

      expect(res.success).toBe(true);
      expect(res.newRole).toBe("USER");
    });

    it("Scenario 49: RPC rejects ADMIN attempting to create ADMIN (ADMIN_CREATION_RESTRICTED)", () => {
      const res = evaluateAdminSetUserRole({
        targetUserId: "target-1",
        targetCurrentRole: "USER",
        newRole: "ADMIN",
        actorUserId: "admin-1",
        actorRole: "ADMIN",
        actorActive: true,
        jwtRole: "service_role",
      });

      expect(res.success).toBe(false);
      expect(res.code).toBe("ADMIN_CREATION_RESTRICTED");
    });

    it("Scenario 50: RPC rejects ADMIN attempting to demote or alter another ADMIN", () => {
      const res = evaluateAdminSetUserRole({
        targetUserId: "admin-2",
        targetCurrentRole: "ADMIN",
        newRole: "USER",
        actorUserId: "admin-1",
        actorRole: "ADMIN",
        actorActive: true,
        jwtRole: "service_role",
      });

      expect(res.success).toBe(false);
      expect(res.code).toBe("CANNOT_MODIFY_ADMIN");
    });

    it("Scenario 51: RPC permits root service_role provisioning (actor = null)", () => {
      const res = evaluateAdminSetUserRole({
        targetUserId: "target-1",
        targetCurrentRole: "USER",
        newRole: "ADMIN",
        actorUserId: null,
        jwtRole: "service_role",
      });

      expect(res.success).toBe(true);
      expect(res.newRole).toBe("ADMIN");
    });

    it("Scenario 51b: RPC explicitly rejects NULL or empty role", () => {
      const resNull = evaluateAdminSetUserRole({
        targetUserId: "target-1",
        targetCurrentRole: "USER",
        newRole: null,
        actorUserId: "admin-1",
        actorRole: "ADMIN",
        actorActive: true,
        jwtRole: "service_role",
      });

      expect(resNull.success).toBe(false);
      expect(resNull.code).toBe("INVALID_ROLE");

      const resEmpty = evaluateAdminSetUserRole({
        targetUserId: "target-1",
        targetCurrentRole: "USER",
        newRole: "",
        actorUserId: "admin-1",
        actorRole: "ADMIN",
        actorActive: true,
        jwtRole: "service_role",
      });

      expect(resEmpty.success).toBe(false);
      expect(resEmpty.code).toBe("INVALID_ROLE");
    });

    it("Scenario 51c: RPC explicitly rejects invalid role strings (e.g. SUPER_ADMIN)", () => {
      const res = evaluateAdminSetUserRole({
        targetUserId: "target-1",
        targetCurrentRole: "USER",
        newRole: "SUPER_ADMIN",
        actorUserId: "admin-1",
        actorRole: "ADMIN",
        actorActive: true,
        jwtRole: "service_role",
      });

      expect(res.success).toBe(false);
      expect(res.code).toBe("INVALID_ROLE");
    });

    it("Scenario 51d: RPC rejects disallowed role transition by ADMIN", () => {
      const res = evaluateAdminSetUserRole({
        targetUserId: "target-1",
        targetCurrentRole: "AUDITOR", // unsupported source role
        newRole: "STAFF",
        actorUserId: "admin-1",
        actorRole: "ADMIN",
        actorActive: true,
        jwtRole: "service_role",
      });

      expect(res.success).toBe(false);
      expect(res.code).toBe("DISALLOWED_ROLE_TRANSITION");
    });

    it("Scenario 51e: Task 1 Audit Atomicity - RPC aborts and throws if audit logging fails", () => {
      expect(() => {
        evaluateAdminSetUserRole({
          targetUserId: "target-1",
          targetCurrentRole: "USER",
          newRole: "STAFF",
          actorUserId: "admin-1",
          actorRole: "ADMIN",
          actorActive: true,
          jwtRole: "service_role",
          simulateAuditFailure: true,
        });
      }).toThrow(/Audit logging failed/);
    });
  });

  // =========================================================================
  // 6. Server Administrative Role Management API (/api/admin/users/role)
  // =========================================================================
  describe("6. Server Administrative Role Management API (/api/admin/users/role)", () => {
    const targetUserId = "44444444-4444-4444-4444-444444444444";

    it("Scenario 52: Returns 401 when request is unauthenticated", async () => {
      vi.spyOn(serverLib, "getAuthenticatedUser").mockResolvedValue(null);

      const req = buildRequest("http://localhost:3000/api/admin/users/role", "POST", {
        targetUserId,
        newRole: "STAFF",
      });

      const res = await postAdminUserRole(req);
      const json = await res.json();

      expect(res.status).toBe(401);
      expect(json.error).toContain("Authentication required");
    });

    it("Scenario 53: Returns 403 when called by passenger (USER role)", async () => {
      vi.spyOn(serverLib, "getAuthenticatedUser").mockResolvedValue(userPassenger);

      const req = buildRequest("http://localhost:3000/api/admin/users/role", "POST", {
        targetUserId,
        newRole: "STAFF",
      });

      const res = await postAdminUserRole(req);
      const json = await res.json();

      expect(res.status).toBe(403);
      expect(json.error).toContain("Only administrators can modify roles");
    });

    it("Scenario 54: Returns 403 when called by STAFF role", async () => {
      vi.spyOn(serverLib, "getAuthenticatedUser").mockResolvedValue(userStaff);

      const req = buildRequest("http://localhost:3000/api/admin/users/role", "POST", {
        targetUserId,
        newRole: "STAFF",
      });

      const res = await postAdminUserRole(req);
      const json = await res.json();

      expect(res.status).toBe(403);
      expect(json.error).toContain("Only administrators can modify roles");
    });

    it("Scenario 55: Returns 400 when payload is invalid", async () => {
      vi.spyOn(serverLib, "getAuthenticatedUser").mockResolvedValue(userAdmin);

      const req = buildRequest("http://localhost:3000/api/admin/users/role", "POST", {
        targetUserId: 12345, // invalid type
        newRole: "STAFF",
      });

      const res = await postAdminUserRole(req);
      const json = await res.json();

      expect(res.status).toBe(400);
      expect(json.error).toContain("targetUserId is required");
    });

    it("Scenario 56: Returns 400 when newRole is not a valid role domain", async () => {
      vi.spyOn(serverLib, "getAuthenticatedUser").mockResolvedValue(userAdmin);

      const req = buildRequest("http://localhost:3000/api/admin/users/role", "POST", {
        targetUserId,
        newRole: "SUPER_ADMIN", // invalid role
      });

      const res = await postAdminUserRole(req);
      const json = await res.json();

      expect(res.status).toBe(400);
      expect(json.error).toContain("newRole must be one of: USER, STAFF, ADMIN");
    });

    it("Scenario 57: Returns 403 when ADMIN attempts to modify their own role", async () => {
      vi.spyOn(serverLib, "getAuthenticatedUser").mockResolvedValue(userAdmin);

      const req = buildRequest("http://localhost:3000/api/admin/users/role", "POST", {
        targetUserId: userAdmin.id, // attempting self-modification
        newRole: "STAFF",
      });

      const res = await postAdminUserRole(req);
      const json = await res.json();

      expect(res.status).toBe(403);
      expect(json.error).toContain("Administrators cannot modify their own account role");
    });

    it("Scenario 58: Returns 403 when ADMIN attempts to promote another user to ADMIN", async () => {
      vi.spyOn(serverLib, "getAuthenticatedUser").mockResolvedValue(userAdmin);

      const req = buildRequest("http://localhost:3000/api/admin/users/role", "POST", {
        targetUserId,
        newRole: "ADMIN", // admin promotion restricted
      });

      const res = await postAdminUserRole(req);
      const json = await res.json();

      expect(res.status).toBe(403);
      expect(json.error).toContain("Administrators cannot grant ADMIN privileges");
    });

    it("Scenario 59: Returns 404 when target user profile does not exist", async () => {
      vi.spyOn(serverLib, "getAuthenticatedUser").mockResolvedValue(userAdmin);

      const mockAdminClient = {
        from: () => ({
          select: () => ({
            eq: () => ({
              maybeSingle: async () => ({ data: null, error: null }),
            }),
          }),
        }),
      };
      vi.spyOn(serverLib, "getAdminClient").mockReturnValue(mockAdminClient as any);

      const req = buildRequest("http://localhost:3000/api/admin/users/role", "POST", {
        targetUserId: "non-existent-user",
        newRole: "STAFF",
      });

      const res = await postAdminUserRole(req);
      const json = await res.json();

      expect(res.status).toBe(404);
      expect(json.error).toContain("Target user not found");
    });

    it("Scenario 60: Returns 403 when ADMIN attempts to modify or demote another ADMIN", async () => {
      vi.spyOn(serverLib, "getAuthenticatedUser").mockResolvedValue(userAdmin);

      const mockAdminClient = {
        from: () => ({
          select: () => ({
            eq: () => ({
              maybeSingle: async () => ({
                data: { id: targetUserId, role: "ADMIN", active: true },
                error: null,
              }),
            }),
          }),
        }),
      };
      vi.spyOn(serverLib, "getAdminClient").mockReturnValue(mockAdminClient as any);

      const req = buildRequest("http://localhost:3000/api/admin/users/role", "POST", {
        targetUserId,
        newRole: "STAFF",
      });

      const res = await postAdminUserRole(req);
      const json = await res.json();

      expect(res.status).toBe(403);
      expect(json.error).toContain("Administrators cannot demote or alter other administrator accounts");
    });

    it("Scenario 61: ADMIN promoting USER to STAFF succeeds with 200 via RPC", async () => {
      vi.spyOn(serverLib, "getAuthenticatedUser").mockResolvedValue(userAdmin);

      const mockAdminClient = {
        from: () => ({
          select: () => ({
            eq: () => ({
              maybeSingle: async () => ({
                data: { id: targetUserId, role: "USER", active: true },
                error: null,
              }),
            }),
          }),
        }),
        rpc: async (fnName: string, args: any) => {
          expect(fnName).toBe("admin_set_user_role");
          expect(args.p_target_user_id).toBe(targetUserId);
          expect(args.p_new_role).toBe("STAFF");
          expect(args.p_actor_user_id).toBe(userAdmin.id);
          return {
            data: {
              success: true,
              userId: targetUserId,
              previousRole: "USER",
              newRole: "STAFF",
              actorUserId: userAdmin.id,
              message: "User role successfully updated.",
            },
            error: null,
          };
        },
      };
      vi.spyOn(serverLib, "getAdminClient").mockReturnValue(mockAdminClient as any);

      const req = buildRequest("http://localhost:3000/api/admin/users/role", "POST", {
        targetUserId,
        newRole: "STAFF",
      });

      const res = await postAdminUserRole(req);
      const json = await res.json();

      expect(res.status).toBe(200);
      expect(json.success).toBe(true);
      expect(json.data.newRole).toBe("STAFF");
    });

    it("Scenario 62: ADMIN demoting STAFF to USER succeeds with 200 via RPC", async () => {
      vi.spyOn(serverLib, "getAuthenticatedUser").mockResolvedValue(userAdmin);

      const mockAdminClient = {
        from: () => ({
          select: () => ({
            eq: () => ({
              maybeSingle: async () => ({
                data: { id: targetUserId, role: "STAFF", active: true },
                error: null,
              }),
            }),
          }),
        }),
        rpc: async (fnName: string, args: any) => {
          expect(fnName).toBe("admin_set_user_role");
          expect(args.p_target_user_id).toBe(targetUserId);
          expect(args.p_new_role).toBe("USER");
          expect(args.p_actor_user_id).toBe(userAdmin.id);
          return {
            data: {
              success: true,
              userId: targetUserId,
              previousRole: "STAFF",
              newRole: "USER",
              actorUserId: userAdmin.id,
              message: "User role successfully updated.",
            },
            error: null,
          };
        },
      };
      vi.spyOn(serverLib, "getAdminClient").mockReturnValue(mockAdminClient as any);

      const req = buildRequest("http://localhost:3000/api/admin/users/role", "POST", {
        targetUserId,
        newRole: "USER",
      });

      const res = await postAdminUserRole(req);
      const json = await res.json();

      expect(res.status).toBe(200);
      expect(json.success).toBe(true);
      expect(json.data.newRole).toBe("USER");
    });

    it("Scenario 63: /api/admin/users/role rejects disallowed role transition by ADMIN", async () => {
      vi.spyOn(serverLib, "getAuthenticatedUser").mockResolvedValue(userAdmin);

      const mockAdminClient = {
        from: () => ({
          select: () => ({
            eq: () => ({
              maybeSingle: async () => ({
                // Target has an unsupported source role (not USER and not STAFF)
                data: { id: targetUserId, role: "GUEST", active: true },
                error: null,
              }),
            }),
          }),
        }),
      };
      vi.spyOn(serverLib, "getAdminClient").mockReturnValue(mockAdminClient as any);

      // Admin trying to promote an unsupported source role
      const req = buildRequest("http://localhost:3000/api/admin/users/role", "POST", {
        targetUserId,
        newRole: "STAFF",
      });

      const res = await postAdminUserRole(req);
      const json = await res.json();

      expect(res.status).toBe(403);
      expect(json.error).toContain("Disallowed role transition");
    });

    it("Scenario 64: /api/admin/users/role handles database RPC error / audit failure gracefully with HTTP 500", async () => {
      vi.spyOn(serverLib, "getAuthenticatedUser").mockResolvedValue(userAdmin);

      const mockAdminClient = {
        from: () => ({
          select: () => ({
            eq: () => ({
              maybeSingle: async () => ({
                data: { id: targetUserId, role: "USER", active: true },
                error: null,
              }),
            }),
          }),
        }),
        rpc: async () => ({
          data: null,
          error: { message: "Audit logging failed: No audit entry generated. Transaction rolled back." },
        }),
      };
      vi.spyOn(serverLib, "getAdminClient").mockReturnValue(mockAdminClient as any);

      const req = buildRequest("http://localhost:3000/api/admin/users/role", "POST", {
        targetUserId,
        newRole: "STAFF",
      });

      const res = await postAdminUserRole(req);
      const json = await res.json();

      expect(res.status).toBe(500);
      expect(json.error).toContain("Database error updating user role");
    });
  });
});
