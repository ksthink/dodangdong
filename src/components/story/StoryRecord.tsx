import Link from 'next/link';
import { cx } from '@/lib/ui';
import { typeLabel } from '@/lib/chronicle';
import { DateValue } from '@/components/search/parts';

/**
 * 이야기 본문에 끼워 넣는 기록 블록.
 *
 * 이야기는 글이지만 근거는 기록이다. 그래서 사진 아래에 반드시 출처 줄이
 * 붙는다 — 어느 자료에서 온 그림인지, 언제 것인지, 식별자가 무엇인지.
 * 캡션만 있고 출처가 없으면 이야기가 곧 기억으로 흐려진다.
 *
 * 사진이 여러 장이면 격자로(`is-multi`), 한 장을 크게 보여줄 때는
 * `is-wide` 로 본문 폭을 넘어선다.
 */

interface StoryImage {
  src: string;
  alt?: string;
}

export interface StoryRecordProps {
  /** 여러 장이면 격자가 된다. 한 장뿐이면 `src` 만 줘도 된다. */
  images?: (StoryImage | string)[];
  src?: string | null;
  caption?: string | null;
  /** DCMI 유형 코드. 그림이 없을 때 빈 칸에 이 코드를 적는다. */
  type?: string | null;
  title?: string | null;
  href?: string | null;
  date?: string | null;
  dateVerified?: boolean;
  identifier?: string | null;
  wide?: boolean;
}

export default function StoryRecord({
  images,
  src,
  caption,
  type,
  title,
  href,
  date,
  dateVerified,
  identifier,
  wide,
}: StoryRecordProps) {
  const imgs = images ?? (src ? [src] : []);

  return (
    <figure className={cx('jg-srec', imgs.length > 1 && 'is-multi', wide && 'is-wide')}>
      {imgs.length ? (
        <div className="jg-srec-imgs">
          {imgs.map((m, k) => {
            const img = typeof m === 'string' ? { src: m, alt: '' } : m;
            return (
              // eslint-disable-next-line @next/next/no-img-element
              <img key={k} src={img.src} alt={img.alt ?? ''} />
            );
          })}
        </div>
      ) : (
        // 빈 사각형 대신 디더 무늬를 깔고 유형 코드를 적는다. 찾기 화면의
        // 썸네일과 같은 규칙이다 — "아직 안 불러온 것"이 아니라 "원래 그림이
        // 없는 기록"으로 읽혀야 한다.
        <div className="jg-srec-empty jg-thumb-empty" aria-hidden="true">
          {type ? <span>{type}</span> : null}
        </div>
      )}
      <figcaption className="jg-srec-cap">
        {caption ? <span className="jg-srec-text">{caption}</span> : null}
        <span className="jg-srec-src">
          {/* 빈 칸에는 코드를, 출처 줄에는 한국어 이름을 적는다. 읽는 자리는
              문장이므로 '사진'이 'StillImage'보다 먼저 읽힌다. */}
          {type ? <span className="jg-srec-type">{typeLabel(type)}</span> : null}
          {href ? <Link href={href}>{title ?? identifier}</Link> : (title ?? null)}
          {date ? <DateValue value={date} verified={dateVerified} /> : null}
          {identifier ? <span className="jg-date">{identifier}</span> : null}
        </span>
      </figcaption>
    </figure>
  );
}
