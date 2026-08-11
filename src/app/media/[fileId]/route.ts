import { NextRequest } from 'next/server';
import { db } from '@/lib/db';
import { currentRole, canView, type AccessLevel } from '@/lib/access';

/**
 * 파일은 이 경로로만 나간다.
 *
 * 스토리지 버킷은 둘 다 비공개다. 서명 URL 을 브라우저에 넘기면 그 주소가
 * 그대로 유출될 수 있으므로, 접근 등급을 확인한 뒤 서버가 직접 흘려보낸다.
 * 원본(original)은 관리자만 받을 수 있다 — 화면에는 축소본만 쓴다.
 */

export async function GET(_req: NextRequest, ctx: { params: Promise<{ fileId: string }> }) {
  const { fileId } = await ctx.params;
  const role = await currentRole();
  const supabase = db();

  const { data: file } = await supabase
    .from('file')
    .select('id, item_id, role, storage_bucket, storage_path, mime')
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
    return new Response('원본은 관리자만 내려받을 수 있습니다', { status: 403 });
  }
  if (item.is_archived && role !== 'admin') {
    return new Response('없는 자료입니다', { status: 404 });
  }

  const { data: blob, error } = await supabase.storage
    .from(file.storage_bucket)
    .download(file.storage_path);

  if (error || !blob) return new Response('파일을 읽을 수 없습니다', { status: 502 });

  return new Response(blob.stream(), {
    headers: {
      'Content-Type': file.mime ?? 'application/octet-stream',
      // 등급에 따라 캐시가 달라진다. 공개 자료만 공유 캐시를 허용한다.
      'Cache-Control':
        item.access_level === 'public'
          ? 'public, max-age=3600'
          : 'private, no-store',
    },
  });
}
