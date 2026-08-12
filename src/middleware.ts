import { NextRequest, NextResponse } from 'next/server';
import { verifySession, SESSION_COOKIE } from '@/lib/session';

/**
 * 문 앞.
 *
 * 이 아카이브는 가족 기록이다. 링크를 아는 누구나 들어올 수 있게 두지 않고,
 * 모든 경로를 로그인 뒤에 둔다. 자료마다 걸린 접근 등급(공개/가족/비공개)은
 * 그 안에서 다시 한 번 걸러내는 두 번째 층이다.
 *
 * 판정은 session.ts 의 검증을 그대로 쓴다. 문 앞과 방 안이 다른 코드로
 * 판단하면 언젠가 어긋난다.
 */

// /login/verify 는 1단계만 통과한 상태에서 들어오므로 세션이 아직 없다.
const PUBLIC_PATHS = ['/login', '/login/verify', '/logout'];

export async function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;

  const role = await verifySession(req.cookies.get(SESSION_COOKIE)?.value);

  if (role === 'visitor' && !PUBLIC_PATHS.includes(pathname)) {
    const url = req.nextUrl.clone();
    url.pathname = '/login';
    url.search = '';
    // 로그인 뒤 원래 보려던 곳으로 돌려보낸다.
    if (pathname !== '/') url.searchParams.set('next', pathname + req.nextUrl.search);
    return NextResponse.redirect(url);
  }

  // 레이아웃이 현재 경로를 알아야 로그인 화면에서 상단 메뉴를 감출 수 있다.
  const headers = new Headers(req.headers);
  headers.set('x-pathname', pathname);
  return NextResponse.next({ request: { headers } });
}

export const config = {
  matcher: [
    /*
     * 정적 자산과 파비콘은 통과시킨다.
     * /media 는 일부러 포함한다 — 축소본도 자료이므로 로그인 없이 나가면 안 된다.
     */
    '/((?!_next/static|_next/image|favicon.ico).*)',
  ],
};
