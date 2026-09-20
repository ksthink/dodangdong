import Link from 'next/link';
import { requireAdmin } from '@/lib/access';
import { listStories } from '@/lib/admin-curation';
import { createStory } from '@/app/admin/actions';
import { num } from '@/lib/ui';
import Field from '@/components/admin/Field';
import Notice from '@/components/admin/Notice';

export const dynamic = 'force-dynamic';

/**
 * 이야기 목록과 만들기.
 *
 * 큐레이션은 자료가 아니라 자료를 가리키는 묶음이다. 여기서 만드는 것은
 * 껍데기뿐이고, 알맹이는 편집 화면에서 블록을 쌓아 채운다.
 */
export default async function CurationPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  await requireAdmin();
  const { error } = await searchParams;
  const stories = await listStories();

  return (
    <div className="page-admin">
      <section className="admin-sec">
        <h1 className="sec-title jg-pixel">이야기</h1>

        {error ? <Notice tone="error" title="만들지 못했습니다">{error}</Notice> : null}

        {stories.length === 0 ? (
          <div className="empty">
            <p className="jg-pixel">아직 엮은 이야기가 없다</p>
            <p>아래에서 하나 만들어 보세요.</p>
          </div>
        ) : (
          <div className="jg-rtable-wrap">
            <table className="jg-rtable">
              <thead>
                <tr>
                  <th>제목</th>
                  <th>시기</th>
                  <th>블록</th>
                  <th>엮은 기록</th>
                </tr>
              </thead>
              <tbody>
                {stories.map((s) => (
                  <tr key={s.id}>
                    <td className="is-title">
                      <Link href={`/admin/curation/${s.id}`}>{s.title}</Link>
                      {s.summary ? <span className="jg-note">{s.summary}</span> : null}
                    </td>
                    <td className="is-mono">{s.period_edtf ?? '—'}</td>
                    <td className="is-mono">{num(s.blockCount)}</td>
                    <td className="is-mono">{num(s.itemCount)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section className="admin-sec">
        <h2 className="sec-title jg-pixel">새 이야기</h2>
        <form action={createStory} className="edit-form">
          <div className="form-grid">
            <Field label="제목" name="title" required />
            <Field label="시기" code="dcterms:temporal" name="period_edtf" mono
                   help="EDTF 로 적습니다 — 1962/1999, 1978-05-14" />
            <Field label="한 줄 소개" name="summary" type="textarea" rows={2}
                   className="span2"
                   help="이야기 카드와 첫 화면 히어로에 쓰입니다." />
          </div>
          <div className="form-actions">
            <button type="submit" className="jg-btn jg-btn-primary">만들기</button>
          </div>
        </form>
      </section>
    </div>
  );
}
