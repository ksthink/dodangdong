import { db } from '@/lib/db';
import { requireAdmin } from '@/lib/access';
import { createBundle } from '../../actions';

export const dynamic = 'force-dynamic';

/**
 * 묶음 만들기.
 *
 * 여기서 채운 값이 그 안의 모든 낱장으로 흘러간다. 그래서 출처가 필수다 —
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
    <main className="wrap narrow">
      <section className="stack">
        <span className="eyebrow">2단계</span>
        <h1>새 묶음</h1>
        <p className="lede">
          여기 적은 출처·시기·권리·접근등급은 이 묶음에 들어올 모든 자료가 물려받습니다.
        </p>
      </section>

      <form action={createBundle} className="box stack">
        <div className="field">
          <label htmlFor="title">묶음 이름 *</label>
          <input id="title" name="title" type="text" required placeholder="큰아버지 앨범 3권" />
        </div>

        <div className="formgrid">
          <div className="field">
            <label htmlFor="kind">종류</label>
            <select id="kind" name="kind" defaultValue="album">
              <option value="album">앨범</option>
              <option value="roll">필름 롤</option>
              <option value="bundle">다발</option>
              <option value="tape">테이프</option>
              <option value="folder">폴더</option>
              <option value="single">낱개</option>
            </select>
          </div>
          <div className="field">
            <label htmlFor="acquisition_id">수집 세션</label>
            <select id="acquisition_id" name="acquisition_id" defaultValue={acquisition ?? ''}>
              <option value="">— 없음 —</option>
              {(acquisitions ?? []).map((a) => (
                <option key={a.id} value={a.id}>
                  {a.visited_on} {a.from_label ?? ''} {a.location ?? ''}
                </option>
              ))}
            </select>
          </div>
        </div>

        <div className="field">
          <label htmlFor="source">출처 * — 원본이 어디에 있었나</label>
          <input id="source" name="source" type="text" required placeholder="큰아버지 댁 다락, 앨범 3권" />
          <span className="hint">낱장은 이 값을 물려받습니다. 낱장에서 따로 적을 필요가 없습니다.</span>
        </div>

        <div className="field">
          <label htmlFor="provenance">입수 경위</label>
          <input id="provenance" name="provenance" type="text" placeholder="2026-03 방문 수습, 600dpi 직접 스캔" />
        </div>

        <div className="formgrid">
          <div className="field">
            <label htmlFor="period_edtf">시기 범위 (EDTF)</label>
            <input id="period_edtf" name="period_edtf" type="text" placeholder="1958 · 195X · 1971/1991" />
            <span className="hint">촬영일시가 없는 자료는 이 값을 시기로 물려받습니다.</span>
          </div>
          <div className="field">
            <label htmlFor="place_id">장소</label>
            <select id="place_id" name="place_id" defaultValue="">
              <option value="">— 없음 —</option>
              {(places ?? []).map((p) => (
                <option key={p.id} value={p.id}>
                  {p.family_name}
                  {p.admin_name ? ` (${p.admin_name})` : ''}
                </option>
              ))}
            </select>
          </div>
        </div>

        <div className="formgrid">
          <div className="field">
            <label htmlFor="default_access_level">기본 접근 등급</label>
            <select id="default_access_level" name="default_access_level" defaultValue="family">
              <option value="family">가족 — 로그인한 가족만</option>
              <option value="public">공개 — 링크를 아는 누구나</option>
              <option value="private">비공개 — 관리자만</option>
            </select>
            <span className="hint">기본값이 곧 대부분의 자료가 됩니다.</span>
          </div>
          <div className="field">
            <label htmlFor="digitized_by">디지털화</label>
            <input id="digitized_by" name="digitized_by" type="text" placeholder="직접 스캔 (Epson V600)" />
          </div>
        </div>

        <div className="field">
          <label htmlFor="rights">권리</label>
          <input id="rights" name="rights" type="text" placeholder="가족 내부 열람용, 외부 재배포 불가" />
        </div>

        <div className="field">
          <label htmlFor="note">메모</label>
          <textarea id="note" name="note" rows={2} />
        </div>

        <div className="row">
          <button type="submit" className="btn">
            만들고 자료 올리기
          </button>
        </div>
      </form>
    </main>
  );
}
