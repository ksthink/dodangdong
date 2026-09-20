import Link from 'next/link';
import type { ReactNode } from 'react';

/**
 * 구술 인용.
 *
 * 말한 사람과 원 기록으로 가는 길을 함께 적는다. 타임코드를 남기는 까닭은
 * 두 시간짜리 녹음에서 이 한 문장이 어디에 있었는지 되짚을 수 있어야
 * 인용이 확인 가능한 것이 되기 때문이다.
 */

export interface StoryQuoteProps {
  children?: ReactNode;
  text?: string;
  speaker: string;
  /** 원 기록(녹음·영상)으로 가는 주소. */
  href?: string | null;
  source?: string | null;
  /** '01:12:40' 처럼 녹음 안의 위치. */
  timecode?: string | null;
}

export default function StoryQuote({
  children,
  text,
  speaker,
  href,
  source,
  timecode,
}: StoryQuoteProps) {
  return (
    <figure className="jg-squote">
      <blockquote className="jg-squote-text">{children ?? text}</blockquote>
      <figcaption className="jg-squote-src">
        <span className="jg-squote-who">— {speaker}</span>
        {href ? (
          <Link href={href}>{source ?? '원 기록'}</Link>
        ) : source ? (
          <span>{source}</span>
        ) : null}
        {timecode ? <span className="jg-date">{timecode}</span> : null}
      </figcaption>
    </figure>
  );
}
