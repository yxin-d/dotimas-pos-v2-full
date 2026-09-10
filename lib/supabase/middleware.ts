import { createServerClient } from "@supabase/ssr";
import { type NextRequest, NextResponse } from "next/server";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;

export const updateSession = async (request: NextRequest) => {
  // Create an unmodified response
  let supabaseResponse = NextResponse.next({
    request: {
      headers: request.headers,
    },
  });

  const supabase = createServerClient(
    supabaseUrl!,
    supabaseKey!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll()
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value))
          supabaseResponse = NextResponse.next({
            request,
          })
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options)
          )
        },
      },
    },
  );

  // Refresh the session if it exists — required for Server Components,
  // which can't set cookies themselves.
  //
  // This call goes over the network to Supabase on every single request.
  // Without a timeout of its own, a slow response here used to hang the
  // whole request until Vercel's platform-level timeout killed it —
  // turning one slow auth check into a full site outage. Racing it against
  // a timeout means a slow/unreachable Supabase now degrades to "bounced to
  // login," not "the entire site returns a 504."
  const AUTH_CHECK_TIMEOUT_MS = 8000;
  let user = null;
  try {
    const { data } = await Promise.race([
      supabase.auth.getUser(),
      new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error('Auth check timed out')), AUTH_CHECK_TIMEOUT_MS)
      ),
    ]);
    user = data.user;
  } catch {
    // Timed out or errored talking to Supabase — treat as "not confirmed
    // logged in" rather than hanging. Fails closed (safer for an app
    // handling money and credit balances) rather than letting an
    // unauthenticated request through.
    user = null;
  }

  const pathname = request.nextUrl.pathname
  const isAuthRoute = pathname.startsWith('/login')

  // Not logged in and hitting a protected route -> bounce to /login
  if (!user && !isAuthRoute) {
    const url = request.nextUrl.clone()
    url.pathname = '/login'
    return NextResponse.redirect(url)
  }

  // Logged in and hitting /login -> send them into the app instead
  if (user && isAuthRoute) {
    const url = request.nextUrl.clone()
    url.pathname = '/dashboard'
    return NextResponse.redirect(url)
  }

  return supabaseResponse
};
