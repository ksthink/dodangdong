import 'server-only';
import { db } from './db';
import { shortName } from './chronicle';

/**
 * 인물 편집 화면이 보는 것.
 *
 * 인물 목록(`/admin/people`)은 이름과 별칭을 묶어 두는 자리다. 여기는 한
 * 인물을 깊이 고치는 자리다 — 생몰, 가족, 그리고 생애 시기.
 *
 * 생애 시기가 이 화면의 무게중심이다. 찾기 화면의 네 축 가운데 시기분류
 * (dcterms:temporal)는 `life_period` 에서 그대로 만들어진다(facets.ts).
 * 곧 여기서 "어린 시절"을 하나 적으면 찾기 화면에 "할머니/어린 시절"이라는
 * 고를 수 있는 값이 생기고, 적지 않으면 그 축은 영영 비어 있다. 분류를
 * 분류 화면이 아니라 인물 화면에서 세우는 까닭이 그것이다: 시기는 누구의
 * 시기인지를 떼어놓고는 말이 되지 않는다.
 *
 * 관리자만 오는 화면이라 접근 통제를 걸지 않는다 — `requireAdmin()` 이
 * 화면 입구에서 이미 막는다(admin-curation.ts 와 같은 판단이다).
 *
 * 모든 질의의 오류를 던진다. 연표·찾기와 같은 이유다 — 하나만 검사하고
 * 나머지를 `?? []` 로 삼키면 실패가 "빈 결과"와 구별되지 않아, 가족 관계가
 * 통째로 사라진 화면을 아무 경고 없이 보게 된다. 고치는 화면에서 그것은
 * 더 나쁘다: 비어 보이는 칸을 사람이 다시 채워 넣게 된다.
 *
 * 질의는 한 번에 가져와 메모리에서 붙인다. 인물 수도 생애 시기 수도 한
 * 집안 규모로 묶여 있으므로 줄마다 되묻는 것(N+1)은 값이 아니라 습관의
 * 문제다(people.ts 머리말).
 */

// ---------------------------------------------------------------- 모양

export interface PersonForm {
  id: string;
  /** 전거의 display_name. "김순자(할머니)" 꼴. */
  name: string;
  /** 호칭. 괄호 안. */
  short: string;
  aliases: string[];
  birthEdtf: string | null;
  deathEdtf: string | null;
  bornYear: number | null;
  diedYear: number | null;
  relation: string | null;
  note: string | null;
}

/** 생애 시기 한 줄. `count` 는 이 시기가 걸린 기록 수 — 곧 시기분류의 건수다. */
export interface LifePeriodRow {
  id: string;
  label: string;
  fromEdtf: string | null;
  toEdtf: string | null;
  fromYear: number | null;
  toYear: number | null;
  sortOrder: number;
  note: string | null;
  count: number;
  /** 찾기 화면의 시기분류 값. "할머니/어린 시절" 꼴(facets.ts 와 같은 규칙). */
  facet: string;
}

/** 부모·배우자·자식 한 줄. 빼기 폼이 쓸 것까지 담는다. */
export interface KinRow {
  id: string;
  name: string;
  short: string;
  bornYear: number | null;
  diedYear: number | null;
}

/** 관계를 맺을 후보. 자기 자신은 빠진다 — DB 가 자기 관계를 거부한다. */
export interface PersonOption {
  id: string;
  name: string;
}

export interface PersonAdmin {
  person: PersonForm;
  periods: LifePeriodRow[];
  parents: KinRow[];
  spouses: KinRow[];
  children: KinRow[];
  /** 나오는 기록 수. */
  appears: number;
  /** 만든 기록 수. */
  made: number;
  others: PersonOption[];
}

// ---------------------------------------------------------------- 조각

interface PersonRow {
  id: string;
  display_name: string;
  aliases: string[] | null;
  birth_edtf: string | null;
  death_edtf: string | null;
  born_year: number | null;
  died_year: number | null;
  relation_to_root: string | null;
  note: string | null;
}

const PERSON_COLUMNS =
  'id, display_name, aliases, birth_edtf, death_edtf, born_year, died_year, relation_to_root, note';

/**
 * 만든 사람으로 세는 역할. people.ts 가 쓰는 것과 같은 갈래다 — 보는 화면과
 * 고치는 화면에서 같은 건수가 나와야 하므로 규칙을 벌려두지 않는다.
 */
const MADE_ROLES = new Set(['photographer', 'author']);

function kin(p: PersonRow): KinRow {
  return {
    id: p.id,
    name: p.display_name,
    short: shortName(p.display_name),
    bornYear: p.born_year,
    diedYear: p.died_year,
  };
}

/** 부모 → 자식 순. 생년을 모르는 인물은 뒤에 두고 이름으로 가른다(people.ts). */
function byGeneration(a: PersonRow, b: PersonRow): number {
  if (a.born_year !== null && b.born_year !== null) return a.born_year - b.born_year;
  if (a.born_year !== null) return -1;
  if (b.born_year !== null) return 1;
  return a.display_name.localeCompare(b.display_name, 'ko');
}

// ---------------------------------------------------------------- 조립

export async function getPersonAdmin(id: string): Promise<PersonAdmin | null> {
  const supabase = db();

  const [peopleRes, relRes, periodRes, linkRes, plinkRes] = await Promise.all([
    // 가족의 이름과 관계 후보 목록이 모두 필요하므로 전거를 통째로 가져온다.
    // 한 집안 규모라 한 번에 읽는 편이 관계마다 되묻는 것보다 싸다.
    supabase.from('person').select(PERSON_COLUMNS),
    supabase.from('person_relation').select('from_person_id, to_person_id, kind'),
    supabase
      .from('life_period')
      .select('id, label, from_edtf, to_edtf, from_year, to_year, sort_order, note')
      .eq('person_id', id)
      .order('sort_order'),
    supabase.from('item_person').select('item_id, role').eq('person_id', id),
    // 시기분류의 건수를 내려면 걸린 기록을 알아야 한다. 연결표는 작아서
    // 통째로 읽고 메모리에서 이 인물의 시기만 추린다.
    supabase.from('item_life_period').select('item_id, life_period_id'),
  ]);

  for (const [what, res] of [
    ['인물', peopleRes],
    ['가족 관계', relRes],
    ['생애 시기', periodRes],
    ['인물-기록 연결', linkRes],
    ['시기 연결', plinkRes],
  ] as const) {
    if (res.error) throw new Error(`인물 편집 ${what} 조회 실패: ${res.error.message}`);
  }

  const people = (peopleRes.data ?? []) as PersonRow[];
  const self = people.find((p) => p.id === id);
  if (!self) return null;

  const byId = new Map(people.map((p) => [p.id, p]));
  const relations = relRes.data ?? [];
  const periodRows = periodRes.data ?? [];
  const links = linkRes.data ?? [];
  const periodIds = new Set(periodRows.map((p) => p.id));
  const plinks = (plinkRes.data ?? []).filter((l) => periodIds.has(l.life_period_id));

  // 건수는 살아 있는 기록만 센다(admin-classes.ts 와 같은 규칙). 보관함으로
  // 내린 기록까지 세면 화면의 숫자가 찾기 화면의 숫자와 어긋난다.
  const itemIds = [...new Set([...links.map((l) => l.item_id), ...plinks.map((l) => l.item_id)])];
  const live = new Set<string>();
  const typeOf = new Map<string, string>();
  if (itemIds.length > 0) {
    const { data, error } = await supabase
      .from('item_effective')
      .select('id, type')
      .in('id', itemIds)
      .eq('is_archived', false)
      .eq('bundle_archived', false);
    if (error) throw new Error(`인물 편집 기록 조회 실패: ${error.message}`);
    for (const it of (data ?? []) as { id: string; type: string }[]) {
      live.add(it.id);
      typeOf.set(it.id, it.type);
    }
  }

  // ── 생애 시기 ────────────────────────────────────────────────
  const periodCount = new Map<string, number>();
  for (const l of plinks) {
    if (!live.has(l.item_id)) continue;
    periodCount.set(l.life_period_id, (periodCount.get(l.life_period_id) ?? 0) + 1);
  }

  const who = shortName(self.display_name);
  const periods: LifePeriodRow[] = periodRows.map((p) => ({
    id: p.id,
    label: p.label,
    fromEdtf: p.from_edtf,
    toEdtf: p.to_edtf,
    fromYear: p.from_year,
    toYear: p.to_year,
    sortOrder: p.sort_order,
    note: p.note,
    count: periodCount.get(p.id) ?? 0,
    facet: `${who}/${p.label}`,
  }));

  // ── 가족 ────────────────────────────────────────────────────
  // parent 는 to 가 from 의 부모다. 자식은 그 화살표를 거꾸로 읽으면 나온다 —
  // 따로 저장되는 것이 아니라서 화면에서도 직접 더할 수 없다(people.ts).
  // 배우자는 어느 쪽으로 적혀 있든 같은 뜻이라 양방향으로 모은다.
  const parents: PersonRow[] = [];
  const spouses: PersonRow[] = [];
  const children: PersonRow[] = [];
  for (const r of relations) {
    if (r.kind === 'parent') {
      if (r.from_person_id === id) {
        const p = byId.get(r.to_person_id);
        if (p) parents.push(p);
      } else if (r.to_person_id === id) {
        const c = byId.get(r.from_person_id);
        if (c) children.push(c);
      }
    } else if (r.kind === 'spouse') {
      const other =
        r.from_person_id === id
          ? r.to_person_id
          : r.to_person_id === id
            ? r.from_person_id
            : null;
      const s = other ? byId.get(other) : null;
      if (s) spouses.push(s);
    }
  }

  // 배우자는 양쪽에 적혀 있으므로 위 고리를 두 번 지난다. 같은 인물이 두 줄로
  // 서면 빼기 단추도 둘이 되어, 하나를 눌러도 다른 하나가 남은 것처럼 보인다.
  const uniq = (rows: PersonRow[]) => [...new Map(rows.map((p) => [p.id, p])).values()];

  // ── 기록 ────────────────────────────────────────────────────
  // 사건(Event)은 세지 않는다. 파일이 없고 제목만 있어 "기록 n건"에 섞이면
  // 건수가 실제 볼 수 있는 것보다 부풀어 보인다(people.ts).
  let appears = 0;
  let made = 0;
  for (const l of links) {
    if (!live.has(l.item_id) || typeOf.get(l.item_id) === 'Event') continue;
    if (MADE_ROLES.has(l.role)) made += 1;
    else appears += 1;
  }

  return {
    person: {
      id: self.id,
      name: self.display_name,
      short: who,
      aliases: self.aliases ?? [],
      birthEdtf: self.birth_edtf,
      deathEdtf: self.death_edtf,
      bornYear: self.born_year,
      diedYear: self.died_year,
      relation: self.relation_to_root,
      note: self.note,
    },
    periods,
    parents: uniq(parents).sort(byGeneration).map(kin),
    spouses: uniq(spouses).sort(byGeneration).map(kin),
    children: uniq(children).sort(byGeneration).map(kin),
    appears,
    made,
    others: people
      .filter((p) => p.id !== id)
      .sort(byGeneration)
      .map((p) => ({ id: p.id, name: p.display_name })),
  };
}
