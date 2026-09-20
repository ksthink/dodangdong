import 'server-only';
import { db } from './db';
import { canView, type Role, type AccessLevel } from './access';
import { typeLabel, shortName } from './chronicle';
import { thumbsFor, type ItemRow } from './queries';
import type { RecordMeta } from '@/components/record/MetadataTable';

/**
 * 기록 하나.
 *
 * 이 아카이브의 중심 화면이다. 사진이나 문서 한 장을 보여주는 일보다,
 * 그것에 대해 우리가 아는 것을 빠짐없이 펼쳐 보이는 일이 더 중요하다 —
 * 사진은 언젠가 빛이 바래지만 기술(記述)은 바래지 않는다.
 *
 * 그래서 상세정보 표를 접어 두지 않고 설명 바로 아래에 펼친다. 모르는
 * 것은 모른다고 쓰고, 아는 것은 어디서 알았는지까지 적는다.
 */

export interface RecordDetail {
  item: ItemRow;
  /** 상세정보 표가 그대로 받는 모양 */
  meta: RecordMeta;
  /** 사진이 여러 장이면 갤러리로, 한 장이면 크게 */
  photos: { src: string; thumb: string | null; alt: string; identifier: string }[];
  /** 관리자만 받는다. 원본은 Drive 또는 스토리지에 있다. */
  original: { id: string; label: string } | null;
  audio: { src: string; mime: string | null } | null;
  related: { title: string; href: string | null; type: string | null; date: string | null }[];
  stories: { id: string; title: string }[];
  /** 분류 경로 — 페이지 머리의 빵부스러기 */
  crumbs: { label: string; href?: string }[];
  /** 화면 끝의 이용조건 구획. 표 14행과 같은 사실을 사람이 읽는 말로 푼다. */
  terms: RecordTerms;
  transcript: { segments: { start_ms: number; end_ms: number; text: string }[] } | null;
}

/**
 * 이용조건.
 *
 * 표 14행에도 한 줄로 적지만, 화면 끝에 구획을 따로 둔다 — 표의 한 칸은
 * 나머지 열세 줄과 같은 무게로 읽히는데, 이 기록을 밖으로 내보내도 되는지는
 * 같은 무게로 읽혀서는 안 되는 사실이다.
 */
export interface RecordTerms {
  /** 공개 범위를 사람이 읽는 말로. */
  access: string;
  /** dc:rights 원문. 관리자가 따로 적어 둔 말이 있으면 그대로 옮긴다. */
  rights: string | null;
  /** 참이면 기계 학습에 쓰지 않는다. 기본이 참이다(20260920000400_physical.sql). */
  aiOptout: boolean;
  /** 실물이 지금 어디 있는가. 디지털 사본이 있다고 종이가 사라지지는 않는다. */
  physicalLocation: string | null;
  physicalCondition: string | null;
}

const ROLE_KO: Record<string, string> = {
  depicted: '등장인물',
  photographer: '촬영',
  author: '작성',
  recipient: '받은 사람',
  speaker: '말한 사람',
  mentioned: '언급됨',
};

/** 기록을 만든 쪽의 역할. 나머지는 등장인물로 본다. */
const MAKER_ROLES = new Set(['photographer', 'author', 'speaker']);

export async function getRecord(role: Role, id: string): Promise<RecordDetail | null> {
  const supabase = db();

  const { data: item, error } = await supabase
    .from('item_effective')
    .select('*')
    .eq('id', id)
    .maybeSingle();

  if (error) throw new Error(`기록 조회 실패: ${error.message}`);
  if (!item) return null;

  const it = item as ItemRow;

  // 볼 수 없는 기록은 있다는 사실까지 감추지는 않되, 내용은 주지 않는다.
  // 목록에서 자리를 남기는 방침과 같은 자리다.
  if (!canView(it.access_level, role)) return null;
  if (it.is_archived && role !== 'admin') return null;

  const [filesRes, peopleRes, placeRes, subjRes, periodRes, storyRes, trRes, siblingRes] =
    await Promise.all([
      supabase
        .from('file')
        .select('id, role, mime, bytes, width, height, duration_ms, provider')
        .eq('item_id', id),
      supabase.from('item_person').select('role, person(id, display_name)').eq('item_id', id),
      it.place_id
        ? supabase
            .from('place')
            .select('id, family_name, admin_name')
            .eq('id', it.place_id)
            .maybeSingle()
        : Promise.resolve({ data: null, error: null }),
      supabase
        .from('item_subject')
        .select('subject(id, label, parent:parent_id(label))')
        .eq('item_id', id),
      supabase
        .from('item_life_period')
        .select('life_period(id, label, person(display_name))')
        .eq('item_id', id),
      supabase
        .from('curation_ref')
        .select('curation_block(collection_id, collection:collection_id(id, title, kind))')
        .eq('item_id', id),
      supabase.from('transcript').select('segments').eq('item_id', id).maybeSingle(),
      supabase
        .from('item_effective')
        .select('*')
        .eq('bundle_id', it.bundle_id)
        .eq('is_archived', false)
        .neq('id', id)
        .order('seq')
        .limit(8),
    ]);

  // 하나라도 조용히 비면 상세정보 표에 줄이 빠진 채로 나온다. 빠진 줄은
  // "그 값이 없다"로 읽히므로, 조회 실패와 값 없음을 섞으면 안 된다.
  for (const [what, res] of [
    ['파일', filesRes],
    ['인물', peopleRes],
    ['장소', placeRes],
    ['주제분류', subjRes],
    ['시기분류', periodRes],
    ['이야기', storyRes],
    ['전사', trRes],
    ['같은 묶음', siblingRes],
  ] as const) {
    if (res.error) throw new Error(`기록 ${what} 조회 실패: ${res.error.message}`);
  }

  const files = filesRes.data ?? [];
  const people = (peopleRes.data ?? []) as unknown as {
    role: string;
    person: { id: string; display_name: string } | null;
  }[];
  const place = placeRes.data as { family_name: string; admin_name: string | null } | null;
  const subjects = (subjRes.data ?? []) as unknown as {
    subject: { id: string; label: string; parent: { label: string } | null } | null;
  }[];
  const periods = (periodRes.data ?? []) as unknown as {
    life_period: { id: string; label: string; person: { display_name: string } | null } | null;
  }[];
  const storyRows = (storyRes.data ?? []) as unknown as {
    curation_block: { collection: { id: string; title: string; kind: string } | null } | null;
  }[];
  const siblings = (siblingRes.data ?? []) as ItemRow[];

  // ── 사진 ────────────────────────────────────────────────────
  // 표시용 사본이 있는 파일만 화면에 건다. 원본은 관리자에게만 따로 준다.
  const display = files.filter((f) => f.role === 'display' || f.role === 'thumb');
  const byRole = new Map<string, (typeof files)[number]>();
  for (const f of files) if (!byRole.has(f.role)) byRole.set(f.role, f);

  const photos =
    display.length > 0
      ? [
          {
            src: `/media/${(byRole.get('display') ?? byRole.get('thumb'))!.id}`,
            thumb: byRole.get('thumb') ? `/media/${byRole.get('thumb')!.id}` : null,
            alt: it.title,
            identifier: it.identifier,
          },
        ]
      : [];

  // 같은 묶음의 다른 낱장도 사진이 있으면 갤러리에 함께 건다. 앨범 한 쪽을
  // 여러 낱장으로 쪼개 둔 경우, 한 장만 보여주면 맥락이 끊긴다.
  const sibThumbs = await thumbsFor(siblings.map((s) => s.id));
  for (const s of siblings) {
    const f = sibThumbs.get(s.id);
    if (!f || !canView(s.access_level, role)) continue;
    photos.push({
      src: `/media/${f}`,
      thumb: `/media/${f}`,
      alt: s.title,
      identifier: s.identifier,
    });
  }

  const soundFile = files.find((f) => f.role === 'stream' || (f.mime ?? '').startsWith('audio/'));
  const originalFile = files.find((f) => f.role === 'original');

  // ── 상세정보 표 ─────────────────────────────────────────────
  const makers = people.filter((p) => MAKER_ROLES.has(p.role) && p.person);

  // 생산자를 전거로 가리켰으면 그 사람의 인물 페이지로 보낸다. 이름 글자만
  // 적힌 생산자(기관·미상)는 갈 곳이 없으므로 글자로 둔다.
  const authority = item as unknown as { creator_id: string | null };
  const creatorRes = authority.creator_id
    ? await supabase
        .from('person')
        .select('id, display_name')
        .eq('id', authority.creator_id)
        .maybeSingle()
    : null;
  if (creatorRes?.error) throw new Error(`기록 생산자 조회 실패: ${creatorRes.error.message}`);
  const creatorPerson = (creatorRes?.data ?? null) as { id: string; display_name: string } | null;

  const appears = people.filter((p) => !MAKER_ROLES.has(p.role) && p.person);

  const subjectPaths = subjects
    .filter((s) => s.subject)
    .map((s) => {
      const label = s.subject!.label;
      const parent = s.subject!.parent?.label;
      return parent
        ? [
            { label: parent, href: `/search?subject=${encodeURIComponent(parent)}` },
            { label, href: `/search?subject=${encodeURIComponent(`${parent}/${label}`)}` },
          ]
        : [{ label, href: `/search?subject=${encodeURIComponent(label)}` }];
    });

  const periodPaths = periods
    .filter((p) => p.life_period)
    .map((p) => {
      const who = shortName(p.life_period!.person?.display_name ?? '');
      const label = p.life_period!.label;
      return [
        { label: who, href: `/search?period=${encodeURIComponent(who)}` },
        { label, href: `/search?period=${encodeURIComponent(`${who}/${label}`)}` },
      ];
    });

  const sourcePath = it.source
    ? [
        { label: it.source, href: `/search?source=${encodeURIComponent(it.source)}` },
        {
          label: it.bundle_title,
          href: `/search?source=${encodeURIComponent(`${it.source}/${it.bundle_title}`)}`,
        },
      ]
    : [];

  const meta: RecordMeta = {
    creator:
      makers.length > 0
        ? makers.map((p) => ({
            text: `${shortName(p.person!.display_name)}${p.role !== 'author' ? ` (${ROLE_KO[p.role]})` : ''}`,
            href: `/people/${p.person!.id}`,
          }))
        : creatorPerson
          ? [
              {
                text: shortName(creatorPerson.display_name),
                href: `/people/${creatorPerson.id}`,
              },
            ]
          : it.creator,
    date: it.created_edtf
      ? { value: it.created_edtf, verified: it.date_verified }
      : it.created_start
        ? { value: it.created_start, verified: it.date_verified }
        : null,
    type: { type: it.type, detail: it.doc_type },
    source:
      sourcePath.length > 0
        ? {
            text: sourcePath.map((s) => s.label).join(' > '),
            path: sourcePath,
            // 실물이 어디 있는지 적혀 있으면 "실물 원본" 인장을 찍는다. 사본을
            // 만든 뒤에 종이가 어디로 갔는지가 가장 빨리 잊히고, 그 한 줄이
            // 없으면 이 기록은 화면에만 있는 것처럼 읽힌다.
            original: Boolean(it.physical_location),
            // 상태는 다음에 실물을 꺼낼 사람이 무엇을 조심해야 하는지다.
            note:
              [it.provenance, it.physical_location, it.physical_condition]
                .filter((v): v is string => Boolean(v))
                .join(' · ') || undefined,
          }
        : null,
    subject: subjectPaths.length > 0 ? subjectPaths : null,
    temporal: periodPaths.length > 0 ? periodPaths : null,
    spatial: place
      ? {
          text: place.family_name,
          note: place.admin_name ?? undefined,
        }
      : null,
    people:
      appears.length > 0
        ? appears.map((p) => ({
            text: shortName(p.person!.display_name),
            href: `/people/${p.person!.id}`,
          }))
        : null,
    contributor: it.contributor,
    publisher: it.publisher,
    format: [it.medium, it.extent, fileFormat(byRole.get('display') ?? byRole.get('original'))]
      .filter((v): v is string => Boolean(v))
      .join(' · ') || null,
    identifier: it.identifier,
    language: it.language === 'ko' ? '한국어' : it.language,
    rights: rightsLabel(it.access_level, it.rights),
  };

  // ── 관련 ────────────────────────────────────────────────────
  const stories = storyRows
    .map((r) => r.curation_block?.collection)
    .filter((c): c is { id: string; title: string; kind: string } => Boolean(c) && c!.kind === 'story')
    .filter((c, i, arr) => arr.findIndex((x) => x.id === c.id) === i)
    .map((c) => ({ id: c.id, title: c.title }));

  return {
    item: it,
    meta,
    photos,
    original:
      originalFile && role === 'admin'
        ? {
            id: originalFile.id,
            label: originalFile.provider === 'gdrive' ? 'Drive 에서 원본 보기' : '원본 내려받기',
          }
        : null,
    audio: soundFile ? { src: `/media/${soundFile.id}`, mime: soundFile.mime } : null,
    related: siblings.map((s) => {
      const visible = canView(s.access_level, role);
      return {
        title: visible ? s.title : '잠긴 기록',
        href: visible ? `/item/${s.id}` : null,
        type: typeLabel(s.type),
        date: s.created_edtf ?? s.created_start,
      };
    }),
    stories,
    // 분류 경로는 한 축만 따라간다 — 형태분류다. 출처와 형태를 한 줄에 섞으면
    // 각 단계가 무엇의 하위인지 알 수 없고, 눌렀을 때 어디로 가는지도 어긋난다.
    // 나머지 세 축은 상세정보 표에서 각자의 줄로 간다.
    crumbs: [
      { label: '형태분류', href: '/search' },
      { label: typeLabel(it.type), href: `/search?form=${encodeURIComponent(it.type)}` },
      ...(it.doc_type
        ? [
            {
              label: it.doc_type,
              href: `/search?form=${encodeURIComponent(`${it.type}/${it.doc_type}`)}`,
            },
          ]
        : []),
    ],
    terms: {
      access: accessLabel(it.access_level),
      rights: it.rights,
      aiOptout: it.ai_optout,
      physicalLocation: it.physical_location,
      physicalCondition: it.physical_condition,
    },
    transcript: trRes.data as RecordDetail['transcript'],
  };
}

/** "JPEG · 2.4MB · 1600×1200" */
function fileFormat(f?: { mime: string | null; bytes: number | null; width: number | null; height: number | null }): string | null {
  if (!f) return null;
  const parts: string[] = [];
  if (f.mime) parts.push(f.mime.replace(/^image\/|^audio\/|^video\//, '').toUpperCase());
  if (f.bytes) parts.push(`${(f.bytes / 1024 / 1024).toFixed(1)}MB`);
  if (f.width && f.height) parts.push(`${f.width}×${f.height}`);
  return parts.length > 0 ? parts.join(' · ') : null;
}

/**
 * 이용조건.
 *
 * 공개 범위를 사람이 읽는 말로 바꾼다. 'public' 이라 해도 이 사이트는
 * 통째로 로그인 뒤에 있으므로 "누구나"가 아니라 "로그인한 가족 모두"다.
 * 그 차이를 적어 두지 않으면 관리자가 공개 범위를 잘못 판단한다.
 */
function rightsLabel(level: AccessLevel, rights: string | null): string | null {
  const base = accessLabel(level);
  return rights ? `${base} · ${rights}` : base;
}

/** 공개 범위 한 마디. 표와 화면 끝 이용조건 구획이 같은 말을 쓰게 한다. */
function accessLabel(level: AccessLevel): string {
  return level === 'public'
    ? '가족 공개 — 로그인한 사람 모두'
    : level === 'family'
      ? '가족 제한'
      : '비공개 — 관리자만';
}
