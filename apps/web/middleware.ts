import { NextResponse, type NextRequest } from "next/server";

export function middleware(request: NextRequest) {
  const { pathname, search } = request.nextUrl;
  const localeMatch = pathname.match(/^\/(zh|fr)(\/.*)?$/);

  if (!localeMatch) {
    return NextResponse.next();
  }

  const target = request.nextUrl.clone();
  target.pathname = `/en${localeMatch[2] ?? ""}`;
  target.search = search;
  return NextResponse.redirect(target);
}

export const config = {
  matcher: ["/((?!api|_next|icon.svg).*)"],
};
