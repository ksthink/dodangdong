import Link from 'next/link';
import { notFound } from 'next/navigation';
import { db } from '@/lib/db';
import { requireAdmin } from '@/lib/access';
import { thumbsFor, type ItemRow } from '@/lib/queries';
import { parseEdtf } from '@/lib/edtf';
import { Uploader } from '@/components/Uploader';
import { ItemTile } from '@/components/ItemTile';
import { updateBundle, bulkUpdateItems } from '../../actions';

export const dynamic = 'force-dynamic';

/**
 * 묶음 한 개 — 기술 · 적재 · 일괄 편집이 한 화면에 있다.
 * 관리자가 실제로 시간을 보내는 곳이므로 오가는 단계를 만들지 않았다.
 */
export default async function BundlePage({ params }: { params: Promise<{ id: string }> }) {
  await requireAdmin();
  const { id } = await params;
  const supabase = db();

  const { data: bundle } = await supabase.from('bundle').select('*').eq('id', id).maybeSingle();
  if (!bundle) notFound();

  const { data: itemsData } = await supabase
    .from('item_effective')
    .select('*')
    .eq('bundle_id', id)
    .order('seq');
  const items = (itemsData ?? []) as ItemRow[];
  const thumbs = await thumbsFor(items.map((i) => i.id));
  const undated = items.filter((i) => !i.created_start).length;

  return (
    <main className="wrap">
      <section className="stack">
        <span className="eyebrow">묶음</span>
        <h1>{bundle.title}</h1>
        <div className="row">
          <span className="chip">자료 {items.length}건</span>
          {undated > 0 && <span className="chip warn">시기 미상 {undated}건</span>}
          {bundle.period_edtf && (
            <span className="chip">{parseEdtf(bundle.period_edtf).label}</span>
          )}
          <span className="chip">{bundle.source}</span>
        </div>
      </section>

      <section className="stack">
        <h2>자료 올리기</h2>
        <p className="small">
          여기 올린 자료는 이 묶음의 출처·시기·권리·접근등급을 그대로 물려받습니다. 같은 파일을 두 번
          올리면 체크섬으로 걸러집니다.
        </p>
        <Uploader bundleId={id} />
      </section>

      <section className="stack">
        <div className="rule" />
        <h2>묶음 기술</h2>
        <form action={updateBundle} className="box stack">
          <input type="hidden" name="id" value={id} />
          <div className="field">
            <label htmlFor="title">묶음 이름</label>
            <input id="title" name="title" type="text" defaultValue={bundle.title} />
          </div>
          <div className="formgrid">
            <div className="field">
              <label htmlFor="kind">종류</label>
              <select id="kind" name="kind" defaultValue={bundle.kind}>
                <option value="album">앨범</option>
                <option value="roll">필름 롤</option>
                <option value="bundle">다발</option>
                <option value="tape">테이프</option>
                <option value="folder">폴더</option>
                <option value="single">낱개</option>
              </select>
            </div>
            <div className="field">
              <label htmlFor="period_edtf">시기 범위 (EDTF)</label>
              <input
                id="period_edtf"
                name="period_edtf"
                type="text"
                defaultValue={bundle.period_edtf ?? ''}
                placeholder="1958 · 195X · 1971/1991"
              />
            </div>
          </div>
          <div className="field">
            <label htmlFor="source">출처</label>
            <input id="source" name="source" type="text" defaultValue={bundle.source} />
          </div>
          <div className="field">
            <label htmlFor="provenance">입수 경위</label>
            <input
              id="provenance"
              name="provenance"
              type="text"
              defaultValue={bundle.provenance ?? ''}
            />
          </div>
          <div className="formgrid">
            <div className="field">
              <label htmlFor="default_access_level">기본 접근 등급</label>
              <select
                id="default_access_level"
                name="default_access_level"
                defaultValue={bundle.default_access_level}
              >
                <option value="family">가족</option>
                <option value="public">공개</option>
                <option value="private">비공개</option>
              </select>
            </div>
            <div className="field">
              <label htmlFor="digitized_by">디지털화</label>
              <input
                id="digitized_by"
                name="digitized_by"
                type="text"
                defaultValue={bundle.digitized_by ?? ''}
              />
            </div>
          </div>
          <div className="field">
            <label htmlFor="rights">권리</label>
            <input id="rights" name="rights" type="text" defaultValue={bundle.rights ?? ''} />
          </div>
          <div className="field">
            <label htmlFor="note">메모</label>
            <textarea id="note" name="note" rows={2} defaultValue={bundle.note ?? ''} />
          </div>
          <div className="row">
            <button type="submit" className="btn">
              저장
            </button>
            <span className="small dim">
              여기를 고치면 상속받는 낱장에 즉시 반영됩니다. 직접 입력한 낱장은 건드리지 않습니다.
            </span>
          </div>
        </form>
      </section>

      {items.length > 0 && (
        <section className="stack">
          <div className="rule" />
          <h2>낱장 {items.length}건</h2>
          <p className="small">
            체크한 자료에 같은 값을 한 번에 적용합니다. 수천 장을 다룰 때 실제로 시간을 아껴주는
            도구입니다.
          </p>

          <form action={bulkUpdateItems} className="box stack">
            <input type="hidden" name="bundle_id" value={id} />

            <div className="formgrid">
              <div className="field">
                <label htmlFor="bulk_edtf">시기 (EDTF)</label>
                <input id="bulk_edtf" name="created_edtf" type="text" placeholder="비우면 그대로" />
              </div>
              <div className="field">
                <label htmlFor="bulk_access">접근 등급</label>
                <select id="bulk_access" name="access_level" defaultValue="">
                  <option value="">— 그대로 —</option>
                  <option value="public">공개</option>
                  <option value="family">가족</option>
                  <option value="private">비공개</option>
                </select>
              </div>
              <div className="field">
                <label htmlFor="bulk_type">유형</label>
                <select id="bulk_type" name="type" defaultValue="">
                  <option value="">— 그대로 —</option>
                  <option value="StillImage">사진</option>
                  <option value="Sound">목소리</option>
                  <option value="MovingImage">영상</option>
                  <option value="Text">편지·문서</option>
                  <option value="PhysicalObject">유품</option>
                </select>
              </div>
            </div>

            <label className="row" style={{ fontSize: 12 }}>
              <input type="checkbox" name="mark_featured" style={{ width: 'auto', minHeight: 0 }} />
              대표로 표시 (연표에서 이 자료가 앞에 나옵니다)
            </label>

            <div className="grid">
              {items.map((i) => (
                <label className="cell" key={i.id} style={{ cursor: 'pointer' }}>
                  <ItemTile
                    id={i.id}
                    title={i.title}
                    type={i.type}
                    accessLevel={i.access_level}
                    visible
                    thumbFileId={thumbs.get(i.id)}
                    aspect="1"
                  />
                  <span className="row" style={{ gap: '0.3rem' }}>
                    <input
                      type="checkbox"
                      name="item_ids"
                      value={i.id}
                      style={{ width: 'auto', minHeight: 0 }}
                    />
                    <span className="cap">{i.seq}</span>
                    {i.is_featured && <span className="chip accent">대표</span>}
                  </span>
                  <span className="cap dim">
                    {i.created_start ? parseEdtf(i.created_edtf).label : '시기 미상'}
                  </span>
                  <Link href={`/admin/items/${i.id}`} className="cap" style={{ color: 'var(--accent)' }}>
                    상세 기술 →
                  </Link>
                </label>
              ))}
            </div>

            <div className="row">
              <button type="submit" className="btn">
                체크한 자료에 적용
              </button>
            </div>
          </form>
        </section>
      )}
    </main>
  );
}
