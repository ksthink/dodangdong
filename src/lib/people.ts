import 'server-only';
import { db } from './db';
import { canView, type Role } from './access';
import { shortName, type Lane, type LaneSpan } from './chronicle';
import { thumbsFor, type ItemRow } from './queries';

/**
 * 인물.
 *
 * 연표가 "언제"로 찾는 길이고 분류가 "무엇"으로 찾는 길이라면, 이쪽은
 * "누구"로 찾는 길이다. 가족이 아카이브를 여는 가장 흔한 이유이기도 하다 —
 * 대개 무엇을 찾는지보다 누구를 찾는지가 먼저 떠오른다.
 *
 * 두 가지를 지킨다.
 *
 * 하나. 인물 페이지는 공개 기록에 한 번이라도 나오는 인물만 손님에게
 * 보인다(명세). 전거에만 있고 볼 수 있는 기록이 하나도 없는 인물은 이름
 * 자체가 집안 정보이므로 목록에도 상세에도 내지 않는다. 관리자는 전부 본다.
 * 가족에게는 가족 등급까지 쳐서 판정한다 — 볼 수 있는 기록이 있으면 그
 * 인물을 숨길 이유가 없고, 판정을 canView 하나로 모아 두면 등급이 늘어도
 * 이 파일을 고칠 일이 없다.
 *
 * 둘. 잠긴 기록은 목록에서 지우지 않고 제목만 감춘다 — 저장소의 기존
 * 방침(queries.ts 머리말)을 그대로 따른다.
 *
 * 질의는 전부 한 번에 가져와 메모리에서 붙인다. 인물 수는 한 집안 규모로
 * 묶여 있으므로 인물마다 질의를 도는 것(N+1)은 값이 아니라 습관의 문제다.
 */

// ---------------------------------------------------------------- 모양

export interface PersonSummary {
  id: string;
  /** 전거의 display_name. "김순자(할머니)" 꼴. */
  name: string;
  /** 부르는 이름. 괄호 안. */
  short: string;
  aliases: string[];
  birthEdtf: string | null;
  deathEdtf: string | null;
  bornYear: number | null;
  diedYear: number | null;
  relation: string | null;
  note: string | null;
  /** 나오는 기록 수. */
  appears: number;
  /** 만든 기록 수. */
  made: number;
  /** 얼굴 자리에 쓸 사진. 없으면 null. */
  face: string | null;
}

/** 부모·배우자·자식. 이름만 알면 카드 한 줄이 되고, id 로 건너간다. */
export interface PersonKin {
  id: string;
  name: string;
  short: string;
  bornYear: number | null;
  diedYear: number | null;
}

/** ResultRow 한 줄에 그대로 들어가는 모양. */
export interface PersonRecord {
  id: string;
  title: string;
  href: string | null;
  summary: string | null;
  type: string;
  docType: string | null;
  date: string | null;
  dateVerified: boolean;
  thumb: string | null;
}

export interface PersonDetail {
  person: PersonSummary;
  periods: LaneSpan[];
  parents: PersonKin[];
  spouses: PersonKin[];
  children: PersonKin[];
  /** 나오는 기록. */
  appears: PersonRecord[];
  /** 만든 기록. */
  made: PersonRecord[];
  /** 그 인물 한 줄짜리 생애 레인. */
  lane: Lane;
  from: number;
  to: number;
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

/** 만든 사람으로 세는 역할. 나머지(depicted·recipient·speaker·mentioned)는 나오는 쪽. */
const MADE_ROLES = new Set(['photographer', 'author']);

/** created_start('1978-05-14') 에서 연도만. */
function yearOf(d: string | null): number | null {
  if (!d) return null;
  const y = Number(d.slice(0, 4));
  return Number.isFinite(y) ? y : null;
}

/**
 * 화면에 적을 날짜. EDTF 원문이 있으면 그대로 쓴다 — 1978? 나 197X 가
 * 1978-01-01 로 둔갑하지 않게 하려는 것이다.
 */
function dateLabel(it: ItemRow): string | null {
  return it.created_edtf ?? it.created_start;
}

function kin(p: PersonRow): PersonKin {
  return {
    id: p.id,
    name: p.display_name,
    short: shortName(p.display_name),
    bornYear: p.born_year,
    diedYear: p.died_year,
  };
}

/** 부모 → 자식 순. 생년을 모르는 인물은 뒤에 두고 이름으로 가른다. */
function byGeneration(a: PersonRow, b: PersonRow): number {
  if (a.born_year !== null && b.born_year !== null) return a.born_year - b.born_year;
  if (a.born_year !== null) return -1;
  if (b.born_year !== null) return 1;
  return a.display_name.localeCompare(b.display_name, 'ko');
}

// ---------------------------------------------------------------- 목록

export async function getPeopleList(role: Role): Promise<PersonSummary[]> {
  const supabase = db();

  const [peopleRes, linksRes, itemsRes] = await Promise.all([
    supabase.from('person').select(PERSON_COLUMNS),
    supabase.from('item_person').select('item_id, person_id, role'),
    supabase
      .from('item_effective')
      .select('id, type, access_level, created_start')
      .eq('is_archived', false)
      .eq('bundle_archived', false),
  ]);

  // 셋 다 똑같이 던진다. 하나만 검사하고 나머지를 `?? []` 로 삼키면 실패가
  // "빈 결과"와 구별되지 않는다 — 인물이 통째로 사라진 화면을 아무 경고도
  // 없이 보게 되고, 그것이 접근 통제인지 장애인지 알 길이 없다.
  for (const [what, res] of [
    ['인물', peopleRes],
    ['인물-기록 연결', linksRes],
    ['기록', itemsRes],
  ] as const) {
    if (res.error) throw new Error(`인물 ${what} 조회 실패: ${res.error.message}`);
  }

  const people = (peopleRes.data ?? []) as PersonRow[];
  const links = linksRes.data ?? [];
  const items = (itemsRes.data ?? []) as {
    id: string;
    type: string;
    access_level: ItemRow['access_level'];
    created_start: string | null;
  }[];

  const itemById = new Map(items.map((i) => [i.id, i]));

  // 인물마다 세 가지를 모은다 — 나오는 수, 만든 수, 그리고 볼 수 있는 것이
  // 하나라도 있는가. 사건(Event)은 세지 않는다. 파일이 없고 제목만 있어
  // "기록 n건"에 섞이면 건수가 실제 볼 수 있는 것보다 부풀어 보인다.
  const counts = new Map<string, { appears: number; made: number }>();
  const visible = new Set<string>();
  const faceCandidates = new Map<string, string[]>();

  for (const l of links) {
    const it = itemById.get(l.item_id);
    if (!it) continue;
    const seen = canView(it.access_level, role);
    if (seen) visible.add(l.person_id);
    if (it.type === 'Event') continue;

    const c = counts.get(l.person_id) ?? { appears: 0, made: 0 };
    if (MADE_ROLES.has(l.role)) c.made += 1;
    else c.appears += 1;
    counts.set(l.person_id, c);

    // 얼굴은 그 인물이 찍힌 사진에서 가져온다. 자기가 찍은 사진은 남의
    // 얼굴이므로 쓰지 않는다.
    if (seen && l.role === 'depicted' && it.type === 'StillImage') {
      const list = faceCandidates.get(l.person_id) ?? [];
      if (list.length < 3) {
        list.push(it.id);
        faceCandidates.set(l.person_id, list);
      }
    }
  }

  const shown = people.filter((p) => role === 'admin' || visible.has(p.id)).sort(byGeneration);

  // 얼굴 후보는 인물마다 세 장까지다. 기록 전체로 썸네일을 훑으면 `.in()`
  // 목록이 URL 에 실려 프록시 한계에 걸린다(chronicle.ts 참고).
  const faceIds = shown.flatMap((p) => faceCandidates.get(p.id) ?? []);
  const thumbs = await thumbsFor(faceIds);

  return shown.map((p) => {
    const c = counts.get(p.id) ?? { appears: 0, made: 0 };
    const face = (faceCandidates.get(p.id) ?? [])
      .map((id) => thumbs.get(id))
      .find((v): v is string => Boolean(v));
    return {
      id: p.id,
      name: p.display_name,
      short: shortName(p.display_name),
      aliases: p.aliases ?? [],
      birthEdtf: p.birth_edtf,
      deathEdtf: p.death_edtf,
      bornYear: p.born_year,
      diedYear: p.died_year,
      relation: p.relation_to_root,
      note: p.note,
      appears: c.appears,
      made: c.made,
      face: face ? `/media/${face}` : null,
    };
  });
}

// ---------------------------------------------------------------- 상세

export async function getPersonDetail(role: Role, id: string): Promise<PersonDetail | null> {
  const supabase = db();

  const [peopleRes, relRes, periodRes, linkRes] = await Promise.all([
    // 부모·배우자·자식의 이름이 필요하므로 전거를 통째로 가져온다. 한 집안
    // 규모라 한 번에 읽는 편이 관계마다 되묻는 것보다 싸다.
    supabase.from('person').select(PERSON_COLUMNS),
    supabase.from('person_relation').select('from_person_id, to_person_id, kind'),
    supabase
      .from('life_period')
      .select('label, from_year, to_year, sort_order')
      .eq('person_id', id)
      .order('sort_order'),
    supabase.from('item_person').select('item_id, role').eq('person_id', id),
  ]);

  for (const [what, res] of [
    ['인물', peopleRes],
    ['가족 관계', relRes],
    ['생애 시기', periodRes],
    ['인물-기록 연결', linkRes],
  ] as const) {
    if (res.error) throw new Error(`인물 ${what} 조회 실패: ${res.error.message}`);
  }

  const people = (peopleRes.data ?? []) as PersonRow[];
  const self = people.find((p) => p.id === id);
  if (!self) return null;

  const byId = new Map(people.map((p) => [p.id, p]));
  const relations = relRes.data ?? [];
  const periodRows = periodRes.data ?? [];
  const links = linkRes.data ?? [];

  // 기록은 이 인물 것만 가져온다. id 목록이 한 인물의 기록으로 묶여 있어
  // URL 길이 걱정이 없다.
  const itemIds = [...new Set(links.map((l) => l.item_id))];
  let items: ItemRow[] = [];
  if (itemIds.length > 0) {
    const { data, error } = await supabase
      .from('item_effective')
      .select('*')
      .in('id', itemIds)
      .eq('is_archived', false)
      .eq('bundle_archived', false)
      .order('created_start', { ascending: true, nullsFirst: false })
      .order('seq', { ascending: true });
    if (error) throw new Error(`인물 기록 조회 실패: ${error.message}`);
    items = (data ?? []) as ItemRow[];
  }

  // 손님에게는 공개 기록에 한 번이라도 나오는 인물만 보인다. 없는 인물은
  // 404 로 둔다 — "볼 수 없습니다"라고 답하면 그 인물이 있다는 사실이
  // 새어 나가고, 그것이 감추려던 것이다.
  if (role !== 'admin' && !items.some((it) => canView(it.access_level, role))) return null;

  // ── 가족 ────────────────────────────────────────────────────
  // parent 는 to 가 from 의 부모다. 자식은 그 화살표를 거꾸로 읽으면 나온다.
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
      const other = r.from_person_id === id ? r.to_person_id : r.to_person_id === id ? r.from_person_id : null;
      const s = other ? byId.get(other) : null;
      // 배우자는 양쪽에 다 적혀 있다(방향이 없는 관계라 그렇게 저장한다).
      // 그래서 두 줄을 다 지나가면 같은 사람이 두 번 담긴다.
      if (s && !spouses.some((x) => x.id === s.id)) spouses.push(s);
    }
  }

  // ── 기록 ────────────────────────────────────────────────────
  const roleOf = new Map<string, string[]>();
  for (const l of links) {
    if (!roleOf.has(l.item_id)) roleOf.set(l.item_id, []);
    roleOf.get(l.item_id)!.push(l.role);
  }

  const thumbs = await thumbsFor(
    items.filter((it) => canView(it.access_level, role)).map((it) => it.id),
  );

  const toRecord = (it: ItemRow): PersonRecord => {
    const seen = canView(it.access_level, role);
    const thumb = thumbs.get(it.id);
    return {
      id: it.id,
      title: seen ? it.title : '잠긴 기록',
      href: seen ? `/item/${it.id}` : null,
      summary: seen ? it.description : null,
      type: it.type,
      docType: it.doc_type,
      date: dateLabel(it),
      dateVerified: it.date_verified,
      thumb: seen && thumb ? `/media/${thumb}` : null,
    };
  };

  // 사건은 두 목록 어디에도 넣지 않는다. 파일이 없어 한 줄로 서면 빈
  // 썸네일만 남고, 사건의 자리는 바로 위의 생애 레인이다.
  const records = items.filter((it) => it.type !== 'Event');
  const made = records.filter((it) => (roleOf.get(it.id) ?? []).some((r) => MADE_ROLES.has(r)));
  const appears = records.filter((it) => (roleOf.get(it.id) ?? []).some((r) => !MADE_ROLES.has(r)));

  // ── 생애 레인 ────────────────────────────────────────────────
  const nowYear = new Date().getFullYear();
  const periods: LaneSpan[] = periodRows
    .filter((s) => s.from_year !== null)
    .map((s) => ({
      label: s.label,
      from: s.from_year as number,
      // 끝나지 않은 시기는 죽은 해까지, 살아 있으면 지금까지 그린다.
      to: s.to_year ?? self.died_year ?? nowYear,
    }));

  const lane: Lane = {
    id: self.id,
    name: shortName(self.display_name),
    born: self.born_year,
    died: self.died_year,
    periods,
    events: items
      .filter((it) => it.type === 'Event' && yearOf(it.created_start) !== null)
      .map((it) => ({
        date: yearOf(it.created_start) as number,
        title: canView(it.access_level, role) ? it.title : '잠긴 사건',
        verified: it.date_verified,
      })),
    records: records
      .map((it) => yearOf(it.created_start))
      .filter((y): y is number => y !== null),
  };

  // 얼굴은 그 인물이 찍힌 사진에서 가져온다. 자기가 찍은 사진은 남의
  // 얼굴이므로 쓰지 않는다.
  const faceItem = records.find(
    (it) =>
      it.type === 'StillImage' &&
      (roleOf.get(it.id) ?? []).includes('depicted') &&
      thumbs.has(it.id),
  );

  // 축의 양 끝. 생몰과 기록의 연도를 모두 감싸 10년 단위로 떨어뜨린다 —
  // 눈금이 잘리지 않고, 띠가 레인 밖으로 밀려나지 않는다.
  const years = [
    ...lane.records,
    ...lane.events.map((e) => e.date),
    ...periods.flatMap((p) => [p.from, p.to]),
  ];
  if (self.born_year !== null) years.push(self.born_year);
  if (self.died_year !== null) years.push(self.died_year);
  const from = years.length ? Math.floor(Math.min(...years) / 10) * 10 : nowYear - 100;
  const to = years.length ? Math.ceil(Math.max(...years) / 10) * 10 : nowYear;

  return {
    person: {
      id: self.id,
      name: self.display_name,
      short: shortName(self.display_name),
      aliases: self.aliases ?? [],
      birthEdtf: self.birth_edtf,
      deathEdtf: self.death_edtf,
      bornYear: self.born_year,
      diedYear: self.died_year,
      relation: self.relation_to_root,
      note: self.note,
      appears: appears.length,
      made: made.length,
      face: faceItem ? `/media/${thumbs.get(faceItem.id)}` : null,
    },
    periods,
    parents: parents.sort(byGeneration).map(kin),
    spouses: spouses.sort(byGeneration).map(kin),
    children: children.sort(byGeneration).map(kin),
    appears: appears.map(toRecord),
    made: made.map(toRecord),
    lane,
    from,
    to,
  };
}
