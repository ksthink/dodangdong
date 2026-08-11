import { NextRequest, NextResponse } from 'next/server';
import { currentRole } from '@/lib/access';
import { ingestFile } from '@/lib/ingest';

export const runtime = 'nodejs';
export const maxDuration = 300;

/**
 * 적재 창구.
 *
 * 파일은 한 번에 하나씩 받는다 — 수천 장을 한 요청에 몰아넣으면 메모리도 문제지만,
 * 중간에 하나가 실패했을 때 무엇이 들어갔고 무엇이 안 들어갔는지 알 수 없게 된다.
 * 브라우저가 순서대로 보내면서 진행 상황을 그대로 보여주는 편이 낫다.
 */
export async function POST(req: NextRequest) {
  if ((await currentRole()) !== 'admin') {
    return NextResponse.json({ error: '관리자만 올릴 수 있습니다' }, { status: 403 });
  }

  const form = await req.formData();
  const bundleId = String(form.get('bundle_id') ?? '');
  const file = form.get('file');

  if (!bundleId) return NextResponse.json({ error: '묶음이 지정되지 않았습니다' }, { status: 400 });
  if (!(file instanceof File)) {
    return NextResponse.json({ error: '파일이 없습니다' }, { status: 400 });
  }

  const buffer = Buffer.from(await file.arrayBuffer());
  const result = await ingestFile({ bundleId, filename: file.name, buffer });

  return NextResponse.json(result, { status: result.status === 'failed' ? 500 : 200 });
}
