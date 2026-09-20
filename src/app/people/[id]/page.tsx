import Link from 'next/link';
import { notFound } from 'next/navigation';
import { getPersonDetail, type PersonKin, type PersonRecord } from '@/lib/people';
import { currentRole } from '@/lib/access';
import { num } from '@/lib/ui';
import PersonHeader from '@/components/person/PersonHeader';
import LifeLanes from '@/components/chronicle/LifeLanes';
import { ResultRow } from '@/components/search/parts';

export const dynamic = 'force-dynamic';

/**
 * 한 사람.
 *
 * 위에서 아래로 네 층이다. 누구인가(머리) → 언제 살았나(생애 레인) →
 * 어디에 나오나 → 무엇을 남겼나. 앞의 둘이 사람을 세우고, 뒤의 둘이 그
 * 사람을 아카이브에 붙들어 맨다.
 *
 * 생애 레인은 연표의 것을 한 줄로 줄여 쓴다. 같은 그림을 두 번 만들지
 * 않으려는 것이고, 연표에서 이 사람의 줄만 떼어 온 것처럼 읽혀야 한다.
 */
export default async function PersonPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const role = await currentRole();
  const detail = await getPersonDetail(role, id);
  // 없는 사람과 볼 수 없는 사람을 똑같이 404 로 둔다 — 구분해서 답하면
  // 감추려던 이름이 그 구분에서 새어 나간다.
  if (!detail) notFound();

  const { person, parents, spouses, children, appears, made, lane, from, to } = detail;
  const family: { label: string; people: PersonKin[] }[] = [
    { label: '부모', people: parents },
    { label: '배우자', people: spouses },
    { label: '자녀', people: children },
  ].filter((g) => g.people.length > 0);

  return (
    <main className="wrap">
      <PersonHeader
        name={person.name}
        short={person.short}
        face={person.face}
        kicker="사람"
        aliases={person.aliases}
        born={person.bornYear}
        died={person.diedYear}
        relation={person.relation}
        bio={person.note}
        stats={[
          { label: '나오는 기록', value: person.appears },
          { label: '만든 기록', value: person.made },
        ]}
      />

      {lane.born !== null || lane.periods.length > 0 || lane.records.length > 0 ? (
        <section className="chron-lanes">
          <LifeLanes lanes={[lane]} from={from} to={to} label={`${person.short} 생애`} />
        </section>
      ) : null}

      {family.length > 0 ? (
        <section>
          <h2 className="jg-section-title jg-pixel">가족</h2>
          {family.map((g) => (
            <p key={g.label} className="jg-row-meta">
              <span className="jg-tag-label">{g.label}</span>
              <span className="jg-path">
                {g.people.map((k, i) => (
                  <span key={k.id}>
                    {i > 0 ? (
                      <span className="jg-path-sep" aria-hidden="true">
                        {' · '}
                      </span>
                    ) : null}
                    <Link href={`/people/${k.id}`}>{k.short}</Link>
                  </span>
                ))}
              </span>
            </p>
          ))}
        </section>
      ) : null}

      <RecordSection
        title="나오는 기록"
        records={appears}
        empty={`${person.short}이(가) 나오는 자료가 아직 없습니다.`}
      />
      <RecordSection
        title="만든 기록"
        records={made}
        empty={`${person.short}이(가) 만든 자료가 아직 없습니다.`}
      />
    </main>
  );
}

/**
 * 기록 한 묶음.
 *
 * 0건이어도 자리를 지운다 — "없다"를 빈 상자로 보여 주면 화면이 늘 절반쯤
 * 비어 있고, 정말 볼 것이 있는 사람과 구별되지 않는다. 대신 한 줄로 적는다.
 */
function RecordSection({
  title,
  records,
  empty,
}: {
  title: string;
  records: PersonRecord[];
  empty: string;
}) {
  return (
    <section>
      <h2 className="jg-section-title jg-pixel">
        {title}
        <span className="jg-section-count">{num(records.length)}건</span>
      </h2>
      {records.length === 0 ? (
        <p className="small dim">{empty}</p>
      ) : (
        <div>
          {records.map((r) => (
            <ResultRow
              key={r.id}
              title={r.title}
              href={r.href}
              summary={r.summary}
              type={r.type}
              docType={r.docType}
              date={r.date}
              dateVerified={r.dateVerified}
              thumb={r.thumb}
            />
          ))}
        </div>
      )}
    </section>
  );
}
