import 'server-only';
import { db } from './db';
import { typeLabel, shortName } from './chronicle';
import { thumbsFor, type ItemRow } from './queries';

/**
 * 큐레이션 편집 화면이 보는 것.
 *
 * 관리자만 오는 화면이라 접근 통제를 걸지 않는다 — `requireAdmin()` 이
 * 화면 입구에서 이미 막는다. 대신 잠긴 자료도 전부 보여준다. 비공개
 * 기록을 이야기에 엮는 것은 관리자의 판단이고, 그러면 그 이야기는 볼 수
 * 있는 사람에게만 그 블록이 비어 보인다.
 */

export type BlockKind = 'text' | 'heading' | 'record' | 'gallery' | 'quote' | 'timeline';

export const BLOCK_KINDS: { key: BlockKind; label: string; hint: string }[] = [
  { key: 'text', label: '글', hint: '큐레이터가 쓰는 서술문' },
  { key: 'heading', label: '소제목', hint: '이야기를 나누는 마디' },
  { key: 'record', label: '기록', hint: '자료 하나를 크게' },
  { key: 'gallery', label: '사진 묶음', hint: '자료 여럿을 격자로' },
  { key: 'quote', label: '구술 인용', hint: '말한 사람과 녹음의 지점' },
  { key: 'timeline', label: '연표', hint: '엮은 자료를 해마다' },
];

export interface EditorBlock {
  id: string;
  position: number;
  kind: BlockKind;
  body: string | null;
  caption: string | null;
  speakerId: string | null;
  timecodeMs: number | null;
  refs: {
    itemId: string;
    title: string;
    identifier: string;
    type: string;
    typeLabel: string;
    date: string | null;
    thumb: string | null;
  }[];
}

export interface StoryEditor {
  id: string;
  title: string;
  summary: string | null;
  periodEdtf: string | null;
  coverItemId: string | null;
  blocks: EditorBlock[];
  /** 인물 고르기(구술 인용의 말한 사람) */
  people: { id: string; name: string }[];
}

export async function listStories() {
  const { data, error } = await db()
    .from('collection')
    .select('id, title, summary, period_edtf, sort_order')
    .eq('kind', 'story')
    .order('sort_order');

  if (error) throw new Error(`이야기 목록 조회 실패: ${error.message}`);

  const ids = (data ?? []).map((s) => s.id);
  if (ids.length === 0) return [];

  // 이야기마다 블록 수와 엮은 자료 수를 센다. 편집 화면에 들어가기 전에
  // "이 이야기가 얼마나 채워져 있나"를 알 수 있어야 한다.
  const { data: blocks, error: bErr } = await db()
    .from('curation_block')
    .select('id, collection_id')
    .in('collection_id', ids);
  if (bErr) throw new Error(`블록 수 조회 실패: ${bErr.message}`);

  const blockIds = (blocks ?? []).map((b) => b.id);
  const { data: refs, error: rErr } = blockIds.length
    ? await db().from('curation_ref').select('block_id, item_id').in('block_id', blockIds)
    : { data: [], error: null };
  if (rErr) throw new Error(`참조 수 조회 실패: ${rErr.message}`);

  const blockOf = new Map((blocks ?? []).map((b) => [b.id, b.collection_id]));
  const itemsPer = new Map<string, Set<string>>();
  for (const r of refs ?? []) {
    const cid = blockOf.get(r.block_id);
    if (!cid) continue;
    if (!itemsPer.has(cid)) itemsPer.set(cid, new Set());
    itemsPer.get(cid)!.add(r.item_id);
  }

  return (data ?? []).map((s) => ({
    ...s,
    blockCount: (blocks ?? []).filter((b) => b.collection_id === s.id).length,
    itemCount: itemsPer.get(s.id)?.size ?? 0,
  }));
}

export async function getStoryEditor(id: string): Promise<StoryEditor | null> {
  const supabase = db();

  const { data: story, error } = await supabase
    .from('collection')
    .select('id, title, summary, period_edtf, cover_item_id, kind')
    .eq('id', id)
    .maybeSingle();

  if (error) throw new Error(`이야기 조회 실패: ${error.message}`);
  if (!story || story.kind !== 'story') return null;

  const [blocksRes, peopleRes] = await Promise.all([
    supabase
      .from('curation_block')
      .select('id, position, kind, body, caption, speaker_id, timecode_ms')
      .eq('collection_id', id)
      .order('position'),
    supabase.from('person').select('id, display_name').order('born_year', { nullsFirst: false }),
  ]);

  for (const [what, res] of [
    ['블록', blocksRes],
    ['인물', peopleRes],
  ] as const) {
    if (res.error) throw new Error(`이야기 ${what} 조회 실패: ${res.error.message}`);
  }

  const blocks = blocksRes.data ?? [];
  const blockIds = blocks.map((b) => b.id);

  // 참조와 자료를 각각 한 번씩. 블록 수만큼 도는 질의를 만들지 않는다.
  const { data: refs, error: rErr } = blockIds.length
    ? await supabase
        .from('curation_ref')
        .select('block_id, item_id, sort_order')
        .in('block_id', blockIds)
        .order('sort_order')
    : { data: [], error: null };
  if (rErr) throw new Error(`참조 조회 실패: ${rErr.message}`);

  const itemIds = [...new Set((refs ?? []).map((r) => r.item_id))];
  const { data: items, error: iErr } = itemIds.length
    ? await supabase.from('item_effective').select('*').in('id', itemIds)
    : { data: [], error: null };
  if (iErr) throw new Error(`자료 조회 실패: ${iErr.message}`);

  const byId = new Map(((items ?? []) as ItemRow[]).map((i) => [i.id, i]));
  const thumbs = await thumbsFor(itemIds);

  return {
    id: story.id,
    title: story.title,
    summary: story.summary,
    periodEdtf: story.period_edtf,
    coverItemId: story.cover_item_id,
    people: (peopleRes.data ?? []).map((p) => ({
      id: p.id,
      name: shortName(p.display_name),
    })),
    blocks: blocks.map((b) => ({
      id: b.id,
      position: b.position,
      kind: b.kind as BlockKind,
      body: b.body,
      caption: b.caption,
      speakerId: b.speaker_id,
      timecodeMs: b.timecode_ms,
      refs: (refs ?? [])
        .filter((r) => r.block_id === b.id)
        .map((r) => {
          const it = byId.get(r.item_id);
          const f = thumbs.get(r.item_id);
          return {
            itemId: r.item_id,
            title: it?.title ?? '(지워진 자료)',
            identifier: it?.identifier ?? '',
            type: it?.type ?? '',
            typeLabel: it ? typeLabel(it.type) : '',
            date: it?.created_edtf ?? it?.created_start ?? null,
            thumb: f ? `/media/${f}` : null,
          };
        }),
    })),
  };
}

/**
 * 큐레이션에 넣을 자료 고르기.
 *
 * 사건(Event)은 빼둔다 — 파일이 없어 이야기 본문에 걸 것이 없다.
 * 연표 블록은 엮은 자료의 날짜로 만들어지므로 여기서도 자료만 고른다.
 */
export async function pickItems(q: string | undefined, limit = 30) {
  let query = db()
    .from('item_effective')
    .select('*')
    .eq('is_archived', false)
    .neq('type', 'Event')
    .order('created_start', { ascending: true, nullsFirst: false })
    .limit(limit);

  const needle = q?.trim();
  if (needle) {
    // 제목과 식별자에서 찾는다. 설명까지 넣으면 이 화면에서는 너무 많이 걸린다.
    query = query.or(`title.ilike.%${needle}%,identifier.ilike.%${needle}%`);
  }

  const { data, error } = await query;
  if (error) throw new Error(`자료 고르기 조회 실패: ${error.message}`);

  const rows = (data ?? []) as ItemRow[];
  const thumbs = await thumbsFor(rows.map((r) => r.id));

  return rows.map((r) => ({
    id: r.id,
    title: r.title,
    identifier: r.identifier,
    type: r.type,
    typeLabel: typeLabel(r.type),
    date: r.created_edtf ?? r.created_start,
    accessLevel: r.access_level,
    thumb: thumbs.get(r.id) ? `/media/${thumbs.get(r.id)}` : null,
  }));
}

/** 히어로 편성 화면이 보는 것. */
export async function getHeroSchedule() {
  const [slotsRes, storiesRes] = await Promise.all([
    db().from('hero_slot').select('*').order('slot'),
    db()
      .from('collection')
      .select('id, title')
      .eq('kind', 'story')
      .order('sort_order'),
  ]);

  for (const [what, res] of [
    ['편성', slotsRes],
    ['이야기', storiesRes],
  ] as const) {
    if (res.error) throw new Error(`히어로 ${what} 조회 실패: ${res.error.message}`);
  }

  const slots = slotsRes.data ?? [];
  return {
    stories: storiesRes.data ?? [],
    rows: [1, 2, 3].map((slot) => {
      const s = slots.find((x) => x.slot === slot);
      return {
        slot,
        collectionId: s?.collection_id ?? null,
        autoKind: s?.auto_kind ?? null,
        startsOn: s?.starts_on ?? null,
        endsOn: s?.ends_on ?? null,
      };
    }),
  };
}
