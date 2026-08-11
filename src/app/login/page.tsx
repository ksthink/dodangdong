import { redirect } from 'next/navigation';
import { cookies } from 'next/headers';
import {
  roleForPassword,
  makeSessionValue,
  SESSION_COOKIE,
  SESSION_MAX_AGE,
  currentRole,
} from '@/lib/access';

export const dynamic = 'force-dynamic';

/**
 * 로그인 — 공유 암호 하나.
 *
 * 가족마다 계정을 만들지 않는다. 어르신이 쓰실 수 있어야 하고,
 * 실제 위험은 "누가 봤는지 모르는 것"이 아니라 "아무도 못 들어오는 것"이다.
 */
export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; next?: string }>;
}) {
  const { error, next } = await searchParams;
  const role = await currentRole();

  async function login(formData: FormData) {
    'use server';
    const password = String(formData.get('password') ?? '');
    const target = String(formData.get('next') ?? '/');
    const granted = roleForPassword(password);
    if (!granted) {
      redirect(`/login?error=1&next=${encodeURIComponent(target)}`);
    }
    const jar = await cookies();
    jar.set(SESSION_COOKIE, makeSessionValue(granted), {
      httpOnly: true,
      sameSite: 'lax',
      secure: process.env.NODE_ENV === 'production',
      maxAge: SESSION_MAX_AGE,
      path: '/',
    });
    redirect(target.startsWith('/') ? target : '/');
  }

  return (
    <main className="wrap narrow">
      <section className="stack">
        <span className="eyebrow">로그인</span>
        <h1>가족 로그인</h1>
        <p className="lede">
          가족에게 공유된 암호를 넣어주세요. 대부분의 자료는 로그인 없이도 보이지만, 가족만 볼 수
          있게 잠근 자료가 있습니다.
        </p>
      </section>

      {role !== 'visitor' && (
        <div className="callout">
          이미 {role === 'admin' ? '관리자' : '가족'}으로 로그인되어 있습니다.
        </div>
      )}

      {error && <div className="callout err">암호가 맞지 않습니다.</div>}

      <form action={login} className="box stack">
        <input type="hidden" name="next" value={next ?? '/'} />
        <div className="field">
          <label htmlFor="password">암호</label>
          <input id="password" name="password" type="password" autoComplete="current-password" autoFocus />
          <span className="hint">관리자 암호를 넣으면 관리 화면까지 열립니다.</span>
        </div>
        <div className="row">
          <button type="submit" className="btn">
            들어가기
          </button>
        </div>
      </form>
    </main>
  );
}
