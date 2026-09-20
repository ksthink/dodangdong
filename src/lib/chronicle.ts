import 'server-only';
import { db } from './db';
import { canView, type Role } from './access';
import { thumbsFor, type ItemRow } from './queries';

/**
 * 연표.
 *
 * 따로 입력하는 것이 없다. 이미 있는 것에서 조립된다 — 사람의 생몰과
 * 생애 시기, 날짜가 있는 모든 자료, 사건, 그리고 그해의 바깥 세상.
 * 그래서 이 파일에는 쓰기가 없고 조립 규칙만 있다.
 *
 * 세 층으로 나온다. 연대 막대(어느 10년에 무엇이 몰려 있나) → 생애 레인
 * (그 시간대에 누가 살아 있었나) → 해마다 펼침(그해에 무슨 일이 있었나).
 * 위에서 고르면 아래가 따라 움직인다.
 *
 * 잠긴 자료를 목록에서 지우지 않는 것은 이 저장소의 기존 방침을 따른 것이다
 * (queries.ts 머리말). 연표에서도 자리는 차지하되 제목을 감춘다 — 언제
 * 무언가 있었다는 사실까지 지우면, 가족이 무엇을 못 보고 있는지조차 알 수 없다.
 */

// ---------------------------------------------------------------- 모양

export interface Decade {
  label: string;
  value: number;
  count: number;
  current: boolean;
}

export interface LaneSpan {
  label: string;
  from: number;
  to: number;
}

export interface LaneEvent {
  date: number;
  title: string;
  verified: boolean;
}

export interface Lane {
  id: string;
  name: string;
  born: number | null;
  died: number | null;
  periods: LaneSpan[];
  events: LaneEvent[];
  records: number[];
}

export interface YearAge {
  name: string;
  age: number;
}

export interface YearEntry {
  date: string;
  title: string;
  href: string | null;
  type: string | null;
  verified: boolean;
  locked: boolean;
}

export interface ChronicleYearData {
  year: number;
  ages: YearAge[];
  events: YearEntry[];
  records: YearEntry[];
  recordCount: number;
  thumbs: string[];
  world: { date: string; title: string }[];
}

export interface ChronicleData {
  decades: Decade[];
  lanes: Lane[];
  from: number;
  to: number;
  years: ChronicleYearData[];
  cursor: number | null;
  undatedCount: number;
}

// ---------------------------------------------------------------- 조각

/** created_start('1978-05-14') 에서 연도만. */
function yearOf(d: string | null): number | null {
  if (!d) return null;
  const y = Number(d.slice(0, 4));
  return Number.isFinite(y) ? y : null;
}

/**
 * 화면에 보일 날짜. EDTF 원문이 있으면 그대로 쓴다 — 1978? 나 197X 가
 * 1978-01-01 로 둔갑하지 않게 하려는 것이다. 모르는 것은 모른다고 쓴다.
 */
function dateLabel(item: ItemRow): string {
  if (item.created_edtf) return item.created_edtf;
  return item.created_start ?? '';
}

const TYPE_LABEL: Record<string, string> = {
  StillImage: '사진',
  Sound: '음성',
  MovingImage: '영상',
  Text: '문서',
  PhysicalObject: '실물',
  Collection: '묶음',
  Event: '사건',
};

export function typeLabel(t: string): string {
  return TYPE_LABEL[t] ?? t;
}

/**
 * 연표에 적을 짧은 이름.
 *
 * 전거의 display_name 은 "김순자(할머니)" 꼴이다. 레인 한 줄과 나이 목록에는
 * 호칭만 쓴다 — 명세가 말하는 "가족 호칭은 아카이브를 만드는 사람 기준으로
 * 통일한다"가 이 자리에 해당한다. 괄호가 없으면 이름을 그대로 쓴다.
 *
 * relation_to_root('아버지의 어머니')는 쓰지 않는다. 그건 관계를 설명하는
 * 문장이지 부르는 이름이 아니다.
 */
export function shortName(displayName: string): string {
  const m = displayName.match(/\(([^)]+)\)\s*$/);
  return m ? m[1] : displayName;
}

// ---------------------------------------------------------------- 조립

export async function getChronicle(role: Role, decade?: number): Promise<ChronicleData> {
  const supabase = db();

  const [itemsRes, peopleRes, periodsRes, worldRes] = await Promise.all([
    supabase
      .from('item_effective')
      .select('*')
      .eq('is_archived', false)
      .eq('bundle_archived', false)
      .not('created_start', 'is', null)
      .order('created_start', { ascending: true })
      .order('seq', { ascending: true }),
    supabase
      .from('person')
      .select('id, display_name, born_year, died_year, birth_edtf, death_edtf, relation_to_root')
      .order('born_year', { ascending: true, nullsFirst: false }),
    supabase
      .from('life_period')
      .select('person_id, label, from_year, to_year, sort_order')
      .order('sort_order'),
    supabase.from('world_event').select('year, label').order('year').order('sort_order'),
  ]);

  // 넷 다 똑같이 던진다. 하나만 검사하고 나머지를 `?? []` 로 삼키면,
  // 실패가 "빈 결과"와 구별되지 않는다 — 연표는 에러도 로그도 없이
  // 절반만 그려지고, 원인을 찾을 실마리가 남지 않는다.
  // (가장 흔한 경우: 마이그레이션을 아직 올리지 않은 채로 배포해
  //  person 질의가 born_year 열 부재로 실패하는 것.)
  for (const [what, res] of [
    ['자료', itemsRes],
    ['인물', peopleRes],
    ['생애 시기', periodsRes],
    ['바깥 세상', worldRes],
  ] as const) {
    if (res.error) throw new Error(`연표 ${what} 조회 실패: ${res.error.message}`);
  }

  const items = (itemsRes.data ?? []) as ItemRow[];
  const people = peopleRes.data ?? [];
  const periods = periodsRes.data ?? [];
  const world = worldRes.data ?? [];

  // 날짜 없는 자료는 연표에 자리가 없다. 몇 건인지만 세어 아래에 알린다.
  const undatedCount = await countUndated();

  // ── 연대 ────────────────────────────────────────────────────
  const byDecade = new Map<number, number>();
  for (const it of items) {
    const y = yearOf(it.created_start);
    if (y === null) continue;
    const d = Math.floor(y / 10) * 10;
    byDecade.set(d, (byDecade.get(d) ?? 0) + 1);
  }

  const decadeValues = [...byDecade.keys()].sort((a, b) => a - b);

  // 고르지 않았을 때 어느 연대를 펼칠 것인가. 가장 최근을 펼치면 아카이브가
  // 대개 텅 빈 화면으로 시작한다 — 최근 10년은 아직 정리되지 않았고, 옛 자료가
  // 먼저 쌓이기 때문이다. 자료가 가장 많은 연대를 펼친다. 같으면 나중 쪽.
  const busiest = decadeValues.reduce<number | null>((best, v) => {
    if (best === null) return v;
    return (byDecade.get(v) ?? 0) >= (byDecade.get(best) ?? 0) ? v : best;
  }, null);
  const current = decade ?? busiest;

  const decades: Decade[] = decadeValues.map((v) => ({
    label: `${v}`,
    value: v,
    count: byDecade.get(v) ?? 0,
    current: v === current,
  }));

  // ── 레인의 시간 범위 ─────────────────────────────────────────
  // 사람의 생몰과 자료의 연도를 모두 감싸는 구간. 양쪽 끝을 10년 단위로
  // 떨어뜨려 눈금이 잘리지 않게 한다.
  const years: number[] = [];
  for (const it of items) {
    const y = yearOf(it.created_start);
    if (y !== null) years.push(y);
  }
  for (const p of people) {
    if (p.born_year) years.push(p.born_year);
    if (p.died_year) years.push(p.died_year);
  }
  const nowYear = new Date().getFullYear();
  const from = years.length ? Math.floor(Math.min(...years) / 10) * 10 : nowYear - 100;
  const to = years.length ? Math.ceil(Math.max(...years, nowYear) / 10) * 10 : nowYear;

  // ── 레인 ────────────────────────────────────────────────────
  // 사람마다 한 줄. 그 사람이 등장하거나 만든 자료를 점으로 찍는다.
  const personItems = await itemsByPerson(people.map((p) => p.id));

  const lanes: Lane[] = people
    .filter((p) => p.born_year !== null)
    .map((p) => {
      const mine = personItems.get(p.id) ?? new Set<string>();
      const laneEvents: LaneEvent[] = [];
      const laneRecords: number[] = [];

      for (const it of items) {
        if (!mine.has(it.id)) continue;
        const y = yearOf(it.created_start);
        if (y === null) continue;
        if (it.type === 'Event') {
          laneEvents.push({
            date: y,
            title: canView(it.access_level, role) ? it.title : '잠긴 사건',
            verified: Boolean((it as ItemRow & { date_verified?: boolean }).date_verified),
          });
        } else {
          laneRecords.push(y);
        }
      }

      return {
        id: p.id,
        name: shortName(p.display_name),
        born: p.born_year,
        died: p.died_year,
        periods: periods
          .filter((s) => s.person_id === p.id && s.from_year !== null)
          .map((s) => ({
            label: s.label,
            from: s.from_year as number,
            // 끝나지 않은 시기는 죽은 해까지, 살아 있으면 지금까지 그린다.
            to: s.to_year ?? p.died_year ?? nowYear,
          })),
        events: laneEvents,
        records: laneRecords,
      };
    });

  // ── 해마다 ──────────────────────────────────────────────────
  // 고른 연대의 열 해만 펼친다. 전부 펼치면 한 화면에 100년이 쏟아진다.
  const worldByYear = new Map<number, { date: string; title: string }[]>();
  for (const w of world) {
    if (!worldByYear.has(w.year)) worldByYear.set(w.year, []);
    worldByYear.get(w.year)!.push({ date: `${w.year}`, title: w.label });
  }

  const inDecade = current === null
    ? []
    : items.filter((it) => {
        const y = yearOf(it.created_start);
        return y !== null && y >= current && y < current + 10;
      });

  const thumbMap = await thumbsFor(
    inDecade.filter((it) => canView(it.access_level, role)).map((it) => it.id),
  );

  const yearBuckets = new Map<number, ItemRow[]>();
  for (const it of inDecade) {
    const y = yearOf(it.created_start)!;
    if (!yearBuckets.has(y)) yearBuckets.set(y, []);
    yearBuckets.get(y)!.push(it);
  }

  const yearsOut: ChronicleYearData[] = [...yearBuckets.keys()]
    .sort((a, b) => a - b)
    .map((year) => {
      const bucket = yearBuckets.get(year)!;
      const entries = bucket.map((it) => toEntry(it, role));

      return {
        year,
        ages: people
          .filter((p) => p.born_year !== null && p.born_year <= year)
          .filter((p) => p.died_year === null || p.died_year >= year)
          .map((p) => ({
            name: shortName(p.display_name),
            age: year - (p.born_year as number),
          })),
        events: entries.filter((_, i) => bucket[i].type === 'Event'),
        records: entries.filter((_, i) => bucket[i].type !== 'Event'),
        recordCount: bucket.filter((it) => it.type !== 'Event').length,
        thumbs: bucket
          .filter((it) => it.type !== 'Event' && canView(it.access_level, role))
          .map((it) => thumbMap.get(it.id))
          .filter((v): v is string => Boolean(v))
          .slice(0, 5)
          .map((fileId) => `/media/${fileId}`),
        world: worldByYear.get(year) ?? [],
      };
    });

  return {
    decades,
    lanes,
    from,
    to,
    years: yearsOut,
    cursor: current,
    undatedCount,
  };
}

function toEntry(it: ItemRow, role: Role): YearEntry {
  const visible = canView(it.access_level, role);
  return {
    date: dateLabel(it),
    title: visible ? it.title : '잠긴 자료',
    href: visible ? `/item/${it.id}` : null,
    type: it.type === 'Event' ? null : typeLabel(it.type),
    verified: Boolean((it as ItemRow & { date_verified?: boolean }).date_verified),
    locked: !visible,
  };
}

/**
 * 그 사람이 나오거나 만든 자료의 id 집합을 사람별로 모은다.
 *
 * 자료 id 가 아니라 사람 id 로 좁힌다. PostgREST 는 `.in()` 목록을 URL 질의
 * 문자열에 싣는데, uuid 하나가 36자라 자료 3,000건이면 URL 이 100KB 를 넘어
 * 프록시의 요청 라인 한계에 걸려 갑자기 400 으로 죽는다. 사람 수는 한 집안
 * 규모로 묶여 있으므로 이쪽을 기준으로 삼으면 천장이 없다.
 */
async function itemsByPerson(personIds: string[]): Promise<Map<string, Set<string>>> {
  const map = new Map<string, Set<string>>();
  if (personIds.length === 0) return map;
  const { data, error } = await db()
    .from('item_person')
    .select('item_id, person_id')
    .in('person_id', personIds);
  if (error) throw new Error(`연표 인물-자료 연결 조회 실패: ${error.message}`);
  for (const r of data ?? []) {
    if (!map.has(r.person_id)) map.set(r.person_id, new Set());
    map.get(r.person_id)!.add(r.item_id);
  }
  return map;
}

async function countUndated(): Promise<number> {
  const { count } = await db()
    .from('item_effective')
    .select('id', { count: 'exact', head: true })
    .eq('is_archived', false)
    .eq('bundle_archived', false)
    .is('created_start', null);
  return count ?? 0;
}
