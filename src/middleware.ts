import { NextResponse, type NextRequest } from "next/server";
import { COOKIE, verifySession } from "@/lib/session";
import { SECTION_ACCESS, sectionForPath } from "@/lib/roles";

function csp(nonce: string) {
  const dev = process.env.NODE_ENV !== "production";
  return [
    "default-src 'self'",
    `script-src 'self' 'nonce-${nonce}' 'strict-dynamic'${dev ? " 'unsafe-eval'" : ""}`,
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data: blob:",
    "font-src 'self' data:",
    "connect-src 'self'",
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "frame-ancestors 'none'",
    ...(dev ? [] : ["upgrade-insecure-requests"]),
  ].join("; ");
}

export async function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;
  const nonce = btoa(crypto.randomUUID());
  const policy = csp(nonce);
  const pass = () => {
    const h = new Headers(req.headers);
    h.set("x-nonce", nonce);
    h.set("content-security-policy", policy);
    const res = NextResponse.next({ request: { headers: h } });
    res.headers.set("content-security-policy", policy);
    return res;
  };
  const go = (url: URL) => {
    const res = NextResponse.redirect(url);
    res.headers.set("content-security-policy", policy);
    return res;
  };

  const session = await verifySession(req.cookies.get(COOKIE)?.value);

  if (pathname.startsWith("/login")) {
    if (session) return go(new URL("/", req.url));
    return pass();
  }

  if (!session) {
    if (pathname.startsWith("/api/")) {
      return NextResponse.json({ error: "Sesi berakhir. Masuk kembali untuk melanjutkan." }, { status: 401 });
    }
    const url = new URL("/login", req.url);
    if (pathname !== "/") url.searchParams.set("next", pathname);
    return go(url);
  }

  if (!pathname.startsWith("/api/")) {
    const section = sectionForPath(pathname);
    if (!SECTION_ACCESS[section].includes(session.role)) {
      const url = new URL("/", req.url);
      url.searchParams.set("akses", section);
      return go(url);
    }
  }
  return pass();
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|icon.svg).*)"],
};
