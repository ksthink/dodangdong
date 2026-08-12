/**
 * TOTP — Google Authenticator 가 쓰는 시간 기반 일회용 비밀번호.
 *
 * RFC 6238 그대로다: 30초 시간대마다 HMAC-SHA1 을 계산하고, 그 결과에서
 * 6자리를 뽑아낸다. 표준을 벗어나면 인증 앱이 읽지 못하므로 손대지 않는다.
 *
 * 시계는 어긋난다. 앞뒤 한 칸(±30초)까지 받아준다 — 그보다 넓히면
 * 어깨너머로 본 코드의 유효 시간이 함께 길어진다.
 */

const PERIOD = 30;
const DIGITS = 6;
const DRIFT_STEPS = 1;

const B32_ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';

export function base32Encode(bytes: Uint8Array): string {
  let bits = 0;
  let value = 0;
  let out = '';
  for (const b of bytes) {
    value = (value << 8) | b;
    bits += 8;
    while (bits >= 5) {
      out += B32_ALPHABET[(value >>> (bits - 5)) & 31];
      bits -= 5;
    }
  }
  if (bits > 0) out += B32_ALPHABET[(value << (5 - bits)) & 31];
  return out;
}

export function base32Decode(s: string): Uint8Array {
  const clean = s.toUpperCase().replace(/[^A-Z2-7]/g, '');
  let bits = 0;
  let value = 0;
  const out: number[] = [];
  for (const ch of clean) {
    const idx = B32_ALPHABET.indexOf(ch);
    if (idx === -1) continue;
    value = (value << 5) | idx;
    bits += 5;
    if (bits >= 8) {
      out.push((value >>> (bits - 8)) & 0xff);
      bits -= 8;
    }
  }
  return new Uint8Array(out);
}

/** 20바이트(160비트) — SHA-1 HMAC 의 블록에 맞는 표준 길이. */
export function generateSecret(): string {
  return base32Encode(crypto.getRandomValues(new Uint8Array(20)));
}

async function hotp(secret: Uint8Array, counter: number): Promise<string> {
  const buf = new ArrayBuffer(8);
  const view = new DataView(buf);
  // 카운터는 64비트 빅엔디언. 상위 32비트는 2038년 이후에나 쓰인다.
  view.setUint32(0, Math.floor(counter / 2 ** 32));
  view.setUint32(4, counter >>> 0);

  const key = await crypto.subtle.importKey(
    'raw',
    secret.slice().buffer as ArrayBuffer,
    { name: 'HMAC', hash: 'SHA-1' },
    false,
    ['sign'],
  );
  const mac = new Uint8Array(await crypto.subtle.sign('HMAC', key, buf));

  // 동적 절단(dynamic truncation) — 마지막 니블이 시작 위치를 가리킨다.
  const offset = mac[mac.length - 1] & 0x0f;
  const code =
    ((mac[offset] & 0x7f) << 24) |
    (mac[offset + 1] << 16) |
    (mac[offset + 2] << 8) |
    mac[offset + 3];

  return String(code % 10 ** DIGITS).padStart(DIGITS, '0');
}

export function currentStep(nowMs = Date.now()): number {
  return Math.floor(nowMs / 1000 / PERIOD);
}

export interface TotpVerification {
  ok: boolean;
  /** 인증에 쓰인 시간대. 같은 코드의 재사용을 막는 데 쓴다. */
  step?: number;
}

/**
 * 코드를 확인한다.
 *
 * `minStep` 보다 이전 시간대는 거절한다 — 이미 한 번 쓰인 코드를
 * 30초 안에 다시 들이미는 것을 막기 위해서다.
 */
export async function verifyTotp(
  secretBase32: string,
  code: string,
  opts: { minStep?: number; nowMs?: number } = {},
): Promise<TotpVerification> {
  const digits = code.replace(/\D/g, '');
  if (digits.length !== DIGITS) return { ok: false };

  const secret = base32Decode(secretBase32);
  if (secret.length === 0) return { ok: false };

  const now = currentStep(opts.nowMs);
  for (let d = -DRIFT_STEPS; d <= DRIFT_STEPS; d++) {
    const step = now + d;
    if (opts.minStep !== undefined && step <= opts.minStep) continue;
    const expected = await hotp(secret, step);
    // 자릿수가 같으므로 단순 비교로도 시간 정보가 새지 않는다.
    if (timingSafeEqual(expected, digits)) return { ok: true, step };
  }
  return { ok: false };
}

function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

/** 인증 앱이 읽는 QR 의 내용. */
export function otpauthUri(secretBase32: string, account: string, issuer: string): string {
  const label = encodeURIComponent(`${issuer}:${account}`);
  const params = new URLSearchParams({
    secret: secretBase32,
    issuer,
    algorithm: 'SHA1',
    digits: String(DIGITS),
    period: String(PERIOD),
  });
  return `otpauth://totp/${label}?${params}`;
}

/** 손으로 옮겨 적기 쉽게 네 글자씩 끊어 보여준다. */
export function formatSecret(secretBase32: string): string {
  return secretBase32.match(/.{1,4}/g)?.join(' ') ?? secretBase32;
}

export const TOTP_PERIOD = PERIOD;
export const TOTP_DIGITS = DIGITS;
