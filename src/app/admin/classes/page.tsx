import { requireAdmin } from '@/lib/access';
import { getClasses } from '@/lib/admin-classes';
import { num } from '@/lib/ui';
import Field from '@/components/admin/Field';
import Notice from '@/components/admin/Notice';
import { createSubject, renameSubject, removeSubject } from '../actions';

export const dynamic = 'force-dynamic';

/**
 * 분류 관리.
 *
 * 찾기 화면이 거르는 네 축을 그대로 구획 넷으로 세운다. 순서는 사람이
 * 손댈 수 있는 것부터다 — 주제분류만 여기서 만들고 고치고, 나머지 셋은
 * 어디를 고쳐야 바뀌는지만 알린다.
 *
 * 건수를 매 줄에 적는 것은 "만들어만 두고 아무도 쓰지 않는 분류"를 드러내기
 * 위해서다. 그래도 0건인 분류를 지우지는 않는다 — 비어 있다는 사실도 정보다
 * (facets.ts 머리말의 규칙을 관리 화면에서도 지킨다).
 */
export default async function AdminClassesPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  await requireAdmin();
  const { error } = await searchParams;
  const { subjects, periods, forms, sources, itemCount, unsubjected, unperiodized } =
    await getClasses();

  const parentOptions = [
    { value: '', label: '— 상위 분류를 고르세요 —' },
    ...subjects.map((s) => ({ value: s.id, label: s.label })),
  ];

  return (
    <div className="page page-admin">
      <section className="admin-sec">
        <h1 className="page-title jg-pixel">분류</h1>
        <p className="page-lead">
          찾기 화면은 이 네 갈래로 기록을 거릅니다. 형태와 출처는 기록에 적은
          값에서 저절로 만들어지고, 주제는 여기서 세우며, 시기는 인물의 생애에
          매여 있습니다.
        </p>
        {error ? <Notice tone="error">{error}</Notice> : null}
        <p className="jg-note">
          살아 있는 기록 {num(itemCount)}건 가운데 주제분류가 없는 것{' '}
          {num(unsubjected)}건, 시기분류가 없는 것 {num(unperiodized)}건입니다.
          분류는 낱장 기술 화면에서 붙입니다.
        </p>
      </section>

      <section className="admin-sec">
        <h2 className="sec-title jg-pixel">주제분류</h2>
        <p className="jg-note">
          무엇에 관한 기록인가. <span className="jg-tag-code">dc:subject</span> 두
          단계까지만 둡니다 — 세 단계가 되는 순간 어디에 넣을지 판단을 미루게 되고,
          미룬 것은 영영 분류되지 않습니다.
        </p>

        {subjects.length === 0 ? (
          <div className="empty">
            <p className="jg-pixel">주제분류가 없다</p>
            <p>아래에서 상위 분류를 하나 세워 보세요.</p>
          </div>
        ) : (
          <div className="jg-rtable-wrap">
            <table className="jg-rtable">
              <thead>
                <tr>
                  <th>분류</th>
                  <th className="is-mono">걸린 기록</th>
                  <th>이름 고치기</th>
                  <th>
                    <span className="jg-sr">지우기</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {subjects.flatMap((top) => [
                  <SubjectLine key={top.id} row={top} />,
                  ...top.children.map((c) => <SubjectLine key={c.id} row={c} nested />),
                ])}
              </tbody>
            </table>
          </div>
        )}

        <Notice tone="info" title="지우면 되돌릴 수 없습니다">
          상위 분류를 지우면 그 아래 하위 분류까지 함께 사라지고, 기록에 걸어둔
          연결도 같이 지워집니다. 기록 자체는 남지만 그 분류로는 다시 찾지 못합니다.
          이름을 고치는 것도 마찬가지로 주의가 필요합니다 — 찾기 화면의 주소는 분류
          이름을 그대로 싣기 때문에, 예전 이름으로 걸어둔 링크는 아무것도 찾지 못합니다.
        </Notice>

        <form action={createSubject} className="edit-form">
          <div className="form-grid">
            <Field
              label="상위 분류 만들기"
              code="dc:subject"
              name="label"
              placeholder="명절·기념일"
              help="같은 자리에 같은 이름을 두 번 만들 수 없습니다."
            />
          </div>
          <div className="form-actions">
            <button type="submit" className="jg-btn jg-btn-primary">
              상위 만들기
            </button>
          </div>
        </form>

        <form action={createSubject} className="edit-form">
          <div className="form-grid">
            <Field label="하위 분류 만들기" name="label" placeholder="추석" />
            <Field
              label="어느 상위 아래"
              name="parent_id"
              type="select"
              options={parentOptions}
              defaultValue=""
              help="고르지 않으면 상위 분류가 하나 더 만들어집니다."
            />
          </div>
          <div className="form-actions">
            <button type="submit" className="jg-btn jg-btn-secondary">
              하위 만들기
            </button>
          </div>
        </form>
      </section>

      <section className="admin-sec">
        <h2 className="sec-title jg-pixel">시기분류</h2>
        <p className="jg-note">
          누구의 어느 때인가. <span className="jg-tag-code">dcterms:temporal</span>{' '}
          상위는 인물, 하위는 그 사람의 생애 시기입니다.
        </p>

        {periods.length === 0 ? (
          <div className="empty">
            <p className="jg-pixel">생애 시기가 없다</p>
            <p>인물 화면에서 한 사람의 생애를 나눠 보세요.</p>
          </div>
        ) : (
          <div className="jg-rtable-wrap">
            <table className="jg-rtable">
              <thead>
                <tr>
                  <th>인물</th>
                  <th>시기</th>
                  <th className="is-mono">햇수</th>
                  <th className="is-mono">걸린 기록</th>
                </tr>
              </thead>
              <tbody>
                {periods.flatMap((p) =>
                  p.periods.map((s, i) => (
                    <tr key={s.id}>
                      {/* 인물 이름은 묶음의 첫 줄에만 적는다. 같은 이름을 시기
                          수만큼 되풀이하면 어디서 사람이 바뀌는지 읽히지 않는다. */}
                      {i === 0 ? (
                        <td className="is-title" rowSpan={p.periods.length}>
                          {p.name}
                          {p.name === p.fullName ? null : (
                            <span className="jg-tag-code"> {p.fullName}</span>
                          )}
                        </td>
                      ) : null}
                      <td>{s.label}</td>
                      <td className="is-mono is-muted">
                        {s.fromYear || s.toYear
                          ? `${s.fromYear ?? '?'}–${s.toYear ?? ''}`
                          : '—'}
                      </td>
                      <td className="is-mono">{num(s.count)}</td>
                    </tr>
                  )),
                )}
              </tbody>
            </table>
          </div>
        )}

        <Notice tone="info" title="인물 화면에서 고칩니다">
          생애 시기는 한 사람의 일생을 나눈 것이라 인물에 매여 있습니다. 여기서는
          어떤 시기가 있고 얼마나 쓰이는지만 봅니다. 찾기 화면에는{' '}
          <strong>호칭 &gt; 시기</strong> 꼴로 나타납니다.
        </Notice>
      </section>

      <section className="admin-sec">
        <h2 className="sec-title jg-pixel">형태분류</h2>
        <p className="jg-note">
          무엇인가. <span className="jg-tag-code">dc:type</span> 상위는 DCMI 일곱
          가지로 고정이고, 하위는 낱장 기술 화면의 <strong>세부 형태</strong>에 적은
          말이 그대로 됩니다.
        </p>

        <div className="jg-rtable-wrap">
          <table className="jg-rtable">
            <thead>
              <tr>
                <th>형태</th>
                <th className="is-mono">DCMI</th>
                <th className="is-mono">기록</th>
              </tr>
            </thead>
            <tbody>
              {forms.flatMap((f) => [
                <tr key={f.type}>
                  <td className="is-title">{f.label}</td>
                  <td className="is-mono is-muted">{f.type}</td>
                  <td className="is-mono">{num(f.count)}</td>
                </tr>,
                ...f.docTypes.map((d) => (
                  <tr key={`${f.type}/${d.label}`}>
                    <td>
                      <span className="is-muted" aria-hidden="true">
                        └{' '}
                      </span>
                      {d.label}
                    </td>
                    <td className="is-mono is-muted">—</td>
                    <td className="is-mono">{num(d.count)}</td>
                  </tr>
                )),
              ])}
            </tbody>
          </table>
        </div>

        <Notice tone="info" title="여기서 만들 것이 없습니다">
          형태분류는 기록에서 유도됩니다. 하위를 늘리려면 낱장 기술 화면의 세부
          형태에 적으세요 — 적은 말이 곧 분류가 됩니다. 사건(Event)은 연표의 몫이라
          찾기 화면의 결과에는 섞이지 않습니다.
        </Notice>
      </section>

      <section className="admin-sec">
        <h2 className="sec-title jg-pixel">출처분류</h2>
        <p className="jg-note">
          어디서 나왔는가. <span className="jg-tag-code">dc:source</span> 상위는
          출처, 하위는 묶음입니다.
        </p>

        {sources.length === 0 ? (
          <div className="empty">
            <p className="jg-pixel">아직 들어온 기록이 없다</p>
            <p>묶음을 만들어 기록을 올리면 여기에 쌓입니다.</p>
          </div>
        ) : (
          <div className="jg-rtable-wrap">
            <table className="jg-rtable">
              <thead>
                <tr>
                  <th>출처 · 묶음</th>
                  <th className="is-mono">기록</th>
                </tr>
              </thead>
              <tbody>
                {sources.flatMap((s) => [
                  <tr key={s.source}>
                    <td className="is-title">{s.source}</td>
                    <td className="is-mono">{num(s.count)}</td>
                  </tr>,
                  ...s.bundles.map((b) => (
                    <tr key={`${s.source}/${b.title}`}>
                      <td>
                        <span className="is-muted" aria-hidden="true">
                          └{' '}
                        </span>
                        {b.title}
                      </td>
                      <td className="is-mono">{num(b.count)}</td>
                    </tr>
                  )),
                ])}
              </tbody>
            </table>
          </div>
        )}

        <Notice tone="info" title="묶음 화면에서 고칩니다">
          출처는 묶음에 적고, 낱장에서 비워두면 묶음 값을 물려받습니다. 출처가 빈
          기록은 <strong>(출처 없음)</strong> 아래 모입니다.
        </Notice>
      </section>
    </div>
  );
}

/**
 * 주제분류 한 줄.
 *
 * 이름 고치는 칸에 Field 를 쓰지 않았다. Field 는 라벨을 위에 세우는데,
 * 표에서는 머리줄이 이미 그 일을 하고 있어 분류 수만큼 같은 라벨이 되풀이된다.
 * 대신 Checkbox 와 같은 방식으로 aria-label 에 무엇을 고치는지 적는다.
 */
function SubjectLine({
  row,
  nested,
}: {
  row: { id: string; label: string; note: string | null; count: number };
  nested?: boolean;
}) {
  return (
    <tr>
      <td className="is-title">
        {nested ? (
          <span className="is-muted" aria-hidden="true">
            └{' '}
          </span>
        ) : null}
        {row.label}
        {row.note ? <span className="jg-tag-code"> {row.note}</span> : null}
      </td>
      <td className="is-mono">{num(row.count)}</td>
      <td>
        <form action={renameSubject} className="jg-rtable-actions">
          <input type="hidden" name="subject_id" value={row.id} />
          <input
            className="jg-input"
            name="label"
            defaultValue={row.label}
            aria-label={`${row.label} 이름 고치기`}
          />
          <button type="submit" className="jg-btn jg-btn-text">
            고치기
          </button>
        </form>
      </td>
      <td>
        <form action={removeSubject}>
          <input type="hidden" name="subject_id" value={row.id} />
          <button
            type="submit"
            className="jg-btn jg-btn-text"
            aria-label={`${row.label} 지우기`}
          >
            지우기
          </button>
        </form>
      </td>
    </tr>
  );
}
