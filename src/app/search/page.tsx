import Link from 'next/link';
import { currentRole } from '@/lib/access';
import { search, AXES, SORTS, PAGE_SIZES, type Axis, type SortKey, type Selection } from '@/lib/facets';
import { thumbsFor } from '@/lib/queries';
import { num } from '@/lib/ui';
import FacetGroup from '@/components/search/FacetGroup';
import { ResultRow, ResultHeader } from '@/components/search/parts';

export const dynamic = 'force-dynamic';

export const metadata = {
  title: '기록 찾기 — 도당동 아카이브',
  description: '네 갈래 분류로 자료를 찾습니다.',
};

type Params = Record<string, string | undefined>;

/**
 * 기록 찾기.
 *
 * 네 축(형태·출처·주제·시기)에 검색어를 더해 좁혀 간다. 고른 것은 모두
 * 주소에 남는다 — 가족끼리 "이 링크 봐" 하고 주고받을 수 있어야 하고,
 * 뒤로 가기가 예상대로 돌아가야 한다.
 *
 * 사건(Event)은 여기 나오지 않는다. 파일이 없고 제목만 있어서 결과 목록에
 * 섞이면 무엇을 찾았는지 흐려진다 — 사건은 연표의 몫이다.
 */
export default async function SearchPage({
  searchParams,
}: {
  searchParams: Promise<Params>;
}) {
  const sp = await searchParams;
  const role = await currentRole();

  const sel: Selection = {
    form: sp.form,
    source: sp.source,
    subject: sp.subject,
    period: sp.period,
    q: sp.q,
  };
  const sort = (SORTS.find((s) => s.key === sp.sort)?.key ?? 'default') as SortKey;
  const pageSize = PAGE_SIZES.includes(Number(sp.size)) ? Number(sp.size) : 20;
  const page = Math.max(1, Number(sp.page) || 1);

  const res = await search(role, sel, sort, page, pageSize);
  const thumbs = await thumbsFor(res.items.filter((i) => !i.locked).map((i) => i.id));

  /** 지금 주소에서 한 값만 바꾼 주소. 쪽 번호는 조건이 바뀌면 처음으로 되돌린다. */
  const urlWith = (patch: Params, keepPage = false) => {
    const next = new URLSearchParams();
    for (const [k, v] of Object.entries({ ...sp, ...patch })) {
      if (v && (keepPage || k !== 'page')) next.set(k, v);
    }
    const s = next.toString();
    return s ? `/search?${s}` : '/search';
  };

  const chips = AXES.map(({ key, title }) => ({ key, title, value: sel[key] }))
    .filter((c): c is { key: Axis; title: string; value: string } => Boolean(c.value));
  const anyFilter = chips.length > 0 || Boolean(sel.q);
  const lastPage = Math.max(1, Math.ceil(res.total / pageSize));

  return (
    <main className="wrap">
      <section className="page-head">
        <h1 className="page-title jg-pixel">기록 찾기</h1>
        <p className="page-lead">
          네 갈래 분류로 좁혀 갑니다. 상위 분류를 고르면 그 아래 전부가 들어옵니다.
        </p>
      </section>

      <form className="jg-search" action="/search" method="get">
        <label className="jg-search-label" htmlFor="q">
          검색어
        </label>
        <div className="jg-search-row">
          <input
            id="q"
            name="q"
            className="jg-input"
            defaultValue={sel.q ?? ''}
            placeholder="제목·설명·식별자에서 찾습니다"
          />
          <button type="submit" className="jg-btn jg-btn-primary">
            찾기
          </button>
        </div>
        {/* 검색어를 새로 넣어도 고른 분류는 유지한다. */}
        {AXES.map(({ key }) =>
          sel[key] ? <input key={key} type="hidden" name={key} value={sel[key]} /> : null,
        )}
      </form>

      {anyFilter ? (
        <ul className="filter-chips" aria-label="고른 조건">
          {sel.q ? (
            <li>
              <Link className="filter-chip" href={urlWith({ q: undefined })}>
                검색어: {sel.q} ✕
              </Link>
            </li>
          ) : null}
          {chips.map((c) => (
            <li key={c.key}>
              <Link className="filter-chip" href={urlWith({ [c.key]: undefined })}>
                {c.title}: {c.value.replace('/', ' > ')} ✕
              </Link>
            </li>
          ))}
          <li>
            <Link className="jg-btn jg-btn-text" href="/search">
              모두 지우기
            </Link>
          </li>
        </ul>
      ) : null}

      <div className="search-layout">
        <div className="search-facets">
          {res.groups.map((g) => (
            <FacetGroup
              key={g.key}
              group={g}
              hrefFor={(value, selected) => urlWith({ [g.key]: selected ? undefined : value })}
            />
          ))}
        </div>

        <div className="search-results">
          <ResultHeader
            total={res.total}
            sort={sort}
            pageSize={pageSize}
            sortLinks={SORTS.map((s) => ({
              key: s.key,
              label: s.label,
              href: urlWith({ sort: s.key === 'default' ? undefined : s.key }),
            }))}
            sizeLinks={PAGE_SIZES.map((n) => ({
              n,
              href: urlWith({ size: n === 20 ? undefined : String(n) }),
            }))}
          />

          {res.items.length === 0 ? (
            <div className="empty">
              <p className="jg-pixel">찾은 것이 없다</p>
              <p>조건을 하나 지우고 다시 찾아 보세요.</p>
            </div>
          ) : (
            <div>
              {res.items.map((it) => (
                <ResultRow
                  key={it.id}
                  title={it.locked ? '잠긴 자료' : it.title}
                  href={it.locked ? null : `/item/${it.id}`}
                  summary={it.locked ? null : it.description}
                  type={it.type}
                  docType={it.doc_type}
                  date={it.created_edtf ?? it.created_start}
                  dateVerified={it.date_verified}
                  sourceSteps={
                    it.source
                      ? [
                          { label: it.source, href: urlWith({ source: it.source }) },
                          {
                            label: it.bundle_title,
                            href: urlWith({ source: `${it.source}/${it.bundle_title}` }),
                          },
                        ]
                      : undefined
                  }
                  thumb={thumbs.get(it.id) ? `/media/${thumbs.get(it.id)}` : null}
                />
              ))}
            </div>
          )}

          {lastPage > 1 ? (
            <nav className="pager" aria-label="쪽 넘기기">
              {page > 1 ? (
                <Link className="pager-btn" href={urlWith({ page: String(page - 1) }, true)}>
                  ← 이전
                </Link>
              ) : null}
              <span className="small dim">
                {num(page)} / {num(lastPage)} 쪽
              </span>
              {page < lastPage ? (
                <Link className="pager-btn" href={urlWith({ page: String(page + 1) }, true)}>
                  다음 →
                </Link>
              ) : null}
            </nav>
          ) : null}
        </div>
      </div>
    </main>
  );
}
