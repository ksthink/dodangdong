import { db } from '@/lib/db';
import { requireAdmin } from '@/lib/access';
import { createPerson } from '../actions';

export const dynamic = 'force-dynamic';

/**
 * 인물 전거 관리.
 *
 * 이름을 문자열로 적지 않는 이유가 여기 있다 — "할머니 / 김순덕 / 어머니"를
 * 한 번 묶어두면 이후 모든 자료가 같은 사람을 가리킨다.
 */
export default async function AdminPeoplePage() {
  await requireAdmin();
  const supabase = db();

  const { data: people } = await supabase
    .from('person')
    .select('id, display_name, aliases, relation_to_root, birth_edtf, death_edtf')
    .order('display_name');

  const { data: links } = await supabase.from('item_person').select('person_id');
  const counts = new Map<string, number>();
  for (const l of links ?? []) counts.set(l.person_id, (counts.get(l.person_id) ?? 0) + 1);

  return (
    <main className="wrap narrow">
      <section className="stack">
        <span className="eyebrow">통제 어휘</span>
        <h1>인물 전거</h1>
        <p className="lede">
          부르던 호칭을 별칭으로 함께 넣어두면, 어느 이름으로 검색해도 같은 사람에 닿습니다.
        </p>
      </section>

      <form action={createPerson} className="box stack">
        <h3>인물 등록</h3>
        <div className="formgrid">
          <div className="field">
            <label htmlFor="display_name">이름 *</label>
            <input id="display_name" name="display_name" type="text" required placeholder="김순덕" />
          </div>
          <div className="field">
            <label htmlFor="relation_to_root">관계</label>
            <input id="relation_to_root" name="relation_to_root" type="text" placeholder="할머니" />
          </div>
        </div>
        <div className="field">
          <label htmlFor="aliases">달리 부르던 이름 (쉼표로 구분)</label>
          <input id="aliases" name="aliases" type="text" placeholder="할머니, 순덕이, 어머니" />
        </div>
        <div className="formgrid">
          <div className="field">
            <label htmlFor="birth_edtf">출생 (EDTF)</label>
            <input id="birth_edtf" name="birth_edtf" type="text" placeholder="1935" />
          </div>
          <div className="field">
            <label htmlFor="death_edtf">사망 (EDTF)</label>
            <input id="death_edtf" name="death_edtf" type="text" />
          </div>
        </div>
        <div className="field">
          <label htmlFor="note">메모</label>
          <textarea id="note" name="note" rows={2} />
        </div>
        <div className="row">
          <button type="submit" className="btn">
            등록
          </button>
        </div>
      </form>

      <div className="tw">
        <table>
          <thead>
            <tr>
              <th>이름</th>
              <th>관계</th>
              <th>별칭</th>
              <th>연결된 자료</th>
            </tr>
          </thead>
          <tbody>
            {(people ?? []).map((p) => (
              <tr key={p.id}>
                <td>{p.display_name}</td>
                <td className="dim">{p.relation_to_root ?? '—'}</td>
                <td className="dim">{(p.aliases ?? []).join(', ') || '—'}</td>
                <td>{counts.get(p.id) ?? 0}</td>
              </tr>
            ))}
            {(people ?? []).length === 0 && (
              <tr>
                <td colSpan={4} className="dim">
                  아직 등록된 인물이 없습니다.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </main>
  );
}
