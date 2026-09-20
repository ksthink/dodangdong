import { getPeopleList } from '@/lib/people';
import { currentRole } from '@/lib/access';
import PersonCard from '@/components/person/PersonCard';

export const dynamic = 'force-dynamic';

export const metadata = {
  title: '사람 — 도당동 아카이브',
  description: '집안 사람들을 부르던 이름으로 찾는다.',
};

/**
 * 사람.
 *
 * 가족이 아카이브를 열 때 가장 먼저 떠올리는 것은 대개 자료가 아니라
 * 사람이다 — "할머니 사진 어디 있더라". 그래서 이름을 문자열로 흘리지 않고
 * 전거에 묶어 두고, 어느 이름으로 찾아도 한 곳에 닿게 한다.
 *
 * 부모에서 자식 순으로 늘어놓는다. 가나다순은 찾기에는 편하지만 집안의
 * 모양을 지운다.
 */
export default async function PeoplePage() {
  const role = await currentRole();
  const people = await getPeopleList(role);

  return (
    <main className="wrap">
      <section className="page-head">
        <h1 className="page-title jg-pixel">사람</h1>
        <p className="page-lead">
          집안 사람들을 부르던 이름으로 모았습니다. 윗대부터 차례로 놓았습니다.
        </p>
      </section>

      {people.length === 0 ? (
        <div className="empty">
          <p className="jg-pixel">아직 아무도 없다</p>
          <p>자료에 사람을 연결하면 여기에 모입니다.</p>
        </div>
      ) : (
        <div className="grid-3">
          {people.map((p) => (
            <PersonCard
              key={p.id}
              name={p.name}
              short={p.short}
              face={p.face}
              born={p.bornYear}
              died={p.diedYear}
              relation={p.relation}
              made={p.made}
              appears={p.appears}
              href={`/people/${p.id}`}
            />
          ))}
        </div>
      )}
    </main>
  );
}
