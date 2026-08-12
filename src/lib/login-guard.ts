import 'server-only';
import { db } from './db';

/**
 * 무차별 대입 방어.
 *
 * 관리자 계정 하나에 비밀번호가 유일한 자물쇠이므로, 무제한으로 찔러볼 수 있으면
 * 자물쇠가 없는 것과 다르지 않다. 같은 주소에서 실패가 쌓이면 잠시 막는다.
 *
 * 서버리스는 인스턴스가 계속 바뀌어 메모리에 세는 것이 의미가 없다.
 * 그래서 DB 에 기록한다 — 로그인 한 번에 질의 두 번은 치를 만한 값이다.
 */

const WINDOW_MINUTES = 15;
const MAX_FAILURES = 10;

export interface GuardResult {
  blocked: boolean;
  remaining: number;
}

/** 프록시 뒤에 있으므로 첫 번째 X-Forwarded-For 를 쓴다. */
export function clientIp(headers: Headers): string {
  const xff = headers.get('x-forwarded-for');
  if (xff) return xff.split(',')[0].trim();
  return headers.get('x-real-ip') ?? 'unknown';
}

export async function checkLoginAllowed(ip: string): Promise<GuardResult> {
  const since = new Date(Date.now() - WINDOW_MINUTES * 60 * 1000).toISOString();
  const { count, error } = await db()
    .from('login_attempt')
    .select('id', { count: 'exact', head: true })
    .eq('ip', ip)
    .eq('succeeded', false)
    .gte('at', since);

  // 기록을 못 읽으면 막지 않는다. 잠금 장치가 고장 나서 아무도 못 들어오는
  // 상황이 무차별 대입보다 더 흔한 사고다.
  if (error) return { blocked: false, remaining: MAX_FAILURES };

  const failures = count ?? 0;
  return { blocked: failures >= MAX_FAILURES, remaining: Math.max(0, MAX_FAILURES - failures) };
}

export async function recordLoginAttempt(
  ip: string,
  username: string,
  succeeded: boolean,
): Promise<void> {
  // 아이디는 그대로 남기되 비밀번호는 어디에도 남기지 않는다.
  await db()
    .from('login_attempt')
    .insert({ ip, username: username.slice(0, 100), succeeded });

  // 성공하면 그 주소의 실패 기록을 지운다. 오늘 한 번 틀렸다고
  // 내일까지 문턱이 낮아져 있을 이유가 없다.
  if (succeeded) {
    await db().from('login_attempt').delete().eq('ip', ip).eq('succeeded', false);
  }
}

export const LOGIN_WINDOW_MINUTES = WINDOW_MINUTES;
export const LOGIN_MAX_FAILURES = MAX_FAILURES;
