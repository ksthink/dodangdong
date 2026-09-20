'use client';

import { useEffect } from 'react';
import Link from 'next/link';
import { cx } from '@/lib/ui';

/**
 * 사진을 화면 가득 보는 뷰어.
 *
 * 테마와 무관하게 늘 어둡다(--viewer-* 토큰). 낮 모드의 밝은 종이 위에서는
 * 빛바랜 옛 사진의 색이 날아가 보이기 때문이다 — 사진을 볼 때만큼은
 * 주위를 어둡게 한다.
 *
 * 고른 사진이 무엇인지는 부모가 쥔다(index/onIndex). 갤러리에서 열든
 * 페이지가 주소로 열든 같은 뷰어를 쓰기 위해서다.
 *
 * 키보드는 전체화면일 때만 가로챈다. inline 으로 페이지에 박혀 있을 때
 * ESC 와 화살표를 먹으면 페이지의 다른 조작을 방해한다.
 */

export interface ViewerItem {
  src: string;
  /** 필름 띠에 쓸 작은 그림. 없으면 src 를 그대로 줄여 쓴다. */
  thumb?: string | null;
  alt?: string;
  title?: string | null;
  date?: string | null;
  identifier?: string | null;
  /** 원본 파일 내려받기 주소. */
  original?: string | null;
  /** 이 사진의 기록 상세 화면. */
  href?: string | null;
}

export interface ViewerProps {
  items: ViewerItem[];
  index: number;
  onIndex: (next: number) => void;
  onClose?: () => void;
  /** 페이지 안에 박아 넣는 모양. 전체화면 대신 자리를 차지한다. */
  inline?: boolean;
}

export default function Viewer({ items, index, onIndex, onClose, inline }: ViewerProps) {
  // 범위를 벗어난 index 로도 열릴 수 있다 — 주소에 손으로 넣은 번호 같은 것.
  const i = Math.max(0, Math.min(items.length - 1, index));
  const it: ViewerItem | undefined = items[i];

  useEffect(() => {
    if (inline) return;
    function go(d: number) {
      if (items.length) onIndex((i + d + items.length) % items.length);
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose?.();
      if (e.key === 'ArrowLeft') go(-1);
      if (e.key === 'ArrowRight') go(1);
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [inline, i, items.length, onIndex, onClose]);

  if (!it) return null;

  const go = (d: number) => onIndex((i + d + items.length) % items.length);

  return (
    <div
      className={cx('jg-viewer', inline && 'is-inline')}
      role="dialog"
      aria-modal={inline ? undefined : 'true'}
      aria-label="사진 보기"
    >
      <div className="jg-viewer-top">
        <span className="jg-viewer-count">
          {i + 1} / {items.length}
        </span>
        {it.original ? (
          <a className="jg-vbtn" href={it.original} download>
            원본 내려받기
          </a>
        ) : null}
        {onClose ? (
          <button type="button" className="jg-vbtn" onClick={onClose}>
            닫기
          </button>
        ) : null}
      </div>

      <div className="jg-viewer-stage">
        <button
          type="button"
          className="jg-vbtn jg-viewer-nav"
          aria-label="이전 사진"
          onClick={() => go(-1)}
        >
          ←
        </button>
        <figure className="jg-viewer-figure">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={it.src} alt={it.alt ?? it.title ?? ''} />
        </figure>
        <button
          type="button"
          className="jg-vbtn jg-viewer-nav"
          aria-label="다음 사진"
          onClick={() => go(1)}
        >
          →
        </button>
      </div>

      <div className="jg-viewer-caption">
        <p className="jg-viewer-title jg-pixel">{it.title}</p>
        <p className="jg-viewer-meta">
          {it.date ? <span>{it.date}</span> : null}
          {it.identifier ? <span>{it.identifier}</span> : null}
          {it.href ? <Link href={it.href}>상세정보 →</Link> : null}
        </p>
      </div>

      {items.length > 1 ? (
        <ol className="jg-viewer-strip">
          {items.map((x, k) => (
            <li key={k}>
              <button
                type="button"
                className={cx(k === i && 'is-current')}
                aria-label={`${k + 1}번째 사진`}
                aria-current={k === i ? 'true' : undefined}
                onClick={() => onIndex(k)}
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={x.thumb ?? x.src} alt="" />
              </button>
            </li>
          ))}
        </ol>
      ) : null}
    </div>
  );
}
