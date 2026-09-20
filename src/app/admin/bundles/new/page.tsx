import { db } from '@/lib/db';
import { requireAdmin } from '@/lib/access';
import { createBundle } from '../../actions';
import Field from '@/components/admin/Field';
import Notice from '@/components/admin/Notice';

export const dynamic = 'force-dynamic';

/**
 * 묶음 만들기.
 *
 * 여기서 채운 값이 그 안의 모든 기록으로 흘러간다. 그래서 출처가 필수다 —
 * 묶음 단위에서는 "어느 집 어느 앨범"을 확실히 알 수 있기 때문이다.
 */
export default async function NewBundlePage({
  searchParams,
}: {
  searchParams: Promise<{ acquisition?: string }>;
}) {
  await requireAdmin();
  const { acquisition } = await searchParams;
  const supabase = db();

  const [{ data: acquisitions }, { data: places }] = await Promise.all([
    supabase.from('acquisition').select('id, visited_on, from_label, location').order('visited_on', { ascending: false }),
    supabase.from('place').select('id, family_name, admin_name').order('family_name'),
  ]);

  return (
    <div className="page page-admin">
      <section className="admin-sec">
        <h1 className="page-title jg-pixel">새 묶음</h1>
        <p className="page-lead">
          여기 적은 출처·시기·권리·접근등급은 이 묶음에 들어올 모든 기록이 물려받습니다.
        </p>

        <Notice tone="info" title="출처는 반드시 적습니다">
          묶음에서 비워두면 그 안의 기록 수십 건이 전부 출처 없이 남습니다. 나중에
          기록마다 되짚는 일은 사실상 불가능합니다.
        </Notice>
      </section>

      <section className="admin-sec">
        <form action={createBundle} className="edit-form">
          <div className="form-grid">
            <Field
              label="묶음 이름"
              code="dc:title"
              name="title"
              required
              className="span2"
              placeholder="큰아버지 앨범 3권"
            />

            <Field
              label="종류"
              name="kind"
              type="select"
              defaultValue="album"
              options={[
                { value: 'album', label: '앨범' },
                { value: 'roll', label: '필름 롤' },
                { value: 'bundle', label: '다발' },
                { value: 'tape', label: '테이프' },
                { value: 'folder', label: '폴더' },
                { value: 'single', label: '낱개' },
              ]}
            />
            {/* 주소로 넘어온 수집 세션을 미리 골라둔다 — 수집 화면의
                "묶음 추가"에서 곧바로 들어오는 길이다. */}
            <Field
              label="수집 세션"
              name="acquisition_id"
              type="select"
              defaultValue={acquisition ?? ''}
              options={[
                { value: '', label: '— 없음 —' },
                ...(acquisitions ?? []).map((a) => ({
                  value: a.id,
                  label: `${a.visited_on} ${a.from_label ?? ''} ${a.location ?? ''}`.trim(),
                })),
              ]}
            />

            <Field
              label="출처 — 원본이 어디에 있었나"
              code="dc:source"
              name="source"
              required
              className="span2"
              placeholder="큰아버지 댁 다락, 앨범 3권"
              help="기록은 이 값을 물려받습니다. 기록에서 따로 적을 필요가 없습니다."
            />

            <Field
              label="입수 경위"
              code="dcterms:provenance"
              name="provenance"
              className="span2"
              placeholder="2026-03 방문 수습, 600dpi 직접 스캔"
            />

            <Field
              label="시기 범위"
              code="dcterms:temporal"
              name="period_edtf"
              mono
              placeholder="1958 · 195X · 1971/1991"
              help="EDTF 로 적습니다. 촬영일시가 없는 기록은 이 값을 시기로 물려받습니다."
            />
            <Field
              label="장소"
              code="dcterms:spatial"
              name="place_id"
              type="select"
              defaultValue=""
              options={[
                { value: '', label: '— 없음 —' },
                ...(places ?? []).map((p) => ({
                  value: p.id,
                  label: `${p.family_name}${p.admin_name ? ` (${p.admin_name})` : ''}`,
                })),
              ]}
            />

            <Field
              label="기본 공개 범위"
              code="dcterms:accessRights"
              name="default_access_level"
              type="select"
              defaultValue="family"
              options={[
                { value: 'family', label: '가족 — 로그인한 가족만' },
                { value: 'public', label: '공개 — 링크를 아는 누구나' },
                { value: 'private', label: '비공개 — 관리자만' },
              ]}
              help="기본값이 곧 대부분의 기록이 됩니다."
            />
            <Field
              label="디지털화"
              name="digitized_by"
              placeholder="직접 스캔 (Epson V600)"
            />

            <Field
              label="권리"
              code="dc:rights"
              name="rights"
              className="span2"
              placeholder="가족 내부 열람용, 외부 재배포 불가"
            />

            <Field label="메모" name="note" type="textarea" rows={2} className="span2" />
          </div>

          <div className="form-actions">
            <button type="submit" className="jg-btn jg-btn-primary">
              만들고 기록 올리기
            </button>
          </div>
        </form>
      </section>
    </div>
  );
}
