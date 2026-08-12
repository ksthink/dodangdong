import { cookies } from 'next/headers';
import { verifySession, SESSION_COOKIE, type Role } from './session';

/**
 * 요청 맥락에서 역할을 읽는다.
 *
 * 서명·검증 자체는 session.ts 에 있다 — 미들웨어가 같은 코드를 써야
 * 문 앞과 방 안의 판정이 어긋나지 않기 때문이다.
 */

export async function currentRole(): Promise<Role> {
  const jar = await cookies();
  return verifySession(jar.get(SESSION_COOKIE)?.value);
}

export async function requireAdmin(): Promise<void> {
  if ((await currentRole()) !== 'admin') {
    throw new Error('관리자만 접근할 수 있습니다.');
  }
}

export {
  canView,
  lockLabel,
  makeSessionValue,
  makePendingValue,
  verifyPending,
  PENDING_COOKIE,
  PENDING_MAX_AGE,
  roleForCredentials,
  safeNextPath,
  familyLoginEnabled,
  ACCESS_LABELS,
  SESSION_COOKIE,
  SESSION_MAX_AGE,
  type Role,
  type AccessLevel,
} from './session';
