'use client';

import { useState } from 'react';
import Link from 'next/link';
import { cx, num } from '@/lib/ui';

/**
 * 첫 화면 큐레이션 캐러셀.
 *
 * 이 저장소에서 'use client' 가 붙은 유일한 자리다. 고른 슬라이드는
 * 주소에 남길 것이 아니라서 — 첫 화면을 주고받는 일은 없고, 뒤로 가기가
 * 슬라이드마다 걸리면 오히려 성가시다 — 상태를 컴포넌트 안에 둔다.
 *
 * 자동으로 넘기지 않는다. 읽는 속도는 사람마다 다르고, 오래된 사진의
 * 설명을 읽는 중에 화면이 바뀌면 되돌릴 방법이 없다.
 */

export interface HeroImage {
  src: string;
  alt?: string;
  caption?: string;
}

export interface HeroSlide {
  title: string;
  kind?: string;
  kicker?: string;
  summary?: string;
  count?: number;
  period?: string;
  people?: string;
  href?: string;
  cta?: string;
  images?: HeroImage[];
}

export interface HeroProps {
  slides: HeroSlide[];
  label?: string;
  index?: number;
}

export function Hero({ slides, label, index = 0 }: HeroProps) {
  const [i, setI] = useState(index);

  if (slides.length === 0) return null;

  const s = slides[i] ?? slides[0];
  // 배치 규칙(is-1/is-2/is-3)이 세 장까지만 정의되어 있다.
  const imgs = (s.images ?? []).slice(0, 3);

  function go(d: number) {
    setI((k) => (k + d + slides.length) % slides.length);
  }

  return (
    <section
      className="jg-hero"
      aria-roledescription="carousel"
      aria-label={label ?? '오늘의 큐레이션'}
    >
      <div className="jg-hero-text">
        <p className="jg-hero-kicker">
          {s.kind ? <span className="jg-hero-kind jg-pixel">{s.kind}</span> : null}
          {s.kicker ? <span>{s.kicker}</span> : null}
        </p>
        <h2 className="jg-hero-title jg-pixel">{s.title}</h2>
        {s.summary ? <p className="jg-hero-summary">{s.summary}</p> : null}
        <p className="jg-hero-meta">
          {s.count != null ? (
            <span>
              기록 <strong>{num(s.count)}</strong>건
            </span>
          ) : null}
          {s.period ? <span className="jg-date">{s.period}</span> : null}
          {s.people ? <span>{s.people}</span> : null}
        </p>
        <div className="jg-hero-actions">
          {s.href ? (
            <Link className="jg-btn jg-btn-primary" href={s.href}>
              {s.cta ?? '이야기 읽기'}
            </Link>
          ) : null}
          {slides.length > 1 ? (
            <div className="jg-hero-pager">
              <button
                type="button"
                className="jg-hero-nav"
                aria-label="이전"
                onClick={() => go(-1)}
              >
                ←
              </button>
              <ol className="jg-hero-dots">
                {slides.map((x, k) => (
                  <li key={k}>
                    <button
                      type="button"
                      className={cx(k === i && 'is-current')}
                      aria-label={`${k + 1}번째: ${x.title}`}
                      aria-current={k === i ? 'true' : undefined}
                      onClick={() => setI(k)}
                    />
                  </li>
                ))}
              </ol>
              <button
                type="button"
                className="jg-hero-nav"
                aria-label="다음"
                onClick={() => go(1)}
              >
                →
              </button>
              <span className="jg-hero-count">
                {i + 1} / {slides.length}
              </span>
            </div>
          ) : null}
        </div>
      </div>
      <div className={cx('jg-hero-art', `is-${imgs.length}`)}>
        {imgs.map((m, k) => (
          <figure key={k} className="jg-hero-fig">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={m.src} alt={m.alt ?? ''} />
            {m.caption ? <figcaption>{m.caption}</figcaption> : null}
          </figure>
        ))}
      </div>
    </section>
  );
}
