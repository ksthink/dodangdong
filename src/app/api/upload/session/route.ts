import { NextRequest, NextResponse } from 'next/server';
import { currentRole } from '@/lib/access';
import { db } from '@/lib/db';
import { createUploadSession, ensureBundleFolder, DriveNotConnected } from '@/lib/drive';
import { mimeFor } from '@/lib/ingest';

export const runtime = 'nodejs';

/**
 * 업로드 세션 발급.
 *
 * 브라우저에 넘기는 것은 세션 URL 하나뿐이다. 액세스 토큰은 넘기지 않는다 —
 * 세션 URL 자체가 그 파일 하나에만 쓸 수 있는 일회용 자격이기 때문이다.
 *
 * 파일 바이트는 브라우저에서 Drive 로 곧장 간다. 이 서버를 통과하지 않으므로
 * 서버리스 요청 본문 크기 제한(버셀 4.5MB)과 무관하고, 2GB 영상도 올라간다.
 */
export async function POST(req: NextRequest) {
  if ((await currentRole()) !== 'admin') {
    return NextResponse.json({ error: '관리자만 올릴 수 있습니다' }, { status: 403 });
  }

  let body: { bundle_id?: string; filename?: string; mime?: string; size?: number };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: '잘못된 요청입니다' }, { status: 400 });
  }

  const { bundle_id: bundleId, filename, size } = body;
  if (!bundleId || !filename || !size) {
    return NextResponse.json({ error: '묶음·파일명·크기가 필요합니다' }, { status: 400 });
  }

  const { data: bundle } = await db()
    .from('bundle')
    .select('id, title')
    .eq('id', bundleId)
    .maybeSingle();
  if (!bundle) return NextResponse.json({ error: '묶음을 찾을 수 없습니다' }, { status: 404 });

  const mime = body.mime && body.mime !== '' ? body.mime : mimeFor(filename);

  try {
    const folderId = await ensureBundleFolder(bundle.id, bundle.title);
    const sessionUrl = await createUploadSession({ filename, mime, size, folderId });
    return NextResponse.json({ sessionUrl });
  } catch (e) {
    if (e instanceof DriveNotConnected) {
      return NextResponse.json({ error: e.message, needsConnect: true }, { status: 409 });
    }
    return NextResponse.json(
      { error: e instanceof Error ? e.message : '세션 생성 실패' },
      { status: 500 },
    );
  }
}
