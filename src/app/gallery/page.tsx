import Link from 'next/link';
import { getGallery, getTypeCounts, thumbsFor } from '@/lib/queries';
import { currentRole, canView } from '@/lib/access';
import { parseEdtf } from '@/lib/edtf';
import { ItemTile } from '@/components/ItemTile';
import { TYPE_LABELS } from '@/components/icons';

export const dynamic = 'force-dynamic';

const ORDER = ['StillImage', 'Sound', 'MovingImage', 'Text', 'PhysicalObject'];

/** 유형별 갤러리 — dcterms:type 이 그대로 탭이 된다. */
export default async function GalleryPage({
  searchParams,
}: {
  searchParams: Promise<{ type?: string }>;
}) {
  const { type } = await searchParams;
  const role = await currentRole();
  const [items, counts] = await Promise.all([getGallery(type), getTypeCounts()]);
  const thumbs = await thumbsFor(items.map((i) => i.id));
  const totalAll = Object.values(counts).reduce((a, b) => a + b, 0);

  return (
    <main className="wrap">
      <section className="stack">
        <span className="eyebrow">자료</span>
        <h1>유형별로 훑어보기</h1>
        <p className="lede">
          자유롭게 적은 분류가 아니라 DCMI Type Vocabulary 를 그대로 씁니다. 새 유형은 만들지
          않습니다.
        </p>
      </section>

      <div className="row">
        <Link href="/gallery" className={`chip${!type ? ' accent' : ''}`}>
          전체 {totalAll}
        </Link>
        {ORDER.filter((t) => counts[t]).map((t) => (
          <Link key={t} href={`/gallery?type=${t}`} className={`chip${type === t ? ' accent' : ''}`}>
            {TYPE_LABELS[t]} {counts[t]}
          </Link>
        ))}
      </div>

      {items.length === 0 ? (
        <div className="box">
          <p>이 유형의 자료가 아직 없습니다.</p>
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
