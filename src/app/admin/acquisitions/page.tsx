import Link from 'next/link';
import { db } from '@/lib/db';
import { requireAdmin } from '@/lib/access';
import { createAcquisition } from '../actions';
import Field from '@/components/admin/Field';

export const dynamic = 'force-dynamic';

/**
 * 수집 세션 — 방문해서 받아온 단위.
 *
 * 이걸 먼저 적어두면 그 아래 만드는 모든 묶음에 출처가 자동으로 따라붙는다.
 * 기록마다 "어디서 났나"를 적을 필요가 없어지는 것은 이 화면 덕분이다.
 */
export default async function AcquisitionsPage() {
  await requireAdmin();
  const supabase = db();

  const { data: acquisitions } = await supabase
    .from('acquisition')
    .select('id, visited_on, from_label, location, note')
    .order('visited_on', { ascending: false });

  const { data: bundles } = await supabase
    .from('bundle')
    .select('id, title, acquisition_id')
    .eq('is_archived', false);

  const byAcq = new Map<string, { id: string; title: string }[]>();
  for (const b of bundles ?? []) {
    if (!b.acquisition_id) continue;
    if (!byAcq.has(b.acquisition_id)) byAcq.set(b.acquisition_id, []);
    byAcq.get(b.acquisition_id)!.push(b);
  }

  return (
    <div className="page page-admin">
      <section className="admin-sec">
        <h1 className="page-title jg-pixel">수집 세션</h1>
        <p className="page-lead">
          언제, 누구 집에서, 무엇을 받아왔는지 한 번만 적어두면 그 아래 묶음 전부가 출처를
          물려받습니다.
        </p>
      </section>

      <section className="admin-sec">
        <h2 className="sec-title jg-pixel">새 수집 세션</h2>
        <form action={createAcquisition} className="edit-form">
          <div className="form-grid">
            <Field label="방문일" code="dcterms:dateAccepted" name="visited_on" type="date" mono required />
            <Field label="누구에게서" code="dc:source" name="from_label" placeholder="큰아버지" />
            <Field label="장소" code="dcterms:spatial" name="location" placeholder="안동 본가 다락" />
            <Field
              label="받아온 것"
              name="note"
              type="textarea"
              rows={2}
              className="span2"
              placeholder="앨범 5권, 편지 다발 하나, 카세트 3개"
              help="세는 단위로 적어두면 나중에 빠진 것을 알아챌 수 있습니다."
            />
          </div>
          <div className="form-actions">
            <button type="submit" className="jg-btn jg-btn-primary">
              만들기
            </button>
          </div>
        </form>
      </section>

      <section className="admin-sec">
        <h2 className="sec-title jg-pixel">지금까지의 수집</h2>

        {(acquisitions ?? []).length === 0 ? (
          <div className="empty">
            <p className="jg-pixel">아직 수집 기록이 없다</p>
            <p>위에서 첫 방문을 적어 보세요.</p>
          </div>
        ) : (
          <div className="jg-rtable-wrap">
            <table className="jg-rtable">
              <thead>
                <tr>
                  <th>방문일</th>
                  <th>누구에게서</th>
                  <th>장소</th>
                  <th>받아온 것</th>
                  <th>묶음</th>
                  <th aria-label="할 일" />
                </tr>
              </thead>
              <tbody>
                {(acquisitions ?? []).map((a) => {
                  const made = byAcq.get(a.id) ?? [];
                  return (
                    <tr key={a.id}>
                      <td className="is-mono is-title">{a.visited_on}</td>
                      <td>{a.from_label || '—'}</td>
                      <td className="is-muted">{a.location || '—'}</td>
                      <td className="is-muted">{a.note || '—'}</td>
                      <td>
                        {/* 묶음이 이 세션에 달려 있는지가 한눈에 보여야 한다.
                            비어 있으면 아직 아무것도 기술되지 않은 방문이다. */}
                        {made.length === 0 ? (
                          <span className="is-muted">묶음 없음</span>
                        ) : (
                          <ul className="jg-chips">
                            {made.map((b) => (
                              <li key={b.id}>
                                <Link href={`/admin/bundles/${b.id}`}>{b.title}</Link>
                              </li>
                            ))}
                          </ul>
                        )}
                      </td>
                      <td>
                        <Link
                          href={`/admin/bundles/new?acquisition=${a.id}`}
                          className="jg-btn jg-btn-secondary"
                        >
                          묶음 추가
                        </Link>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
