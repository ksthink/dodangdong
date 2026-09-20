import Link from 'next/link';
import { currentRole } from '@/lib/access';
import { getHome } from '@/lib/home';
import { num } from '@/lib/ui';
import { Hero } from '@/components/home/Hero';
import { SearchField } from '@/components/home/SearchField';
import { RecordCard } from '@/components/home/RecordCard';
import { StoryCard } from '@/components/home/StoryCard';
import FacetGroup from '@/components/search/FacetGroup';

export const dynamic = 'force-dynamic';

/**
 * 첫 화면.
 *
 * 아카이브의 첫인상은 "무엇이 있는가"가 아니라 "무엇을 먼저 보면 되는가"를
 * 말해야 한다. 자료 목록을 그대로 쏟으면 방문한 가족은 어디서부터 볼지
 * 모른다. 그래서 큐레이션이 맨 위에 온다.
 *
 * 위에서 아래로: 히어로 → 찾기와 형태분류별 건수 → 이야기 둘 → 최근 기록 넷.
 */
export default async function HomePage() {
  const role = await currentRole();
  const home = await getHome(role);

  return (
    <main className="wrap page page-home">
      {home.slides.length > 0 ? <Hero slides={home.slides} /> : null}

      <section className="home-find">
        <div className="home-find-search">
          <SearchField
            label="기록 찾기"
            placeholder="제목, 인물, 장소, 연도 — 예: 부엌, 1978"
          />
          <p className="home-total">
            {/* 관리자는 잠긴 것까지 세지만, 가족에게는 볼 수 있는 것만 센다.
                보이지 않는 것을 숫자로 알려 주면 "무엇이 빠졌나" 하는 질문만 남는다. */}
            {role === 'admin' ? '전체 기록 ' : '공개 기록 '}
            <strong>{num(home.total)}</strong>건
          </p>
        </div>

        <div className="home-types">
          <FacetGroup
            group={{
              key: 'form',
              title: '형태분류',
              code: 'dc:type',
              items: home.typeCounts.map((t) => ({
                value: t.value,
                label: t.label,
                count: t.count,
                selected: false,
              })),
            }}
            hrefFor={(value) => `/search?form=${encodeURIComponent(value)}`}
          />
        </div>
      </section>

      {home.stories.length > 0 ? (
        <section className="home-block">
          <div className="block-head">
            <h2 className="jg-pixel">이야기</h2>
            <Link href="/stories">이야기 모두 보기 →</Link>
          </div>
          <div className="grid-2">
            {home.stories.map((s) => (
              <StoryCard
                key={s.id}
                title={s.title}
                summary={s.summary}
                count={s.count}
                period={s.period}
                image={s.cover}
                href={`/stories/${s.id}`}
              />
            ))}
          </div>
        </section>
      ) : null}

      <section className="home-block">
        <div className="block-head">
          <h2 className="jg-pixel">최근 등록한 기록</h2>
          <Link href="/search?sort=added">더 보기 →</Link>
        </div>
        {home.recent.length === 0 ? (
          <div className="empty">
            <p className="jg-pixel">아직 기록이 없다</p>
            <p>관리 화면에서 묶음을 만들고 자료를 올리면 여기에 쌓입니다.</p>
          </div>
        ) : (
          <div className="grid-4">
            {home.recent.map((r) => (
              <RecordCard
                key={r.id}
                title={r.title}
                type={r.type}
                docType={r.doc_type}
                date={r.created_edtf ?? r.created_start}
                dateVerified={r.date_verified}
                creator={r.creator}
                identifier={r.identifier}
                thumb={r.thumb}
                href={`/item/${r.id}`}
              />
            ))}
          </div>
        )}
      </section>
    </main>
  );
}
