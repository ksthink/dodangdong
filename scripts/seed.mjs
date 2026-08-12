/**
 * 시드 — 개발용 표본 자료.
 *
 * 운영 적재는 브라우저 → Google Drive 직행이지만, 시드는 Drive 연결 없이도 돌아야 하므로
 * Supabase 원본 경로를 쓴다. 체크섬·축소본 생성은 실제와 같은 방식으로 거친다.
 *
 *   npm run seed        (dev 서버 없이도 동작)
 */

import { createClient } from '@supabase/supabase-js';
import { createHash } from 'node:crypto';
import sharp from 'sharp';
import { readFileSync } from 'node:fs';

const env = Object.fromEntries(
  readFileSync(new URL('../.env.local', import.meta.url), 'utf8')
    .split('\n')
    .filter((l) => l.trim() && !l.startsWith('#'))
    .map((l) => {
      const i = l.indexOf('=');
      return [l.slice(0, i).trim(), l.slice(i + 1).trim()];
    }),
);

const supabase = createClient(env.SUPABASE_URL, env.SUPABASE_SECRET_KEY, {
  auth: { persistSession: false },
});

// ---------------------------------------------------------------- 표본 파일

const PALETTES = [
  ['#8FA3B8', '#4A5A6E', '#D8DEE6'],
  ['#B8A48F', '#6E5F4A', '#E6E0D8'],
  ['#94AD9C', '#4F6455', '#DCE6DE'],
  ['#AD9494', '#644F4F', '#E6DCDC'],
];

/** 픽셀아트풍 표본 사진. 실제 스캔본 대신 구조를 보여주기 위한 것. */
async function samplePhoto(seed, label) {
  const [bg, fg, hi] = PALETTES[seed % PALETTES.length];
  const w = 1200;
  const h = 900;
  const px = 24; // 픽셀 크기
  const rects = [];
  // 지평선
  const horizon = 12 + (seed % 6);
  for (let y = horizon; y < h / px; y++) {
    for (let x = 0; x < w / px; x++) {
      if ((x + y + seed) % 7 === 0) {
        rects.push(`<rect x="${x * px}" y="${y * px}" width="${px}" height="${px}" fill="${hi}" opacity="0.35"/>`);
      }
    }
  }
  // 인물 실루엣 몇 개
  const figures = 1 + (seed % 3);
  for (let f = 0; f < figures; f++) {
    const cx = ((f + 1) * w) / (figures + 1);
    const base = horizon * px;
    rects.push(`<rect x="${cx - px * 1.5}" y="${base - px * 5}" width="${px * 3}" height="${px * 3}" fill="${fg}"/>`);
    rects.push(`<rect x="${cx - px * 2.5}" y="${base - px * 2}" width="${px * 5}" height="${px * 2}" fill="${fg}"/>`);
  }
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}">
    <rect width="${w}" height="${h}" fill="${bg}"/>
    <rect y="${horizon * px}" width="${w}" height="${h}" fill="${fg}" opacity="0.25"/>
    ${rects.join('')}
    <text x="${px}" y="${h - px}" font-family="monospace" font-size="28" fill="${fg}">${label}</text>
  </svg>`;
  return sharp(Buffer.from(svg)).jpeg({ quality: 88 }).toBuffer();
}

/** 3초짜리 무음에 가까운 WAV — 음성 자료의 재생 경로를 확인하기 위한 것. */
function sampleWav(seconds = 3) {
  const rate = 8000;
  const n = rate * seconds;
  const data = Buffer.alloc(n * 2);
  for (let i = 0; i < n; i++) {
    const v = Math.round(Math.sin((i / rate) * 2 * Math.PI * 220) * 1200);
    data.writeInt16LE(v, i * 2);
  }
  const header = Buffer.alloc(44);
  header.write('RIFF', 0);
  header.writeUInt32LE(36 + data.length, 4);
  header.write('WAVE', 8);
  header.write('fmt ', 12);
  header.writeUInt32LE(16, 16);
  header.writeUInt16LE(1, 20);
  header.writeUInt16LE(1, 22);
  header.writeUInt32LE(rate, 24);
  header.writeUInt32LE(rate * 2, 28);
  header.writeUInt16LE(2, 32);
  header.writeUInt16LE(16, 34);
  header.write('data', 36);
  header.writeUInt32LE(data.length, 40);
  return Buffer.concat([header, data]);
}

/**
 * 표본 자료 적재.
 *
 * 운영에서는 브라우저 → Drive 직행 경로를 쓰지만, 시드는 Drive 연결 없이도 돌아야 하므로
 * Supabase 원본 경로(provider = 'supabase')를 쓴다. src/lib/ingest.ts 의 ingestBytes 와
 * 같은 일을 하며, 개발용 픽스처라 중복을 감수한다.
 */
async function upload(bundleId, filename, buffer, mime) {
  const checksum = createHash('sha256').update(buffer).digest('hex');

  const { data: dupe } = await supabase
    .from('file').select('item_id').eq('checksum_sha256', checksum).eq('role', 'original').maybeSingle();
  if (dupe) return { status: 'duplicate', itemId: dupe.item_id };

  const { data: bundle } = await supabase
    .from('bundle').select('id, title, period_edtf').eq('id', bundleId).single();

  const type = mime.startsWith('image/') ? 'StillImage'
    : mime.startsWith('audio/') ? 'Sound'
    : mime.startsWith('video/') ? 'MovingImage'
    : mime.startsWith('text/') || mime === 'application/pdf' ? 'Text'
    : 'PhysicalObject';

  const { count } = await supabase
    .from('item').select('id', { count: 'exact', head: true }).eq('bundle_id', bundleId);
  const seq = (count ?? 0) + 1;

  let width = null, height = null;
  if (type === 'StillImage') {
    try { const m = await sharp(buffer).metadata(); width = m.width; height = m.height; } catch {}
  }

  const edtf = bundle.period_edtf ?? null;
  const { data: item, error } = await supabase.from('item').insert({
    bundle_id: bundleId,
    seq,
    title: `${bundle.title} ${String(seq).padStart(3, '0')}`,
    type,
    created_edtf: edtf,
    created_start: edtf ? `${edtf.slice(0, 4).replace(/X/g, '0')}-01-01` : null,
    created_end: edtf ? `${edtf.slice(0, 4).replace(/X/g, '9')}-12-31` : null,
    created_precision: edtf ? (edtf.includes('X') ? 'decade' : edtf.includes('/') ? 'interval' : 'year') : 'unknown',
  }).select('id, identifier, title').single();
  if (error) { console.log(`   ! ${filename}: ${error.message}`); return { status: 'failed' }; }

  const ext = filename.split('.').pop().toLowerCase();
  const originalPath = `${bundleId}/${item.id}/original.${ext}`;
  const up = await supabase.storage.from('originals').upload(originalPath, buffer, { contentType: mime });
  if (up.error) { console.log(`   ! ${filename}: ${up.error.message}`); return { status: 'failed' }; }

  const rows = [{
    item_id: item.id, role: 'original', provider: 'supabase',
    storage_bucket: 'originals', storage_path: originalPath, original_filename: filename,
    mime, bytes: buffer.byteLength, width, height,
    checksum_sha256: checksum, checksum_verified: true,
  }];

  if (type === 'StillImage' && width) {
    for (const d of [{ role: 'thumb', width: 400 }, { role: 'display', width: 1400 }]) {
      const out = await sharp(buffer).rotate()
        .resize({ width: Math.min(d.width, width), withoutEnlargement: true })
        .jpeg({ quality: 82, progressive: true }).toBuffer({ resolveWithObject: true });
      const path = `${item.id}/${d.role}.jpg`;
      const res = await supabase.storage.from('derivatives')
        .upload(path, out.data, { contentType: 'image/jpeg', upsert: true });
      if (!res.error) rows.push({
        item_id: item.id, role: d.role, provider: 'supabase',
        storage_bucket: 'derivatives', storage_path: path, mime: 'image/jpeg',
        bytes: out.data.byteLength, width: out.info.width, height: out.info.height,
      });
    }
  }

  // PostgREST 는 배열 삽입 시 모든 원소의 키가 같기를 요구한다(PGRST102).
  const COLS = ['item_id','role','provider','storage_bucket','storage_path','original_filename',
    'mime','bytes','width','height','duration_ms','checksum_sha256','checksum_md5','checksum_verified','exif'];
  const norm = rows.map((r) => Object.fromEntries(COLS.map((c) => [c, c === 'checksum_verified' ? (r[c] ?? false) : (r[c] ?? null)])));
  const { error: fileErr } = await supabase.from('file').insert(norm);
  if (fileErr) { console.log(`   ! ${filename}: 파일 등록 실패 ${fileErr.message}`); return { status: 'failed' }; }
  return { status: 'created', itemId: item.id, identifier: item.identifier };
}

// ---------------------------------------------------------------- 시드 본문

async function main() {
  console.log('시드 시작');

  // 기존 시드 정리(파일까지)
  const { data: oldItems } = await supabase.from('item').select('id');
  if (oldItems?.length) {
    for (const bucket of ['originals', 'derivatives']) {
      const { data: files } = await supabase.from('file').select('storage_path').eq('storage_bucket', bucket);
      if (files?.length) {
        await supabase.storage.from(bucket).remove(files.map((f) => f.storage_path));
      }
    }
  }
  for (const t of ['item_collection', 'item_person', 'transcript', 'event_log', 'file', 'item', 'collection', 'bundle', 'acquisition', 'person', 'place']) {
    await supabase.from(t).delete().neq('id', '00000000-0000-0000-0000-000000000000');
  }

  // ---- 전거
  const { data: people } = await supabase
    .from('person')
    .insert([
      { display_name: '김순덕', aliases: ['할머니', '순덕이', '어머니'], relation_to_root: '중심 인물', birth_edtf: '1935', note: '경북 안동 출생. 1971년 부산 초량으로 이주.' },
      { display_name: '박영수', aliases: ['할아버지', '아버지'], relation_to_root: '배우자', birth_edtf: '1931', death_edtf: '2004' },
      { display_name: '박정선', aliases: ['큰아버지'], relation_to_root: '장남', birth_edtf: '1959' },
      { display_name: '증조할머니', aliases: ['왕할머니'], relation_to_root: '어머니', birth_edtf: '190X' },
    ])
    .select('id, display_name');
  const P = Object.fromEntries(people.map((p) => [p.display_name, p.id]));

  const { data: places } = await supabase
    .from('place')
    .insert([
      { family_name: '안동 본가', admin_name: '경상북도 안동시 도산면' },
      { family_name: '초량 가게', admin_name: '부산광역시 동구 초량동', note: '1971~1991 운영. 지금은 없어짐.' },
    ])
    .select('id, family_name');
  const PL = Object.fromEntries(places.map((p) => [p.family_name, p.id]));

  // ---- 수집 세션
  const { data: acq } = await supabase
    .from('acquisition')
    .insert([
      { visited_on: '2026-03-14', from_label: '큰아버지', location: '안동 본가 다락', note: '앨범 3권, 편지 다발 하나, 카세트 2개' },
      { visited_on: '2026-05-02', from_label: '작은고모', location: '부산 자택', note: '가게 사진 상자 하나' },
    ])
    .select('id');

  // ---- 묶음 (여기서 채운 값이 낱장으로 흘러간다)
  const { data: bundles } = await supabase
    .from('bundle')
    .insert([
      {
        acquisition_id: acq[0].id,
        title: '큰아버지 앨범 3권',
        kind: 'album',
        source: '큰아버지 댁 다락, 앨범 3권',
        provenance: '2026-03 방문 수습, 600dpi 직접 스캔',
        place_id: PL['안동 본가'],
        rights: '가족 내부 열람용, 외부 재배포 불가',
        default_access_level: 'family',
        period_edtf: '1958',
        period_start: '1958-01-01',
        period_end: '1958-12-31',
        digitized_by: '직접 스캔 (Epson V600)',
        digitized_on: '2026-03-20',
      },
      {
        acquisition_id: acq[1].id,
        title: '초량 가게 사진 상자',
        kind: 'folder',
        source: '작은고모 보관 상자',
        provenance: '2026-05 방문 수습',
        place_id: PL['초량 가게'],
        rights: '가족 내부 열람용',
        default_access_level: 'public',
        period_edtf: '1971/1991',
        period_start: '1971-01-01',
        period_end: '1991-12-31',
        digitized_by: '직접 스캔',
      },
      {
        acquisition_id: acq[0].id,
        title: '2019 구술 인터뷰',
        kind: 'tape',
        source: '큰아버지 댁, 카세트 2개',
        provenance: '2026-03 수습 후 직접 디지털화',
        rights: '가족 내부 열람용',
        default_access_level: 'family',
        period_edtf: '2019',
        period_start: '2019-01-01',
        period_end: '2019-12-31',
      },
      {
        acquisition_id: acq[0].id,
        title: '주고받은 편지 다발',
        kind: 'bundle',
        source: '큰아버지 댁 다락, 상자 안 편지 다발',
        provenance: '2026-03 방문 수습',
        rights: '가족 내부 열람용',
        default_access_level: 'family',
        period_edtf: '196X',
        period_start: '1960-01-01',
        period_end: '1969-12-31',
      },
    ])
    .select('id, title');
  const B = Object.fromEntries(bundles.map((b) => [b.title, b.id]));
  console.log('묶음 4개 생성');

  // ---- 적재 (실제 파이프라인 통과)
  const created = { album: [], shop: [], tape: [], letters: [] };

  for (let i = 1; i <= 8; i++) {
    const buf = await samplePhoto(i, `1958 anniv ${String(i).padStart(2, '0')}`);
    const r = await upload(B['큰아버지 앨범 3권'], `1958_혼례_${String(i).padStart(2, '0')}.jpg`, buf, 'image/jpeg');
    if (r.itemId) created.album.push(r.itemId);
  }
  console.log(`  앨범 ${created.album.length}건`);

  for (let i = 1; i <= 6; i++) {
    const buf = await samplePhoto(i + 10, `choryang ${1971 + i * 3}`);
    const r = await upload(B['초량 가게 사진 상자'], `초량_가게앞_${1971 + i * 3}.jpg`, buf, 'image/jpeg');
    if (r.itemId) created.shop.push(r.itemId);
  }
  console.log(`  가게 ${created.shop.length}건`);

  {
    const r = await upload(B['2019 구술 인터뷰'], '2019_인터뷰_1부.wav', sampleWav(4), 'audio/wav');
    if (r.itemId) created.tape.push(r.itemId);
    const note = Buffer.from(
      '2019년 구술 인터뷰 1부 받아쓰기\n\n낙동강을 건넌 이야기, 혼례 준비, 초량 가게를 연 경위.\n',
      'utf8',
    );
    const r2 = await upload(B['2019 구술 인터뷰'], '2019_인터뷰_받아쓰기.txt', note, 'text/plain');
    if (r2.itemId) created.tape.push(r2.itemId);
  }
  console.log(`  인터뷰 ${created.tape.length}건`);

  for (let i = 1; i <= 3; i++) {
    const buf = await samplePhoto(i + 20, `letter ${i}`);
    const r = await upload(B['주고받은 편지 다발'], `196X_서신_${String(i).padStart(2, '0')}.jpg`, buf, 'image/jpeg');
    if (r.itemId) created.letters.push(r.itemId);
  }
  console.log(`  편지 ${created.letters.length}건`);

  // ---- 선별 상세 기술 (대표만 깊게)
  await supabase
    .from('item')
    .update({
      title: '혼례를 마치고, 마당에서',
      created_edtf: '1958-04-12',
      created_start: '1958-04-12',
      created_end: '1958-04-12',
      created_precision: 'day',
      description:
        '앞줄 가운데가 할머니. 오른쪽 끝에서 두 번째가 증조할머니로, 이 사진이 증조할머니가 남긴 유일한 사진입니다.',
      medium: '흑백 인화지',
      extent: '89×127mm',
      creator: '미상 (동네 사진관)',
      is_featured: true,
    })
    .eq('id', created.album[0]);

  await supabase
    .from('item')
    .update({
      title: '가게 앞에서, 첫 해',
      created_edtf: '1971',
      created_start: '1971-01-01',
      created_end: '1971-12-31',
      created_precision: 'year',
      description: '초량시장에 가게를 연 해. 이후 스무 해 동안 같은 자리에서 한 장씩 찍었습니다.',
      is_featured: true,
    })
    .eq('id', created.shop[0]);

  // 낱장이 묶음 등급을 덮어쓰는 예 — 편지 한 통만 비공개
  await supabase
    .from('item')
    .update({
      title: '가계부에 끼워져 있던 쪽지',
      access_level: 'private',
      created_edtf: '1964?',
      created_start: '1964-01-01',
      created_end: '1964-12-31',
      created_precision: 'year',
      created_uncertain: true,
      description: '내용이 사적이라 비공개로 두었습니다. 존재만 남깁니다.',
    })
    .eq('id', created.letters[2]);

  await supabase
    .from('item')
    .update({
      title: '여든넷의 구술 인터뷰 1부',
      description: '피란길, 혼례, 가게를 연 경위. 총 4시간 20분 중 첫 대목.',
      is_featured: true,
      extent: '04분 00초',
    })
    .eq('id', created.tape[0]);

  // 가게 사진은 해마다 한 장 — 시기를 흩어 놓는다
  for (let i = 1; i < created.shop.length; i++) {
    const year = 1971 + i * 3;
    await supabase
      .from('item')
      .update({
        title: `가게 앞에서, ${year}년`,
        created_edtf: String(year),
        created_start: `${year}-01-01`,
        created_end: `${year}-12-31`,
        created_precision: 'year',
      })
      .eq('id', created.shop[i]);
  }

  // ---- 인물 연결
  await supabase.from('item_person').insert([
    { item_id: created.album[0], person_id: P['김순덕'], role: 'depicted' },
    { item_id: created.album[0], person_id: P['박영수'], role: 'depicted' },
    { item_id: created.album[0], person_id: P['증조할머니'], role: 'depicted' },
    { item_id: created.album[1], person_id: P['김순덕'], role: 'depicted' },
    { item_id: created.shop[0], person_id: P['김순덕'], role: 'depicted' },
    { item_id: created.tape[0], person_id: P['김순덕'], role: 'speaker' },
  ]);

  // ---- 전사 (자동, 교정 전)
  await supabase.from('transcript').insert({
    item_id: created.tape[0],
    source: 'auto',
    reviewed: false,
    segments: [
      { start_ms: 134000, end_ms: 141000, text: '그날 아침에 비가 왔거든.' },
      { start_ms: 141000, end_ms: 155000, text: '마당이 질어서 신발을 벗고 섰다. 사진에는 안 보이지.' },
      { start_ms: 155000, end_ms: 168000, text: '저기 뒤에 선 분이 우리 어머니다.' },
    ],
    full_text: '그날 아침에 비가 왔거든. 마당이 질어서 신발을 벗고 섰다. 저기 뒤에 선 분이 우리 어머니다.',
  });

  // ---- 모음집
  const { data: cols } = await supabase
    .from('collection')
    .insert([
      {
        title: '초량시장 가게 앞에서',
        kind: 'topic',
        description: '해마다 같은 자리에서 찍은 사진을 나란히 놓고 보는 이야기',
        period_edtf: '1971/1991',
        cover_item_id: created.shop[0],
        sort_order: 1,
      },
      {
        title: '1958년 혼례',
        kind: 'event',
        description: '안동에서 대구로. 사진 여덟 장과 서신 두 통이 남아 있습니다.',
        period_edtf: '1958',
        cover_item_id: created.album[0],
        sort_order: 2,
      },
    ])
    .select('id, title');

  await supabase.from('item_collection').insert([
    ...created.shop.map((id, i) => ({ item_id: id, collection_id: cols[0].id, sort_order: i })),
    ...created.album.map((id, i) => ({ item_id: id, collection_id: cols[1].id, sort_order: i })),
  ]);

  const { count } = await supabase.from('item').select('id', { count: 'exact', head: true });
  console.log(`\n완료 — 자료 ${count}건, 묶음 4개, 모음집 2개, 인물 4명`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
