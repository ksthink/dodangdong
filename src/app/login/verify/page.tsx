import { redirect } from 'next/navigation';
import { cookies, headers } from 'next/headers';
import {
  verifyPending,
  makeSessionValue,
  safeNextPath,
  SESSION_COOKIE,
  SESSION_MAX_AGE,
  PENDING_COOKIE,
  currentRole,
} from '@/lib/access';
import { verifySecondFactor } from '@/lib/two-factor';
import { clientIp, checkLoginAllowed, recordLoginAttempt, LOGIN_WINDOW_MINUTES } from '@/lib/login-guard';
import { VERSION_LABEL } from '@/lib/version';
import { IconHeart, IconLock } from '@/components/icons';

export const dynamic = 'force-dynamic';

/**
 * 두 번째 자물쇠.
 *
 * 여기까지 온 사람은 아이디와 비밀번호를 맞혔다. 그것만으로는 들여보내지 않는다 —
 * 비밀번호는 새어나가고, 새어나간 사실을 한동안 모르기 때문이다.
 */
export default async function VerifyPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; next?: string }>;
}) {
  const { error, next } = await searchParams;

  if ((await currentRole()) !== 'visitor') redirect(safeNextPath(next));

  const jar = await cookies();
  const pending = await verifyPending(jar.get(PENDING_COOKIE)?.value);
  // 쪽지가 없거나 5분이 지났으면 처음부터 다시.
  if (pending === 'visitor') redirect('/login?error=expired');

  async function verify(formData: FormData) {
    'use server';
    const code = String(formData.get('code') ?? '');
    const target = safeNextPath(String(formData.get('next') ?? '/'));
    const ip = clientIp(await headers());

    const guard = await checkLoginAllowed(ip);
    if (guard.blocked) {
      redirect(`/login/verify?error=locked&next=${encodeURIComponent(target)}`);
    }

    const store = await cookies();
    const role = await verifyPending(store.get(PENDING_COOKIE)?.value);
    if (role === 'visitor') redirect('/login?error=expired');

    const verdict = await verifySecondFactor(code);
    await recordLoginAttempt(ip, '2fa', verdict === 'ok');

    if (verdict !== 'ok') {
      redirect(`/login/verify?error=1&next=${encodeURIComponent(target)}`);
    }

    store.delete(PENDING_COOKIE);
    store.set(SESSION_COOKIE, await makeSessionValue(role), {
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
            시도가 너무 많습니다. {LOGIN_WINDOW_MINUTES}분 뒤에 다시 시도해 주세요.
          </div>
        ) : error ? (
          <div className="callout err" role="alert">
            코드가 맞지 않습니다.
          </div>
        ) : null}

        <form action={verify} className="stack">
          <input type="hidden" name="next" value={safeNextPath(next)} />

          <div className="field">
            <label htmlFor="code">인증 앱 코드</label>
            <input
              id="code"
              name="code"
              type="text"
              inputMode="numeric"
              autoComplete="one-time-code"
              autoCapitalize="characters"
              autoCorrect="off"
              spellCheck={false}
              maxLength={9}
              placeholder="000000"
              required
              autoFocus
              style={{ letterSpacing: '0.2em', textAlign: 'center', fontSize: 16 }}
            />
            <span className="hint">Google Authenticator 에 뜨는 6자리 숫자</span>
          </div>

          <button type="submit" className="btn" style={{ justifyContent: 'center' }}>
            확인
          </button>
        </form>

        <div className="gate-note">
          <IconLock size={10} />
          <span>
            인증 앱을 쓸 수 없다면 발급받아 둔 <b>복구 코드</b>를 같은 칸에 넣으세요. 한 번 쓰면
            사라집니다.
          </span>
        </div>

        <a href="/login" className="small" style={{ textAlign: 'center' }}>
          처음부터 다시
        </a>
      </div>
    </main>
  );
}
