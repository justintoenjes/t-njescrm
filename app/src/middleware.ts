import { withAuth } from 'next-auth/middleware';
import { NextResponse } from 'next/server';

export default withAuth(
  function middleware(req) {
    const { pathname } = req.nextUrl;
    const role = req.nextauth.token?.role;

    if (pathname.startsWith('/settings') && role !== 'ADMIN') {
      return NextResponse.redirect(new URL('/', req.url));
    }
    return NextResponse.next();
  },
  {
    callbacks: {
      authorized: ({ token }) => !!token,
    },
  },
);

export const config = {
  matcher: ['/((?!login|api/auth|api/push/vapid-public-key|_next/static|_next/image|favicon.ico|icon-512\\.png|apple-touch-icon\\.png|apple-touch-icon-precomposed\\.png|manifest\\.json|sw\\.js|logo.*\\.svg).*)'],
};
