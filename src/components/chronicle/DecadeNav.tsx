import Link from 'next/link';
import { cx, num } from '@/lib/ui';
import type { Decade } from '@/lib/chronicle';

/**
 * 연대 막대.
 *
 * 10년마다 한 칸. 칸 안의 작은 막대가 그 연대에 자료가 얼마나 몰려 있는지
 * 보여준다 — 가장 많은 연대를 8칸으로 두고 나머지를 거기 맞춰 줄인다.
 * 숫자를 읽기 전에 모양으로 먼저 알게 하려는 것이다.
 *
 * 프로토타입은 onClick 으로 상태를 바꿨지만 여기서는 링크로 둔다.
 * 그래야 "1970년대를 보고 있는 주소"가 생겨서 가족끼리 주고받을 수 있고,
 * 자바스크립트 없이도 넘어간다.
 */

export default function DecadeNav({ decades }: { decades: Decade[] }) {
  const max = Math.max(...decades.map((d) => d.count), 1);

  return (
    <nav className="jg-decades" aria-label="연대 고르기">
      <ol>
        {decades.map((d) => {
          const on = Math.round((d.count / max) * 8);
          return (
            <li key={d.value}>
              <Link
                href={`/chronicle?decade=${d.value}`}
                className={cx('jg-decade', d.current && 'is-current')}
                aria-current={d.current ? 'true' : undefined}
              >
                <span className="jg-decade-bar" aria-hidden="true">
                  {Array.from({ length: 8 }, (_, i) => (
                    <span key={i} className={i < on ? 'is-on' : undefined} />
                  ))}
                </span>
                <span className="jg-decade-label">{d.label}</span>
                <span className="jg-decade-count">{num(d.count)}</span>
              </Link>
            </li>
          );
        })}
      </ol>
    </nav>
  );
}
