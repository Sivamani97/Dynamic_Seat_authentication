import { createServerClient, type CookieOptions } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

export async function middleware(request: NextRequest) {
  let response = NextResponse.next({
    request: {
      headers: request.headers,
    },
  });

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL || "https://dummy-project.supabase.co";
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || "dummy_anon_key";

  const supabase = createServerClient(url, anonKey, {
    cookies: {
      get(name: string) {
        return request.cookies.get(name)?.value;
      },
      set(name: string, value: string, options: CookieOptions) {
        request.cookies.set({ name, value, ...options });
        response = NextResponse.next({
          request: {
            headers: request.headers,
          },
        });
        response.cookies.set({ name, value, ...options });
      },
      remove(name: string, options: CookieOptions) {
        request.cookies.set({ name, value: "", ...options });
        response = NextResponse.next({
          request: {
            headers: request.headers,
          },
        });
        response.cookies.set({ name, value: "", ...options });
      },
    },
  });

  const {
    data: { user },
  } = await supabase.auth.getUser();

  const pathname = request.nextUrl.pathname;

  // 1. Whitelist Dedicated Login Pages from Unauthenticated Redirection
  const isLoginPage =
    pathname === "/login" ||
    pathname === "/staff/login" ||
    pathname === "/admin/login";

  // If unauthenticated:
  if (!user) {
    if (isLoginPage) {
      // Allow unauthenticated access to render the respective login portals
      return response;
    }

    // Unauthenticated user requesting a protected route -> Redirect to role-specific login portal
    if (pathname.startsWith("/admin")) {
      const redirectUrl = new URL("/admin/login", request.url);
      redirectUrl.searchParams.set("redirect", pathname);
      return NextResponse.redirect(redirectUrl);
    }

    if (pathname.startsWith("/staff")) {
      const redirectUrl = new URL("/staff/login", request.url);
      redirectUrl.searchParams.set("redirect", pathname);
      return NextResponse.redirect(redirectUrl);
    }

    const redirectUrl = new URL("/login", request.url);
    redirectUrl.searchParams.set("redirect", pathname);
    return NextResponse.redirect(redirectUrl);
  }

  // 2. Authoritative role extraction strictly from public.profiles
  // SECURITY: Never trust browser-controlled user_metadata.role for authorization.
  // Distinguish missing profiles from database lookup failures.
  let role: "USER" | "STAFF" | "ADMIN" | null = null;
  let dbLookupFailed = false;

  try {
    const { data: profile, error } = await supabase
      .from("profiles")
      .select("role")
      .eq("id", user.id)
      .maybeSingle();

    if (error) {
      console.error("Middleware profile lookup database error:", error.message);
      dbLookupFailed = true;
      role = null;
    } else if (profile?.role) {
      role = profile.role === "ADMIN" ? "ADMIN" : profile.role === "STAFF" ? "STAFF" : "USER";
    } else {
      // Profile row missing: fail closed to standard passenger USER
      role = "USER";
    }
  } catch (err) {
    console.error("Middleware profile lookup unexpected exception:", err);
    dbLookupFailed = true;
    role = null;
  }

  // 3. Handle Already-Authenticated Users Visiting Login Pages
  // Route them to their appropriate dashboard without creating redirect loops
  if (isLoginPage) {
    if (dbLookupFailed || !role) {
      // Database unavailable: allow login page to render so user can sign in fresh or see status
      return response;
    }

    if (pathname === "/admin/login" && role === "ADMIN") {
      return NextResponse.redirect(new URL("/admin", request.url));
    }
    if (pathname === "/staff/login" && (role === "STAFF" || role === "ADMIN")) {
      return NextResponse.redirect(new URL("/staff", request.url));
    }
    if (pathname === "/login") {
      if (role === "ADMIN") return NextResponse.redirect(new URL("/admin", request.url));
      if (role === "STAFF") return NextResponse.redirect(new URL("/staff", request.url));
      return NextResponse.redirect(new URL("/tickets", request.url));
    }

    // Allow user to stay on login page if attempting cross-role re-authentication
    return response;
  }

  // 4. Admin Route Protection (/admin, /admin/*)
  if (pathname.startsWith("/admin")) {
    if (dbLookupFailed || !role || role !== "ADMIN") {
      if (role === "STAFF") {
        return NextResponse.redirect(new URL("/staff", request.url));
      }
      return NextResponse.redirect(new URL("/tickets", request.url));
    }
  }

  // 5. Staff Route Protection (/staff, /staff/*)
  if (pathname.startsWith("/staff")) {
    if (dbLookupFailed || !role || (role !== "STAFF" && role !== "ADMIN")) {
      return NextResponse.redirect(new URL("/tickets", request.url));
    }
  }

  return response;
}

export const config = {
  matcher: [
    "/admin/:path*",
    "/admin",
    "/staff/:path*",
    "/staff",
    "/login",
  ],
};
