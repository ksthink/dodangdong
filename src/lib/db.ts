import { createClient, SupabaseClient } from '@supabase/supabase-js';

/**
 * DB·스토리지 접근은 전부 서버에서, secret key 로만 이루어진다.
 * 브라우저에는 어떤 키도 내려보내지 않는다 — 테이블은 RLS 로 잠겨 있고
 * 정책이 없으므로, 키가 새어나가도 직접 읽히지 않는다.
 * 열람 권한 판정은 서버 코드(access.ts)가 담당한다.
 */

const url = process.env.SUPABASE_URL;
const secret = process.env.SUPABASE_SECRET_KEY;

let cached: SupabaseClient | null = null;

export function db(): SupabaseClient {
  if (!url || !secret) {
    throw new Error(
      'SUPABASE_URL 과 SUPABASE_SECRET_KEY 가 필요합니다. .env.local 을 확인하세요.',
    );
  }
  if (!cached) {
    cached = createClient(url, secret, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
  }
  return cached;
}

export const BUCKET_ORIGINALS = 'originals';
export const BUCKET_DERIVATIVES = 'derivatives';
