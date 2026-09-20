import 'server-only';
import { db } from './db';
import { canView, type Role } from './access';
import { typeLabel } from './chronicle';
import type { ItemRow } from './queries';

/**
 * 네 갈래 분류로 찾기.
 *
 * 축마다 두 단계(상위 > 하위)까지만 쓴다. 세 단계가 되는 순간 사람이 어디에
 * 넣을지 판단을 미루고, 미룬 것은 영영 분류되지 않는다.
 *
 *   형태분류  dc:type            무엇인가       item.type + doc_type
 *   출처분류  dc:source          어디서 나왔나   item.source > bundle_title
 *   주제분류  dc:subject         무엇에 관한가   subject
 *   시기분류  dcterms:temporal   누구의 어느 때  item_life_period
 *
 * 건수는 "지금 걸린 다른 조건을 그대로 두고 이 항목을 더하면 몇 건이 되나"가
 * 아니라 "지금 결과 안에 이 항목이 몇 건 있나"로 센다. 앞엣것이 이론상 더
 * 친절하지만 축마다 질의를 다시 돌려야 하고, 이 규모에서 얻는 것보다 잃는
 * 것이 많다. 0건인 분류도 목록에서 지우지 않는다 — 비어 있다는 사실도 정보다.
 */

export type Axis = 'form' | 'source' | 'subject' | 'period';

export const AXES: { key: Axis; title: string; code: string }[] = [
  { key: 'form', title: '형태분류', code: 'dc:type' },
  { key: 'source', title: '출처분류', code: 'dc:source' },
  { key: 'subject', title: '주제분류', code: 'dc:subject' },
  { key: 'period', title: '시기분류', code: 'dcterms:temporal' },
];

export interface FacetItem {
  /** 주소에 실리는 값. 두 단계는 "상위/하위". */
  value: string;
  label: string;
  count: number;
  selected: boolean;
  children?: FacetItem[];
}

export interface FacetGroupData {
  key: Axis;
  title: string;
  code: string;
  items: FacetItem[];
}

export interface Selection {
  form?: string;
  source?: string;
  subject?: string;
  period?: string;
  q?: string;
}

export type SortKey = 'default' | 'title' | 'newest' | 'oldest' | 'added';

export const SORTS: { key: SortKey; label: string }[] = [
  { key: 'default', label: '기본순' },
  { key: 'title', label: '가나다순' },
  { key: 'newest', label: '생산일자 최신순' },
  { key: 'oldest', label: '생산일자 오래된순' },
  { key: 'added', label: '최근 등록순' },
];

export const PAGE_SIZES = [10, 20, 30, 100];

export interface SearchResult {
  groups: FacetGroupData[];
  items: (ItemRow & { locked: boolean })[];
  total: number;
  page: number;
  pageSize: number;
  sort: SortKey;
}

/** "상위/하위" 를 나눈다. 하위가 없으면 [상위, null]. */
function splitPath(v: string | undefined): [string, string | null] | null {
  if (!v) return null;
  const i = v.indexOf('/');
  return i === -1 ? [v, null] : [v.slice(0, i), v.slice(i + 1)];
}

export async function search(role: Role, sel: Selection, sort: SortKey, page: number, pageSize: number): Promise<SearchResult> {
  const supabase = db();

  const [itemsRes, subjectsRes, linksRes, periodsRes, plinksRes] = await Promise.all([
    supabase
      .from('item_effective')
      .select('*')
      .eq('is_archived', false)
      .eq('bundle_archived', false),
    supabase.from('subject').select('id, parent_id, label, sort_order').order('sort_order'),
    supabase.from('item_subject').select('item_id, subject_id'),
    supabase
      .from('life_period')
      .select('id, person_id, label, sort_order, person(display_name)')
      .order('sort_order'),
    supabase.from('item_life_period').select('item_id, life_period_id'),
  ]);

  // 연표와 같은 이유로 전부 던진다 — 실패가 "빈 결과"로 둔갑하면 분류가
  // 통째로 사라진 화면을 아무 경고 없이 보게 된다.
  for (const [what, res] of [
    ['기록', itemsRes],
    ['주제분류', subjectsRes],
    ['주제 연결', linksRes],
    ['생애 시기', periodsRes],
    ['시기 연결', plinksRes],
  ] as const) {
    if (res.error) throw new Error(`찾기 ${what} 조회 실패: ${res.error.message}`);
  }

  // 사건(Event)은 연표의 몫이라 찾기 목록에서는 빼둔다. 파일이 없고 제목만
  // 있어서 결과 목록에 섞이면 무엇을 찾았는지 흐려진다.
  const all = ((itemsRes.data ?? []) as ItemRow[]).filter((i) => i.type !== 'Event');
  const subjects = subjectsRes.data ?? [];
  const links = linksRes.data ?? [];
  // Supabase 의 타입 추론은 조인된 관계를 늘 배열로 본다. 여기서는 1:1 이라
  // 단일 객체로 온다. unknown 을 거쳐 실제 모양으로 바로잡는다.
  const periods = (periodsRes.data ?? []) as unknown as {
    id: string; person_id: string; label: string; sort_order: number;
    person: { display_name: string } | null;
  }[];
  const plinks = plinksRes.data ?? [];

  // 기록 -> 주제 경로들 / 시기 경로들
  const subjectById = new Map(subjects.map((s) => [s.id, s]));
  const subjectPaths = new Map<string, string[]>();
  for (const l of links) {
    const s = subjectById.get(l.subject_id);
    if (!s) continue;
    const parent = s.parent_id ? subjectById.get(s.parent_id) : null;
    const path = parent ? `${parent.label}/${s.label}` : s.label;
    if (!subjectPaths.has(l.item_id)) subjectPaths.set(l.item_id, []);
    subjectPaths.get(l.item_id)!.push(path);
  }

  const periodById = new Map(periods.map((p) => [p.id, p]));
  const periodPaths = new Map<string, string[]>();
  for (const l of plinks) {
    const p = periodById.get(l.life_period_id);
    if (!p) continue;
    const who = shortPerson(p.person?.display_name ?? '');
    const path = `${who}/${p.label}`;
    if (!periodPaths.has(l.item_id)) periodPaths.set(l.item_id, []);
    periodPaths.get(l.item_id)!.push(path);
  }

  // 한 기록이 어느 축의 어느 값에 걸리는지
  const pathsOf = (it: ItemRow, axis: Axis): string[] => {
    switch (axis) {
      case 'form': {
        return [it.doc_type ? `${it.type}/${it.doc_type}` : it.type];
      }
      case 'source':
        return [it.source ? `${it.source}/${it.bundle_title}` : ''];
      case 'subject':
        return subjectPaths.get(it.id) ?? [];
      case 'period':
        return periodPaths.get(it.id) ?? [];
    }
  };

  // 고른 값에 걸리는가. 상위만 골랐으면 그 아래 전부를 받는다.
  const matches = (it: ItemRow, axis: Axis, picked: string | undefined): boolean => {
    const want = splitPath(picked);
    if (!want) return true;
    return pathsOf(it, axis).some((p) => {
      const [top, sub] = splitPath(p)!;
      return want[1] === null ? top === want[0] : top === want[0] && sub === want[1];
    });
  };

  const needle = sel.q?.trim().toLowerCase();
  const textHit = (it: ItemRow) =>
    !needle ||
    it.title.toLowerCase().includes(needle) ||
    (it.description ?? '').toLowerCase().includes(needle) ||
    it.identifier.toLowerCase().includes(needle);

  // 모든 조건을 만족하는 결과
  const hits = all.filter(
    (it) =>
      textHit(it) &&
      matches(it, 'form', sel.form) &&
      matches(it, 'source', sel.source) &&
      matches(it, 'subject', sel.subject) &&
      matches(it, 'period', sel.period),
  );

  // ── 패싯 ────────────────────────────────────────────────────
  const groups: FacetGroupData[] = AXES.map(({ key, title, code }) => {
    const counts = new Map<string, number>();
    for (const it of hits) {
      for (const p of pathsOf(it, key)) {
        if (!p) continue;
        const [top, sub] = splitPath(p)!;
        counts.set(top, (counts.get(top) ?? 0) + 1);
        if (sub) counts.set(`${top}/${sub}`, (counts.get(`${top}/${sub}`) ?? 0) + 1);
      }
    }

    // 축마다 있을 수 있는 값을 모두 세운다. 결과에 없더라도 0건으로 남긴다.
    const skeleton = axisSkeleton(key, all, subjects, periods, pathsOf);
    const picked = sel[key];

    const items: FacetItem[] = skeleton.map(({ value, label, children }) => ({
      value,
      label,
      count: counts.get(value) ?? 0,
      selected: picked === value,
      children: children.map((c) => ({
        value: c.value,
        label: c.label,
        count: counts.get(c.value) ?? 0,
        selected: picked === c.value,
      })),
    }));

    return { key, title, code, items };
  });

  // ── 정렬과 쪽 나누기 ─────────────────────────────────────────
  const sorted = [...hits].sort(comparator(sort));
  const total = sorted.length;
  const from = (page - 1) * pageSize;
  const items = sorted.slice(from, from + pageSize).map((it) => ({
    ...it,
    locked: !canView(it.access_level, role),
  }));

  return { groups, items, total, page, pageSize, sort };
}

function comparator(sort: SortKey) {
  const byDate = (a: ItemRow, b: ItemRow) =>
    (a.created_start ?? '').localeCompare(b.created_start ?? '');
  switch (sort) {
    case 'title':
      return (a: ItemRow, b: ItemRow) => a.title.localeCompare(b.title, 'ko');
    case 'newest':
      return (a: ItemRow, b: ItemRow) => byDate(b, a);
    case 'oldest':
      return byDate;
    case 'added':
      return (a: ItemRow, b: ItemRow) =>
        b.submitted_at.localeCompare(a.submitted_at);
    default:
      // 기본순 — 생산일자 오름차순, 같으면 묶음 안의 순서.
      return (a: ItemRow, b: ItemRow) => byDate(a, b) || a.seq - b.seq;
  }
}

/** "김순자(할머니)" -> "할머니" */
function shortPerson(displayName: string): string {
  const m = displayName.match(/\(([^)]+)\)\s*$/);
  return m ? m[1] : displayName;
}

type Skel = { value: string; label: string; children: { value: string; label: string }[] };

/**
 * 축이 가질 수 있는 값의 뼈대.
 *
 * 결과가 아니라 아카이브 전체에서 뽑는다. 0건인 분류를 지우지 않으려는
 * 것이다 — "여기에는 아무것도 없다"는 것도 알아야 할 사실이고, 지워 버리면
 * 목록이 고를 때마다 춤춘다.
 */
function axisSkeleton(
  axis: Axis,
  all: ItemRow[],
  subjects: { id: string; parent_id: string | null; label: string }[],
  periods: { id: string; label: string; person: { display_name: string } | null }[],
  pathsOf: (it: ItemRow, axis: Axis) => string[],
): Skel[] {
  if (axis === 'subject') {
    const tops = subjects.filter((s) => !s.parent_id);
    return tops.map((t) => ({
      value: t.label,
      label: t.label,
      children: subjects
        .filter((s) => s.parent_id === t.id)
        .map((s) => ({ value: `${t.label}/${s.label}`, label: s.label })),
    }));
  }

  if (axis === 'period') {
    const byPerson = new Map<string, Set<string>>();
    for (const p of periods) {
      const who = shortPerson(p.person?.display_name ?? '');
      if (!byPerson.has(who)) byPerson.set(who, new Set());
      byPerson.get(who)!.add(p.label);
    }
    return [...byPerson.entries()].map(([who, labels]) => ({
      value: who,
      label: who,
      children: [...labels].map((l) => ({ value: `${who}/${l}`, label: l })),
    }));
  }

  // 형태·출처는 기록에서 직접 뽑는다.
  const tree = new Map<string, Set<string>>();
  for (const it of all) {
    for (const p of pathsOf(it, axis)) {
      if (!p) continue;
      const [top, sub] = splitPath(p)!;
      if (!tree.has(top)) tree.set(top, new Set());
      if (sub) tree.get(top)!.add(sub);
    }
  }

  const order = axis === 'form'
    ? ['StillImage', 'Text', 'Sound', 'MovingImage', 'PhysicalObject', 'Collection']
    : null;
  const tops = [...tree.keys()].sort((a, b) =>
    order ? order.indexOf(a) - order.indexOf(b) : a.localeCompare(b, 'ko'),
  );

  return tops.map((top) => ({
    value: top,
    label: axis === 'form' ? typeLabel(top) : top,
    children: [...(tree.get(top) ?? [])]
      .sort((a, b) => a.localeCompare(b, 'ko'))
      .map((sub) => ({ value: `${top}/${sub}`, label: sub })),
  }));
}
