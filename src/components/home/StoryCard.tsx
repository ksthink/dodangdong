import Link from 'next/link';
import { num } from '@/lib/ui';

/**
 * 첫 화면의 이야기 한 편.
 *
 * 기록 카드와 달리 썸네일이 없으면 그림 칸 자체를 빼 버린다. 이야기는
 * 자료가 아니라 글이어서, 빈 그림 자리가 "아직 안 올라온 사진"으로 읽힌다.
 */

export interface StoryCardProps {
  title: string;
  href?: string | null;
  image?: string | null;
  imageAlt?: string;
  kicker?: string | null;
  summary?: string | null;
  count?: number | null;
  period?: string | null;
}

export function StoryCard({
  title,
  href,
  image,
  imageAlt,
  kicker,
  summary,
  count,
  period,
}: StoryCardProps) {
  const inner = (
    <>
      {image ? (
        <div className="jg-story-img">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={image} alt={imageAlt ?? ''} />
        </div>
      ) : null}
      <div className="jg-story-body">
        {kicker ? <p className="jg-story-kicker">{kicker}</p> : null}
        <h3 className="jg-story-title jg-pixel">{title}</h3>
        {summary ? <p className="jg-story-summary">{summary}</p> : null}
        <p className="jg-story-meta">
          {count != null ? (
            <span>
              기록 <strong>{num(count)}</strong>건
            </span>
          ) : null}
          {period ? <span className="jg-date">{period}</span> : null}
          {href ? (
            <span className="jg-story-more" aria-hidden="true">
              읽기 →
            </span>
          ) : null}
        </p>
      </div>
    </>
  );

  return href ? (
    <Link className="jg-story" href={href}>
      {inner}
    </Link>
  ) : (
    <article className="jg-story">{inner}</article>
  );
}
