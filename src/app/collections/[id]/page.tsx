import { notFound } from 'next/navigation';
import { getCollection, thumbsFor } from '@/lib/queries';
import { currentRole, canView } from '@/lib/access';
import { parseEdtf } from '@/lib/edtf';
import { ItemTile } from '@/components/ItemTile';
import { maskItem } from '@/lib/mask';

export const dynamic = 'force-dynamic';

export default async function CollectionPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const result = await getCollection(id);
  if (!result) notFound();

  const { collection, items } = result;
  const role = await currentRole();
  const thumbs = await thumbsFor(items.map((i) => i.id));

  return (
    <main className="wrap">
      <section className="stack">
        <span className="eyebrow">이야기 모음집</span>
        <h1>{collection.title}</h1>
        {collection.period_edtf && (
          <span className="small">{parseEdtf(collection.period_edtf).label}</span>
        )}
        {collection.description && <p className="lede">{collection.description}</p>}
        <span className="chip">자료 {items.length}건</span>
      </section>

      {items.length === 0 ? (
        <div className="box">
          <p>이 모음집에 아직 자료가 없습니다.</p>
        </div>
      ) : (
        <div className="grid">
          {items.map((i) => (
            <div className="cell" key={i.id}>
              <ItemTile
                id={i.id}
                title={i.title}
                type={i.type}
                accessLevel={i.access_level}
                visible={canView(i.access_level, role)}
                thumbFileId={thumbs.get(i.id)}
                aspect="1"
              />
              <span className="cap">
                {maskItem(i, canView(i.access_level, role)).title}
              </span>
              <span className="cap dim">{parseEdtf(i.created_edtf).label}</span>
            </div>
          ))}
        </div>
      )}
    </main>
  );
}
