import Link from 'next/link';
import { num } from '@/lib/ui';

/**
 * 관련 기록 목록.
 *
 * 한 기록에 딸린 다른 기록들 — 같은 사건의 사진, 그 사진을 설명하는 편지,
 * 뒷면 글씨를 찍은 사본. 세 칸 격자(종류 · 제목 · 날짜)로 고정한 것은
 * 여러 개가 줄줄이 있을 때 눈이 한 줄만 따라 내려가면 되게 하려는 것이다.
 *
 * 제목에 주소가 없을 수 있다 — 잠긴 기록은 있다는 사실만 남기고 링크를
 * 떼는 것이 이 저장소의 방침이다(queries.ts 머리말).
 */

export interface RelatedItem {
  /** "사진", "증빙" 처럼 이 기록과의 관계나 종류. */
  type?: string | null;
  title: string;
  href?: string | null;
  date?: string | null;
}

export interface RelatedListProps {
  items: RelatedItem[];
  title?: string;
  /** 이 묶음을 가리키는 식별자. 머리글 아래에 작게 적는다. */
  code?: string | null;
}

export default function RelatedList({ items, title, code }: RelatedListProps) {
  return (
    <section className="jg-related">
      <h2 className="jg-section-title jg-pixel">
        {title ?? '관련 기록'}
        <span className="jg-section-count">{num(items.length)}</span>
      </h2>
      {code ? <p className="jg-related-code">{code}</p> : null}
      <ol className="jg-related-list">
        {items.map((it, i) => (
          <li key={i}>
            <span className="jg-related-type">{it.type ?? ''}</span>
            <span className="jg-related-title">
              {it.href ? <Link href={it.href}>{it.title}</Link> : it.title}
            </span>
            {it.date ? <span className="jg-date">{it.date}</span> : null}
          </li>
        ))}
      </ol>
    </section>
  );
}
