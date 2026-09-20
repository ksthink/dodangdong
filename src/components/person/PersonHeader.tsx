import { Fragment } from 'react';
import { num } from '@/lib/ui';
import { shortName } from '@/lib/chronicle';
import { Face, lifeSpan } from './PersonCard';

/**
 * 인물 상세의 머리.
 *
 * 큰 제목은 호칭이고, 실명·다른 이름·생몰·관계·식별자는 정의 목록으로
 * 아래에 붙인다. 아는 것만 줄이 생긴다 — 빈 dt/dd 를 남기면 '모른다'가
 * '없다'로 읽히기 때문이다.
 */

export interface PersonHeaderProps {
  /** 전거의 display_name. "김순자(할머니)" 꼴. */
  name: string;
  /** 호칭. 주지 않으면 `name` 에서 꺼낸다. */
  short?: string;
  face?: string | null;
  kicker?: string | null;
  aliases?: string[];
  born?: string | number | null;
  died?: string | number | null;
  relation?: string | null;
  identifier?: string | null;
  bio?: string | null;
  stats?: { label: string; value: number }[];
}

export default function PersonHeader({
  name,
  short,
  face,
  kicker,
  aliases,
  born,
  died,
  relation,
  identifier,
  bio,
  stats,
}: PersonHeaderProps) {
  const call = short ?? shortName(name);
  const span = lifeSpan({ born, died });

  return (
    <header className="jg-phead">
      <Face face={face} name={name} short={call} size="xl" />
      <div className="jg-phead-body">
        {kicker ? <p className="jg-phead-kicker">{kicker}</p> : null}
        <h1 className="jg-phead-name jg-pixel">{call}</h1>
        <dl className="jg-phead-facts">
          {call !== name ? (
            <Fragment>
              <dt>이름</dt>
              <dd>{name}</dd>
            </Fragment>
          ) : null}
          {aliases && aliases.length ? (
            <Fragment>
              <dt>다른 이름</dt>
              <dd>{aliases.join(', ')}</dd>
            </Fragment>
          ) : null}
          {span ? (
            <Fragment>
              <dt>생몰</dt>
              <dd className="jg-date">{span}</dd>
            </Fragment>
          ) : null}
          {relation ? (
            <Fragment>
              <dt>관계</dt>
              <dd>{relation}</dd>
            </Fragment>
          ) : null}
          {identifier ? (
            <Fragment>
              <dt>식별자</dt>
              <dd className="jg-date">{identifier}</dd>
            </Fragment>
          ) : null}
        </dl>
        {bio ? <p className="jg-phead-bio">{bio}</p> : null}
        {stats && stats.length ? (
          <ul className="jg-phead-stats">
            {stats.map((s, k) => (
              <li key={k}>
                <strong>{num(s.value)}</strong>
                <span>{s.label}</span>
              </li>
            ))}
          </ul>
        ) : null}
      </div>
    </header>
  );
}
