import Link from 'next/link';
import { db } from '@/lib/db';
import { requireAdmin } from '@/lib/access';
import { num } from '@/lib/ui';
import Field from '@/components/admin/Field';
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
    <div className="page page-admin">
      <section className="admin-sec">
        <h1 className="page-title jg-pixel">인물 전거</h1>
        <p className="page-lead">
          부르던 호칭을 별칭으로 함께 넣어두면, 어느 이름으로 검색해도 같은 사람에 닿습니다.
        </p>

        {(people ?? []).length === 0 ? (
          <div className="empty">
            <p className="jg-pixel">아직 등록된 인물이 없다</p>
            <p>아래에서 한 사람을 등록해 보세요.</p>
          </div>
        ) : (
          <div className="jg-rtable-wrap">
            <table className="jg-rtable">
              <thead>
                <tr>
                  <th>이름</th>
                  <th>관계</th>
                  <th>생몰</th>
                  <th>달리 부르던 이름</th>
                  <th>연결된 자료</th>
                </tr>
              </thead>
              <tbody>
                {(people ?? []).map((p) => (
                  <tr key={p.id}>
                    <td className="is-title">
                      <Link href={`/people/${p.id}`}>{p.display_name}</Link>
                    </td>
                    <td className="is-muted">{p.relation_to_root ?? '—'}</td>
                    {/* 생몰은 EDTF 그대로 적는다 — 어림한 해를 '1935년'으로
                        다듬으면 확인된 날짜와 구분되지 않는다. */}
                    <td className="is-mono is-muted">
                      {p.birth_edtf || p.death_edtf
                        ? `${p.birth_edtf ?? '?'}–${p.death_edtf ?? ''}`
                        : '—'}
                    </td>
                    <td>
                      {(p.aliases ?? []).length > 0 ? (
                        <ul className="jg-chips">
                          {(p.aliases ?? []).map((a: string) => (
                            <li key={a}>{a}</li>
                          ))}
                        </ul>
                      ) : (
                        <span className="is-muted">—</span>
                      )}
                    </td>
                    <td className="is-mono">{num(counts.get(p.id) ?? 0)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section className="admin-sec">
        <h2 className="sec-title jg-pixel">인물 등록</h2>
        <form action={createPerson} className="edit-form">
          <div className="form-grid">
            <Field label="이름" code="foaf:name" name="display_name" required placeholder="김순덕" />
            <Field label="관계" name="relation_to_root" placeholder="할머니"
                   help="이 아카이브를 세운 사람에게서 본 관계입니다." />
            <Field label="달리 부르던 이름" name="aliases" className="span2"
                   placeholder="할머니, 순덕이, 어머니"
                   help="쉼표로 나눕니다. 여기 적은 이름으로도 검색에 걸립니다." />
            <Field label="출생" code="dcterms:date" name="birth_edtf" mono placeholder="1935"
                   help="EDTF 로 적습니다 — 1935, 1935-04, 1935?" />
            <Field label="사망" code="dcterms:date" name="death_edtf" mono />
            <Field label="메모" name="note" type="textarea" rows={2} className="span2"
                   help="같은 이름이 둘일 때 가려낼 근거를 적어 둡니다." />
          </div>
          <div className="form-actions">
            <button type="submit" className="jg-btn jg-btn-primary">등록</button>
          </div>
        </form>
      </section>
    </div>
  );
}
