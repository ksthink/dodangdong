import 'server-only';
import { db } from './db';
import { seal, open } from './crypto-box';
import { generateSecret, verifyTotp } from './totp';

/**
 * 관리자 2단계 인증의 상태와 절차.
 *
 * 흐름은 셋뿐이다 — 등록(아직 안 켰을 때), 확인(로그인 2단계), 해제.
 * 어느 경로에서도 비밀키를 평문으로 DB 에 남기지 않는다.
 */

export interface TotpState {
  enrolled: boolean;
  activated: boolean;
  recoveryRemaining: number;
}

interface Row {
  secret_encrypted: string;
  activated_at: string | null;
  last_step: number | null;
  recovery_hashes: string[];
}

async function readRow(): Promise<Row | null> {
  const { data } = await db()
    .from('admin_totp')
    .select('secret_encrypted, activated_at, last_step, recovery_hashes')
    .eq('id', true)
    .maybeSingle();
  return (data as Row) ?? null;
}

export async function totpState(): Promise<TotpState> {
  const row = await readRow();
  if (!row) return { enrolled: false, activated: false, recoveryRemaining: 0 };
  return {
    enrolled: true,
    activated: row.activated_at !== null,
    recoveryRemaining: row.recovery_hashes.length,
  };
}

/** 로그인 2단계를 요구해야 하는가. 켜져 있고 활성화된 경우에만. */
export async function totpRequired(): Promise<boolean> {
  return (await totpState()).activated;
}

/**
 * 새 비밀키를 만들어 저장한다(아직 활성화하지 않음).
 * 인증 앱에 등록한 뒤 코드를 한 번 맞춰야 켜진다 — 등록에 실패했는데
 * 켜져 버리면 관리자가 자기 사이트에서 잠기기 때문이다.
 */
export async function beginEnrollment(): Promise<string> {
  const secret = generateSecret();
  const sealed = await seal(secret);
  const { error } = await db()
    .from('admin_totp')
    .upsert({
      id: true,
      secret_encrypted: sealed,
      activated_at: null,
      last_step: null,
      recovery_hashes: [],
      modified_at: new Date().toISOString(),
    });
  if (error) throw new Error(`2단계 인증 등록 실패: ${error.message}`);
  return secret;
}

export async function pendingSecret(): Promise<string | null> {
  const row = await readRow();
  if (!row || row.activated_at) return null;
  return open(row.secret_encrypted);
}

async function sha256Hex(s: string): Promise<string> {
  const data = new TextEncoder().encode(s);
  const digest = await crypto.subtle.digest('SHA-256', data.slice().buffer as ArrayBuffer);
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

function makeRecoveryCode(): string {
  // 사람이 옮겨 적을 것이므로 헷갈리는 글자(0/O, 1/I)는 뺀다.
  const alphabet = '23456789ABCDEFGHJKLMNPQRSTUVWXYZ';
  const bytes = crypto.getRandomValues(new Uint8Array(8));
  const chars = [...bytes].map((b) => alphabet[b % alphabet.length]).join('');
  return `${chars.slice(0, 4)}-${chars.slice(4)}`;
}

/**
 * 코드가 맞으면 2단계 인증을 켜고, 복구 코드를 발급한다.
 * 복구 코드의 원본은 이 순간 한 번만 돌려주고 어디에도 남기지 않는다.
 */
export async function activateEnrollment(code: string): Promise<string[] | null> {
  const row = await readRow();
  if (!row || row.activated_at) return null;

  const secret = await open(row.secret_encrypted);
  if (!secret) return null;

  const result = await verifyTotp(secret, code);
  if (!result.ok) return null;

  const codes = Array.from({ length: 10 }, makeRecoveryCode);
  const hashes = await Promise.all(codes.map(sha256Hex));

  const { error } = await db()
    .from('admin_totp')
    .update({
      activated_at: new Date().toISOString(),
      last_step: result.step ?? null,
      recovery_hashes: hashes,
      modified_at: new Date().toISOString(),
    })
    .eq('id', true);
  if (error) throw new Error(`2단계 인증 활성화 실패: ${error.message}`);

  return codes;
}

export type SecondFactorResult = 'ok' | 'invalid' | 'not-enrolled';

/**
 * 로그인 2단계 확인. 인증 앱 코드와 복구 코드를 모두 받는다.
 * 쓰인 복구 코드는 즉시 목록에서 지운다.
 */
export async function verifySecondFactor(input: string): Promise<SecondFactorResult> {
  const row = await readRow();
  if (!row || !row.activated_at) return 'not-enrolled';

  const secret = await open(row.secret_encrypted);
  if (!secret) return 'invalid';

  const cleaned = input.trim().toUpperCase();

  // 인증 앱 코드
  const result = await verifyTotp(secret, input, { minStep: row.last_step ?? undefined });
  if (result.ok) {
    await db()
      .from('admin_totp')
      .update({ last_step: result.step ?? null, modified_at: new Date().toISOString() })
      .eq('id', true);
    return 'ok';
  }

  // 복구 코드
  if (row.recovery_hashes.length > 0) {
    const hash = await sha256Hex(cleaned);
    if (row.recovery_hashes.includes(hash)) {
      await db()
        .from('admin_totp')
        .update({
          recovery_hashes: row.recovery_hashes.filter((h) => h !== hash),
          modified_at: new Date().toISOString(),
        })
        .eq('id', true);
      return 'ok';
    }
  }

  return 'invalid';
}

/** 해제. 현재 코드를 한 번 더 확인한 뒤에만 풀린다. */
export async function disableTotp(code: string): Promise<boolean> {
  const verdict = await verifySecondFactor(code);
  if (verdict !== 'ok') return false;
  const { error } = await db().from('admin_totp').delete().eq('id', true);
  return !error;
}

/** 복구 코드 재발급. 남은 코드가 떨어졌을 때 쓴다. */
export async function regenerateRecoveryCodes(code: string): Promise<string[] | null> {
  const verdict = await verifySecondFactor(code);
  if (verdict !== 'ok') return null;

  const codes = Array.from({ length: 10 }, makeRecoveryCode);
  const hashes = await Promise.all(codes.map(sha256Hex));
  const { error } = await db()
    .from('admin_totp')
    .update({ recovery_hashes: hashes, modified_at: new Date().toISOString() })
    .eq('id', true);
  if (error) return null;
  return codes;
}
