import 'server-only';
import { db } from './db';
import { canView, type Role } from './access';
import { shortName } from './chronicle';
import { thumbsFor, type ItemRow } from './queries';

/**
 * 이야기.
 *
 * 연표가 "언제"로, 분류가 "무엇에 관한"으로 가는 길이라면 이쪽은 사람이
 * 손으로 엮은 길이다. collection(kind='story') 하나가 이야기 한 편이고,
 * curation_block 이 그 안의 문단·사진·인용·작은 연표가 된다.
 *
 * 이야기는 글이지만 근거는 기록이다. 그래서 블록마다 가리키는 기록을
 * 끝까지 끌고 다닌다 — 제목·식별자·날짜가 본문 옆에 붙어야 이야기가
 * 기억으로 흐려지지 않는다.
 *
 * 잠긴 기록은 목록에서 지우지 않고 제목만 감춘다(queries.ts 머리말과
 * 같은 방침). 이야기에서 통째로 빼 버리면 문단과 사진의 수가 어긋나
 * 글쓴이가 무엇을 엮었는지조차 알 수 없게 된다.
 */

// ---------------------------------------------------------------- 모양

export type BlockKind = 'text' | 'heading' | 'record' | 'gallery' | 'quote' | 'timeline';

export interface StoryItem {
  id: string;
  /** 잠겨 있으면 '잠긴 기록'. */
  title: string;
  /** 잠겨 있으면 null — 있다는 사실만 남기고 길을 뗀다. */
  href: string | null;
  locked: boolean;
  /** DCMI 유형 코드. 화면에서 typeLabel 로 옮긴다. */
  type: string;
  date: string;
  dateVerified: boolean;
  identifier: string;
  thumb: string | null;
}

export interface StoryBlock {
  id: string;
  kind: BlockKind;
  body: string | null;
  caption: string | null;
  /** 인용의 화자. person 이 지워졌으면 null. */
  speaker: string | null;
  /** '01:12:40' 꼴. 녹음 안의 위치. */
  timecode: string | null;
  items: StoryItem[];
}

export interface StoryCardData {
  id: string;
  title: string;
  summary: string | null;
  period: string | null;
  /** 엮인 기록 수. 잠긴 것도 센다. */
  count: number;
  cover: string | null;
}

export interface StoryData {
  id: string;
  title: string;
  summary: string | null;
  period: string | null;
  blocks: StoryBlock[];
  /** 이 이야기가 엮은 기록 전체. 블록 순서대로, 중복 없이. */
  items: StoryItem[];
}

// ---------------------------------------------------------------- 조각

/**
 * 화면에 보일 날짜. EDTF 원문이 있으면 그대로 쓴다 — 1978? 나 197X 가
 * 1978-01-01 로 둔갑하지 않게 하려는 것이다.
 */
function dateLabel(it: ItemRow): string {
  return it.created_edtf ?? it.created_start ?? '';
}

/** 녹음 안의 위치. 한 시간을 넘으면 시:분:초, 아니면 분:초. */
function timecodeLabel(ms: number | null): string | null {
  if (ms === null) return null;
  const total = Math.max(0, Math.floor(ms / 1000));
  const s = String(total % 60).padStart(2, '0');
  const m = String(Math.floor(total / 60) % 60).padStart(2, '0');
  const h = Math.floor(total / 3600);
  return h > 0 ? `${String(h).padStart(2, '0')}:${m}:${s}` : `${m}:${s}`;
}

function toStoryItem(it: ItemRow, role: Role, thumb: string | undefined): StoryItem {
  const visible = canView(it.access_level, role);
  return {
    id: it.id,
    title: visible ? it.title : '잠긴 기록',
    href: visible ? `/item/${it.id}` : null,
    locked: !visible,
    type: it.type,
    date: dateLabel(it),
    dateVerified: it.date_verified,
    identifier: it.identifier,
    thumb: visible && thumb ? `/media/${thumb}` : null,
  };
}

// ---------------------------------------------------------------- 목록

export async function getStories(role: Role): Promise<StoryCardData[]> {
  const supabase = db();

  const [storiesRes, refsRes] = await Promise.all([
    supabase
      .from('collection')
      .select('id, title, summary, description, period_edtf, cover_item_id, sort_order')
      .eq('kind', 'story')
      .order('sort_order'),
    // 블록을 거치지 않고 참조를 한 번에 끌어온 뒤 메모리에서 이야기별로 묶는다.
    // 이야기 편수만큼 질의를 도는 N+1 을 피하려는 것이다.
    supabase.from('curation_ref').select('item_id, curation_block(collection_id)'),
  ]);

  // 연표·찾기와 같은 이유로 전부 던진다. 실패가 "빈 결과"로 둔갑하면
  // 이야기가 한 편도 없는 화면을 아무 경고 없이 보게 된다.
  for (const [what, res] of [
    ['이야기', storiesRes],
    ['엮인 기록', refsRes],
  ] as const) {
    if (res.error) throw new Error(`이야기 ${what} 조회 실패: ${res.error.message}`);
  }

  const stories = storiesRes.data ?? [];
  if (stories.length === 0) return [];

  const refs = (refsRes.data ?? []) as unknown as {
    item_id: string;
    curation_block: { collection_id: string } | null;
  }[];

  const byStory = new Map<string, Set<string>>();
  for (const r of refs) {
    const cid = r.curation_block?.collection_id;
    if (!cid) continue;
    if (!byStory.has(cid)) byStory.set(cid, new Set());
    byStory.get(cid)!.add(r.item_id);
  }

  // 표지 기록의 등급을 먼저 본다. 잠긴 기록을 표지로 삼은 이야기가
  // 방문자에게 깨진 그림으로 보이지 않게 하려는 것이다.
  const coverIds = stories.map((s) => s.cover_item_id).filter((v): v is string => Boolean(v));
  const coverAccess = new Map<string, ItemRow['access_level']>();
  if (coverIds.length > 0) {
    const { data, error } = await supabase
      .from('item_effective')
      .select('id, access_level')
      .in('id', coverIds);
    if (error) throw new Error(`이야기 표지 조회 실패: ${error.message}`);
    for (const c of data ?? []) coverAccess.set(c.id, c.access_level as ItemRow['access_level']);
  }

  const openCovers = coverIds.filter((id) => {
    const level = coverAccess.get(id);
    return level !== undefined && canView(level, role);
  });
  const thumbs = await thumbsFor(openCovers);

  return stories.map((s) => {
    const file = s.cover_item_id ? thumbs.get(s.cover_item_id) : undefined;
    return {
      id: s.id,
      title: s.title,
      summary: s.summary ?? s.description,
      period: s.period_edtf,
      count: byStory.get(s.id)?.size ?? 0,
      cover: file ? `/media/${file}` : null,
    };
  });
}

// ---------------------------------------------------------------- 한 편

export async function getStory(role: Role, id: string): Promise<StoryData | null> {
  const supabase = db();

  const { data: story, error: storyError } = await supabase
    .from('collection')
    .select('id, title, kind, summary, description, period_edtf')
    .eq('id', id)
    .eq('kind', 'story')
    .maybeSingle();
  if (storyError) throw new Error(`이야기 조회 실패: ${storyError.message}`);
  if (!story) return null;

  const { data: blockRows, error: blockError } = await supabase
    .from('curation_block')
    .select('id, position, kind, body, caption, speaker_id, timecode_ms')
    .eq('collection_id', id)
    .order('position');
  if (blockError) throw new Error(`이야기 블록 조회 실패: ${blockError.message}`);
  const blocks = blockRows ?? [];

  const blockIds = blocks.map((b) => b.id);
  const speakerIds = [...new Set(blocks.map((b) => b.speaker_id).filter((v): v is string => Boolean(v)))];

  // 참조와 화자를 각각 한 번에. 블록마다 도는 질의를 만들지 않는다.
  const [refsRes, peopleRes] = await Promise.all([
    blockIds.length > 0
      ? supabase
          .from('curation_ref')
          .select('block_id, item_id, sort_order')
          .in('block_id', blockIds)
          .order('sort_order')
      : Promise.resolve({ data: [], error: null }),
    speakerIds.length > 0
      ? supabase.from('person').select('id, display_name').in('id', speakerIds)
      : Promise.resolve({ data: [], error: null }),
  ]);

  for (const [what, res] of [
    ['엮인 기록', refsRes],
    ['화자', peopleRes],
  ] as const) {
    if (res.error) throw new Error(`이야기 ${what} 조회 실패: ${res.error.message}`);
  }

  const refs = (refsRes.data ?? []) as { block_id: string; item_id: string; sort_order: number }[];
  const speakers = new Map(
    ((peopleRes.data ?? []) as { id: string; display_name: string }[]).map((p) => [
      p.id,
      shortName(p.display_name),
    ]),
  );

  // 기록도 한 번에 가져와 메모리에서 붙인다.
  const itemIds = [...new Set(refs.map((r) => r.item_id))];
  const itemById = new Map<string, ItemRow>();
  if (itemIds.length > 0) {
    const { data, error } = await supabase
      .from('item_effective')
      .select('*')
      .in('id', itemIds)
      .eq('is_archived', false)
      .eq('bundle_archived', false);
    if (error) throw new Error(`이야기 기록 조회 실패: ${error.message}`);
    for (const it of (data ?? []) as ItemRow[]) itemById.set(it.id, it);
  }

  const thumbs = await thumbsFor(
    [...itemById.values()].filter((it) => canView(it.access_level, role)).map((it) => it.id),
  );

  const refsByBlock = new Map<string, typeof refs>();
  for (const r of refs) {
    if (!refsByBlock.has(r.block_id)) refsByBlock.set(r.block_id, []);
    refsByBlock.get(r.block_id)!.push(r);
  }

  const out: StoryBlock[] = blocks.map((b) => ({
    id: b.id,
    kind: b.kind as BlockKind,
    body: b.body,
    caption: b.caption,
    speaker: b.speaker_id ? (speakers.get(b.speaker_id) ?? null) : null,
    timecode: timecodeLabel(b.timecode_ms),
    items: (refsByBlock.get(b.id) ?? [])
      .map((r) => itemById.get(r.item_id))
      // 보존 처리된 기록은 참조가 남아 있어도 화면에 없다.
      .filter((it): it is ItemRow => Boolean(it))
      .map((it) => toStoryItem(it, role, thumbs.get(it.id))),
  }));

  // 끝에 다는 전체 목록. 블록 순서를 그대로 따르고 같은 기록은 한 번만 적는다.
  const seen = new Set<string>();
  const items: StoryItem[] = [];
  for (const b of out) {
    for (const it of b.items) {
      if (seen.has(it.id)) continue;
      seen.add(it.id);
      items.push(it);
    }
  }

  return {
    id: story.id,
    title: story.title,
    summary: story.summary ?? story.description,
    period: story.period_edtf,
    blocks: out,
    items,
  };
}

/** 작은 연표를 해마다 묶는다. 연도를 모르는 기록은 뒤에 '시기 미상'으로 남긴다. */
export function groupByYear(items: StoryItem[]): { year: string; items: StoryItem[] }[] {
  const buckets = new Map<string, StoryItem[]>();
  for (const it of items) {
    const y = /^\d{4}/.exec(it.date)?.[0] ?? '시기 미상';
    if (!buckets.has(y)) buckets.set(y, []);
    buckets.get(y)!.push(it);
  }
  return [...buckets.entries()]
    .sort((a, b) => (a[0] === '시기 미상' ? 1 : b[0] === '시기 미상' ? -1 : a[0].localeCompare(b[0])))
    .map(([year, list]) => ({ year, items: list }));
}
