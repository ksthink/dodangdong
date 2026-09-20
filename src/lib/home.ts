import 'server-only';
import { db } from './db';
import { canView, type Role } from './access';
import { thumbsFor, type ItemRow } from './queries';

/**
 * 첫 화면.
 *
 * 아카이브의 첫인상은 "무엇이 있는가"가 아니라 "무엇을 먼저 보면 되는가"를
 * 말해야 한다. 자료 목록을 그대로 쏟으면 방문한 가족은 어디서부터 볼지
 * 모른다. 그래서 큐레이션을 맨 위에 둔다.
 *
 * 히어로는 자리 셋이다. 관리자가 편성한 것이 먼저고, 빈 자리는 자동
 * 큐레이션이 채운다 — "오늘, N년 전"이 먼저고, 그것도 없으면 가장 최근
 * 이야기. 자동으로 넘기지 않는다. 사람이 화살표를 눌러야 다음 것을 본다.
 */

export interface HeroSlide {
  /** "이달의 이야기" · "오늘, 48년 전" · "새로 들어온 기록" */
  kind: string;
  kicker?: string;
  title: string;
  summary?: string;
  count?: number;
  period?: string;
  href: string;
  cta?: string;
  images: { src: string; caption?: string }[];
}

export interface HomeData {
  slides: HeroSlide[];
  total: number;
  typeCounts: { value: string; label: string; count: number }[];
  stories: {
    id: string;
    title: string;
    summary: string | null;
    period: string | null;
    count: number;
    cover: string | null;
  }[];
  recent: (ItemRow & { thumb: string | null })[];
}

const TYPE_ORDER = ['StillImage', 'Text', 'MovingImage', 'Sound', 'PhysicalObject'] as const;
const TYPE_KO: Record<string, string> = {
  StillImage: '사진',
  Text: '문서',
  MovingImage: '영상',
  Sound: '음성',
  PhysicalObject: '실물',
};

/** created_start('1978-05-14') 에서 연도만. */
function yearOf(d: string | null): number | null {
  if (!d) return null;
  const y = Number(d.slice(0, 4));
  return Number.isFinite(y) ? y : null;
}

export async function getHome(role: Role): Promise<HomeData> {
  const supabase = db();

  const [itemsRes, storiesRes, slotsRes, blockRefsRes] = await Promise.all([
    supabase
      .from('item_effective')
      .select('*')
      .eq('is_archived', false)
      .eq('bundle_archived', false)
      .order('submitted_at', { ascending: false }),
    supabase
      .from('collection')
      .select('id, title, summary, description, period_edtf, cover_item_id, sort_order')
      .eq('kind', 'story')
      .order('sort_order'),
    supabase.from('hero_slot').select('*').order('slot'),
    supabase.from('curation_ref').select('block_id, item_id, curation_block(collection_id)'),
  ]);

  // 연표·찾기와 같은 이유로 전부 던진다. 실패가 "빈 결과"로 둔갑하면
  // 첫 화면이 조용히 반쪽이 된다.
  for (const [what, res] of [
    ['자료', itemsRes],
    ['이야기', storiesRes],
    ['히어로 편성', slotsRes],
    ['이야기 블록', blockRefsRes],
  ] as const) {
    if (res.error) throw new Error(`첫 화면 ${what} 조회 실패: ${res.error.message}`);
  }

  // 사건(Event)은 연표의 몫이다. 첫 화면의 "기록"에는 넣지 않는다.
  const all = ((itemsRes.data ?? []) as ItemRow[]).filter((i) => i.type !== 'Event');
  const visible = all.filter((i) => canView(i.access_level, role));
  const stories = storiesRes.data ?? [];
  const slots = slotsRes.data ?? [];

  // 이야기마다 엮인 자료 수
  const refs = (blockRefsRes.data ?? []) as unknown as {
    item_id: string;
    curation_block: { collection_id: string } | null;
  }[];
  const storyItems = new Map<string, Set<string>>();
  for (const r of refs) {
    const cid = r.curation_block?.collection_id;
    if (!cid) continue;
    if (!storyItems.has(cid)) storyItems.set(cid, new Set());
    storyItems.get(cid)!.add(r.item_id);
  }

  // 썸네일은 한 번에. 히어로·이야기 표지·최근 기록이 모두 여기서 가져간다.
  const recent = visible.slice(0, 4);
  const coverIds = stories.map((s) => s.cover_item_id).filter((v): v is string => Boolean(v));
  const todayHits = todayItems(visible);
  const donated = newestBundle(visible);

  const thumbs = await thumbsFor([
    ...recent.map((i) => i.id),
    ...coverIds,
    ...todayHits.slice(0, 3).map((i) => i.id),
    ...donated.items.slice(0, 2).map((i) => i.id),
  ]);
  const src = (id: string) => {
    const f = thumbs.get(id);
    return f ? `/media/${f}` : null;
  };

  // ── 히어로 ──────────────────────────────────────────────────
  const slides: HeroSlide[] = [];

  // 1) 관리자가 편성한 자리. 기간이 지난 것은 건너뛴다.
  const today = new Date().toISOString().slice(0, 10);
  for (const slot of slots) {
    const live =
      (!slot.starts_on || slot.starts_on <= today) && (!slot.ends_on || slot.ends_on >= today);
    if (!live) continue;

    if (slot.collection_id) {
      const s = stories.find((x) => x.id === slot.collection_id);
      if (s) slides.push(storySlide(s, storyItems, src, '이달의 이야기'));
    } else if (slot.auto_kind === 'today') {
      const t = todaySlide(todayHits, src);
      if (t) slides.push(t);
    } else if (slot.auto_kind === 'recent' && donated.items.length > 0) {
      slides.push(donatedSlide(donated, src));
    } else if (slot.auto_kind === 'story' && stories.length > 0) {
      slides.push(storySlide(stories[0], storyItems, src, '이달의 이야기'));
    }
  }

  // 2) 편성이 없으면 있는 것으로 채운다. 첫 화면이 비어 있는 것보다 낫다.
  if (slides.length === 0) {
    if (stories.length > 0) slides.push(storySlide(stories[0], storyItems, src, '이달의 이야기'));
    const t = todaySlide(todayHits, src);
    if (t) slides.push(t);
    if (donated.items.length > 0) slides.push(donatedSlide(donated, src));
  }

  // ── 형태분류별 건수 ──────────────────────────────────────────
  const counts = new Map<string, number>();
  for (const it of visible) counts.set(it.type, (counts.get(it.type) ?? 0) + 1);

  return {
    slides,
    total: visible.length,
    typeCounts: TYPE_ORDER.map((t) => ({
      value: t,
      label: TYPE_KO[t],
      count: counts.get(t) ?? 0,
    })),
    stories: stories.slice(0, 2).map((s) => ({
      id: s.id,
      title: s.title,
      summary: s.summary ?? s.description,
      period: s.period_edtf,
      count: storyItems.get(s.id)?.size ?? 0,
      cover: s.cover_item_id ? src(s.cover_item_id) : null,
    })),
    recent: recent.map((i) => ({ ...i, thumb: src(i.id) })),
  };
}

// ---------------------------------------------------------------- 자동 큐레이션

/**
 * 오늘과 월·일이 같은 자료.
 *
 * 날짜가 확인된 것만 쓴다. 추정 날짜로 "오늘, 48년 전"을 말하면 그 숫자가
 * 사실인 척하게 된다 — 인장이 있는 것에만 이 자리를 준다.
 */
function todayItems(list: ItemRow[]): ItemRow[] {
  const now = new Date();
  const md = `${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
  return list.filter(
    (r) =>
      r.date_verified &&
      r.created_precision === 'day' &&
      r.created_start?.slice(5) === md,
  );
}

function todaySlide(hits: ItemRow[], src: (id: string) => string | null): HeroSlide | null {
  if (hits.length === 0) return null;
  const first = hits[0];
  const y = yearOf(first.created_start);
  const years = y ? new Date().getFullYear() - y : null;
  return {
    kind: years ? `오늘, ${years}년 전` : '오늘',
    kicker: first.created_edtf ?? first.created_start ?? undefined,
    title: first.title,
    summary: first.description ?? undefined,
    count: hits.length,
    period: first.created_edtf ?? first.created_start ?? undefined,
    href: `/item/${first.id}`,
    cta: '기록 보기',
    images: hits
      .slice(0, 3)
      .map((i) => ({ src: src(i.id), caption: i.identifier }))
      .filter((x): x is { src: string; caption: string } => Boolean(x.src)),
  };
}

/** 가장 최근에 등록된 묶음. "새로 들어온 기록" 자리를 채운다. */
function newestBundle(list: ItemRow[]): { title: string; source: string; items: ItemRow[] } {
  if (list.length === 0) return { title: '', source: '', items: [] };
  const newest = list[0];
  const items = list.filter((i) => i.bundle_id === newest.bundle_id);
  return { title: newest.bundle_title, source: newest.source ?? '', items };
}

function donatedSlide(
  b: { title: string; source: string; items: ItemRow[] },
  src: (id: string) => string | null,
): HeroSlide {
  return {
    kind: '새로 들어온 기록',
    kicker: b.source,
    title: b.title,
    count: b.items.length,
    href: `/search?source=${encodeURIComponent(`${b.source}/${b.title}`)}`,
    cta: '기록 보기',
    images: b.items
      .slice(0, 2)
      .map((i) => ({ src: src(i.id), caption: i.identifier }))
      .filter((x): x is { src: string; caption: string } => Boolean(x.src)),
  };
}

function storySlide(
  s: {
    id: string;
    title: string;
    summary: string | null;
    description: string | null;
    period_edtf: string | null;
    cover_item_id: string | null;
  },
  storyItems: Map<string, Set<string>>,
  src: (id: string) => string | null,
  kind: string,
): HeroSlide {
  const cover = s.cover_item_id ? src(s.cover_item_id) : null;
  return {
    kind,
    // kicker 를 두지 않는다. kind 가 이미 "이달의 이야기"라고 말하므로
    // 그 아래 또 "이야기"를 적으면 같은 말이 두 번 나온다.
    title: s.title,
    summary: s.summary ?? s.description ?? undefined,
    count: storyItems.get(s.id)?.size ?? 0,
    period: s.period_edtf ?? undefined,
    href: `/stories/${s.id}`,
    cta: '이야기 읽기',
    images: cover ? [{ src: cover }] : [],
  };
}
