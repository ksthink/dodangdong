import Link from 'next/link';
import { notFound } from 'next/navigation';
import { requireAdmin } from '@/lib/access';
import { getPersonAdmin, type KinRow } from '@/lib/admin-person';
import { num } from '@/lib/ui';
import {
  updatePerson,
  addLifePeriod,
  updateLifePeriod,
  removeLifePeriod,
  addRelation,
  removeRelation,
} from '@/app/admin/actions';
import Field from '@/components/admin/Field';
import Notice from '@/components/admin/Notice';
import PersonHeader from '@/components/person/PersonHeader';

export const dynamic = 'force-dynamic';

/**
 * 인물 편집.
 *
 * 인물 목록은 이름을 묶어 두는 자리고, 여기는 한 인물을 깊이 고치는 자리다.
 * 네 마디로 나뉜다 — 기본 / 생애 시기 / 가족 / 기록.
 *
 * 머리에 공개 화면과 같은 PersonHeader 를 미리보기로 둔다. 고치는 사람이
 * 지금 무엇을 바꾸고 있는지 보이는 것과 함께 봐야, 호칭을 괄호에 넣는
 * 규칙 같은 것이 글자가 아니라 결과로 읽힌다.
 *
 * 폼은 전부 <form action={serverAction}>. 자바스크립트 없이 도는 화면이라
 * 저장 뒤에는 서버가 같은 주소로 돌려보내고, 할 말은 `?done=`·`?error=` 에
 * 실려 온다(관리 화면의 기존 관례).
 */
export default async function AdminPersonPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ done?: string; error?: string }>;
}) {
  await requireAdmin();
  const { id } = await params;
  const { done, error } = await searchParams;

  const data = await getPersonAdmin(id);
  if (!data) notFound();

  const { person, periods, parents, spouses, children, appears, made, others } = data;

  /** 가족 한 줄. 빼기 단추까지 붙는다. `kind` 는 저장된 종류다. */
  const kinLine = (k: KinRow, kind: 'parent' | 'spouse', label: string) => (
    <li key={`${kind}-${k.id}`}>
      <Link href={`/admin/people/${k.id}`}>{k.name}</Link>
      <form action={removeRelation} style={{ display: 'inline' }}>
        <input type="hidden" name="person_id" value={person.id} />
        {/* parent 는 방향이 있다. 자식 줄은 저쪽에서 이쪽을 부모로 가리킨 것이다. */}
        <input type="hidden" name="from_person_id" value={label === '자식' ? k.id : person.id} />
        <input type="hidden" name="to_person_id" value={label === '자식' ? person.id : k.id} />
        <input type="hidden" name="kind" value={kind} />
        <button type="submit" className="jg-btn jg-btn-text" aria-label={`${k.name} ${label} 관계 빼기`}>
          ✕
        </button>
      </form>
    </li>
  );

  return (
    <div className="page page-admin">
      <section className="admin-sec">
        <div className="block-head">
          <h1 className="sec-title jg-pixel">인물 고치기</h1>
          <Link href={`/people/${person.id}`}>인물 화면 보기 →</Link>
        </div>

        {error ? <Notice tone="error">{error}</Notice> : null}
        {done ? <Notice tone="success">{done}</Notice> : null}

        {/* 지금 저장된 값이 손님에게 어떻게 보이는지. */}
        <PersonHeader
          name={person.name}
          short={person.short}
          kicker="미리보기"
          aliases={person.aliases}
          born={person.birthEdtf ?? person.bornYear}
          died={person.deathEdtf ?? person.diedYear}
          relation={person.relation}
          bio={person.note}
          stats={[
            { label: '나오는 기록', value: appears },
            { label: '만든 기록', value: made },
            { label: '생애 시기', value: periods.length },
          ]}
        />
      </section>

      {/* ── 1. 기본 ─────────────────────────────────────────── */}
      <section className="admin-sec">
        <h2 className="sec-title jg-pixel">기본</h2>
        <form action={updatePerson} className="edit-form">
          <input type="hidden" name="person_id" value={person.id} />
          <div className="form-grid">
            <Field
              label="이름"
              code="foaf:name"
              name="display_name"
              className="span2"
              required
              defaultValue={person.name}
              help="실명과 부르던 호칭을 함께. 괄호 안이 호칭이 됩니다 — 김순자(할머니)."
            />
            <Field
              label="달리 부르던 이름"
              name="aliases"
              className="span2"
              defaultValue={person.aliases.join(', ')}
              help="쉼표로 나눠 적습니다. 어느 이름으로 찾아도 같은 인물에 닿습니다."
            />
            <Field
              label="태어난 때"
              code="dcterms:temporal"
              name="birth_edtf"
              mono
              defaultValue={person.birthEdtf ?? ''}
              help="1936? 처럼 추정을 적을 수 있습니다."
            />
            <Field
              label="떠난 때"
              code="dcterms:temporal"
              name="death_edtf"
              mono
              defaultValue={person.deathEdtf ?? ''}
              help="1936? 처럼 추정을 적을 수 있습니다. 살아 계시면 비워 둡니다."
            />
            <Field
              label="나와의 관계"
              name="relation_to_root"
              defaultValue={person.relation ?? ''}
              help="이 아카이브를 세운 사람에서 본 관계. 예: 외할머니."
            />
            <Field
              label="소개"
              name="note"
              type="textarea"
              rows={3}
              className="span2"
              defaultValue={person.note ?? ''}
            />
          </div>
          <div className="form-actions">
            <button type="submit" className="jg-btn jg-btn-primary">저장</button>
          </div>
        </form>
      </section>

      {/* ── 2. 생애 시기 ────────────────────────────────────── */}
      <section className="admin-sec">
        <h2 className="sec-title jg-pixel">생애 시기</h2>

        <Notice tone="info" title="여기서 적는 것이 곧 시기분류입니다">
          <p>
            찾기 화면의 네 갈래 가운데 시기분류(dcterms:temporal)는 이 목록에서 그대로 만들어집니다.
            &ldquo;{person.short}/어린 시절&rdquo; 처럼 인물과 시기를 묶은 값이 되고, 기록 편집
            화면에서 그 값을 기록에 붙입니다. 여기에 아무것도 적지 않으면 시기분류 축은 비어 있습니다.
          </p>
        </Notice>

        {periods.length === 0 ? (
          <div className="empty">
            <p className="jg-pixel">아직 적어 둔 시기가 없다</p>
            <p>아래에서 한 시기를 세워 보세요.</p>
          </div>
        ) : (
          periods.map((p) => (
            <form key={p.id} action={updateLifePeriod} className="edit-form">
              <input type="hidden" name="person_id" value={person.id} />
              <input type="hidden" name="life_period_id" value={p.id} />
              <div className="block-head">
                <h3 className="sec-title jg-pixel">{p.label}</h3>
                {p.count > 0 ? (
                  <Link href={`/search?period=${encodeURIComponent(p.facet)}`}>
                    걸린 기록 {num(p.count)}건 →
                  </Link>
                ) : (
                  <span className="is-muted">걸린 기록 없음</span>
                )}
              </div>
              <div className="form-grid">
                <Field label="이름" name="label" className="span2" required defaultValue={p.label} />
                <Field label="시작" name="from_edtf" mono defaultValue={p.fromEdtf ?? ''} />
                <Field
                  label="끝"
                  name="to_edtf"
                  mono
                  defaultValue={p.toEdtf ?? ''}
                  help="비워 두면 지금도 이어지는 것으로 봅니다."
                />
              </div>
              <div className="form-actions">
                <button type="submit" className="jg-btn jg-btn-secondary">이 시기 저장</button>
              </div>
            </form>
          ))
        )}

        {/* 지우기는 고치기 폼 안에 넣을 수 없다 — 폼은 겹칠 수 없다. */}
        {periods.length > 0 ? (
          <ul className="jg-chips">
            {periods.map((p) => (
              <li key={p.id}>
                {p.label}
                <form action={removeLifePeriod} style={{ display: 'inline' }}>
                  <input type="hidden" name="person_id" value={person.id} />
                  <input type="hidden" name="life_period_id" value={p.id} />
                  <button type="submit" className="jg-btn jg-btn-text" aria-label={`${p.label} 지우기`}>
                    ✕
                  </button>
                </form>
              </li>
            ))}
          </ul>
        ) : null}

        <form action={addLifePeriod} className="edit-form">
          <input type="hidden" name="person_id" value={person.id} />
          <div className="form-grid">
            <Field
              label="시기의 이름"
              name="label"
              className="span2"
              required
              placeholder="예: 어린 시절, 부산 살던 때"
            />
            <Field label="시작" name="from_edtf" mono placeholder="1936?" />
            <Field
              label="끝"
              name="to_edtf"
              mono
              placeholder="1950"
              help="비워 두면 지금도 이어지는 것으로 봅니다."
            />
          </div>
          <div className="form-actions">
            <button type="submit" className="jg-btn jg-btn-primary">시기 더하기</button>
          </div>
        </form>
      </section>

      {/* ── 3. 가족 ─────────────────────────────────────────── */}
      <section className="admin-sec">
        <h2 className="sec-title jg-pixel">가족</h2>

        <Notice tone="info">
          <p>
            저장되는 것은 부모와 배우자 둘뿐입니다. 자식은 저쪽 인물이 이 인물을 부모로 가리킨
            것을 거꾸로 읽어 나오는 것이라, 아래에서 &ldquo;자식&rdquo;을 고르면 방향을 뒤집어
            저장합니다. 배우자는 방향이 없어 양쪽에 함께 적힙니다.
          </p>
        </Notice>

        <div className="block-head">
          <h3 className="sec-title jg-pixel">부모</h3>
        </div>
        {parents.length === 0 ? (
          <p className="is-muted">아직 없습니다.</p>
        ) : (
          <ul className="jg-chips">{parents.map((k) => kinLine(k, 'parent', '부모'))}</ul>
        )}

        <div className="block-head">
          <h3 className="sec-title jg-pixel">배우자</h3>
        </div>
        {spouses.length === 0 ? (
          <p className="is-muted">아직 없습니다.</p>
        ) : (
          <ul className="jg-chips">{spouses.map((k) => kinLine(k, 'spouse', '배우자'))}</ul>
        )}

        <div className="block-head">
          <h3 className="sec-title jg-pixel">자식</h3>
        </div>
        {children.length === 0 ? (
          <p className="is-muted">아직 없습니다.</p>
        ) : (
          <ul className="jg-chips">{children.map((k) => kinLine(k, 'parent', '자식'))}</ul>
        )}

        <form action={addRelation} className="edit-form">
          <input type="hidden" name="from_person_id" value={person.id} />
          <div className="form-grid">
            <Field
              label="인물"
              name="to_person_id"
              type="select"
              required
              options={[
                { value: '', label: '(고르지 않음)' },
                ...others.map((o) => ({ value: o.id, label: o.name })),
              ]}
            />
            <Field
              label="종류"
              name="kind"
              type="select"
              defaultValue="parent"
              options={[
                { value: 'parent', label: `이 인물(${person.short})의 부모` },
                { value: 'spouse', label: `이 인물(${person.short})의 배우자` },
                { value: 'child', label: `이 인물(${person.short})의 자식` },
              ]}
            />
          </div>
          <div className="form-actions">
            <button type="submit" className="jg-btn jg-btn-primary">관계 맺기</button>
          </div>
        </form>
      </section>

      {/* ── 4. 기록 ─────────────────────────────────────────── */}
      <section className="admin-sec">
        <h2 className="sec-title jg-pixel">기록</h2>
        <p className="page-lead">
          이 인물에 걸린 기록입니다. 사건과 보관함으로 내린 것은 세지 않습니다.
        </p>
        <ul className="jg-chips">
          <li>
            나오는 기록 {num(appears)}건
            <Link href={`/search?q=${encodeURIComponent(person.short)}`}>찾기에서 보기 →</Link>
          </li>
          <li>
            만든 기록 {num(made)}건
            <Link href={`/search?q=${encodeURIComponent(person.name)}`}>찾기에서 보기 →</Link>
          </li>
        </ul>
      </section>
    </div>
  );
}
