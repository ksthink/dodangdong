import Link from 'next/link';
import { cx, num } from '@/lib/ui';
import type { FacetGroupData, FacetItem } from '@/lib/facets';

/**
 * 분류 축 하나.
 *
 * 상위를 고르면 그 아래 전부가 결과에 들어온다. 하위를 고르면 그것만.
 * 0건인 분류도 지우지 않는다 — 비어 있다는 사실도 알아야 할 정보이고,
 * 지워 버리면 고를 때마다 목록이 춤춰서 어디를 눌렀는지 놓친다.
 *
 * 프로토타입은 button + onClick 이었다. 링크로 바꾸면 고른 분류가 주소에
 * 남아 가족끼리 주고받을 수 있고, 뒤로 가기가 제대로 돌아간다. 0건인
 * 항목은 링크 대신 span 으로 둔다 — 눌러도 아무 일이 없는 링크보다
 * 처음부터 누를 수 없는 편이 정직하다.
 */

function Items({
  items,
  hrefFor,
  depth,
}: {
  items: FacetItem[];
  hrefFor: (value: string, selected: boolean) => string;
  depth: number;
}) {
  return (
    <ul className={cx('jg-facet-list', depth > 0 && 'is-nested')}>
      {items.map((it) => (
        <li key={it.value}>
          {it.count === 0 && !it.selected ? (
            <span className="jg-facet-item is-zero">
              <span className="jg-facet-label">{it.label}</span>
              <span className="jg-facet-count">{num(it.count)}</span>
            </span>
          ) : (
            <Link
              href={hrefFor(it.value, it.selected)}
              className={cx('jg-facet-item', it.selected && 'is-selected')}
              aria-pressed={it.selected}
            >
              <span className="jg-facet-label">{it.label}</span>
              <span className="jg-facet-count">{num(it.count)}</span>
            </Link>
          )}
          {it.children && it.children.length > 0 ? (
            <Items items={it.children} hrefFor={hrefFor} depth={depth + 1} />
          ) : null}
        </li>
      ))}
    </ul>
  );
}

export default function FacetGroup({
  group,
  hrefFor,
}: {
  group: FacetGroupData;
  hrefFor: (value: string, selected: boolean) => string;
}) {
  return (
    <section className="jg-facet">
      <h3 className="jg-facet-title">
        <span className="jg-pixel">{group.title}</span>
        <span className="jg-facet-code">{group.code}</span>
      </h3>
      <Items items={group.items} hrefFor={hrefFor} depth={0} />
    </section>
  );
}
