import Link from 'next/link';
import { cx } from '@/lib/ui';

/**
 * 이야기 안에 들어가는 작은 연표.
 *
 * 연표 화면의 `ChronicleYear` 와는 다른 물건이다. 저기는 한 해를 세 열로
 * 펼쳐 보는 화면이고, 여기는 글쓴이가 고른 몇 건만 해마다 묶어 이야기
 * 사이에 끼워 넣는 목록이다. 그래서 나이도, 바깥 세상도, 썸네일도 없다.
 *
 * 사건은 점을 채워(`is-event`) 자료와 구분한다 — 사건에는 파일이 없어도
 * 되고, 연표의 뼈대는 대개 그쪽이다.
 */

export interface TimelineItem {
  date: string;
  title: string;
  href?: string | null;
  /** 이미 사람이 읽을 이름으로 만들어 넘긴다(`typeLabel`). */
  type?: string | null;
  event?: boolean;
  verified?: boolean;
}

export interface TimelineGroup {
  year: string | number;
  /** 그해를 한 줄로 설명하는 글쓴이의 말. */
  note?: string | null;
  items?: TimelineItem[];
}

export default function Timeline({ groups }: { groups: TimelineGroup[] }) {
  return (
    <ol className="jg-tl">
      {groups.map((g, k) => (
        <li key={k} className="jg-tl-group">
          <p className="jg-tl-year jg-pixel">{g.year}</p>
          {g.note ? <p className="jg-tl-note">{g.note}</p> : null}
          <ul className="jg-tl-items">
            {(g.items ?? []).map((it, j) => (
              <li key={j} className={cx('jg-tl-item', it.event && 'is-event')}>
                <span className="jg-tl-date">{it.date}</span>
                <span className="jg-tl-body">
                  {it.type ? <span className="jg-tl-type">{it.type}</span> : null}
                  {it.href ? <Link href={it.href}>{it.title}</Link> : <span>{it.title}</span>}
                  {it.verified ? <span className="jg-verified">확인됨</span> : null}
                </span>
              </li>
            ))}
          </ul>
        </li>
      ))}
    </ol>
  );
}
