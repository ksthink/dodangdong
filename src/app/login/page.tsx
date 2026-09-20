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
import LoginForm from '@/components/auth/LoginForm';
import Field from '@/components/admin/Field';

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
    <main className="page page-login">
      <LoginForm
        action={login}
        title="로그인"
        submitLabel="들어가기"
        locked={
          error === 'locked'
            ? `로그인 시도가 너무 많습니다. ${LOGIN_WINDOW_MINUTES}분 뒤에 다시 시도해 주세요.`
            : undefined
        }
        // 어느 쪽이 틀렸는지는 밝히지 않는다. 아이디가 있는지 없는지를
        // 알려주는 것만으로도 밖에서 이름을 하나씩 맞춰볼 수 있기 때문이다.
        error={error && error !== 'locked' ? '아이디 또는 비밀번호가 맞지 않습니다.' : undefined}
        help={
          <>
            {familyOpen
              ? '가족 계정으로 들어오면 가족 공개 자료까지 보입니다.'
              : '지금은 관리자만 들어올 수 있습니다. 가족 계정은 준비되는 대로 엽니다.'}{' '}
            {VERSION_LABEL}
          </>
        }
      >
        <input type="hidden" name="next" value={safeNextPath(next)} />

        <Field label="아이디" name="username"
          autoFocus autoComplete="username" required />
        <Field label="비밀번호" name="password" type="password" autoComplete="current-password" required />
      </LoginForm>
    </main>
  );
}
