import 'server-only';
import { createHash } from 'crypto';
import sharp from 'sharp';
import exifr from 'exifr';
import { db, BUCKET_ORIGINALS, BUCKET_DERIVATIVES } from './db';
import { dateToEdtf, edtfColumns } from './edtf';

/**
 * 적재 파이프라인.
 *
 * 원본은 손대지 않고 그대로 originals 버킷에 넣고, 화면용 축소본만 만들어
 * derivatives 버킷에 둔다. 축소본은 언제든 원본에서 다시 만들 수 있으므로
 * 사라져도 복구된다.
 *
 * 낱장은 등록 시점에 묶음 값을 상속한 상태다 — 상속 필드를 NULL 로 두는 것이
 * 곧 "물려받는 중"이라는 뜻이므로, 여기서는 아무것도 채우지 않는다.
 */

const MIME_BY_EXT: Record<string, string> = {
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  png: 'image/png',
  webp: 'image/webp',
  tif: 'image/tiff',
  tiff: 'image/tiff',
  heic: 'image/heic',
  gif: 'image/gif',
  mp3: 'audio/mpeg',
  m4a: 'audio/mp4',
  wav: 'audio/wav',
  flac: 'audio/flac',
  ogg: 'audio/ogg',
  mp4: 'video/mp4',
  mov: 'video/quicktime',
  avi: 'video/x-msvideo',
  mkv: 'video/x-matroska',
  pdf: 'application/pdf',
  txt: 'text/plain',
  md: 'text/markdown',
};

export type DcmiType =
  | 'StillImage'
  | 'Sound'
  | 'MovingImage'
  | 'Text'
  | 'PhysicalObject'
  | 'Collection'
  | 'Event';

export function mimeFor(filename: string): string {
  const ext = filename.split('.').pop()?.toLowerCase() ?? '';
  return MIME_BY_EXT[ext] ?? 'application/octet-stream';
}

/** DCMI Type Vocabulary 로만 분류한다. 자유 문자열을 만들지 않는다. */
export function dcmiTypeFor(mime: string): DcmiType {
  if (mime.startsWith('image/')) return 'StillImage';
  if (mime.startsWith('audio/')) return 'Sound';
  if (mime.startsWith('video/')) return 'MovingImage';
  if (mime === 'application/pdf' || mime.startsWith('text/')) return 'Text';
  return 'PhysicalObject';
}

export interface IngestInput {
  bundleId: string;
  filename: string;
  buffer: Buffer;
}

export interface IngestResult {
  status: 'created' | 'duplicate' | 'failed';
  itemId?: string;
  identifier?: string;
  title?: string;
  filename: string;
  reason?: string;
}

const DERIVATIVES = [
  { role: 'thumb' as const, width: 400 },
  { role: 'display' as const, width: 1400 },
];

export async function ingestFile({ bundleId, filename, buffer }: IngestInput): Promise<IngestResult> {
  const supabase = db();
  const checksum = createHash('sha256').update(buffer).digest('hex');

  // 같은 원본이 이미 있으면 두 번 넣지 않는다. 여러 친척에게서 같은 사진을
  // 받는 일이 흔하므로, 이 검사가 실제로 자주 걸린다.
  const { data: dupe } = await supabase
    .from('file')
    .select('id, item_id')
    .eq('checksum_sha256', checksum)
    .eq('role', 'original')
    .maybeSingle();
  if (dupe) {
    return { status: 'duplicate', filename, itemId: dupe.item_id, reason: '이미 등록된 파일' };
  }

  const { data: bundle, error: bundleErr } = await supabase
    .from('bundle')
    .select('id, title, period_edtf')
    .eq('id', bundleId)
    .single();
  if (bundleErr || !bundle) {
    return { status: 'failed', filename, reason: '묶음을 찾을 수 없습니다' };
  }

  const mime = mimeFor(filename);
  const type = dcmiTypeFor(mime);

  // 묶음 안에서의 순번
  const { count } = await supabase
    .from('item')
    .select('id', { count: 'exact', head: true })
    .eq('bundle_id', bundleId);
  const seq = (count ?? 0) + 1;

  // 이미지면 크기와 촬영일시를 뽑아 둔다. 시기가 자동으로 채워지면
  // 관리자가 낱장에서 손댈 일이 사실상 없어진다.
  let width: number | null = null;
  let height: number | null = null;
  let exif: Record<string, unknown> | null = null;
  let shotEdtf: string | null = null;

  if (type === 'StillImage') {
    try {
      const meta = await sharp(buffer).metadata();
      width = meta.width ?? null;
      height = meta.height ?? null;
    } catch {
      // 손상된 이미지도 원본은 보관한다. 축소본만 포기한다.
    }
    try {
      const parsed = await exifr.parse(buffer, ['DateTimeOriginal', 'CreateDate', 'Make', 'Model']);
      if (parsed) {
        exif = parsed as Record<string, unknown>;
        const shot = (parsed.DateTimeOriginal ?? parsed.CreateDate) as Date | undefined;
        if (shot instanceof Date && !Number.isNaN(shot.getTime())) {
          shotEdtf = dateToEdtf(shot);
        }
      }
    } catch {
      /* EXIF 가 없어도 정상이다 — 스캔본에는 대개 없다 */
    }
  }

  // 시기: EXIF 촬영일시 > 묶음의 시기 범위 > 미상
  const createdEdtf = shotEdtf ?? bundle.period_edtf ?? null;

  const { data: item, error: itemErr } = await supabase
    .from('item')
    .insert({
      bundle_id: bundleId,
      seq,
      title: `${bundle.title} ${String(seq).padStart(3, '0')}`,
      type,
      ...edtfColumns(createdEdtf),
    })
    .select('id, identifier, title')
    .single();

  if (itemErr || !item) {
    return { status: 'failed', filename, reason: itemErr?.message ?? '자료 등록 실패' };
  }

  // 스토리지 키는 ASCII 만 허용된다. 파일명에 의미를 담지 않는 것이 원칙이므로
  // 경로는 기계적으로 짓고, 원래 이름은 file.original_filename 에 남긴다.
  const ext = filename.includes('.') ? filename.split('.').pop()!.toLowerCase() : 'bin';
  const safeExt = /^[a-z0-9]{1,8}$/.test(ext) ? ext : 'bin';
  const originalPath = `${bundleId}/${item.id}/original.${safeExt}`;

  const up = await supabase.storage
    .from(BUCKET_ORIGINALS)
    .upload(originalPath, buffer, { contentType: mime, upsert: false });
  if (up.error) {
    await supabase.from('item').delete().eq('id', item.id);
    return { status: 'failed', filename, reason: `원본 업로드 실패: ${up.error.message}` };
  }

  const fileRows: Record<string, unknown>[] = [
    {
      item_id: item.id,
      role: 'original',
      storage_bucket: BUCKET_ORIGINALS,
      storage_path: originalPath,
      original_filename: filename,
      mime,
      bytes: buffer.byteLength,
      width,
      height,
      checksum_sha256: checksum,
      exif,
    },
  ];

  if (type === 'StillImage' && width) {
    for (const d of DERIVATIVES) {
      // 원본보다 키우지는 않되, 축소본은 항상 만든다.
      // 원본이 TIFF·HEIC 면 브라우저가 못 여는데, 화면용 JPEG 이 없으면
      // 자료가 있어도 보이지 않는 상태가 된다.
      try {
        const out = await sharp(buffer)
          .rotate() // EXIF 방향 반영
          .resize({ width: Math.min(d.width, width), withoutEnlargement: true })
          .jpeg({ quality: 82, progressive: true })
          .toBuffer({ resolveWithObject: true });
        const path = `${item.id}/${d.role}.jpg`;
        const res = await supabase.storage
          .from(BUCKET_DERIVATIVES)
          .upload(path, out.data, { contentType: 'image/jpeg', upsert: true });
        if (!res.error) {
          fileRows.push({
            item_id: item.id,
            role: d.role,
            storage_bucket: BUCKET_DERIVATIVES,
            storage_path: path,
            mime: 'image/jpeg',
            bytes: out.data.byteLength,
            width: out.info.width,
            height: out.info.height,
          });
        }
      } catch {
        /* 축소본 실패는 치명적이지 않다 — 원본은 이미 안전하다 */
      }
    }
  }

  await supabase.from('file').insert(fileRows);
  await supabase.from('event_log').insert({
    item_id: item.id,
    bundle_id: bundleId,
    action: 'ingest',
    after: { filename, checksum, mime, type },
  });

  return {
    status: 'created',
    itemId: item.id,
    identifier: item.identifier,
    title: item.title,
    filename,
  };
}
