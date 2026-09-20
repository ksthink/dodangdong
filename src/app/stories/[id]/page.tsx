import { notFound } from 'next/navigation';
import { currentRole } from '@/lib/access';
import { typeLabel } from '@/lib/chronicle';
import { getStory, groupByYear, type StoryBlock } from '@/lib/stories';
import StoryRecord from '@/components/story/StoryRecord';
import StoryQuote from '@/components/story/StoryQuote';
import Timeline from '@/components/story/Timeline';
import RelatedList from '@/components/record/RelatedList';

export const dynamic = 'force-dynamic';

/**
 * 이야기 한 편.
 *
 * 글과 기록을 번갈아 쌓는다. 블록의 차례는 글쓴이가 정한 것이므로 화면이
 * 다시 정렬하지 않는다 — position 순서 그대로 내려간다.
 *
 * 끝에 엮은 기록을 모두 다시 적는 까닭은, 이야기가 근거를 고르는 일이기도
 * 하기 때문이다. 무엇을 썼는지 한자리에서 세어 볼 수 있어야 한다.
 */
export default async function StoryPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const role = await currentRole();
  const story = await getStory(role, id);

  if (!story) notFound();

  return (
    <main className="wrap">
      <header className="story-head">
        <h1 className="story-title jg-pixel">{story.title}</h1>
        {story.summary ? <p className="story-lead">{story.summary}</p> : null}
        {story.period ? <p className="jg-date">{story.period}</p> : null}
      </header>

      <div className="story-body">
        {story.blocks.map((b) => (
          <Block key={b.id} block={b} />
        ))}
      </div>

      {story.items.length > 0 ? (
        <RelatedList
          title="엮은 기록"
          items={story.items.map((it) => ({
            type: typeLabel(it.type),
            title: it.title,
            href: it.href,
            date: it.date,
          }))}
        />
      ) : null}
    </main>
  );
}

function Block({ block }: { block: StoryBlock }) {
  switch (block.kind) {
    case 'text':
      return <p className="story-text">{block.body}</p>;

    case 'heading':
      return <h2 className="story-h2 jg-pixel">{block.body}</h2>;

    case 'record': {
      const it = block.items[0];
      if (!it) return null;
      return (
        <StoryRecord
          src={it.thumb}
          caption={block.caption}
          type={it.type}
          title={it.title}
          href={it.href}
          date={it.date}
          dateVerified={it.dateVerified}
          identifier={it.identifier}
        />
      );
    }

    case 'gallery': {
      if (block.items.length === 0) return null;
      // 그림이 없는(또는 잠긴) 자료는 격자에 빈 칸을 만들지 않는다. 대신
      // 아래 출처 줄과 끝의 '엮은 기록'에 그대로 남아 있다.
      const images = block.items
        .map((it) => it.thumb)
        .filter((v): v is string => Boolean(v))
        .map((src) => ({ src, alt: '' }));
      const first = block.items[0];
      return (
        <StoryRecord
          images={images}
          caption={block.caption}
          type={first.type}
          title={first.title}
          href={first.href}
          date={first.date}
          dateVerified={first.dateVerified}
          identifier={first.identifier}
        />
      );
    }

    case 'quote': {
      const it = block.items[0];
      return (
        <StoryQuote
          text={block.body ?? ''}
          speaker={block.speaker ?? '미상'}
          href={it?.href ?? null}
          source={it?.title ?? block.caption}
          timecode={block.timecode}
        />
      );
    }

    case 'timeline':
      return (
        <Timeline
          groups={groupByYear(block.items).map((g) => ({
            year: g.year,
            items: g.items.map((it) => ({
              date: it.date,
              title: it.title,
              href: it.href,
              // Timeline 은 사람이 읽을 이름을 그대로 받는다.
              type: it.type === 'Event' ? null : typeLabel(it.type),
              event: it.type === 'Event',
              verified: it.dateVerified,
            })),
          }))}
        />
      );
  }
}
