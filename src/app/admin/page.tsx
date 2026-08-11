import Link from 'next/link';
import { db } from '@/lib/db';
import { requireAdmin } from '@/lib/access';
import { thumbsFor } from '@/lib/queries';
import { ItemTile } from '@/components/ItemTile';
import { TYPE_LABELS } from '@/components/icons';

export const dynamic = 'force-dynamic';

/**
 * 관리자 첫 화면은 대시보드가 아니라 작업 대기열이다.
 * "무엇이 아직 기술되지 않았는가"가 이 아카이브의 진짜 진행률이다.
 */
export default async function AdminHome() {
  await requireAdmin();
  const supabase = db();

  const [totalRes, undatedRes, untitledRes, unfeaturedRes, bundleRes, recentRes] = await Promise.all([
    supabase.from('item').select('id', { count: 'exact', head: true }).eq('is_archived', false),
    supabase
      .from('item')
      .select('id', { count: 'exact', head: true })
      .is('created_start', null)
      .eq('is_archived', false),
    supabase
      .from('item')
      .select('id', { count: 'exact', head: true })
      .is('description', null)
      .eq('is_archived', false),
    supabase
      .from('item')
      .select('id', { count: 'exact', head: true })
      .eq('is_featured', true)
      .eq('is_archived', false),
    supabase.from('bundle').select('id', { count: 'exact', head: true }).eq('is_archived', false),
    supabase
      .from('item_effective')
      .select('*')
      .is('created_start', null)
      .eq('is_archived', false)
      .order('submitted_at', { ascending: false })
      .limit(12),
  ]);

  const needsWork = recentRes.data ?? [];
  const thumbs = await thumbsFor(needsWork.map((i) => i.id));

  return (
    <main className="wrap">
      <section className="stack">
        <span className="eyebrow">작업 대기열</span>
        <h1>무엇이 아직 남았나</h1>
        <p className="lede">
          자료를 넣는 것과 기술하는 것은 다른 일입니다. 여기 남아 있는 것이 곧 할 일입니다.
        </p>
      </section>

      <div className="statgrid">
        <div className="stat">
          <div className="n">{totalRes.count ?? 0}</div>
          <div className="k">전체 자료</div>
        </div>
        <div className="stat">
          <div className="n">{bundleRes.count ?? 0}</div>
          <div className="k">묶음</div>
        </div>
        <div className="stat">
          <div className="n" style={{ color: 'var(--warn)' }}>{undatedRes.count ?? 0}</div>
          <div className="k">시기 미상</div>
        </div>
        <div className="stat">
          <div className="n" style={{ color: 'var(--muted)' }}>{untitledRes.count ?? 0}</div>
          <div className="k">설명 없음</div>
        </div>
        <div className="stat">
          <div className="n" style={{ color: 'var(--accent)' }}>{unfeaturedRes.count ?? 0}</div>
          <div className="k">대표 표시</div>
        </div>
      </div>

      <div className="row">
        <Link href="/admin/acquisitions" className="btn">
          수집 세션 만들기
        </Link>
        <Link href="/admin/bundles" className="btn ghost">
          묶음 목록
        </Link>
      </div>

      <section className="stack">
        <div className="rule" />
        <h2>시기가 비어 있는 자료</h2>
        <p className="small">
          시기가 없으면 연표에 나타나지 못합니다. 묶음 단위로 한꺼번에 채우는 편이 빠릅니다.
        </p>
        {needsWork.length === 0 ? (
          <div className="box">
            <p>비어 있는 자료가 없습니다. 기술이 모두 끝났습니다.</p>
          </div>
        ) : (
          <div className="grid">
            {needsWork.map((i) => (
              <div className="cell" key={i.id}>
                <Link href={`/admin/items/${i.id}`}>
                  <ItemTile
                    id={i.id}
                    title={i.title}
                    type={i.type}
                    accessLevel={i.access_level}
                    visible
                    thumbFileId={thumbs.get(i.id)}
                    aspect="1"
                  />
                </Link>
                <span className="cap">{i.title}</span>
                <span className="cap dim">{TYPE_LABELS[i.type] ?? i.type}</span>
              </div>
            ))}
          </div>
        )}
      </section>
    </main>
  );
}
