// Runs before every page request (called from src/proxy.ts):
//   1. refreshes the login session cookie if it is about to expire, and
//   2. sends logged-out visitors to /login.
// Finer checks (2FA, roles) happen in src/lib/auth.ts on the server.
import { NextResponse, type NextRequest } from "next/server";
import { createServerClient } from "@supabase/ssr";

// Pages anyone can open without being logged in.
const PUBLIC_PATHS = ["/login", "/setup", "/forgot-password", "/auth"];

function isPublic(pathname: string) {
  return PUBLIC_PATHS.some((p) => pathname === p || pathname.startsWith(`${p}/`));
}

export async function updateSession(request: NextRequest) {
  let response = NextResponse.next({ request });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet, headers) {
          cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
          response = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) =>
            response.cookies.set(name, value, options),
          );
          // Stops any cache between the browser and the server from storing
          // a response that carries someone's session cookie.
          Object.entries(headers).forEach(([key, value]) => response.headers.set(key, value));
        },
      },
    },
  );

  // Keep this call directly after creating the client: it verifies the
  // session and refreshes it if needed.
  const { data } = await supabase.auth.getClaims();
  const loggedIn = Boolean(data?.claims?.sub);
  const { pathname, search } = request.nextUrl;

  const redirectTo = (path: string, params?: Record<string, string>) => {
    const url = request.nextUrl.clone();
    url.pathname = path;
    url.search = "";
    Object.entries(params ?? {}).forEach(([k, v]) => url.searchParams.set(k, v));
    const redirect = NextResponse.redirect(url);
    // Carry over any refreshed or cleared session cookies.
    response.cookies.getAll().forEach((cookie) => redirect.cookies.set(cookie));
    return redirect;
  };

  if (!loggedIn && !isPublic(pathname)) {
    return redirectTo("/login", pathname === "/" ? undefined : { next: pathname + search });
  }

  if (loggedIn && pathname === "/login") {
    return redirectTo("/");
  }

  return response;
}
