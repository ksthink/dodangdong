import Link from 'next/link';
import { getPeople } from '@/lib/queries';
import { parseEdtf } from '@/lib/edtf';

export const dynamic = 'force-dynamic';

/**
 * 인물 전거 목록.
 *
 * 이름을 문자열로 적지 않고 전거에 묶는 이유가 여기서 눈에 보인다 —
 * "할머니 / 김순덕 / 어머니" 를 한 사람으로 모아두면 어느 이름으로 찾아도 같은 곳에 닿는다.
 */
export default async function PeoplePage() {
  const people = await getPeople();

  return (
    <main className="wrap narrow">
      <section className="stack">
        <span className="eyebrow">사람</span>
        <h1>인물 전거</h1>
        <p className="lede">
          자료에 적힌 이름이 아니라, 사람 하나하나에 번호를 붙여 관리합니다. 부르던 호칭도 함께
          보관합니다.
        </p>
      </section>

      {people.length === 0 ? (
        <div className="box">
          <p>아직 등록된 인물이 없습니다.</p>
        </div>
      ) : (
        <div className="tw">
          <table>
            <thead>
              <tr>
                <th>이름</th>
                <th>관계</th>
                <th>생몰</th>
                <th>달리 부르던 이름</th>
              </tr>
            </thead>
            <tbody>
              {people.map((p) => (
                <tr key={p.id}>
                  <td>
                    <Link href={`/people/${p.id}`}>{p.display_name}</Link>
                  </td>
                  <td className="dim">{p.relation_to_root ?? '—'}</td>
                  <td className="dim">
                    {p.birth_edtf ? parseEdtf(p.birth_edtf).label : '—'}
                    {p.death_edtf ? ` – ${parseEdtf(p.death_edtf).label}` : ''}
                  </td>
                  <td className="dim">{(p.aliases ?? []).join(', ') || '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </main>
  );
}
