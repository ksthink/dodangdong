import 'server-only';
import { createHash } from 'crypto';
import sharp from 'sharp';
import exifr from 'exifr';
import { db, BUCKET_DERIVATIVES, BUCKET_ORIGINALS } from './db';
import { dateToEdtf, edtfColumns } from './edtf';
import { downloadFile, fileMeta, type DriveFileMeta } from './drive';

/**
 * 적재 파이프라인.
 *
 * 원본은 Drive 에 그대로 있고, 여기서는 그것을 **색인**한다 —
 * 자료(item) 행을 만들고, 화면용 축소본을 Supabase 에 올리고, 시기·무결성 근거를 기록한다.
 *
 * 이미지는 내려받아 sha256·EXIF·축소본을 만든다.
 * 영상·음성은 내려받지 않는다. 서버 메모리로 감당할 크기가 아니고, 그럴 이유도 없다 —
 * Drive 가 주는 md5 로 무결성은 확인되고, 재생은 어차피 원본을 직접 쓴다.
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

/**
 * 내려받아 축소본을 만들 이미지의 상한.
 * 서버리스 함수의 메모리 안에서 안전하게 다룰 수 있는 범위로 잡는다.
 * 넘으면 원본은 그대로 두고 축소본만 포기한다 — 원본은 이미 Drive 에서 안전하다.
 */
const MAX_PROCESS_BYTES = 60 * 1024 * 1024;

const DERIVATIVES = [
  { role: 'thumb' as const, width: 400 },
  { role: 'display' as const, width: 1400 },
];

export interface IngestResult {
  status: 'created' | 'duplicate' | 'failed';
  itemId?: string;
  identifier?: string;
  title?: string;
  filename: string;
  /** 축소본을 만들지 못한 이유 (원본은 무사하다) */
  warning?: string;
  reason?: string;
}

/** 이미 등록된 파일인가. Drive id → md5 순으로 본다. */
async function findDuplicate(driveId: string, md5: string | null) {
  const supabase = db();
  const { data: byId } = await supabase
    .from('file')
    .select('id, item_id')
    .eq('storage_path', driveId)
    .eq('provider', 'gdrive')
    .eq('role', 'original')
    .maybeSingle();
  if (byId) return byId;

  if (md5) {
    const { data: byMd5 } = await supabase
      .from('file')
      .select('id, item_id')
      .eq('checksum_md5', md5)
      .eq('role', 'original')
      .maybeSingle();
    if (byMd5) return byMd5;
  }
  return null;
}

/**
 * Drive 에 올라온 파일 하나를 아카이브에 색인한다.
 * 브라우저가 Drive 로 직접 올린 뒤, 그 파일 id 를 가지고 이 함수가 불린다.
 */
export async function ingestDriveFile(opts: {
  bundleId: string;
  driveFileId: string;
}): Promise<IngestResult> {
  const supabase = db();

  let meta: DriveFileMeta;
  try {
    meta = await fileMeta(opts.driveFileId);
  } catch (e) {
    return {
      status: 'failed',
      filename: opts.driveFileId,
      reason: e instanceof Error ? e.message : 'Drive 조회 실패',
    };
  }

  const dupe = await findDuplicate(meta.id, meta.md5Checksum);
  if (dupe) {
    return { status: 'duplicate', filename: meta.name, itemId: dupe.item_id, reason: '이미 등록된 파일' };
  }

  const { data: bundle, error: bundleErr } = await supabase
    .from('bundle')
    .select('id, title, period_edtf')
    .eq('id', opts.bundleId)
    .single();
  if (bundleErr || !bundle) {
    return { status: 'failed', filename: meta.name, reason: '묶음을 찾을 수 없습니다' };
  }

  // Drive 가 보고한 mime 이 비어 있거나 일반적이면 확장자로 보정한다.
  const mime =
    meta.mimeType && meta.mimeType !== 'application/octet-stream'
      ? meta.mimeType
      : mimeFor(meta.name);
  const type = dcmiTypeFor(mime);

  const { count } = await supabase
    .from('item')
    .select('id', { count: 'exact', head: true })
    .eq('bundle_id', opts.bundleId);
  const seq = (count ?? 0) + 1;

  // ---- 이미지면 내려받아 실제로 확인한다
  let width: number | null = null;
  let height: number | null = null;
  let exif: Record<string, unknown> | null = null;
  let shotEdtf: string | null = null;
  let sha256: string | null = null;
  let buffer: Buffer | null = null;
  let warning: string | undefined;

  const processable = type === 'StillImage' && meta.size > 0 && meta.size <= MAX_PROCESS_BYTES;

  if (type === 'StillImage' && !processable) {
    warning = `원본이 커서(${Math.round(meta.size / 1024 / 1024)}MB) 축소본을 만들지 못했습니다`;
  }

  if (processable) {
    try {
      buffer = await downloadFile(meta.id);
      // 서버가 직접 읽어 계산한 체크섬만 무결성 근거로 삼는다.
      sha256 = createHash('sha256').update(buffer).digest('hex');
      const m = await sharp(buffer).metadata();
      width = m.width ?? null;
      height = m.height ?? null;
    } catch {
      warning = '원본을 내려받지 못해 축소본을 만들지 못했습니다';
      buffer = null;
    }

    if (buffer) {
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
  }

  // 시기: EXIF 촬영일시 > 묶음의 시기 범위 > 미상
  const createdEdtf = shotEdtf ?? bundle.period_edtf ?? null;

  const { data: item, error: itemErr } = await supabase
    .from('item')
    .insert({
      bundle_id: opts.bundleId,
      seq,
      title: `${bundle.title} ${String(seq).padStart(3, '0')}`,
      type,
      ...edtfColumns(createdEdtf),
    })
    .select('id, identifier, title')
    .single();

  if (itemErr || !item) {
    return { status: 'failed', filename: meta.name, reason: itemErr?.message ?? '자료 등록 실패' };
  }

  const fileRows: Record<string, unknown>[] = [
    {
      item_id: item.id,
      role: 'original',
      provider: 'gdrive',
      storage_bucket: 'gdrive',
      storage_path: meta.id,
      original_filename: meta.name,
      mime,
      bytes: meta.size,
      width,
      height,
      checksum_sha256: sha256,
      checksum_md5: meta.md5Checksum,
      // Drive 의 md5 는 Google 이 계산한 것이고, sha256 은 우리가 직접 읽어 계산한 것이다.
      checksum_verified: sha256 !== null,
      exif,
    },
  ];

  if (buffer && width) {
    for (const d of DERIVATIVES) {
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
            provider: 'supabase',
            storage_bucket: BUCKET_DERIVATIVES,
            storage_path: path,
            mime: 'image/jpeg',
            bytes: out.data.byteLength,
            width: out.info.width,
            height: out.info.height,
          });
        }
      } catch {
        /* 축소본 실패는 치명적이지 않다 — 원본은 Drive 에서 안전하다 */
      }
    }
  }

  await supabase.from('file').insert(fileRows);
  await supabase.from('event_log').insert({
    item_id: item.id,
    bundle_id: opts.bundleId,
    action: 'ingest_drive',
    after: { driveFileId: meta.id, filename: meta.name, mime, type, md5: meta.md5Checksum },
  });

  return {
    status: 'created',
    itemId: item.id,
    identifier: item.identifier,
    title: item.title,
    filename: meta.name,
    warning,
  };
}

/**
 * 바이트를 직접 받아 Supabase 에 원본까지 넣는 경로.
 * 개발용 시드와, Drive 를 쓰지 않는 소규모 운영을 위해 남겨둔다.
 */
export async function ingestBytes(opts: {
  bundleId: string;
  filename: string;
  buffer: Buffer;
}): Promise<IngestResult> {
  const supabase = db();
  const { bundleId, filename, buffer } = opts;
  const checksum = createHash('sha256').update(buffer).digest('hex');

  const { data: dupe } = await supabase
    .from('file')
    .select('id, item_id')
    .eq('checksum_sha256', checksum)
    .eq('role', 'original')
    .maybeSingle();
  if (dupe) {
    return { status: 'duplicate', filename, itemId: dupe.item_id, reason: '이미 등록된 파일' };
  }

  const { data: bundle } = await supabase
    .from('bundle')
    .select('id, title, period_edtf')
    .eq('id', bundleId)
    .single();
  if (!bundle) return { status: 'failed', filename, reason: '묶음을 찾을 수 없습니다' };

  const mime = mimeFor(filename);
  const type = dcmiTypeFor(mime);

  const { count } = await supabase
    .from('item')
    .select('id', { count: 'exact', head: true })
    .eq('bundle_id', bundleId);
  const seq = (count ?? 0) + 1;

  let width: number | null = null;
  let height: number | null = null;
  let exif: Record<string, unknown> | null = null;
  let shotEdtf: string | null = null;

  if (type === 'StillImage') {
    try {
      const m = await sharp(buffer).metadata();
      width = m.width ?? null;
      height = m.height ?? null;
    } catch {
      /* 손상된 이미지도 원본은 보관한다 */
    }
    try {
      const parsed = await exifr.parse(buffer, ['DateTimeOriginal', 'CreateDate']);
      if (parsed) {
        exif = parsed as Record<string, unknown>;
        const shot = (parsed.DateTimeOriginal ?? parsed.CreateDate) as Date | undefined;
        if (shot instanceof Date && !Number.isNaN(shot.getTime())) shotEdtf = dateToEdtf(shot);
      }
    } catch {
      /* 없어도 정상 */
    }
  }

  const { data: item, error: itemErr } = await supabase
    .from('item')
    .insert({
      bundle_id: bundleId,
      seq,
      title: `${bundle.title} ${String(seq).padStart(3, '0')}`,
      type,
      ...edtfColumns(shotEdtf ?? bundle.period_edtf ?? null),
    })
    .select('id, identifier, title')
    .single();
  if (itemErr || !item) {
    return { status: 'failed', filename, reason: itemErr?.message ?? '자료 등록 실패' };
  }

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
      provider: 'supabase',
      storage_bucket: BUCKET_ORIGINALS,
      storage_path: originalPath,
      original_filename: filename,
      mime,
      bytes: buffer.byteLength,
      width,
      height,
      checksum_sha256: checksum,
      checksum_verified: true,
      exif,
    },
  ];

  if (type === 'StillImage' && width) {
    for (const d of DERIVATIVES) {
      try {
        const out = await sharp(buffer)
          .rotate()
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
            provider: 'supabase',
            storage_bucket: BUCKET_DERIVATIVES,
            storage_path: path,
            mime: 'image/jpeg',
            bytes: out.data.byteLength,
            width: out.info.width,
            height: out.info.height,
          });
        }
      } catch {
        /* 축소본 실패는 치명적이지 않다 */
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

  return { status: 'created', itemId: item.id, identifier: item.identifier, title: item.title, filename };
}
