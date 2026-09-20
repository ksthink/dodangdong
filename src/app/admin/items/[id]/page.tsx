import Link from 'next/link';
import { notFound } from 'next/navigation';
import { db } from '@/lib/db';
import { requireAdmin } from '@/lib/access';
import { getItem } from '@/lib/queries';
import { parseEdtf } from '@/lib/edtf';
import Field from '@/components/admin/Field';
import Notice from '@/components/admin/Notice';
import Checkbox from '@/components/admin/Checkbox';
import StatusBadge from '@/components/admin/StatusBadge';
import { DateValue, TypeTag } from '@/components/search/parts';
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

const ROLE_LABELS: Record<string, string> = Object.fromEntries(PERSON_ROLES);

const TYPES = [
  { value: 'StillImage', label: '사진' },
  { value: 'Sound', label: '목소리' },
  { value: 'MovingImage', label: '영상' },
  { value: 'Text', label: '편지·문서' },
  { value: 'PhysicalObject', label: '유품' },
];

/**
 * 낱장 상세 기술.
 *
 * 상속 필드는 비워두면 묶음 값을 물려받는다는 뜻이다. 화면에서도 그렇게 보이도록
 * placeholder 에 물려받는 값을 그대로 띄운다 — 비어 있는 칸이 곧 "상속 중"이다.
 * 도움말에도 같은 말을 적어 두었다. 빈 칸은 "아직 안 적은 것"으로도 읽히므로
 * 글로 한 번 더 못을 박아야 한다.
 *
 * 칸마다 더블린코어 요소 코드를 달았다. 보는 화면의 상세정보 표와 같은 이름이
 * 같은 자리에 있어야, 기술하는 사람이 무엇을 채우는지 안다.
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

  const placeOptions = [
    { value: '', label: '— 묶음에서 상속 —' },
    ...(places ?? []).map((p) => ({ value: String(p.id), label: String(p.family_name) })),
  ];
  const personOptions = [
    { value: '', label: '— 인물 —' },
    ...(allPeople ?? []).map((p) => ({ value: String(p.id), label: String(p.display_name) })),
  ];
  const collectionOptions = [
    { value: '', label: '— 모음집 —' },
    ...(allCollections ?? []).map((c) => ({ value: String(c.id), label: String(c.title) })),
  ];
  const roleOptions = PERSON_ROLES.map(([value, label]) => ({ value, label }));

  return (
    <div className="page page-admin">
      <section className="admin-sec">
        <div className="block-head">
          <h1 className="page-title jg-pixel">{item.title}</h1>
          <Link href={`/item/${id}`}>열람 화면에서 보기 →</Link>
        </div>
        <p className="jg-card-meta">
          <span className="jg-tag-code">{item.identifier}</span>
          <TypeTag type={item.type} detail={item.doc_type} />
          {item.created_start ? (
            <DateValue value={parsed.label} verified={item.date_verified} />
          ) : null}
          <StatusBadge level={item.access_level} />
        </p>
        <ul className="jg-chips">
          <li>
            <Link href={`/admin/bundles/${item.bundle_id}`}>← {item.bundle_title}</Link>
          </li>
          {item.is_archived && <li>보관됨</li>}
        </ul>
      </section>

      <section className="admin-sec">
        <h2 className="sec-title jg-pixel">지금 이 자료</h2>
        {/* 뷰어(Viewer)는 상태를 쥐는 클라이언트 조각이라 기술 화면에는 두지 않는다 —
            여기서 필요한 것은 "고치고 있는 것이 이 자료가 맞는가" 확인뿐이다. */}
        {display ? (
          <figure style={{ margin: 0, maxWidth: 420 }}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={`/media/${display.id}`}
              alt={item.title}
              style={{ display: 'block', width: '100%', height: 'auto', border: 'var(--stroke) solid var(--ink)' }}
            />
          </figure>
        ) : original && item.type === 'Sound' ? (
          <audio controls src={`/media/${original.id}`} style={{ width: '100%', maxWidth: 420 }} />
        ) : original && item.type === 'MovingImage' ? (
          <video controls src={`/media/${original.id}`} style={{ width: '100%', maxWidth: 420 }} />
        ) : (
          <Notice tone="info">화면용 사본이 없습니다.</Notice>
        )}

        <div className="jg-rtable-wrap">
          <table className="jg-rtable">
            <thead>
              <tr>
                <th>쓰임</th>
                <th>형식</th>
                <th className="is-mono">크기</th>
                <th className="is-mono">용량</th>
                <th>
                  <span className="jg-sr">내려받기</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {files.map((f) => (
                <tr key={f.id}>
                  <td className="is-mono">{f.role}</td>
                  <td className="is-mono is-muted">{f.mime}</td>
                  <td className="is-mono">{f.width ? `${f.width}×${f.height}` : '—'}</td>
                  <td className="is-mono">{f.bytes ? `${Math.round(f.bytes / 1024)}KB` : '—'}</td>
                  <td>
                    <a href={`/media/${f.id}`} className="jg-btn jg-btn-text">
                      내려받기
                    </a>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section className="admin-sec">
        <h2 className="sec-title jg-pixel">기술</h2>
        <form action={updateItem} className="edit-form">
          <input type="hidden" name="id" value={id} />

          <div className="form-grid">
            <Field
              label="제목"
              code="dc:title"
              name="title"
              className="span2"
              defaultValue={item.title}
            />
            <Field
              label="시기"
              code="dc:date"
              name="created_edtf"
              mono
              defaultValue={item.created_edtf ?? ''}
              placeholder="1958-04-12 · 1958? · 195X"
              help={`지금: ${parsed.label}${parsed.valid ? '' : ' — 해석되지 않는 표기입니다'}`}
            />
            <Field
              label="유형"
              code="dc:type"
              name="type"
              type="select"
              options={TYPES}
              defaultValue={item.type}
            />
            <Field
              label="설명"
              code="dc:description"
              name="description"
              type="textarea"
              rows={3}
              className="span2"
              defaultValue={item.description ?? ''}
            />
            <Field
              label="기록자"
              code="dc:creator"
              name="creator"
              defaultValue={item.creator ?? ''}
            />
            <Field label="매체" code="dc:medium" name="medium" defaultValue={item.medium ?? ''} />
            <Field
              label="크기·길이"
              code="dcterms:extent"
              name="extent"
              defaultValue={item.extent ?? ''}
            />
            <Field
              label="언어"
              code="dc:language"
              name="language"
              defaultValue={item.language ?? ''}
            />
          </div>

          {/* 상속 칸. 빈 칸이 곧 "묶음을 따름"이고, 회색 글씨로 보이는 것이 물려받는 값이다. */}
          <Notice tone="info" title="아래는 상속 칸입니다">
            비워두면 묶음 값을 물려받습니다. 회색으로 보이는 글씨가 지금 물려받고 있는 값입니다.
          </Notice>

          <div className="form-grid">
            <Field
              label="출처"
              code="dc:source"
              name="source"
              defaultValue={item.source_overridden ? (item.source ?? '') : ''}
              placeholder={bundle?.source ?? ''}
              help="비우면 묶음 값을 따릅니다."
            />
            <Field
              label="입수 경위"
              code="dcterms:provenance"
              name="provenance"
              defaultValue={item.provenance_overridden ? (item.provenance ?? '') : ''}
              placeholder={bundle?.provenance ?? ''}
              help="비우면 묶음 값을 따릅니다."
            />
            <Field
              label="권리"
              code="dc:rights"
              name="rights"
              className="span2"
              defaultValue={item.rights_overridden ? (item.rights ?? '') : ''}
              placeholder={bundle?.rights ?? ''}
              help="비우면 묶음 값을 따릅니다."
            />
            <Field
              label="접근 등급"
              name="access_level"
              type="select"
              defaultValue={item.access_overridden ? item.access_level : ''}
              options={[
                { value: '', label: '— 묶음에서 상속 —' },
                { value: 'public', label: '공개' },
                { value: 'family', label: '가족' },
                { value: 'private', label: '비공개' },
              ]}
            />
            <Field
              label="장소"
              code="dcterms:spatial"
              name="place_id"
              type="select"
              options={placeOptions}
              defaultValue={item.place_overridden ? (item.place_id ?? '') : ''}
            />
            <div className="form-checks">
              <Checkbox name="is_featured" label="대표로 표시" defaultChecked={item.is_featured} />
            </div>
          </div>

          <div className="form-actions">
            <button type="submit" className="jg-btn jg-btn-primary">
              저장
            </button>
          </div>
        </form>
      </section>

      <section className="admin-sec">
        <h2 className="sec-title jg-pixel">등장인물</h2>
        {/* 연결은 한 사람씩 넣고 뺀다. 칩의 ✕ 하나가 곧 unlinkPerson 폼 하나다. */}
        {people.length > 0 ? (
          <ul className="jg-chips">
            {people.map((p) => (
              <li key={`${p.id}-${p.role}`}>
                {p.display_name}
                <span className="jg-tag-code"> {ROLE_LABELS[p.role] ?? p.role}</span>
                <form action={unlinkPerson} style={{ display: 'inline' }}>
                  <input type="hidden" name="item_id" value={id} />
                  <input type="hidden" name="person_id" value={p.id} />
                  <input type="hidden" name="role" value={p.role} />
                  <button
                    type="submit"
                    className="jg-btn jg-btn-text"
                    aria-label={`${p.display_name} 연결 끊기`}
                  >
                    ✕
                  </button>
                </form>
              </li>
            ))}
          </ul>
        ) : (
          <p className="jg-note">연결된 인물이 없습니다.</p>
        )}

        <form action={linkPerson} className="edit-form">
          <input type="hidden" name="item_id" value={id} />
          <div className="form-grid">
            <Field
              label="인물"
              code="dc:subject"
              name="person_id"
              type="select"
              options={personOptions}
              defaultValue=""
            />
            <Field
              label="어떻게"
              name="role"
              type="select"
              options={roleOptions}
              defaultValue="depicted"
            />
          </div>
          <div className="form-actions">
            <button type="submit" className="jg-btn jg-btn-secondary">
              연결
            </button>
          </div>
        </form>
      </section>

      <section className="admin-sec">
        <h2 className="sec-title jg-pixel">모음집</h2>
        {collections.length > 0 ? (
          <ul className="jg-chips">
            {collections.map((c) => (
              <li key={c.id}>{c.title}</li>
            ))}
          </ul>
        ) : (
          <p className="jg-note">들어간 모음집이 없습니다.</p>
        )}

        <form action={addToCollection} className="edit-form">
          <input type="hidden" name="item_id" value={id} />
          <div className="form-grid">
            <Field
              label="모음집"
              name="collection_id"
              type="select"
              options={collectionOptions}
              defaultValue=""
            />
          </div>
          <div className="form-actions">
            <button type="submit" className="jg-btn jg-btn-secondary">
              넣기
            </button>
          </div>
        </form>
      </section>

      <section className="admin-sec">
        <h2 className="sec-title jg-pixel">보관</h2>
        <form action={archiveItem} className="edit-form">
          <input type="hidden" name="id" value={id} />
          <input type="hidden" name="archived" value={item.is_archived ? 'false' : 'true'} />
          <Notice tone="info" title="삭제는 없습니다">
            보관으로 내리면 열람 화면에서 사라지지만 파일은 그대로 남습니다.
          </Notice>
          <div className="form-actions">
            <button type="submit" className="jg-btn jg-btn-secondary">
              {item.is_archived ? '보관 해제' : '보관함으로 내리기'}
            </button>
          </div>
        </form>
      </section>
    </div>
  );
}
