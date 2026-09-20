import 'server-only';
import { db } from './db';
import { typeLabel, shortName } from './chronicle';

/**
 * 분류 관리 화면이 보는 것.
 *
 * 네 축(형태·출처·주제·시기)을 한자리에 모은다. 찾기 화면(facets.ts)은 이
 * 네 축으로 기록을 거르는데, 그 가운데 사람이 손으로 값을 붙여야 하는 것은
 * 주제와 시기뿐이다. 붙일 곳이 없으면 그 두 축은 영영 비어 있고, 찾기 화면은
 * 아무도 고를 수 없는 빈 목록을 계속 그린다.
 *
 * 그래서 네 축의 성격이 여기서 갈린다.
 *
 *   형태분류  DCMI 7종 + doc_type    기록에서 유도된다      읽기 전용
 *   출처분류  source > bundle_title  기록에서 유도된다      읽기 전용
 *   주제분류  subject 나무           사람이 세운다          만들고 고친다
 *   시기분류  life_period            인물의 생애에 매인다   인물 화면에서
 *
 * 읽기 전용인 둘을 그래도 보여주는 것은, 관리자가 "내가 고칠 수 있는 축"과
 * "기록을 고쳐야 바뀌는 축"을 한눈에 구별해야 하기 때문이다.
 *
 * 건수는 보관되지 않은 기록만 센다. 0건인 분류도 지우지 않는다 — 비어 있다는
 * 사실도 정보다(facets.ts 머리말과 같은 규칙).
 *
 * 모든 질의의 오류를 던진다. 연표·찾기와 같은 이유다 — 하나만 검사하고 나머지를
 * `?? []` 로 삼키면 실패가 "빈 결과"와 구별되지 않아, 분류가 통째로 사라진
 * 화면을 아무 경고 없이 보게 된다.
 */

// ---------------------------------------------------------------- 모양

export interface SubjectRow {
  id: string;
  label: string;
  note: string | null;
  count: number;
}

export interface SubjectTop extends SubjectRow {
  children: SubjectRow[];
}

export interface PeriodRow {
  id: string;
  label: string;
  fromYear: number | null;
  toYear: number | null;
  count: number;
}

export interface PersonPeriods {
  personId: string;
  /** 짧은 호칭. 찾기 화면의 시기분류가 쓰는 이름과 같아야 한다. */
  name: string;
  fullName: string;
  periods: PeriodRow[];
}

export interface FormRow {
  type: string;
  label: string;
  count: number;
  /** 쓰인 doc_type 만. 미리 정해둔 낱말 목록이 없다 — 적는 대로 늘어난다. */
  docTypes: { label: string; count: number }[];
}

export interface SourceRow {
  source: string;
  count: number;
  bundles: { title: string; count: number }[];
}

export interface ClassesData {
  subjects: SubjectTop[];
  periods: PersonPeriods[];
  forms: FormRow[];
  sources: SourceRow[];
  /** 살아 있는 기록 수. 아래 셋과 견주어 얼마나 분류되었는지 가늠한다. */
  itemCount: number;
  /** 아직 주제분류가 하나도 걸리지 않은 기록 수. */
  unsubjected: number;
  /** 아직 시기분류가 하나도 걸리지 않은 기록 수. */
  unperiodized: number;
}

/** DCMI 7종. 형태분류의 상위 단계는 이 일곱으로 고정되어 있다. */
const DCMI_TYPES = [
  'StillImage',
  'Text',
  'Sound',
  'MovingImage',
  'PhysicalObject',
  'Collection',
  'Event',
] as const;

// 질의 결과의 모양. 클라이언트에 타입을 주지 않은 채로 쓰므로 여기서 한 번
// 못을 박아 둔다 — `any` 를 그대로 흘려보내면 열 이름 오타가 화면까지 간다.
interface ItemBit {
  id: string;
  type: string;
  doc_type: string | null;
  source: string | null;
  bundle_title: string;
}

interface SubjectBit {
  id: string;
  parent_id: string | null;
  label: string;
  note: string | null;
  sort_order: number;
}

interface PeriodBit {
  id: string;
  person_id: string;
  label: string;
  from_year: number | null;
  to_year: number | null;
  sort_order: number;
  person: { display_name: string } | null;
}

// ---------------------------------------------------------------- 조립

export async function getClasses(): Promise<ClassesData> {
  const supabase = db();

  const [itemsRes, subjectsRes, linksRes, periodsRes, plinksRes] = await Promise.all([
    supabase
      .from('item_effective')
      .select('id, type, doc_type, source, bundle_title')
      .eq('is_archived', false)
      .eq('bundle_archived', false),
    supabase
      .from('subject')
      .select('id, parent_id, label, note, sort_order')
      .order('sort_order')
      .order('label'),
    supabase.from('item_subject').select('item_id, subject_id'),
    supabase
      .from('life_period')
      .select('id, person_id, label, from_year, to_year, sort_order, person(display_name)')
      .order('sort_order'),
    supabase.from('item_life_period').select('item_id, life_period_id'),
  ]);

  for (const [what, res] of [
    ['기록', itemsRes],
    ['주제분류', subjectsRes],
    ['주제 연결', linksRes],
    ['생애 시기', periodsRes],
    ['시기 연결', plinksRes],
  ] as const) {
    if (res.error) throw new Error(`분류 ${what} 조회 실패: ${res.error.message}`);
  }

  const items = (itemsRes.data ?? []) as ItemBit[];
  const subjects = (subjectsRes.data ?? []) as SubjectBit[];
  const links = (linksRes.data ?? []) as { item_id: string; subject_id: string }[];
  // Supabase 의 타입 추론은 조인된 관계를 늘 배열로 본다. 여기서는 1:1 이라
  // 단일 객체로 온다(facets.ts 와 같은 처리).
  const periods = (periodsRes.data ?? []) as unknown as PeriodBit[];
  const plinks = (plinksRes.data ?? []) as { item_id: string; life_period_id: string }[];

  // 보관된 기록에도 연결은 남아 있다. 건수는 지금 보이는 기록만 세야
  // 찾기 화면에 뜨는 숫자와 어긋나지 않는다.
  const live = new Set(items.map((i) => i.id));

  // ── 주제분류 ────────────────────────────────────────────────
  const subjectCount = new Map<string, number>();
  const subjected = new Set<string>();
  for (const l of links) {
    if (!live.has(l.item_id)) continue;
    subjectCount.set(l.subject_id, (subjectCount.get(l.subject_id) ?? 0) + 1);
    subjected.add(l.item_id);
  }

  const toRow = (s: SubjectBit): SubjectRow => ({
    id: s.id,
    label: s.label,
    note: s.note,
    count: subjectCount.get(s.id) ?? 0,
  });

  const subjectTree: SubjectTop[] = subjects
    .filter((s) => !s.parent_id)
    .map((top) => ({
      ...toRow(top),
      children: subjects.filter((s) => s.parent_id === top.id).map(toRow),
    }));

  // ── 시기분류 ────────────────────────────────────────────────
  const periodCount = new Map<string, number>();
  const periodized = new Set<string>();
  for (const l of plinks) {
    if (!live.has(l.item_id)) continue;
    periodCount.set(l.life_period_id, (periodCount.get(l.life_period_id) ?? 0) + 1);
    periodized.add(l.item_id);
  }

  const byPerson = new Map<string, PersonPeriods>();
  for (const p of periods) {
    const full = p.person?.display_name ?? '이름 미상';
    if (!byPerson.has(p.person_id)) {
      byPerson.set(p.person_id, {
        personId: p.person_id,
        name: shortName(full),
        fullName: full,
        periods: [],
      });
    }
    byPerson.get(p.person_id)!.periods.push({
      id: p.id,
      label: p.label,
      fromYear: p.from_year,
      toYear: p.to_year,
      count: periodCount.get(p.id) ?? 0,
    });
  }

  // ── 형태분류 ────────────────────────────────────────────────
  // 상위는 DCMI 일곱으로 고정이고, 하위는 기록에 적힌 doc_type 이 그대로 된다.
  const forms: FormRow[] = DCMI_TYPES.map((t) => {
    const mine = items.filter((i) => i.type === t);
    const docs = new Map<string, number>();
    for (const i of mine) {
      if (!i.doc_type) continue;
      docs.set(i.doc_type, (docs.get(i.doc_type) ?? 0) + 1);
    }
    return {
      type: t,
      label: typeLabel(t),
      count: mine.length,
      docTypes: [...docs.entries()]
        .sort((a, b) => a[0].localeCompare(b[0], 'ko'))
        .map(([label, count]) => ({ label, count })),
    };
  });

  // ── 출처분류 ────────────────────────────────────────────────
  // 출처가 비어 있는 기록은 묶음에서 물려받지 못한 것이다(item_effective 가
  // 이미 상속을 마친 값을 준다). 한데 모아 눈에 띄게 둔다.
  const sourceTree = new Map<string, Map<string, number>>();
  for (const i of items) {
    const src = i.source ?? '(출처 없음)';
    if (!sourceTree.has(src)) sourceTree.set(src, new Map());
    const bundles = sourceTree.get(src)!;
    bundles.set(i.bundle_title, (bundles.get(i.bundle_title) ?? 0) + 1);
  }

  const sources: SourceRow[] = [...sourceTree.entries()]
    .sort((a, b) => a[0].localeCompare(b[0], 'ko'))
    .map(([source, bundles]) => ({
      source,
      count: [...bundles.values()].reduce((a, b) => a + b, 0),
      bundles: [...bundles.entries()]
        .sort((a, b) => a[0].localeCompare(b[0], 'ko'))
        .map(([title, count]) => ({ title, count })),
    }));

  return {
    subjects: subjectTree,
    periods: [...byPerson.values()],
    forms,
    sources,
    itemCount: items.length,
    unsubjected: items.length - subjected.size,
    unperiodized: items.length - periodized.size,
  };
}

// ---------------------------------------------------------------- 낱장에 붙이기

export interface ClassPicker {
  /** 고를 수 있는 주제분류. 상위도 고를 수 있다 — 하위가 없는 축이 있다. */
  subjects: { id: string; label: string; children: { id: string; label: string }[] }[];
  periods: { personId: string; name: string; periods: { id: string; label: string }[] }[];
  chosenSubjects: string[];
  chosenPeriods: string[];
}

/**
 * 기록 한 건의 분류 편집기가 보는 것.
 *
 * 관리 화면의 건수는 필요 없으므로 getClasses() 를 부르지 않는다 — 낱장
 * 화면을 열 때마다 아카이브 전체의 연결을 세는 일은 하지 않는다.
 */
export async function getClassPicker(itemId: string): Promise<ClassPicker> {
  const supabase = db();

  const [subjectsRes, periodsRes, mineRes, minePeriodsRes] = await Promise.all([
    supabase
      .from('subject')
      .select('id, parent_id, label, sort_order')
      .order('sort_order')
      .order('label'),
    supabase
      .from('life_period')
      .select('id, person_id, label, sort_order, person(display_name)')
      .order('sort_order'),
    supabase.from('item_subject').select('subject_id').eq('item_id', itemId),
    supabase.from('item_life_period').select('life_period_id').eq('item_id', itemId),
  ]);

  for (const [what, res] of [
    ['주제분류', subjectsRes],
    ['생애 시기', periodsRes],
    ['걸린 주제', mineRes],
    ['걸린 시기', minePeriodsRes],
  ] as const) {
    if (res.error) throw new Error(`분류 ${what} 조회 실패: ${res.error.message}`);
  }

  const subjects = (subjectsRes.data ?? []) as Pick<
    SubjectBit,
    'id' | 'parent_id' | 'label' | 'sort_order'
  >[];
  const periods = (periodsRes.data ?? []) as unknown as Omit<
    PeriodBit,
    'from_year' | 'to_year'
  >[];

  const byPerson = new Map<string, { personId: string; name: string; periods: { id: string; label: string }[] }>();
  for (const p of periods) {
    if (!byPerson.has(p.person_id)) {
      byPerson.set(p.person_id, {
        personId: p.person_id,
        name: shortName(p.person?.display_name ?? '이름 미상'),
        periods: [],
      });
    }
    byPerson.get(p.person_id)!.periods.push({ id: p.id, label: p.label });
  }

  return {
    subjects: subjects
      .filter((s) => !s.parent_id)
      .map((top) => ({
        id: top.id,
        label: top.label,
        children: subjects
          .filter((s) => s.parent_id === top.id)
          .map((s) => ({ id: s.id, label: s.label })),
      })),
    periods: [...byPerson.values()],
    chosenSubjects: ((mineRes.data ?? []) as { subject_id: string }[]).map((r) => r.subject_id),
    chosenPeriods: ((minePeriodsRes.data ?? []) as { life_period_id: string }[]).map(
      (r) => r.life_period_id,
    ),
  };
}
