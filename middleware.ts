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

  // 1. Unauthenticated -> Redirect to login with return path
  if (!user) {
    const redirectUrl = new URL("/login", request.url);
    redirectUrl.searchParams.set("redirect", pathname);
    return NextResponse.redirect(redirectUrl);
  }

  // 2. Authoritative role extraction strictly from public.profiles
  // SECURITY: Never trust browser-controlled user_metadata.role for authorization.
  let role = "USER";

  try {
    const { data: profile } = await supabase
      .from("profiles")
      .select("role")
      .eq("id", user.id)
      .maybeSingle();

    if (profile?.role) {
      role = profile.role;
    }
  } catch {
    // Fail closed: Profile query failed or unavailable, retain role as USER
    role = "USER";
  }

  // 3. Admin Route Protection (/admin, /admin/*)
  if (pathname.startsWith("/admin")) {
    if (role !== "ADMIN") {
      if (role === "STAFF") {
        return NextResponse.redirect(new URL("/staff", request.url));
      }
      return NextResponse.redirect(new URL("/tickets", request.url));
    }
  }

  // 4. Staff Route Protection (/staff, /staff/*)
  if (pathname.startsWith("/staff")) {
    if (role !== "STAFF" && role !== "ADMIN") {
      return NextResponse.redirect(new URL("/tickets", request.url));
    }
  }

  return response;
}

export const config = {
  matcher: ["/admin/:path*", "/admin", "/staff/:path*", "/staff"],
};
