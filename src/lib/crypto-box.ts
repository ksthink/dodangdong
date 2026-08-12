/**
 * 저장할 때 감싸는 상자.
 *
 * DB 에 그대로 두면 안 되는 것들 — 2단계 인증 비밀키, Google 리프레시 토큰 —
 * 을 AES-GCM 으로 감싸 넣는다. 키는 SESSION_SECRET 에서 파생하므로 따로 관리할
 * 비밀이 늘지 않는다.
 *
 * 이것이 막아주는 것은 "DB 만 유출된 경우"다. 서버 환경변수까지 함께 털리면
 * 소용이 없다. 그래도 백업 파일 하나가 새는 사고는 실제로 가장 흔하다.
 */

const VERSION = 'v1';

async function derivedKey(): Promise<CryptoKey> {
  const secret = process.env.SESSION_SECRET;
  if (!secret || secret.length < 16) {
    throw new Error('SESSION_SECRET 이 필요합니다(16자 이상).');
  }
  // 같은 비밀에서 세션 서명과 다른 키가 나오도록 용도를 섞어 해시한다.
  const material = new TextEncoder().encode(`archive-box:${secret}`);
  const digest = await crypto.subtle.digest('SHA-256', material.slice().buffer as ArrayBuffer);
  return crypto.subtle.importKey('raw', digest, { name: 'AES-GCM' }, false, [
    'encrypt',
    'decrypt',
  ]);
}

function toB64(bytes: Uint8Array): string {
  let s = '';
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s);
}

function fromB64(s: string): Uint8Array {
  const bin = atob(s);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

export async function seal(plain: string): Promise<string> {
  const key = await derivedKey();
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const data = new TextEncoder().encode(plain);
  const cipher = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv },
    key,
    data.slice().buffer as ArrayBuffer,
  );
  return `${VERSION}.${toB64(iv)}.${toB64(new Uint8Array(cipher))}`;
}

export async function open(sealed: string): Promise<string | null> {
  const parts = sealed.split('.');
  if (parts.length !== 3 || parts[0] !== VERSION) return null;
  try {
    const key = await derivedKey();
    const iv = fromB64(parts[1]).slice().buffer as ArrayBuffer;
    const cipher = fromB64(parts[2]);
    const plain = await crypto.subtle.decrypt(
      { name: 'AES-GCM', iv },
      key,
      cipher.slice().buffer as ArrayBuffer,
    );
    return new TextDecoder().decode(plain);
  } catch {
    // SESSION_SECRET 이 바뀌면 열리지 않는다. 그 경우 다시 등록하게 하는 것이 맞다.
    return null;
  }
}
