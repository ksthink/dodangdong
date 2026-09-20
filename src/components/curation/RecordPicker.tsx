import Link from 'next/link';
import { num } from '@/lib/ui';
import { TypeTag, Thumb } from '@/components/search/parts';

/**
 * 큐레이션에 넣을 자료 고르기.
 *
 * 프로토타입은 onSearch·onAdd 두 콜백으로 움직였다. 여기서는 둘을 갈라 놓는다.
 *
 * 찾기는 `<form method="get">` 이다 — 무엇을 찾다가 골랐는지가 주소에 남아야
 * 편집을 하다 말고 새로고침해도 같은 목록이 돌아오고, 뒤로 가기가 한 걸음씩
 * 물러난다. 넣기만 서버 액션을 부른다. 그래서 이 파일에는 'use client' 가 없다.
 *
 * 찾기 폼이 GET 이라 이 화면의 다른 질의(어느 블록을 편집 중인가 따위)는
 * 그대로 두면 지워진다. `hidden` 으로 받아 같이 싣는다.
 */

export interface PickerItem {
  id: string;
  title: string;
  /** 식별자. 같은 제목이 여러 건일 때 이것으로 가른다. */
  identifier?: string | null;
  date?: string | null;
  /** DCMI 형태 코드. 썸네일이 없을 때 빈 자리에 적힌다. */
  type: string;
  thumb?: string | null;
  /** 이미 이 블록에 들어가 있는 자료. 버튼 대신 '넣음' 으로 굳는다. */
  added?: boolean;
}

export interface PickerFilter {
  type: string;
  detail?: string | null;
  selected?: boolean;
  /** 이 갈래만 보는 주소. 고른 갈래도 주소에 남는다. */
  href: string;
}

export interface RecordPickerProps {
  items: PickerItem[];
  /** 찾은 전체 건수. 주지 않으면 지금 보이는 만큼으로 적는다. */
  total?: number;
  title?: string;
  placeholder?: string;
  /** 지금 찾고 있는 말. 칸에 그대로 남겨 둔다. */
  query?: string;
  /** 찾기 폼이 향할 주소. 대개 이 화면 자신이다. */
  searchAction: string;
  /** 찾기와 함께 실어 보낼 그 밖의 질의. */
  hidden?: Record<string, string>;
  filters?: PickerFilter[];
  /** 고른 자료를 블록에 넣는 서버 액션. formData: blockId, itemId. */
  addAction: (formData: FormData) => Promise<void>;
  /** 넣을 곳. hidden 으로 액션에 넘어간다. */
  blockId: string;
  id?: string;
}

export default function RecordPicker({
  items,
  total,
  title = '기록 고르기',
  placeholder = '제목, 인물, 식별자',
  query,
  searchAction,
  hidden,
  filters,
  addAction,
  blockId,
  id = 'jg-picker-q',
}: RecordPickerProps) {
  return (
    <section className="jg-picker">
      <div className="jg-picker-head">
        <h3 className="jg-pixel">{title}</h3>
        <span className="jg-date">{num(total ?? items.length)}건</span>
      </div>

      <form className="jg-search" role="search" action={searchAction} method="get">
        <label className="jg-search-label" htmlFor={id}>
          기록 찾기
        </label>
        <div className="jg-search-row">
          <input
            id={id}
            name="q"
            type="search"
            className="jg-input"
            placeholder={placeholder}
            defaultValue={query}
          />
          <button type="submit" className="jg-btn jg-btn-primary">
            찾기
          </button>
        </div>
        {/* 찾기를 누르면 주소가 통째로 갈리므로, 지켜야 할 질의를 같이 싣는다. */}
        {Object.entries(hidden ?? {}).map(([k, v]) => (
          <input key={k} type="hidden" name={k} value={v} />
        ))}
      </form>

      {filters && filters.length ? (
        <div className="jg-picker-filters">
          {/* 프로토타입은 onClick 으로 골랐다. 링크로 두면 고른 갈래가 주소에 남는다. */}
          {filters.map((f) => (
            <Link key={f.type} href={f.href} aria-current={f.selected ? 'true' : undefined}>
              <TypeTag type={f.type} detail={f.detail} selected={f.selected} />
            </Link>
          ))}
        </div>
      ) : null}

      <ul className="jg-picker-list">
        {items.map((it) => (
          <li key={it.id} className={it.added ? 'is-added' : undefined}>
            <div className="jg-picker-thumb">
              <Thumb src={it.thumb} type={it.type} />
            </div>
            <div className="jg-picker-body">
              <span className="jg-picker-title">{it.title}</span>
              <span className="jg-picker-meta">
                {it.identifier}
                {it.date ? ` · ${it.date}` : ''}
                {it.type ? ` · ${it.type}` : ''}
              </span>
            </div>
            {it.added ? (
              <span className="jg-picker-added">넣음</span>
            ) : (
              // 버튼 하나짜리 폼. 목록 전체를 한 폼으로 묶으면 어느 자료를
              // 넣으려 한 것인지 제출된 값만으로는 알 수 없다.
              <form action={addAction}>
                <input type="hidden" name="blockId" value={blockId} />
                <input type="hidden" name="itemId" value={it.id} />
                <button type="submit" className="jg-btn jg-btn-secondary jg-picker-add">
                  + 넣기
                </button>
              </form>
            )}
          </li>
        ))}
      </ul>
    </section>
  );
}
