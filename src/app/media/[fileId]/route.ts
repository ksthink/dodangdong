import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { currentRole, canView, type AccessLevel } from '@/lib/access';

export const runtime = 'nodejs';

/**
 * 파일은 이 경로로만 나간다.
 *
 * Supabase 버킷은 둘 다 비공개다. 서명 URL 을 브라우저에 넘기면 그 주소가 그대로
 * 유출될 수 있으므로, 접근 등급을 확인한 뒤 서버가 직접 흘려보낸다.
 *
 * 원본은 Drive 에 있고 관리자만 접근할 수 있다. 원본은 수백 MB~수 GB 일 수 있어
 * 서버가 중계하면 함수 시간·메모리를 감당하지 못하므로, Drive 화면으로 보낸다.
 * 관리자는 어차피 자기 Google 계정으로 로그인되어 있다.
 */
export async function GET(_req: NextRequest, ctx: { params: Promise<{ fileId: string }> }) {
  const { fileId } = await ctx.params;
  const role = await currentRole();
  const supabase = db();

  const { data: file } = await supabase
    .from('file')
    .select('id, item_id, role, provider, storage_bucket, storage_path, mime')
    .eq('id', fileId)
    .maybeSingle();

  if (!file) return new Response('없는 파일입니다', { status: 404 });

  const { data: item } = await supabase
    .from('item_effective')
    .select('access_level, is_archived')
    .eq('id', file.item_id)
    .maybeSingle();

  if (!item) return new Response('없는 자료입니다', { status: 404 });

  if (!canView(item.access_level as AccessLevel, role)) {
    return new Response('열람 권한이 없습니다', { status: 403 });
  }
  if (file.role === 'original' && role !== 'admin') {
    return new Response('원본은 관리자만 볼 수 있습니다', { status: 403 });
  }
  if (item.is_archived && role !== 'admin') {
    return new Response('없는 자료입니다', { status: 404 });
  }

  // Drive 원본 — 관리자만 여기 도달한다.
  if (file.provider === 'gdrive') {
    return NextResponse.redirect(`https://drive.google.com/file/d/${file.storage_path}/view`);
  }

  const { data: blob, error } = await supabase.storage
    .from(file.storage_bucket)
    .download(file.storage_path);

  if (error || !blob) return new Response('파일을 읽을 수 없습니다', { status: 502 });

  return new Response(blob.stream(), {
    headers: {
      'Content-Type': file.mime ?? 'application/octet-stream',
      // 사이트 전체가 로그인 뒤에 있으므로 공유 캐시에 남기지 않는다.
      // 자료의 접근 등급이 'public' 이더라도 그것은 "로그인한 사람 모두"라는
      // 뜻이지 "누구나"가 아니다. CDN 이 대신 내주는 일이 없게 한다.
      'Cache-Control': 'private, no-store',
      'X-Content-Type-Options': 'nosniff',
      // 브라우저가 내용을 추측해 실행하지 않도록 표시만 하고 끝낸다.
      'Content-Disposition': 'inline',
    },
  });
}
