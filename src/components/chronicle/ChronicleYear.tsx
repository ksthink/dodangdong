import Link from 'next/link';
import { num } from '@/lib/ui';
import type { ChronicleYearData, YearEntry } from '@/lib/chronicle';

/**
 * 연표의 한 해.
 *
 * 세 열로 나눈다 — 집안 일, 기록, 바깥 세상. 집안 일과 기록을 가르는 까닭은
 * 사건에는 파일이 없어도 되기 때문이다. "할머니가 서울로 이사했다"는 사진 한 장
 * 없어도 온전한 기록이고, 오히려 그런 것이 연표의 뼈대가 된다.
 *
 * 바깥 세상은 맥락일 뿐이라 흐린 열 하나를 차지한다. 기록과 같은 무게로
 * 보여주지 않는다.
 *
 * 머리에 그해 가족들의 나이를 적는다. 연표를 읽는 사람이 실제로 찾는 것은
 * 연도가 아니라 "그때 할머니가 몇 살이었나"인 경우가 많다.
 */

function EntryLine({ e }: { e: YearEntry }) {
  const body = e.href ? <Link href={e.href}>{e.title}</Link> : e.title;
  return (
    <>
      <span className="jg-cyear-date">{e.date}</span>
      <span>
        {e.type ? <span className="jg-tl-type">{e.type} </span> : null}
        {body}
        {e.verified ? <span className="jg-verified">확인됨</span> : null}
      </span>
    </>
  );
}

export default function ChronicleYear({ data }: { data: ChronicleYearData }) {
  const { year, ages, events, records, recordCount, thumbs, world } = data;

  return (
    <section className="jg-cyear" id={`y${year}`}>
      <header className="jg-cyear-head">
        <h3 className="jg-cyear-year jg-pixel">{year}</h3>
        {ages.length > 0 ? (
          <ul className="jg-cyear-ages" aria-label="그해 나이">
            {ages.map((a) => (
              <li key={a.name}>
                {a.name} <strong>{a.age}</strong>살
              </li>
            ))}
          </ul>
        ) : null}
      </header>

      <div className="jg-cyear-cols">
        <div className="jg-cyear-col">
          <p className="jg-cyear-label">집안 일</p>
          {events.length > 0 ? (
            <ul className="jg-cyear-list">
              {events.map((e, k) => (
                <li key={k} className="is-event">
                  <EntryLine e={e} />
                </li>
              ))}
            </ul>
          ) : (
            <p className="jg-empty">기록 없음</p>
          )}
        </div>

        <div className="jg-cyear-col">
          <p className="jg-cyear-label">
            기록 <span className="jg-date">{num(recordCount)}건</span>
          </p>
          {thumbs.length > 0 ? (
            <div className="jg-cyear-thumbs">
              {thumbs.map((src) => (
                // 연표의 썸네일은 장식이 아니라 그해의 인상이다. 다만 제목이
                // 바로 옆에 있으므로 alt 를 비워 두 번 읽히지 않게 한다.
                // eslint-disable-next-line @next/next/no-img-element
                <img key={src} src={src} alt="" />
              ))}
            </div>
          ) : null}
          {records.length > 0 ? (
            <ul className="jg-cyear-list">
              {records.map((r, k) => (
                <li key={k}>
                  <EntryLine e={r} />
                </li>
              ))}
            </ul>
          ) : (
            <p className="jg-empty">기록 없음</p>
          )}
        </div>

        {world.length > 0 ? (
          <div className="jg-cyear-col is-world">
            <p className="jg-cyear-label">바깥 세상</p>
            <ul className="jg-cyear-list">
              {world.map((w, k) => (
                <li key={k}>
                  <span className="jg-cyear-date">{w.date}</span>
                  <span>{w.title}</span>
                </li>
              ))}
            </ul>
          </div>
        ) : null}
      </div>
    </section>
  );
}
