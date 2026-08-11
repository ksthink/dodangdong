import { NextRequest, NextResponse } from 'next/server';
import { currentRole } from '@/lib/access';
import { ingestDriveFile } from '@/lib/ingest';
import { deleteFile } from '@/lib/drive';

export const runtime = 'nodejs';
// 이미지를 내려받아 축소본을 만드는 시간. 버셀 Hobby 상한이 60초다.
export const maxDuration = 60;

/**
 * Drive 로 올라간 파일을 아카이브에 색인한다.
 * 브라우저가 업로드를 마친 뒤 Drive file id 를 들고 여기로 온다.
 */
export async function POST(req: NextRequest) {
  if ((await currentRole()) !== 'admin') {
    return NextResponse.json({ error: '관리자만 올릴 수 있습니다' }, { status: 403 });
  }

  let body: { bundle_id?: string; drive_file_id?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: '잘못된 요청입니다' }, { status: 400 });
  }

  const { bundle_id: bundleId, drive_file_id: driveFileId } = body;
  if (!bundleId || !driveFileId) {
    return NextResponse.json({ error: '묶음과 파일 id 가 필요합니다' }, { status: 400 });
  }

  const result = await ingestDriveFile({ bundleId, driveFileId });

  // 색인에 실패했다면 Drive 에 남은 파일을 치운다. 아카이브에 없는데 Drive 에만
  // 있는 파일은 나중에 정체를 알 수 없는 잔해가 된다.
  if (result.status === 'failed') {
    try {
      await deleteFile(driveFileId);
    } catch {
      /* 치우기 실패는 색인 실패보다 덜 중요하다 */
    }
  }

  return NextResponse.json(result, { status: result.status === 'failed' ? 500 : 200 });
}
