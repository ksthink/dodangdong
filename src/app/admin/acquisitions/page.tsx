import Link from 'next/link';
import { db } from '@/lib/db';
import { requireAdmin } from '@/lib/access';
import { createAcquisition } from '../actions';

export const dynamic = 'force-dynamic';

/**
 * 수집 세션 — 방문해서 받아온 단위.
 *
 * 이걸 먼저 적어두면 그 아래 만드는 모든 묶음에 출처가 자동으로 따라붙는다.
 * 낱장마다 "어디서 났나"를 적을 필요가 없어지는 것은 이 화면 덕분이다.
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
    <main className="wrap">
      <section className="stack">
        <span className="eyebrow">1단계</span>
        <h1>수집 세션</h1>
        <p className="lede">
          언제, 누구 집에서, 무엇을 받아왔는지 한 번만 적어두면 그 아래 묶음 전부가 출처를
          물려받습니다.
        </p>
      </section>

      <form action={createAcquisition} className="box stack">
        <h3>새 수집 세션</h3>
        <div className="formgrid">
          <div className="field">
            <label htmlFor="visited_on">방문일</label>
            <input id="visited_on" name="visited_on" type="date" required />
          </div>
          <div className="field">
            <label htmlFor="from_label">누구에게서</label>
            <input id="from_label" name="from_label" type="text" placeholder="큰아버지" />
          </div>
          <div className="field">
            <label htmlFor="location">장소</label>
            <input id="location" name="location" type="text" placeholder="안동 본가 다락" />
          </div>
        </div>
        <div className="field">
          <label htmlFor="note">받아온 것</label>
          <textarea id="note" name="note" rows={2} placeholder="앨범 5권, 편지 다발 하나, 카세트 3개" />
        </div>
        <div className="row">
          <button type="submit" className="btn">
            만들기
          </button>
        </div>
      </form>

      <section className="stack">
        <div className="rule" />
        <h2>지금까지의 수집</h2>
        {(acquisitions ?? []).length === 0 ? (
          <div className="box">
            <p>아직 수집 기록이 없습니다.</p>
          </div>
        ) : (
          <div className="stack">
            {(acquisitions ?? []).map((a) => (
              <div className="box stack-s" key={a.id}>
                <div className="row">
                  <b>{a.visited_on}</b>
                  {a.from_label && <span className="chip">{a.from_label}</span>}
                  {a.location && <span className="small dim">{a.location}</span>}
                  <Link href={`/admin/bundles/new?acquisition=${a.id}`} className="btn small row-end">
                    묶음 추가
                  </Link>
                </div>
                {a.note && <p className="small">{a.note}</p>}
                <div className="row">
                  {(byAcq.get(a.id) ?? []).map((b) => (
                    <Link key={b.id} href={`/admin/bundles/${b.id}`} className="chip accent">
                      {b.title}
                    </Link>
                  ))}
                  {(byAcq.get(a.id) ?? []).length === 0 && (
                    <span className="small dim">묶음 없음</span>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </section>
    </main>
  );
}
