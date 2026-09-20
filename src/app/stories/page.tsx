import { currentRole } from '@/lib/access';
import { getStories } from '@/lib/stories';
import { StoryCard } from '@/components/home/StoryCard';

export const dynamic = 'force-dynamic';

export const metadata = {
  title: '이야기 — 도당동 아카이브',
  description: '집안의 기록을 사람이 손으로 엮은 글입니다.',
};

/**
 * 이야기 목록.
 *
 * 연표와 찾기는 기계가 낸 길이고, 여기는 사람이 낸 길이다. 그래서 정렬도
 * 날짜가 아니라 글쓴이가 정한 차례(sort_order)를 따른다.
 */
export default async function StoriesPage() {
  const role = await currentRole();
  const stories = await getStories(role);

  return (
    <main className="wrap">
      <section className="page-head">
        <h1 className="page-title jg-pixel">이야기</h1>
        <p className="page-lead">
          흩어진 기록을 한 줄기로 엮어 읽습니다. 문장 옆에는 언제나 그 근거가 된 기록이 붙습니다.
        </p>
      </section>

      {stories.length === 0 ? (
        <div className="box">
          <p>아직 엮은 이야기가 없습니다.</p>
          <p className="small">자료가 모이면 여기에 한 편씩 쌓입니다.</p>
        </div>
      ) : (
        <div className="grid-2">
          {stories.map((s) => (
            <StoryCard
              key={s.id}
              title={s.title}
              href={`/stories/${s.id}`}
              image={s.cover}
              summary={s.summary}
              count={s.count}
              period={s.period}
            />
          ))}
        </div>
      )}
    </main>
  );
}
