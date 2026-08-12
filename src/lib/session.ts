/**
 * 세션 — 서명·검증·자격 확인.
 *
 * 미들웨어와 서버 컴포넌트 양쪽에서 쓰이므로 `next/headers` 같은 요청 맥락에
 * 의존하지 않는다. 쿠키를 꺼내는 일은 access.ts 가 맡는다.
 *
 * HMAC 은 node:crypto 대신 Web Crypto 로 계산한다. 어느 런타임에서도 같은
 * 코드가 돌아야, 미들웨어와 페이지가 서로 다른 판정을 내리는 일이 없다.
 */

export type Role = 'visitor' | 'family' | 'admin';
export type AccessLevel = 'public' | 'family' | 'private';

export const SESSION_COOKIE = 'archive_session';
const MAX_AGE_DAYS = 90;
export const SESSION_MAX_AGE = MAX_AGE_DAYS * 24 * 60 * 60;

function secretKeyMaterial(): ArrayBuffer {
  const s = process.env.SESSION_SECRET;
  if (!s || s.length < 16) {
    throw new Error('SESSION_SECRET 이 필요합니다(16자 이상).');
  }
  const bytes = new TextEncoder().encode(s);
  // Web Crypto 는 ArrayBuffer 를 받는다. TextEncoder 결과의 뷰를 그대로 넘기면
  // SharedArrayBuffer 가능성 때문에 타입이 맞지 않으므로 복사해 건넨다.
  return bytes.slice().buffer as ArrayBuffer;
}

async function hmac(payload: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    'raw',
    secretKeyMaterial(),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  );
  const data = new TextEncoder().encode(payload);
  const sig = await crypto.subtle.sign('HMAC', key, data.slice().buffer as ArrayBuffer);
  return base64url(new Uint8Array(sig));
}

function base64url(bytes: Uint8Array): string {
  let binary = '';
  for (const b of bytes) binary += String.fromCharCode(b);
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

/** 길이가 달라도 시간이 새지 않도록 고정 횟수로 비교한다. */
function safeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

export async function makeSessionValue(role: Exclude<Role, 'visitor'>): Promise<string> {
  const expires = Date.now() + MAX_AGE_DAYS * 24 * 60 * 60 * 1000;
  const payload = `${role}.${expires}`;
  return `${payload}.${await hmac(payload)}`;
}

export async function verifySession(value: string | undefined): Promise<Role> {
  if (!value) return 'visitor';
  const parts = value.split('.');
  if (parts.length !== 3) return 'visitor';
  const [role, expires, sig] = parts;
  if (role !== 'admin' && role !== 'family') return 'visitor';
  if (!/^\d+$/.test(expires) || Number(expires) < Date.now()) return 'visitor';

  let expected: string;
  try {
    expected = await hmac(`${role}.${expires}`);
  } catch {
    return 'visitor';
  }
  return safeEqual(sig, expected) ? role : 'visitor';
}

/**
 * 아이디와 비밀번호로 역할을 판정한다.
 *
 * 가족 계정은 환경변수가 설정된 경우에만 살아난다. 지금은 관리자만 두었으므로
 * FAMILY_USERNAME / FAMILY_PASSWORD 를 비워두면 관리자 외에는 아무도 들어오지 못한다.
 */
export function roleForCredentials(
  username: string,
  password: string,
): Exclude<Role, 'visitor'> | null {
  const id = username.trim();

  const adminId = process.env.ADMIN_USERNAME;
  const adminPw = process.env.ADMIN_PASSWORD;
  if (adminId && adminPw && safeEqual(id, adminId) && safeEqual(password, adminPw)) {
    return 'admin';
  }

  const familyId = process.env.FAMILY_USERNAME;
  const familyPw = process.env.FAMILY_PASSWORD;
  if (familyId && familyPw && safeEqual(id, familyId) && safeEqual(password, familyPw)) {
    return 'family';
  }

  return null;
}

/** 가족 계정이 열려 있는가. 로그인 화면의 안내 문구가 이 값에 따라 달라진다. */
export function familyLoginEnabled(): boolean {
  return Boolean(process.env.FAMILY_USERNAME && process.env.FAMILY_PASSWORD);
}

/** 이 등급의 자료를 이 역할이 볼 수 있는가. */
export function canView(level: AccessLevel | null | undefined, role: Role): boolean {
  const l = level ?? 'family';
  if (role === 'admin') return true;
  if (l === 'public') return true;
  if (l === 'family') return role === 'family';
  return false;
}

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
