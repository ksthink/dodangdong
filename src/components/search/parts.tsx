import Link from 'next/link';
import { cx, num } from '@/lib/ui';
import { typeLabel } from '@/lib/chronicle';

/**
 * 찾기 화면의 작은 조각들.
 *
 * 디자인 시스템 번들에서 옮겨왔다. 프로토타입은 전부 onClick 으로 상태를
 * 바꿨지만 여기서는 링크로 둔다 — 고른 분류가 주소에 남아야 가족끼리
 * 주고받을 수 있고, 뒤로 가기가 제대로 동작하며, 자바스크립트 없이도
 * 넘어간다. 덕분에 이 파일에는 'use client' 가 하나도 없다.
 */

// ---------------------------------------------------------------- 날짜

export function DateValue({ value, verified }: { value: string; verified?: boolean }) {
  return (
    <span className="jg-date">
      {value}
      {verified ? (
        <span className="jg-verified" title="증빙 기록으로 확인된 날짜">
          확인됨
        </span>
      ) : null}
    </span>
  );
}

// ---------------------------------------------------------------- 형태 뱃지

export function TypeTag({
  type,
  detail,
  selected,
}: {
  type: string;
  detail?: string | null;
  selected?: boolean;
}) {
  return (
    <span className={cx('jg-tag', selected && 'is-selected')} data-type={type}>
      <span className="jg-tag-code">{type}</span>
      <span className="jg-tag-label">{typeLabel(type)}</span>
      {detail ? <span className="jg-tag-detail">{detail}</span> : null}
    </span>
  );
}

// ---------------------------------------------------------------- 분류 경로

/** "할머니댁 > 안방 장롱". 단계마다 그 분류의 결과 목록으로 간다. */
export function ClassPath({ steps }: { steps: { label: string; href?: string }[] }) {
  return (
    <span className="jg-path">
      {steps.map((s, i) => (
        <span key={i}>
          {i > 0 ? (
            <span className="jg-path-sep" aria-hidden="true">
              {' > '}
            </span>
          ) : null}
          {s.href ? <Link href={s.href}>{s.label}</Link> : <span>{s.label}</span>}
        </span>
      ))}
    </span>
  );
}

// ---------------------------------------------------------------- 썸네일

/**
 * 썸네일이 없으면 디더 무늬를 깔고 가운데에 DCMI 유형 코드를 적는다.
 * 빈 사각형을 두면 "아직 안 불러온 것"처럼 보이지만, 무늬가 깔려 있으면
 * "원래 그림이 없는 것"으로 읽힌다.
 */
export function Thumb({
  src,
  type,
  alt,
}: {
  src?: string | null;
  type: string;
  alt?: string;
}) {
  if (src) {
    // eslint-disable-next-line @next/next/no-img-element
    return <img className="jg-thumb-img" src={src} alt={alt ?? ''} />;
  }
  return (
    <div className="jg-thumb-empty" aria-hidden="true">
      <span>{type}</span>
    </div>
  );
}

// ---------------------------------------------------------------- 결과 한 줄

export function ResultRow({
  title,
  href,
  summary,
  type,
  docType,
  date,
  dateVerified,
  sourceSteps,
  thumb,
}: {
  title: string;
  href: string | null;
  summary?: string | null;
  type: string;
  docType?: string | null;
  date?: string | null;
  dateVerified?: boolean;
  sourceSteps?: { label: string; href?: string }[];
  thumb?: string | null;
}) {
  return (
    <article className="jg-row">
      <div className="jg-row-thumb">
        <Thumb src={thumb} type={type} />
      </div>
      <div className="jg-row-body">
        <h3 className="jg-row-title">{href ? <Link href={href}>{title}</Link> : title}</h3>
        {summary ? <p className="jg-row-summary">{summary}</p> : null}
        <p className="jg-row-meta">
          <TypeTag type={type} detail={docType} />
          {sourceSteps && sourceSteps.length ? <ClassPath steps={sourceSteps} /> : null}
          {date ? <DateValue value={date} verified={dateVerified} /> : null}
        </p>
      </div>
    </article>
  );
}

// ---------------------------------------------------------------- 결과 머리줄

export function ResultHeader({
  total,
  sortLinks,
  sizeLinks,
  sort,
  pageSize,
}: {
  total: number;
  sortLinks: { key: string; label: string; href: string }[];
  sizeLinks: { n: number; href: string }[];
  sort: string;
  pageSize: number;
}) {
  return (
    <div className="jg-rhead">
      <p className="jg-rhead-total">
        전체 <strong>{num(total)}</strong>건
      </p>
      <div className="jg-rhead-ctrl">
        {/* 프로토타입은 select 였다. 링크로 바꾸면 고른 정렬이 주소에 남고
            자바스크립트 없이도 동작한다. 항목이 다섯뿐이라 줄로 늘어놓아도
            좁지 않다. */}
        <ul className="jg-chips" aria-label="정렬">
          {sortLinks.map((s) => (
            <li key={s.key} className={cx(s.key === sort && 'is-selected')}>
              <Link href={s.href} aria-current={s.key === sort ? 'true' : undefined}>
                {s.label}
              </Link>
            </li>
          ))}
        </ul>
        <ul className="jg-chips" aria-label="한 쪽에">
          {sizeLinks.map((s) => (
            <li key={s.n} className={cx(s.n === pageSize && 'is-selected')}>
              <Link href={s.href} aria-current={s.n === pageSize ? 'true' : undefined}>
                {s.n}개씩
              </Link>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
