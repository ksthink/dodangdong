/**
 * EDTF (Extended Date/Time Format) — 이 아카이브가 쓰는 만큼만.
 *
 * 가족 기록에서 시기는 대부분 정확하지 않다. "1958년 4월 12일"과 "1958년쯤"과
 * "1950년대"를 같은 칸에 넣으면 셋 다 거짓이 된다. 그래서 원문을 EDTF 로 보관하고,
 * 정렬에 쓸 범위(start~end)와 화면에 쓸 한국어 표기를 따로 유도한다.
 *
 * 지원하는 표기
 *   1958-04-12   확정된 날
 *   1958-04      월까지만 앎
 *   1958         해까지만 앎
 *   1958?        불확실 (아마 1958년일 것)
 *   1958~        대략 (1958년 언저리)
 *   1958%        불확실하고 대략적이기까지
 *   195X         1950년대
 *   19XX         1900년대
 *   1971/1991    기간
 */

export type Precision = 'day' | 'month' | 'year' | 'decade' | 'century' | 'interval' | 'unknown';

export interface ParsedEdtf {
  edtf: string;
  start: string | null; // YYYY-MM-DD
  end: string | null;
  precision: Precision;
  uncertain: boolean;
  approx: boolean;
  /** 화면에 그대로 쓸 수 있는 한국어 표기 */
  label: string;
  valid: boolean;
}

const UNKNOWN: ParsedEdtf = {
  edtf: '',
  start: null,
  end: null,
  precision: 'unknown',
  uncertain: false,
  approx: false,
  label: '시기 미상',
  valid: false,
};

function pad(n: number, w = 2) {
  return String(n).padStart(w, '0');
}

function lastDayOfMonth(year: number, month: number) {
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
}

/** 한정자(?, ~, %)를 떼어내고 본체만 돌려준다. */
function stripQualifiers(raw: string) {
  let s = raw.trim();
  let uncertain = false;
  let approx = false;
  while (s.length > 0) {
    const last = s[s.length - 1];
    if (last === '?') {
      uncertain = true;
      s = s.slice(0, -1);
    } else if (last === '~') {
      approx = true;
      s = s.slice(0, -1);
    } else if (last === '%') {
      uncertain = true;
      approx = true;
      s = s.slice(0, -1);
    } else {
      break;
    }
  }
  return { body: s, uncertain, approx };
}

interface Span {
  start: string;
  end: string;
  precision: Precision;
  year: number;
  month?: number;
  day?: number;
  decade?: number;
  century?: number;
}

/** 한정자를 뗀 단일 표기 하나를 범위로 바꾼다. */
function parseSingle(body: string): Span | null {
  // 1958-04-12
  let m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(body);
  if (m) {
    const [y, mo, d] = [Number(m[1]), Number(m[2]), Number(m[3])];
    if (mo < 1 || mo > 12 || d < 1 || d > lastDayOfMonth(y, mo)) return null;
    const iso = `${pad(y, 4)}-${pad(mo)}-${pad(d)}`;
    return { start: iso, end: iso, precision: 'day', year: y, month: mo, day: d };
  }

  // 1958-04
  m = /^(\d{4})-(\d{2})$/.exec(body);
  if (m) {
    const [y, mo] = [Number(m[1]), Number(m[2])];
    if (mo < 1 || mo > 12) return null;
    return {
      start: `${pad(y, 4)}-${pad(mo)}-01`,
      end: `${pad(y, 4)}-${pad(mo)}-${pad(lastDayOfMonth(y, mo))}`,
      precision: 'month',
      year: y,
      month: mo,
    };
  }

  // 1958
  m = /^(\d{4})$/.exec(body);
  if (m) {
    const y = Number(m[1]);
    return { start: `${pad(y, 4)}-01-01`, end: `${pad(y, 4)}-12-31`, precision: 'year', year: y };
  }

  // 195X — 연대
  m = /^(\d{3})X$/i.exec(body);
  if (m) {
    const base = Number(m[1]) * 10;
    return {
      start: `${pad(base, 4)}-01-01`,
      end: `${pad(base + 9, 4)}-12-31`,
      precision: 'decade',
      year: base,
      decade: base,
    };
  }

  // 19XX — 세기(1900년대)
  m = /^(\d{2})XX$/i.exec(body);
  if (m) {
    const base = Number(m[1]) * 100;
    return {
      start: `${pad(base, 4)}-01-01`,
      end: `${pad(base + 99, 4)}-12-31`,
      precision: 'century',
      year: base,
      century: base,
    };
  }

  return null;
}

function labelSingle(span: Span): string {
  switch (span.precision) {
    case 'day':
      return `${span.year}년 ${span.month}월 ${span.day}일`;
    case 'month':
      return `${span.year}년 ${span.month}월`;
    case 'year':
      return `${span.year}년`;
    case 'decade':
      return `${span.decade}년대`;
    case 'century':
      return `${span.century}년대`;
    default:
      return '시기 미상';
  }
}

export function parseEdtf(raw: string | null | undefined): ParsedEdtf {
  if (!raw || !raw.trim()) return { ...UNKNOWN };
  const input = raw.trim();

  // 기간: 1971/1991
  if (input.includes('/')) {
    const [a, b] = input.split('/');
    const qa = stripQualifiers(a ?? '');
    const qb = stripQualifiers(b ?? '');
    const sa = parseSingle(qa.body);
    const sb = parseSingle(qb.body);
    if (!sa || !sb) return { ...UNKNOWN, edtf: input };
    const uncertain = qa.uncertain || qb.uncertain;
    const approx = qa.approx || qb.approx;
    let label = `${labelSingle(sa)} – ${labelSingle(sb)}`;
    if (sa.precision === 'year' && sb.precision === 'year') {
      label = `${sa.year}–${sb.year}년`;
    }
    return {
      edtf: input,
      start: sa.start,
      end: sb.end,
      precision: 'interval',
      uncertain,
      approx,
      label: decorate(label, uncertain, approx),
      valid: true,
    };
  }

  const { body, uncertain, approx } = stripQualifiers(input);
  const span = parseSingle(body);
  if (!span) return { ...UNKNOWN, edtf: input };

  return {
    edtf: input,
    start: span.start,
    end: span.end,
    precision: span.precision,
    uncertain,
    approx,
    label: decorate(labelSingle(span), uncertain, approx),
    valid: true,
  };
}

function decorate(label: string, uncertain: boolean, approx: boolean) {
  if (uncertain && approx) return `${label} 무렵(추정)`;
  if (uncertain) return `${label}(추정)`;
  if (approx) return `${label}쯤`;
  return label;
}

/** 연표에서 묶을 연도. 범위면 시작 연도를 쓴다. */
export function edtfYear(raw: string | null | undefined): number | null {
  const p = parseEdtf(raw);
  if (!p.start) return null;
  return Number(p.start.slice(0, 4));
}

/** EXIF 촬영일시 등에서 얻은 정확한 날짜를 EDTF 로. */
export function dateToEdtf(d: Date): string {
  return `${pad(d.getUTCFullYear(), 4)}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`;
}

/** 관리자 입력값을 DB 컬럼 묶음으로. */
export function edtfColumns(raw: string | null | undefined) {
  const p = parseEdtf(raw);
  return {
    created_edtf: p.valid ? p.edtf : raw?.trim() || null,
    created_start: p.start,
    created_end: p.end,
    created_precision: p.precision,
    created_uncertain: p.uncertain,
    created_approx: p.approx,
  };
}
