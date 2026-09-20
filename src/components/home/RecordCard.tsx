import Link from 'next/link';
import { DateValue, Thumb, TypeTag } from '@/components/search/parts';

/**
 * 첫 화면의 기록 한 장.
 *
 * 찾기 화면의 ResultRow 와 같은 내용을 담되 가로로 눕히지 않고 세운다.
 * 썸네일이 크게 보여야 하는 자리여서다.
 */

export interface RecordCardProps {
  title: string;
  type: string;
  href?: string | null;
  thumb?: string | null;
  thumbAlt?: string;
  docType?: string | null;
  date?: string | null;
  dateVerified?: boolean;
  creator?: string | null;
  identifier?: string | null;
}

export function RecordCard({
  title,
  type,
  href,
  thumb,
  thumbAlt,
  docType,
  date,
  dateVerified,
  creator,
  identifier,
}: RecordCardProps) {
  const body = (
    <>
      <div className="jg-card-thumb">
        <Thumb src={thumb} type={type} alt={thumbAlt} />
      </div>
      <div className="jg-card-body">
        <TypeTag type={type} detail={docType} />
        <h3 className="jg-card-title">{title}</h3>
        <p className="jg-card-meta">
          {date ? <DateValue value={date} verified={dateVerified} /> : null}
          {creator ? <span>{creator}</span> : null}
        </p>
        {identifier ? <p className="jg-card-id">{identifier}</p> : null}
      </div>
    </>
  );

  // 카드 전체가 링크다. 제목만 누를 수 있으면 표적이 너무 작다.
  return href ? (
    <Link className="jg-card" href={href}>
      {body}
    </Link>
  ) : (
    <article className="jg-card">{body}</article>
  );
}
