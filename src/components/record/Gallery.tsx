'use client';

import { useState, type CSSProperties } from 'react';
import { cx } from '@/lib/ui';
import Viewer, { type ViewerItem } from './Viewer';

/**
 * 사진 썸네일 격자.
 *
 * 정사각으로 잘라 늘어놓는다. 세로 사진과 가로 사진이 섞여 있어도 격자가
 * 흐트러지지 않아야 여러 장을 한눈에 훑을 수 있다 — 자른 그림은 고르기
 * 위한 것이고, 제대로 된 비율은 뷰어에서 본다.
 *
 * 열면 뷰어를 여는 상태를 스스로 쥔다. 다만 onOpen 을 넘기면 그쪽에
 * 넘기고 물러선다 — 주소로 여는 화면에서는 페이지가 주인이어야 한다.
 */

export interface GalleryItem extends ViewerItem {
  /** 썸네일 위에 작게 얹는 글자. showCaptions 일 때만 나온다. */
  caption?: string | null;
  selected?: boolean;
}

export interface GalleryProps {
  items: GalleryItem[];
  /** false 면 머리글을 내지 않는다. */
  title?: string | false;
  columns?: number;
  showCaptions?: boolean;
  /** 넘기면 클릭을 부모가 받는다. 이때 이 컴포넌트는 뷰어를 열지 않는다. */
  onOpen?: (index: number) => void;
}

export default function Gallery({ items, title, columns, showCaptions, onOpen }: GalleryProps) {
  // -1 은 닫힌 상태. 0 도 유효한 번호라서 null 대신 -1 을 쓴다.
  const [open, setOpen] = useState(-1);

  return (
    <section className="jg-gallery">
      {title === false ? null : (
        <h2 className="jg-section-title jg-pixel">
          {title ?? '사진'}
          <span className="jg-section-count">{items.length}장</span>
        </h2>
      )}
      <ul
        className="jg-gallery-grid"
        style={{ '--jg-cols': columns ?? 4 } as CSSProperties}
      >
        {items.map((x, k) => (
          <li key={k}>
            <button
              type="button"
              className={cx('jg-gallery-item', x.selected && 'is-selected')}
              aria-label={`${x.title ?? '사진'} 크게 보기`}
              onClick={() => (onOpen ? onOpen(k) : setOpen(k))}
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={x.thumb ?? x.src} alt={x.alt ?? ''} />
              {showCaptions && x.caption ? (
                <span className="jg-gallery-cap">{x.caption}</span>
              ) : null}
            </button>
          </li>
        ))}
      </ul>
      {!onOpen && open >= 0 ? (
        <Viewer items={items} index={open} onIndex={setOpen} onClose={() => setOpen(-1)} />
      ) : null}
    </section>
  );
}
