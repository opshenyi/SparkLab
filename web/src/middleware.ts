import { NextRequest, NextResponse } from 'next/server';

const DEBUG_PAGE_PREFIXES = ['/ai-test', '/theme-test', '/exam-debug'];

function debugPagesEnabled() {
  const raw = process.env.SPARKLAB_ENABLE_DEBUG_PAGES || process.env.NEXT_PUBLIC_ENABLE_DEBUG_PAGES || '';
  const enabled = raw.trim().toLowerCase();
  if (enabled === '1' || enabled === 'true' || enabled === 'yes' || enabled === 'on') {
    return true;
  }
  return process.env.NODE_ENV !== 'production';
}

export function middleware(request: NextRequest) {
  const pathname = request.nextUrl.pathname;
  const isDebugPage = DEBUG_PAGE_PREFIXES.some((prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`));
  if (isDebugPage && !debugPagesEnabled()) {
    return new NextResponse('Not Found', {
      status: 404,
      headers: {
        'Content-Type': 'text/plain; charset=utf-8',
        'Cache-Control': 'no-store',
      },
    });
  }

  return NextResponse.next();
}

export const config = {
  matcher: ['/ai-test', '/theme-test', '/exam-debug/:path*'],
};

