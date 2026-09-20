import Link from 'next/link';
import { cx } from '@/lib/ui';
import { ClassPath, DateValue, TypeTag } from '@/components/search/parts';

/**
 * 기록 하나의 상세정보 표.
 *
 * 더블린코어 15요소를 표 하나에 편다. 제목과 설명은 페이지 머리에 따로
 * 쓰므로 여기 없다 — 표는 "누가, 언제, 어디서, 무엇으로" 만 맡는다.
 *
 * 요소명 칸에 한국어 이름과 dc 요소 코드를 나란히 둔다. 가족은 한국어를
 * 읽고, 나중에 이 기록을 다른 기관으로 넘길 사람은 코드를 읽는다.
 * 두 독자가 같은 표를 본다.
 *
 * 값이 없는 행은 기본으로 감춘다. 빈 칸이 열다섯 줄 늘어서면 "아직 정리가
 * 덜 된 기록" 처럼 보이지만, 채워진 줄만 남으면 있는 그대로 읽힌다.
 * 다만 입력 화면처럼 빠진 칸을 찾아야 할 때가 있어 showEmpty 로 뒤집는다.
 */

// ---------------------------------------------------------------- 값의 모양

/** 글자 하나, 또는 어딘가로 이어지는 글자. */
export interface MetaLink {
  text: string;
  href?: string;
  /** 분류 경로로 쓰이면 text 대신 이 계단을 그린다. */
  path?: { label: string; href?: string }[];
  /** 실물 원본이 남아 있는 출처. */
  original?: boolean;
  /** 값 아래에 작게 붙는 덧말. */
  note?: string;
}

export type MetaValue =
  | string
  | number
  | MetaLink
  | (string | MetaLink)[]
  | { label: string; href?: string }[][]
  | null
  | undefined;

/**
 * 표가 받는 데이터. 키는 15요소의 키로 고정이고, 그 밖의 키는 무시된다.
 * 형태분류와 생산일자만 전용 조각(TypeTag, DateValue)을 쓰므로 모양이 다르다.
 */
export interface RecordMeta {
  creator?: MetaValue;
  date?: string | { value: string; verified?: boolean } | null;
  type?: string | { type: string; detail?: string | null } | null;
  source?: MetaValue;
  subject?: MetaValue;
  temporal?: MetaValue;
  spatial?: MetaValue;
  people?: MetaValue;
  contributor?: MetaValue;
  publisher?: MetaValue;
  format?: MetaValue;
  identifier?: MetaValue;
  language?: MetaValue;
  rights?: MetaValue;
  tags?: (string | MetaLink)[] | null;
}

// ---------------------------------------------------------------- 15요소

/** [키, 한국어 이름, 요소 코드]. 순서가 곧 표에 찍히는 순서다. */
const ELEMENTS: [keyof RecordMeta, string, string][] = [
  ['creator', '생산자', 'dc:creator'],
  ['date', '생산일자', 'dc:date'],
  ['type', '형태분류', 'dc:type'],
  ['source', '출처분류', 'dc:source'],
  ['subject', '주제분류', 'dc:subject'],
  ['temporal', '시기분류', 'dcterms:temporal'],
  ['spatial', '장소', 'dcterms:spatial'],
  ['people', '등장인물', 'dc:subject'],
  ['contributor', '참여자', 'dc:contributor'],
  ['publisher', '발행처', 'dc:publisher'],
  ['format', '형식', 'dc:format'],
  ['identifier', '식별자', 'dc:identifier'],
  ['language', '언어', 'dc:language'],
  ['rights', '이용조건', 'dc:rights'],
  ['tags', '태그', 'dc:subject'],
];

/** 기계가 읽을 값은 고정폭으로 — 날짜와 식별자는 자릿수가 맞아야 눈에 띈다. */
const MONO: Partial<Record<keyof RecordMeta, true>> = {
  date: true,
  format: true,
  identifier: true,
  language: true,
};

// ---------------------------------------------------------------- 값 그리기

function isEmpty(v: unknown): boolean {
  return v == null || v === '' || (Array.isArray(v) && v.length === 0);
}

function isLink(v: unknown): v is MetaLink {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

/** 주소가 있으면 링크로, 없으면 그냥 글자로. 값에 주소가 붙는 것은 선택이다. */
function linkOrText(o: MetaLink) {
  return o.href ? <Link href={o.href}>{o.text}</Link> : <>{o.text}</>;
}

function toLink(x: string | MetaLink): MetaLink {
  return typeof x === 'object' ? x : { text: x };
}

/**
 * 한 칸의 내용. 형태분류와 생산일자는 이미 있는 조각을 쓰고, 나머지는
 * 값의 모양을 보고 고른다 — 글자면 글자, 배열이면 목록, 경로면 계단.
 */
function renderCell(key: keyof RecordMeta, record: RecordMeta) {
  if (key === 'type') {
    const t = record.type;
    if (isEmpty(t)) return <span className="jg-empty">기록 없음</span>;
    return typeof t === 'string' ? <TypeTag type={t} /> : <TypeTag type={t!.type} detail={t!.detail} />;
  }

  if (key === 'date') {
    const d = record.date;
    if (isEmpty(d)) return <span className="jg-empty">기록 없음</span>;
    return typeof d === 'string' ? <DateValue value={d} /> : <DateValue value={d!.value} verified={d!.verified} />;
  }

  return renderPlain(key, record[key]);
}

function renderPlain(key: Exclude<keyof RecordMeta, 'type' | 'date'>, v: MetaValue) {
  if (isEmpty(v)) return <span className="jg-empty">기록 없음</span>;

  if (key === 'tags' && Array.isArray(v)) {
    // 태그는 앞에 # 를 붙여 낱말과 구분한다. 찾기 화면으로 이어진다.
    return (
      <ul className="jg-chips">
        {(v as (string | MetaLink)[]).map((x, i) => {
          const o = toLink(x);
          return <li key={i}>{o.href ? <Link href={o.href}>{`#${o.text}`}</Link> : `#${o.text}`}</li>;
        })}
      </ul>
    );
  }

  if (Array.isArray(v)) {
    // 경로의 목록: [[{할머니댁}, {안방 장롱}], ...] 은 줄마다 경로 하나.
    if (Array.isArray(v[0])) {
      const paths = v as { label: string; href?: string }[][];
      return (
        <ul className="jg-paths">
          {paths.map((steps, i) => (
            <li key={i}>
              <ClassPath steps={steps} />
            </li>
          ))}
        </ul>
      );
    }
    return (
      <ul className="jg-list">
        {(v as (string | MetaLink)[]).map((x, i) => (
          <li key={i}>{linkOrText(toLink(x))}</li>
        ))}
      </ul>
    );
  }

  if (isLink(v)) {
    return (
      <span>
        {v.path ? <ClassPath steps={v.path} /> : linkOrText(v)}
        {v.original ? <span className="jg-verified">실물 원본</span> : null}
        {v.note ? <span className="jg-note">{v.note}</span> : null}
      </span>
    );
  }

  return <>{v}</>;
}

// ---------------------------------------------------------------- 표

export interface MetadataTableProps {
  record: RecordMeta;
  /** false 면 머리글을 아예 내지 않는다 — 이미 위에 제목이 있는 화면용. */
  heading?: string | false;
  /** 값이 없는 행도 "기록 없음" 으로 남긴다. */
  showEmpty?: boolean;
}

export default function MetadataTable({ record, heading, showEmpty }: MetadataTableProps) {
  const rows = ELEMENTS.filter(([key]) => showEmpty || !isEmpty(record[key]));

  return (
    <section className="jg-meta-wrap">
      {heading === false ? null : (
        <h2 className="jg-section-title jg-pixel">{heading ?? '상세정보'}</h2>
      )}
      <dl className="jg-meta">
        {rows.map(([key, name, code]) => (
          <div className="jg-meta-row" key={`${key}-${code}`}>
            <dt className="jg-meta-key">
              <span className="jg-meta-name">{name}</span>
              <span className="jg-meta-code">{code}</span>
            </dt>
            <dd className={cx('jg-meta-val', MONO[key] && 'is-mono')}>
              {renderCell(key, record)}
            </dd>
          </div>
        ))}
      </dl>
    </section>
  );
}
