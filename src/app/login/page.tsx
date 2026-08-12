import { redirect } from 'next/navigation';
import { cookies } from 'next/headers';
import {
  roleForCredentials,
  makeSessionValue,
  familyLoginEnabled,
  SESSION_COOKIE,
  SESSION_MAX_AGE,
  currentRole,
} from '@/lib/access';
import { VERSION_LABEL } from '@/lib/version';
import { IconHeart, IconLock } from '@/components/icons';

export const dynamic = 'force-dynamic';

/**
 * 문 앞 화면.
 *
 * 사이트에 들어오는 모든 사람이 처음 보는 곳이다. 이름 · 버전 · 로그인 창,
 * 그 셋만 둔다. 아카이브의 내용은 한 조각도 밖으로 새지 않는다.
 */
export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; next?: string }>;
}) {
  const { error, next } = await searchParams;
  const role = await currentRole();
  if (role !== 'visitor') redirect(next && next.startsWith('/') ? next : '/');

  const familyOpen = familyLoginEnabled();

  async function login(formData: FormData) {
    'use server';
    const username = String(formData.get('username') ?? '');
    const password = String(formData.get('password') ?? '');
    const target = String(formData.get('next') ?? '/');

    const granted = roleForCredentials(username, password);
    if (!granted) {
      redirect(`/login?error=1&next=${encodeURIComponent(target)}`);
    }

    const jar = await cookies();
    jar.set(SESSION_COOKIE, await makeSessionValue(granted), {
      httpOnly: true,
      sameSite: 'lax',
      secure: process.env.NODE_ENV === 'production',
      maxAge: SESSION_MAX_AGE,
      path: '/',
    });
    redirect(target.startsWith('/') ? target : '/');
  }

  return (
    <main className="gate">
      <div className="gate-card">
        <div className="gate-head">
          <span className="gate-mark">
            <IconHeart size={16} />
          </span>
          <h1>도당동 아카이브</h1>
          <span className="gate-version">{VERSION_LABEL}</span>
        </div>

        <div className="rule" />

        {error && (
          <div className="callout err" role="alert">
            아이디 또는 비밀번호가 맞지 않습니다.
          </div>
        )}

        <form action={login} className="stack">
          <input type="hidden" name="next" value={next ?? '/'} />

          <div className="field">
            <label htmlFor="username">아이디</label>
            <input
              id="username"
              name="username"
              type="text"
              autoComplete="username"
              autoCapitalize="off"
              autoCorrect="off"
              spellCheck={false}
              required
              autoFocus
            />
          </div>

          <div className="field">
            <label htmlFor="password">비밀번호</label>
            <input
              id="password"
              name="password"
              type="password"
              autoComplete="current-password"
              required
            />
          </div>

          <button type="submit" className="btn" style={{ justifyContent: 'center' }}>
            들어가기
          </button>
        </form>

        <div className="gate-note">
          <IconLock size={10} />
          <span>
            {familyOpen
              ? '가족 계정으로 들어오면 가족 공개 자료까지 보입니다.'
              : '지금은 관리자만 들어올 수 있습니다. 가족 계정은 준비되는 대로 엽니다.'}
          </span>
        </div>
      </div>
    </main>
  );
}
