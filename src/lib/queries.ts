import 'server-only';
import { db } from './db';
import type { AccessLevel, Role } from './access';
import { canView } from './access';

/**
 * 열람 화면이 쓰는 조회들.
 *
 * 전부 item_effective 뷰를 본다 — 상속 규칙이 SQL 한 곳에만 있게 하기 위해서다.
 * 잠긴 자료는 목록에서 지우지 않는다. "여기 무언가 있다"는 사실까지 감추면
 * 가족이 무엇을 못 보고 있는지조차 알 수 없게 된다.
 */

export interface ItemRow {
  id: string;
  identifier: string;
  bundle_id: string;
  seq: number;
  title: string;
  type: string;
  created_edtf: string | null;
  created_start: string | null;
  created_precision: string;
  created_uncertain: boolean;
  created_approx: boolean;
  description: string | null;
  creator: string | null;
  medium: string | null;
  extent: string | null;
  language: string | null;
  source: string | null;
  provenance: string | null;
  rights: string | null;
  place_id: string | null;
  access_level: AccessLevel;
  is_featured: boolean;
  is_archived: boolean;
  bundle_title: string;
  source_overridden?: boolean;
  provenance_overridden?: boolean;
  place_overridden?: boolean;
  rights_overridden?: boolean;
  access_overridden?: boolean;
}

export interface ThumbRef {
  item_id: string;
  file_id: string | null;
}

/** 여러 자료의 썸네일 파일 id 를 한 번에 가져온다. */
export async function thumbsFor(itemIds: string[]): Promise<Map<string, string>> {
  const map = new Map<string, string>();
  if (itemIds.length === 0) return map;
  const { data } = await db()
    .from('file')
    .select('id, item_id, role')
    .in('item_id', itemIds)
    .in('role', ['thumb', 'display']);
  for (const f of data ?? []) {
    // thumb 을 우선하되, 없으면 display 로 대체
    if (f.role === 'thumb' || !map.has(f.item_id)) map.set(f.item_id, f.id);
  }
  return map;
}

export interface TimelineGroup {
  year: number | null;
  items: ItemRow[];
}

export async function getTimeline(): Promise<{ groups: TimelineGroup[]; undated: ItemRow[] }> {
  const { data, error } = await db()
    .from('item_effective')
    .select('*')
    .eq('is_archived', false)
    .eq('bundle_archived', false)
    .order('created_start', { ascending: true, nullsFirst: false })
    .order('seq', { ascending: true });

  if (error) throw new Error(`연표 조회 실패: ${error.message}`);
  const rows = (data ?? []) as ItemRow[];

  const byYear = new Map<number, ItemRow[]>();
  const undated: ItemRow[] = [];
  for (const r of rows) {
    if (!r.created_start) {
      undated.push(r);
      continue;
    }
    const y = Number(r.created_start.slice(0, 4));
    if (!byYear.has(y)) byYear.set(y, []);
    byYear.get(y)!.push(r);
  }

  const groups = [...byYear.entries()]
    .sort((a, b) => a[0] - b[0])
    .map(([year, items]) => ({ year, items }));

  return { groups, undated };
}

export async function getGallery(type?: string): Promise<ItemRow[]> {
  let q = db()
    .from('item_effective')
    .select('*')
    .eq('is_archived', false)
    .eq('bundle_archived', false);
  if (type) q = q.eq('type', type);
  const { data, error } = await q
    .order('created_start', { ascending: true, nullsFirst: false })
    .order('seq', { ascending: true });
  if (error) throw new Error(`자료 조회 실패: ${error.message}`);
  return (data ?? []) as ItemRow[];
}

export async function getTypeCounts(): Promise<Record<string, number>> {
  const { data } = await db()
    .from('item_effective')
    .select('type')
    .eq('is_archived', false)
    .eq('bundle_archived', false);
  const counts: Record<string, number> = {};
  for (const r of data ?? []) counts[r.type] = (counts[r.type] ?? 0) + 1;
  return counts;
}

export interface ItemDetail {
  item: ItemRow;
  files: {
    id: string;
    role: string;
    mime: string | null;
    width: number | null;
    height: number | null;
    bytes: number | null;
  }[];
  people: { id: string; display_name: string; role: string }[];
  place: { id: string; family_name: string; admin_name: string | null } | null;
  collections: { id: string; title: string }[];
  transcript: { segments: { start_ms: number; end_ms: number; text: string }[]; reviewed: boolean } | null;
  siblings: ItemRow[];
}

export async function getItem(id: string): Promise<ItemDetail | null> {
  const supabase = db();
  const { data: item } = await supabase.from('item_effective').select('*').eq('id', id).maybeSingle();
  if (!item) return null;

  const [filesRes, peopleRes, placeRes, colRes, trRes, sibRes] = await Promise.all([
    supabase.from('file').select('id, role, mime, width, height, bytes').eq('item_id', id),
    supabase.from('item_person').select('role, person(id, display_name)').eq('item_id', id),
    item.place_id
      ? supabase.from('place').select('id, family_name, admin_name').eq('id', item.place_id).maybeSingle()
      : Promise.resolve({ data: null }),
    supabase.from('item_collection').select('collection(id, title)').eq('item_id', id),
    supabase.from('transcript').select('segments, reviewed').eq('item_id', id).maybeSingle(),
    supabase
      .from('item_effective')
      .select('*')
      .eq('bundle_id', item.bundle_id)
      .eq('is_archived', false)
      .neq('id', id)
      .order('seq')
      .limit(6),
  ]);

  return {
    item: item as ItemRow,
    files: filesRes.data ?? [],
    people: (peopleRes.data ?? []).map((r: Record<string, unknown>) => {
      const p = r.person as { id: string; display_name: string };
      return { id: p.id, display_name: p.display_name, role: r.role as string };
    }),
    place: (placeRes.data as ItemDetail['place']) ?? null,
    collections: (colRes.data ?? []).map((r: Record<string, unknown>) => r.collection as { id: string; title: string }),
    transcript: (trRes.data as ItemDetail['transcript']) ?? null,
    siblings: (sibRes.data ?? []) as ItemRow[],
  };
}

export async function getCollections() {
  const { data } = await db()
    .from('collection')
    .select('id, title, kind, description, period_edtf, cover_item_id')
    .order('sort_order');
  const collections = data ?? [];

  // 표지 자료의 등급을 함께 가져온다. 잠긴 자료를 표지로 삼은 모음집이
  // 방문자에게 깨진 이미지로 보이지 않도록, 볼 수 있는지 먼저 판정한다.
  const coverIds = collections.map((c) => c.cover_item_id).filter((v): v is string => Boolean(v));
  const coverAccess = new Map<string, AccessLevel>();
  if (coverIds.length > 0) {
    const { data: covers } = await db()
      .from('item_effective')
      .select('id, access_level')
      .in('id', coverIds);
    for (const c of covers ?? []) coverAccess.set(c.id, c.access_level as AccessLevel);
  }

  return collections.map((c) => ({
    ...c,
    cover_access: c.cover_item_id ? (coverAccess.get(c.cover_item_id) ?? null) : null,
  }));
}

export async function getCollection(id: string) {
  const supabase = db();
  const { data: collection } = await supabase.from('collection').select('*').eq('id', id).maybeSingle();
  if (!collection) return null;
  const { data: links } = await supabase
    .from('item_collection')
    .select('item_id, sort_order')
    .eq('collection_id', id)
    .order('sort_order');
  const ids = (links ?? []).map((l) => l.item_id);
  if (ids.length === 0) return { collection, items: [] as ItemRow[] };
  const { data: items } = await supabase
    .from('item_effective')
    .select('*')
    .in('id', ids)
    .eq('is_archived', false);
  const order = new Map(ids.map((v, i) => [v, i]));
  const sorted = ((items ?? []) as ItemRow[]).sort(
    (a, b) => (order.get(a.id) ?? 0) - (order.get(b.id) ?? 0),
  );
  return { collection, items: sorted };
}

export async function getPeople() {
  const { data } = await db()
    .from('person')
    .select('id, display_name, aliases, birth_edtf, death_edtf, relation_to_root')
    .order('display_name');
  return data ?? [];
}

export async function getPerson(id: string) {
  const supabase = db();
  const { data: person } = await supabase.from('person').select('*').eq('id', id).maybeSingle();
  if (!person) return null;
  const { data: links } = await supabase.from('item_person').select('item_id, role').eq('person_id', id);
  const ids = (links ?? []).map((l) => l.item_id);
  if (ids.length === 0) return { person, items: [] as ItemRow[] };
  const { data: items } = await supabase
    .from('item_effective')
    .select('*')
    .in('id', ids)
    .eq('is_archived', false)
    .order('created_start', { ascending: true, nullsFirst: false });
  return { person, items: (items ?? []) as ItemRow[] };
}

/** 목록에 쓸 때: 볼 수 있는 것과 잠긴 것을 함께 돌려준다. */
export function partitionByAccess(items: ItemRow[], role: Role) {
  return items.map((i) => ({ item: i, visible: canView(i.access_level, role) }));
}
