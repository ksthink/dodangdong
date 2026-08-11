import Link from 'next/link';
import { db } from '@/lib/db';
import { requireAdmin } from '@/lib/access';
import { createCollection } from '../actions';

export const dynamic = 'force-dynamic';

/**
 * 모음집 관리.
 * 묶음(원본이 어디 있었나)과 다른 축이다 — 이쪽은 "무엇에 관한 이야기인가".
 */
export default async function AdminCollectionsPage() {
  await requireAdmin();
  const supabase = db();

  const { data: collections } = await supabase
    .from('collection')
    .select('id, title, kind, description, period_edtf')
    .order('sort_order');

  const { data: links } = await supabase.from('item_collection').select('collection_id');
  const counts = new Map<string, number>();
  for (const l of links ?? []) counts.set(l.collection_id, (counts.get(l.collection_id) ?? 0) + 1);

  return (
    <main className="wrap narrow">
      <section className="stack">
        <span className="eyebrow">큐레이션</span>
        <h1>이야기 모음집</h1>
        <p className="lede">
          자료는 묶음 하나에 속하지만, 모음집에는 여럿에 들어갈 수 있습니다. 자료 상세 화면에서
          넣습니다.
        </p>
      </section>

      <form action={createCollection} className="box stack">
        <h3>모음집 만들기</h3>
        <div className="field">
          <label htmlFor="title">제목 *</label>
          <input id="title" name="title" type="text" required placeholder="할머니의 부엌" />
        </div>
        <div className="formgrid">
          <div className="field">
            <label htmlFor="kind">종류</label>
            <select id="kind" name="kind" defaultValue="topic">
              <option value="topic">주제 모음집</option>
              <option value="event">사건</option>
            </select>
          </div>
          <div className="field">
            <label htmlFor="period_edtf">시기 (EDTF)</label>
            <input id="period_edtf" name="period_edtf" type="text" placeholder="1958/1990" />
          </div>
        </div>
        <div className="field">
          <label htmlFor="description">설명</label>
          <textarea id="description" name="description" rows={2} />
        </div>
        <div className="row">
          <button type="submit" className="btn">
            만들기
          </button>
        </div>
      </form>

      <div className="tw">
        <table>
          <thead>
            <tr>
              <th>제목</th>
              <th>종류</th>
              <th>자료</th>
            </tr>
          </thead>
          <tbody>
            {(collections ?? []).map((c) => (
              <tr key={c.id}>
                <td>
                  <Link href={`/collections/${c.id}`}>{c.title}</Link>
                </td>
                <td className="dim">{c.kind === 'event' ? '사건' : '주제'}</td>
                <td>{counts.get(c.id) ?? 0}</td>
              </tr>
            ))}
            {(collections ?? []).length === 0 && (
              <tr>
                <td colSpan={3} className="dim">
                  아직 모음집이 없습니다.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </main>
  );
}
