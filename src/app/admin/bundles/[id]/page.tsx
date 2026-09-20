import Link from 'next/link';
import { notFound } from 'next/navigation';
import { db } from '@/lib/db';
import { requireAdmin } from '@/lib/access';
import { thumbsFor, type ItemRow } from '@/lib/queries';
import { parseEdtf } from '@/lib/edtf';
import { num } from '@/lib/ui';
import { Uploader } from '@/components/Uploader';
import Field from '@/components/admin/Field';
import Notice from '@/components/admin/Notice';
import Checkbox from '@/components/admin/Checkbox';
import StatusBadge from '@/components/admin/StatusBadge';
import { DateValue, Thumb, TypeTag } from '@/components/search/parts';
import { updateBundle, bulkUpdateItems } from '../../actions';

export const dynamic = 'force-dynamic';

/** 묶음의 종류. 값은 DB 에 그대로 들어가므로 손대지 않는다. */
const KINDS = [
  { value: 'album', label: '앨범' },
  { value: 'roll', label: '필름 롤' },
  { value: 'bundle', label: '다발' },
  { value: 'tape', label: '테이프' },
  { value: 'folder', label: '폴더' },
  { value: 'single', label: '낱개' },
];

const ACCESS = [
  { value: 'family', label: '가족' },
  { value: 'public', label: '공개' },
  { value: 'private', label: '비공개' },
];

/** 일괄 편집의 칸은 "그대로"가 기본이다 — 빈 값을 보내면 서버가 건드리지 않는다. */
const BULK_ACCESS = [{ value: '', label: '— 그대로 —' }, ...ACCESS];

const TYPES = [
  { value: 'StillImage', label: '사진' },
  { value: 'Sound', label: '목소리' },
  { value: 'MovingImage', label: '영상' },
  { value: 'Text', label: '편지·문서' },
  { value: 'PhysicalObject', label: '유품' },
];

const BULK_TYPES = [{ value: '', label: '— 그대로 —' }, ...TYPES];

/**
 * 묶음 한 개 — 기술 · 적재 · 일괄 편집이 한 화면에 있다.
 * 관리자가 실제로 시간을 보내는 곳이므로 오가는 단계를 만들지 않았다.
 *
 * 구획마다 제목을 달아 무엇을 하는 자리인지 먼저 읽히게 했다. 낱장은
 * 타일 격자 대신 표로 편다 — 수백 장을 훑으며 "시기가 비었는가, 공개
 * 범위가 맞는가"를 보는 일이 많고, 그런 읽기는 줄이 맞아야 빠르다.
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
    <div className="page-admin">
      <section className="admin-sec">
        <div className="block-head">
          <h1 className="page-title jg-pixel">{bundle.title}</h1>
          <Link href="/admin/bundles">묶음 목록 →</Link>
        </div>
        <ul className="jg-chips">
          <li>자료 {num(items.length)}건</li>
          {undated > 0 && <li>시기 미상 {num(undated)}건</li>}
          {bundle.period_edtf && <li>{parseEdtf(bundle.period_edtf).label}</li>}
          <li>{bundle.source}</li>
        </ul>
      </section>

      <section className="admin-sec">
        <h2 className="sec-title jg-pixel">자료 올리기</h2>
        <Notice tone="info" title="파일은 우리 서버를 거치지 않습니다">
          <p>
            브라우저에서 Google Drive 로 곧장 갑니다 — 크기 제한이 없고, 끊겨도 이어서 올라갑니다.
            올린 자료는 이 묶음의 출처·시기·권리·접근등급을 그대로 물려받고, 같은 파일을 두 번
            올리면 체크섬으로 걸러집니다.
          </p>
          {bundle.drive_folder_id && (
            <p>
              <a
                href={`https://drive.google.com/drive/folders/${bundle.drive_folder_id}`}
                target="_blank"
                rel="noreferrer"
              >
                이 묶음의 Drive 폴더 열기 →
              </a>
            </p>
          )}
        </Notice>
        <Uploader bundleId={id} />
      </section>

      <section className="admin-sec">
        <h2 className="sec-title jg-pixel">묶음 기술</h2>
        <form action={updateBundle} className="edit-form">
          <input type="hidden" name="id" value={id} />
          <div className="form-grid">
            <Field
              label="묶음 이름"
              code="dc:title"
              name="title"
              className="span2"
              defaultValue={bundle.title}
              required
            />
            <Field
              label="종류"
              code="dc:type"
              name="kind"
              type="select"
              options={KINDS}
              defaultValue={bundle.kind}
            />
            <Field
              label="시기 범위"
              code="dcterms:temporal"
              name="period_edtf"
              mono
              defaultValue={bundle.period_edtf ?? ''}
              placeholder="1958 · 195X · 1971/1991"
              help="EDTF 표기. 범위는 빗금으로 잇습니다."
            />
            <Field
              label="출처"
              code="dc:source"
              name="source"
              defaultValue={bundle.source}
              help="낱장이 비어 있으면 이 값을 물려받습니다."
            />
            <Field
              label="입수 경위"
              code="dcterms:provenance"
              name="provenance"
              defaultValue={bundle.provenance ?? ''}
            />
            <Field
              label="기본 접근 등급"
              name="default_access_level"
              type="select"
              options={ACCESS}
              defaultValue={bundle.default_access_level}
            />
            <Field
              label="디지털화"
              code="dc:contributor"
              name="digitized_by"
              defaultValue={bundle.digitized_by ?? ''}
            />
            <Field
              label="권리"
              code="dc:rights"
              name="rights"
              className="span2"
              defaultValue={bundle.rights ?? ''}
            />
            <Field
              label="메모"
              name="note"
              type="textarea"
              rows={2}
              className="span2"
              defaultValue={bundle.note ?? ''}
            />
          </div>
          <div className="form-actions">
            <button type="submit" className="jg-btn jg-btn-primary">
              저장
            </button>
            <span className="jg-note">
              여기를 고치면 상속받는 낱장에 즉시 반영됩니다. 직접 입력한 낱장은 건드리지 않습니다.
            </span>
          </div>
        </form>
      </section>

      {items.length > 0 && (
        <section className="admin-sec">
          <h2 className="sec-title jg-pixel">낱장 {num(items.length)}건</h2>
          <p className="jg-note">
            체크한 자료에 같은 값을 한 번에 적용합니다. 수천 장을 다룰 때 실제로 시간을 아껴주는
            도구입니다.
          </p>

          {/* 일괄 편집 칸과 고르는 표가 한 폼 안에 있다 — 무엇을 고쳐 누구에게
              적용하는지 눈으로 이어져야 잘못 누르지 않는다. */}
          <form action={bulkUpdateItems} className="edit-form">
            <input type="hidden" name="bundle_id" value={id} />

            <div className="form-grid">
              <Field
                label="시기"
                code="dc:date"
                name="created_edtf"
                mono
                placeholder="비우면 그대로"
              />
              <Field
                label="접근 등급"
                name="access_level"
                type="select"
                options={BULK_ACCESS}
                defaultValue=""
              />
              <Field
                label="유형"
                code="dc:type"
                name="type"
                type="select"
                options={BULK_TYPES}
                defaultValue=""
              />
              <div className="form-checks">
                <Checkbox name="mark_featured" label="대표로 표시 (연표에서 이 자료가 앞에 나옵니다)" />
              </div>
            </div>

            <div className="jg-rtable-wrap">
              <table className="jg-rtable">
                <thead>
                  <tr>
                    <th className="is-check">
                      <span className="jg-sr">고르기</span>
                    </th>
                    <th className="is-mono">순번</th>
                    <th>
                      <span className="jg-sr">그림</span>
                    </th>
                    <th>제목</th>
                    <th>형태</th>
                    <th>시기</th>
                    <th>공개 범위</th>
                    <th>
                      <span className="jg-sr">기술</span>
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {items.map((i) => {
                    const thumb = thumbs.get(i.id);
                    return (
                      <tr key={i.id}>
                        <td className="is-check">
                          <Checkbox name="item_ids" value={i.id} ariaLabel={`${i.title} 고르기`} />
                        </td>
                        <td className="is-mono">{i.seq}</td>
                        <td>
                          <div className="jg-picker-thumb">
                            <Thumb src={thumb ? `/media/${thumb}` : null} type={i.type} />
                          </div>
                        </td>
                        <td className="is-title">
                          <Link href={`/admin/items/${i.id}`}>{i.title}</Link>
                          {i.is_featured && <span className="jg-rtable-note">대표</span>}
                        </td>
                        <td>
                          <TypeTag type={i.type} detail={i.doc_type} />
                        </td>
                        <td className="is-mono">
                          {i.created_start ? (
                            <DateValue value={parseEdtf(i.created_edtf).label} verified={i.date_verified} />
                          ) : (
                            <span className="is-muted">시기 미상</span>
                          )}
                        </td>
                        <td>
                          <StatusBadge level={i.access_level} />
                        </td>
                        <td>
                          <Link href={`/admin/items/${i.id}`} className="jg-btn jg-btn-text">
                            상세 기술 →
                          </Link>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            <div className="form-actions">
              <button type="submit" className="jg-btn jg-btn-primary">
                체크한 자료에 적용
              </button>
            </div>
          </form>
        </section>
      )}
    </div>
  );
}
