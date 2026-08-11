import { cookies } from 'next/headers';
import { createHmac, timingSafeEqual } from 'crypto';

/**
 * 접근 통제.
 *
 * 등급은 셋뿐이다 — public / family / private. 늘리지 않는다.
 *   public   링크를 아는 사람 누구나
 *   family   로그인한 가족
 *   private  관리자만
 *
 * 로그인은 공유 암호 두 개(가족용·관리자용)로 한다. 가족 구성원마다
 * 계정을 만드는 대신, 어르신도 쓸 수 있도록 단순하게 유지한다.
 */

export type Role = 'visitor' | 'family' | 'admin';
export type AccessLevel = 'public' | 'family' | 'private';

const COOKIE = 'archive_session';
const MAX_AGE_DAYS = 90;

function secret() {
  const s = process.env.SESSION_SECRET;
  if (!s || s.length < 16) {
    throw new Error('SESSION_SECRET 이 필요합니다(16자 이상). .env.local 을 확인하세요.');
  }
  return s;
}

function sign(payload: string) {
  return createHmac('sha256', secret()).update(payload).digest('base64url');
}

export function makeSessionValue(role: Exclude<Role, 'visitor'>) {
  const expires = Date.now() + MAX_AGE_DAYS * 24 * 60 * 60 * 1000;
  const payload = `${role}.${expires}`;
  return `${payload}.${sign(payload)}`;
}

function verify(value: string | undefined): Role {
  if (!value) return 'visitor';
  const parts = value.split('.');
  if (parts.length !== 3) return 'visitor';
  const [role, expires, sig] = parts;
  const expected = sign(`${role}.${expires}`);
  const a = Buffer.from(sig);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !timingSafeEqual(a, b)) return 'visitor';
  if (Number(expires) < Date.now()) return 'visitor';
  if (role === 'admin' || role === 'family') return role;
  return 'visitor';
}

export async function currentRole(): Promise<Role> {
  const jar = await cookies();
  return verify(jar.get(COOKIE)?.value);
}

export async function requireAdmin(): Promise<void> {
  if ((await currentRole()) !== 'admin') {
    throw new Error('관리자만 접근할 수 있습니다.');
  }
}

/** 암호를 확인하고 역할을 돌려준다. 관리자 암호가 우선한다. */
export function roleForPassword(password: string): Exclude<Role, 'visitor'> | null {
  const admin = process.env.ADMIN_PASSWORD;
  const family = process.env.FAMILY_PASSWORD;
  if (admin && password === admin) return 'admin';
  if (family && password === family) return 'family';
  return null;
}

export const SESSION_COOKIE = COOKIE;
export const SESSION_MAX_AGE = MAX_AGE_DAYS * 24 * 60 * 60;

/** 이 등급의 자료를 이 역할이 볼 수 있는가. */
export function canView(level: AccessLevel | null | undefined, role: Role): boolean {
  const l = level ?? 'family';
  if (role === 'admin') return true;
  if (l === 'public') return true;
  if (l === 'family') return role === 'family';
  return false;
}

/** 목록에서 잠긴 자료를 어떻게 다룰지 — 감추지 않고, 있다는 사실은 보여준다. */
export function lockLabel(level: AccessLevel): string {
  if (level === 'family') return '가족만 열람';
  if (level === 'private') return '관리자만 열람';
  return '';
}

export const ACCESS_LABELS: Record<AccessLevel, string> = {
  public: '공개',
  family: '가족',
  private: '비공개',
};
