import { NextRequest, NextResponse } from 'next/server';
import { currentRole } from '@/lib/access';
import { consentUrl } from '@/lib/drive';
import { randomBytes } from 'crypto';

export const runtime = 'nodejs';

/** 리다이렉트 URI 는 Google Cloud Console 에 등록한 것과 문자 하나까지 같아야 한다. */
export function callbackUrl(req: NextRequest): string {
  const configured = process.env.GOOGLE_REDIRECT_URI;
  if (configured) return configured;
  const origin = req.nextUrl.origin;
  return `${origin}/api/google/callback`;
}

export async function GET(req: NextRequest) {
  if ((await currentRole()) !== 'admin') {
    return NextResponse.redirect(new URL('/login?next=/admin', req.url));
  }

  // CSRF 방지 — 돌아온 state 가 쿠키와 같아야 받아들인다.
  const state = randomBytes(16).toString('hex');
  const res = NextResponse.redirect(consentUrl(callbackUrl(req), state));
  res.cookies.set('google_oauth_state', state, {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    maxAge: 600,
    path: '/',
  });
  return res;
}
