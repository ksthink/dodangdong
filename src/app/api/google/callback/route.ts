import { NextRequest, NextResponse } from 'next/server';
import { currentRole } from '@/lib/access';
import { exchangeCode } from '@/lib/drive';
import { callbackUrl } from '../start/route';

export const runtime = 'nodejs';

export async function GET(req: NextRequest) {
  if ((await currentRole()) !== 'admin') {
    return NextResponse.redirect(new URL('/login?next=/admin', req.url));
  }

  const url = req.nextUrl;
  const error = url.searchParams.get('error');
  if (error) {
    return NextResponse.redirect(new URL(`/admin/storage?error=${encodeURIComponent(error)}`, req.url));
  }

  const code = url.searchParams.get('code');
  const state = url.searchParams.get('state');
  const expected = req.cookies.get('google_oauth_state')?.value;

  if (!code || !state || !expected || state !== expected) {
    return NextResponse.redirect(new URL('/admin/storage?error=state', req.url));
  }

  try {
    await exchangeCode(code, callbackUrl(req));
  } catch (e) {
    const msg = e instanceof Error ? e.message : '연결 실패';
    return NextResponse.redirect(new URL(`/admin/storage?error=${encodeURIComponent(msg)}`, req.url));
  }

  const res = NextResponse.redirect(new URL('/admin/storage?connected=1', req.url));
  res.cookies.delete('google_oauth_state');
  return res;
}
