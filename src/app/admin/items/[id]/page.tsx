import Link from 'next/link';
import { notFound } from 'next/navigation';
import { db } from '@/lib/db';
import { requireAdmin } from '@/lib/access';
import { getItem } from '@/lib/queries';
import { parseEdtf } from '@/lib/edtf';
import { updateItem, linkPerson, unlinkPerson, addToCollection, archiveItem } from '../../actions';

export const dynamic = 'force-dynamic';

const PERSON_ROLES = [
  ['depicted', '찍힘'],
  ['photographer', '찍음'],
  ['author', '씀'],
  ['recipient', '받음'],
  ['speaker', '말함'],
  ['mentioned', '언급됨'],
] as const;

/**
 * 낱장 상세 기술.
 *
 * 상속 필드는 비워두면 묶음 값을 물려받는다는 뜻이다. 화면에서도 그렇게 보이도록
 * placeholder 에 물려받는 값을 그대로 띄운다 — 비어 있는 칸이 곧 "상속 중"이다.
 */
export default async function AdminItemPage({ params }: { params: Promise<{ id: string }> }) {
  await requireAdmin();
  const { id } = await params;

  const detail = await getItem(id);
  if (!detail) notFound();
  const { item, files, people, collections } = detail;

  const supabase = db();
  const [{ data: bundle }, { data: allPeople }, { data: allCollections }, { data: places }] =
    await Promise.all([
      supabase.from('bundle').select('*').eq('id', item.bundle_id).single(),
      supabase.from('person').select('id, display_name').order('display_name'),
      supabase.from('collection').select('id, title').order('title'),
      supabase.from('place').select('id, family_name').order('family_name'),
    ]);

  const display = files.find((f) => f.role === 'display') ?? files.find((f) => f.role === 'thumb');
  const original = files.find((f) => f.role === 'original');
  const parsed = parseEdtf(item.created_edtf);

  return (
    <main className="wrap">
      <div className="row">
        <span className="eyebrow">{item.identifier}</span>
        <Link href={`/admin/bundles/${item.bundle_id}`} className="small">
          ← {item.bundle_title}
        </Link>
        <Link href={`/item/${id}`} className="small row-end">
          열람 화면에서 보기 →
        </Link>
      </div>

      <div className="detail">
        <div className="stage">
          {display ? (
            <span className="tile">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={`/media/${display.id}`} alt={item.title} />
            </span>
          ) : original && item.type === 'Sound' ? (
            <audio controls src={`/media/${original.id}`} style={{ width: '100%' }} />
          ) : original && item.type === 'MovingImage' ? (
            <video controls src={`/media/${original.id}`} style={{ width: '100%' }} />
          ) : (
            <div className="panel">
              <p className="small">화면용 사본이 없습니다.</p>
            </div>
          )}

          <div className="panel">
            <h5>파일</h5>
            <div className="stack-s">
              {files.map((f) => (
                <div className="row" key={f.id} style={{ fontSize: 12 }}>
                  <span className="chip">{f.role}</span>
                  <span className="dim">{f.mime}</span>
                  {f.width && (
                    <span className="dim">
                      {f.width}×{f.height}
                    </span>
                  )}
                  {f.bytes && <span className="dim">{Math.round(f.bytes / 1024)}KB</span>}
                  <a href={`/media/${f.id}`} className="row-end" style={{ color: 'var(--accent)' }}>
                    내려받기
                  </a>
                </div>
              ))}
            </div>
          </div>
        </div>

        <aside className="side">
          <form action={updateItem} className="box stack">
            <input type="hidden" name="id" value={id} />

            <div className="field">
              <label htmlFor="title">제목</label>
              <input id="title" name="title" type="text" defaultValue={item.title} />
            </div>

            <div className="field">
              <label htmlFor="created_edtf">시기 (EDTF)</label>
              <input
                id="created_edtf"
                name="created_edtf"
                type="text"
                defaultValue={item.created_edtf ?? ''}
                placeholder="1958-04-12 · 1958? · 195X"
              />
              <span className="hint">
                지금: {parsed.label}
                {parsed.valid ? '' : ' — 해석되지 않는 표기입니다'}
              </span>
            </div>

            <div className="field">
              <label htmlFor="type">유형</label>
              <select id="type" name="type" defaultValue={item.type}>
                <option value="StillImage">사진</option>
                <option value="Sound">목소리</option>
                <option value="MovingImage">영상</option>
                <option value="Text">편지·문서</option>
                <option value="PhysicalObject">유품</option>
              </select>
            </div>

            <div className="field">
              <label htmlFor="description">설명</label>
              <textarea
                id="description"
                name="description"
                rows={3}
                defaultValue={item.description ?? ''}
              />
            </div>

            <div className="formgrid">
              <div className="field">
                <label htmlFor="creator">기록자</label>
                <input id="creator" name="creator" type="text" defaultValue={item.creator ?? ''} />
              </div>
              <div className="field">
                <label htmlFor="medium">매체</label>
                <input id="medium" name="medium" type="text" defaultValue={item.medium ?? ''} />
              </div>
              <div className="field">
                <label htmlFor="extent">크기·길이</label>
                <input id="extent" name="extent" type="text" defaultValue={item.extent ?? ''} />
              </div>
              <div className="field">
                <label htmlFor="language">언어</label>
                <input id="language" name="language" type="text" defaultValue={item.language ?? ''} />
              </div>
            </div>

            <div className="rule" />
            <p className="small">
              아래는 상속 필드입니다. <b>비워두면 묶음 값을 물려받습니다.</b>
            </p>

            <div className="field">
              <label htmlFor="source">출처</label>
              <input
                id="source"
                name="source"
                type="text"
                defaultValue={item.source_overridden ? (item.source ?? '') : ''}
                placeholder={bundle?.source ?? ''}
              />
            </div>
            <div className="field">
              <label htmlFor="provenance">입수 경위</label>
              <input
                id="provenance"
                name="provenance"
                type="text"
                defaultValue={item.provenance_overridden ? (item.provenance ?? '') : ''}
                placeholder={bundle?.provenance ?? ''}
              />
            </div>
            <div className="field">
              <label htmlFor="rights">권리</label>
              <input
                id="rights"
                name="rights"
                type="text"
                defaultValue={item.rights_overridden ? (item.rights ?? '') : ''}
                placeholder={bundle?.rights ?? ''}
              />
            </div>
            <div className="formgrid">
              <div className="field">
                <label htmlFor="access_level">접근 등급</label>
                <select
                  id="access_level"
                  name="access_level"
                  defaultValue={item.access_overridden ? item.access_level : ''}
                >
                  <option value="">— 묶음에서 상속 —</option>
                  <option value="public">공개</option>
                  <option value="family">가족</option>
                  <option value="private">비공개</option>
                </select>
              </div>
              <div className="field">
                <label htmlFor="place_id">장소</label>
                <select
                  id="place_id"
                  name="place_id"
                  defaultValue={item.place_overridden ? (item.place_id ?? '') : ''}
                >
                  <option value="">— 묶음에서 상속 —</option>
                  {(places ?? []).map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.family_name}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <label className="row" style={{ fontSize: 12 }}>
              <input
                type="checkbox"
                name="is_featured"
                defaultChecked={item.is_featured}
                style={{ width: 'auto', minHeight: 0 }}
              />
              대표로 표시
            </label>

            <div className="row">
              <button type="submit" className="btn">
                저장
              </button>
            </div>
          </form>

          <div className="panel">
            <h5>인물</h5>
            <div className="people" style={{ marginBottom: '0.5rem' }}>
              {people.map((p) => (
                <form action={unlinkPerson} key={`${p.id}-${p.role}`}>
                  <input type="hidden" name="item_id" value={id} />
                  <input type="hidden" name="person_id" value={p.id} />
                  <input type="hidden" name="role" value={p.role} />
                  <button type="submit" className="person" style={{ cursor: 'pointer' }}>
                    {p.display_name} ×
                  </button>
                </form>
              ))}
              {people.length === 0 && <span className="small dim">연결된 인물 없음</span>}
            </div>
            <form action={linkPerson} className="row">
              <input type="hidden" name="item_id" value={id} />
              <select name="person_id" defaultValue="" style={{ flex: 1 }}>
                <option value="">— 인물 —</option>
                {(allPeople ?? []).map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.display_name}
                  </option>
                ))}
              </select>
              <select name="role" defaultValue="depicted">
                {PERSON_ROLES.map(([v, l]) => (
                  <option key={v} value={v}>
                    {l}
                  </option>
                ))}
              </select>
              <button type="submit" className="btn small">
                연결
              </button>
            </form>
          </div>

          <div className="panel">
            <h5>모음집</h5>
            <div className="people" style={{ marginBottom: '0.5rem' }}>
              {collections.map((c) => (
                <span className="person" key={c.id}>
                  {c.title}
                </span>
              ))}
              {collections.length === 0 && <span className="small dim">없음</span>}
            </div>
            <form action={addToCollection} className="row">
              <input type="hidden" name="item_id" value={id} />
              <select name="collection_id" defaultValue="" style={{ flex: 1 }}>
                <option value="">— 모음집 —</option>
                {(allCollections ?? []).map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.title}
                  </option>
                ))}
              </select>
              <button type="submit" className="btn small">
                넣기
              </button>
            </form>
          </div>

          <form action={archiveItem} className="panel">
            <h5>보관</h5>
            <input type="hidden" name="id" value={id} />
            <input type="hidden" name="archived" value={item.is_archived ? 'false' : 'true'} />
            <p className="small">
              삭제는 없습니다. 보관으로 내리면 열람 화면에서 사라지지만 파일은 그대로 남습니다.
            </p>
            <button type="submit" className="btn small ghost">
              {item.is_archived ? '보관 해제' : '보관함으로 내리기'}
            </button>
          </form>
        </aside>
      </div>
    </main>
  );
}
