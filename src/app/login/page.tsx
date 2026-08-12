import { redirect } from 'next/navigation';
import { cookies, headers } from 'next/headers';
import {
  roleForCredentials,
  makeSessionValue,
  familyLoginEnabled,
  safeNextPath,
  makePendingValue,
  SESSION_COOKIE,
  SESSION_MAX_AGE,
  PENDING_COOKIE,
  PENDING_MAX_AGE,
  currentRole,
} from '@/lib/access';
import { totpRequired } from '@/lib/two-factor';
import {
  clientIp,
  checkLoginAllowed,
  recordLoginAttempt,
  LOGIN_WINDOW_MINUTES,
} from '@/lib/login-guard';
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
  if (role !== 'visitor') redirect(safeNextPath(next));

  const familyOpen = familyLoginEnabled();

  async function login(formData: FormData) {
    'use server';
    const username = String(formData.get('username') ?? '');
    const password = String(formData.get('password') ?? '');
    const target = safeNextPath(String(formData.get('next') ?? '/'));
    const ip = clientIp(await headers());

    // 같은 주소에서 실패가 쌓였으면 잠시 막는다.
    const guard = await checkLoginAllowed(ip);
    if (guard.blocked) {
      redirect(`/login?error=locked&next=${encodeURIComponent(target)}`);
    }

    const granted = roleForCredentials(username, password);
    await recordLoginAttempt(ip, username, granted !== null);

    if (!granted) {
      redirect(`/login?error=1&next=${encodeURIComponent(target)}`);
    }

    const jar = await cookies();

    // 2단계 인증이 켜져 있으면 여기서 세션을 내주지 않는다.
    // 5분짜리 쪽지만 주고 인증 앱 코드를 받으러 보낸다.
    if (granted === 'admin' && (await totpRequired())) {
      jar.set(PENDING_COOKIE, await makePendingValue(granted), {
        httpOnly: true,
        sameSite: 'lax',
        secure: process.env.NODE_ENV === 'production',
        maxAge: PENDING_MAX_AGE,
        path: '/',
      });
      redirect(`/login/verify?next=${encodeURIComponent(target)}`);
    }

    jar.set(SESSION_COOKIE, await makeSessionValue(granted), {
      httpOnly: true,
      sameSite: 'lax',
      secure: process.env.NODE_ENV === 'production',
      maxAge: SESSION_MAX_AGE,
      path: '/',
    });
    redirect(target);
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

        {error === 'locked' ? (
          <div className="callout err" role="alert">
            로그인 시도가 너무 많습니다. {LOGIN_WINDOW_MINUTES}분 뒤에 다시 시도해 주세요.
          </div>
        ) : error ? (
          <div className="callout err" role="alert">
            아이디 또는 비밀번호가 맞지 않습니다.
          </div>
        ) : null}

        <form action={login} className="stack">
          <input type="hidden" name="next" value={safeNextPath(next)} />

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
