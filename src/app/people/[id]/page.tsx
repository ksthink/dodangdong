import { notFound } from 'next/navigation';
import { getPerson, thumbsFor } from '@/lib/queries';
import { currentRole, canView } from '@/lib/access';
import { parseEdtf } from '@/lib/edtf';
import { ItemTile } from '@/components/ItemTile';

export const dynamic = 'force-dynamic';

export default async function PersonPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const result = await getPerson(id);
  if (!result) notFound();

  const { person, items } = result;
  const role = await currentRole();
  const thumbs = await thumbsFor(items.map((i) => i.id));

  return (
    <main className="wrap">
      <section className="stack">
        <span className="eyebrow">사람</span>
        <h1>{person.display_name}</h1>
        <div className="row">
          {person.relation_to_root && <span className="chip">{person.relation_to_root}</span>}
          {person.birth_edtf && (
            <span className="chip">
              {parseEdtf(person.birth_edtf).label}
              {person.death_edtf ? ` – ${parseEdtf(person.death_edtf).label}` : ' 생'}
            </span>
          )}
          <span className="chip">자료 {items.length}건</span>
        </div>
        {person.aliases?.length > 0 && (
          <p className="small">달리 부르던 이름: {person.aliases.join(', ')}</p>
        )}
        {person.note && <p className="lede">{person.note}</p>}
      </section>

      {items.length === 0 ? (
        <div className="box">
          <p>이 사람이 연결된 자료가 아직 없습니다.</p>
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
              <span className="cap">{parseEdtf(i.created_edtf).label}</span>
            </div>
          ))}
        </div>
      )}
    </main>
  );
}
