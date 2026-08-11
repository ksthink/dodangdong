import Link from 'next/link';
import { db } from '@/lib/db';
import { requireAdmin, ACCESS_LABELS, type AccessLevel } from '@/lib/access';
import { parseEdtf } from '@/lib/edtf';

export const dynamic = 'force-dynamic';

const KIND_LABELS: Record<string, string> = {
  album: '앨범',
  roll: '필름 롤',
  bundle: '다발',
  tape: '테이프',
  folder: '폴더',
  single: '낱개',
};

export default async function BundlesPage() {
  await requireAdmin();
  const supabase = db();

  const { data: bundles } = await supabase
    .from('bundle')
    .select('id, title, kind, source, period_edtf, default_access_level, is_archived')
    .order('created_at', { ascending: false });

  const { data: items } = await supabase
    .from('item')
    .select('bundle_id, created_start')
    .eq('is_archived', false);

  const counts = new Map<string, { total: number; undated: number }>();
  for (const i of items ?? []) {
    const c = counts.get(i.bundle_id) ?? { total: 0, undated: 0 };
    c.total += 1;
    if (!i.created_start) c.undated += 1;
    counts.set(i.bundle_id, c);
  }

  return (
    <main className="wrap">
      <section className="stack">
        <span className="eyebrow">2단계</span>
        <h1>묶음</h1>
        <p className="lede">
          앨범 한 권, 테이프 하나처럼 원본이 담겨 있던 단위입니다. 기술 작업의 대부분이 여기서
          끝납니다.
        </p>
        <div className="row">
          <Link href="/admin/bundles/new" className="btn">
            새 묶음
          </Link>
        </div>
      </section>

      {(bundles ?? []).length === 0 ? (
        <div className="box">
          <p>아직 묶음이 없습니다.</p>
          <p className="small">먼저 수집 세션을 만들고, 거기에 묶음을 붙이는 순서를 권합니다.</p>
        </div>
      ) : (
        <div className="tw">
          <table>
            <thead>
              <tr>
                <th>묶음</th>
                <th>종류</th>
                <th>시기</th>
                <th>출처</th>
                <th>기본 등급</th>
                <th>자료</th>
                <th>시기 미상</th>
              </tr>
            </thead>
            <tbody>
              {(bundles ?? []).map((b) => {
                const c = counts.get(b.id) ?? { total: 0, undated: 0 };
                return (
                  <tr key={b.id}>
                    <td>
                      <Link href={`/admin/bundles/${b.id}`}>{b.title}</Link>
                    </td>
                    <td className="dim">{KIND_LABELS[b.kind] ?? b.kind}</td>
                    <td className="dim">{b.period_edtf ? parseEdtf(b.period_edtf).label : '—'}</td>
                    <td className="dim">{b.source}</td>
                    <td className="dim">
                      {ACCESS_LABELS[b.default_access_level as AccessLevel]}
                    </td>
                    <td>{c.total}</td>
                    <td style={{ color: c.undated ? 'var(--warn)' : undefined }}>
                      {c.undated || '—'}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </main>
  );
}
