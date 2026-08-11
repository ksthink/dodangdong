import Link from 'next/link';
import { getCollections, thumbsFor } from '@/lib/queries';
import { currentRole, canView } from '@/lib/access';
import { parseEdtf } from '@/lib/edtf';

export const dynamic = 'force-dynamic';

/**
 * 이야기 모음집 — 주제 큐레이션.
 * 묶음(원본이 어디 있었나)과는 다른 축이다. 자료 하나가 모음집 여럿에 들어갈 수 있다.
 */
export default async function CollectionsPage() {
  const role = await currentRole();
  const collections = await getCollections();
  const covers = await thumbsFor(
    collections.map((c) => c.cover_item_id).filter((v): v is string => Boolean(v)),
  );

  return (
    <main className="wrap">
      <section className="stack">
        <span className="eyebrow">이야기</span>
        <h1>주제로 엮은 모음집</h1>
        <p className="lede">
          연표가 시간을 따라간다면, 모음집은 주제를 따라갑니다. 관리자가 직접 엮습니다.
        </p>
      </section>

      {collections.length === 0 ? (
        <div className="box">
          <p>아직 모음집이 없습니다.</p>
          <p className="small">관리자 화면에서 자료를 골라 모음집으로 엮을 수 있습니다.</p>
        </div>
      ) : (
        <div className="grid" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))' }}>
          {collections.map((c) => {
            // 표지 자료를 볼 수 없는 사람에게는 표지를 내보내지 않는다.
            const coverVisible = c.cover_access ? canView(c.cover_access, role) : false;
            const cover = coverVisible && c.cover_item_id ? covers.get(c.cover_item_id) : undefined;
            return (
              <Link key={c.id} href={`/collections/${c.id}`} className="cell">
                <span className="tile" style={{ aspectRatio: '3 / 2' }}>
                  {cover ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={`/media/${cover}`} alt={c.title} loading="lazy" />
                  ) : (
                    <span className="lock" style={{ background: 'var(--panel-2)', color: 'var(--muted)' }}>
                      표지 없음
                    </span>
                  )}
                </span>
                <h3 style={{ marginTop: '0.3rem' }}>{c.title}</h3>
                {c.period_edtf && <span className="cap">{parseEdtf(c.period_edtf).label}</span>}
                {c.description && (
                  <p className="small" style={{ lineHeight: 1.7 }}>
                    {c.description}
                  </p>
                )}
              </Link>
            );
          })}
        </div>
      )}
    </main>
  );
}
