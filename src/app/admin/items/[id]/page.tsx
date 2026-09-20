import Link from 'next/link';
import { notFound } from 'next/navigation';
import { db } from '@/lib/db';
import { requireAdmin } from '@/lib/access';
import { getItem } from '@/lib/queries';
import { getClassPicker } from '@/lib/admin-classes';
import { parseEdtf } from '@/lib/edtf';
import Field from '@/components/admin/Field';
import Notice from '@/components/admin/Notice';
import Checkbox from '@/components/admin/Checkbox';
import StatusBadge from '@/components/admin/StatusBadge';
import { DateValue, TypeTag } from '@/components/search/parts';
import PersonPicker, { type PersonOption, type PersonPick } from '@/components/curation/PersonPicker';
import {
  updateItem,
  linkPerson,
  unlinkPerson,
  addToCollection,
  archiveItem,
  setItemSubjects,
  setItemPeriods,
  setItemPeople,
  setItemCreator,
} from '../../actions';

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

/**
 * item_effective 에는 있으나 ItemRow(queries.ts)에는 아직 없는 열. 그 타입은
 * 다른 화면들이 함께 쓰므로 여기서 고치지 않고, 같은 행에서 이 화면이
 * 필요한 만큼만 따로 읽는다.
 */
interface AuthorityCols {
  /** 전거에 등록된 생산자. */
  creator_id: string | null;
  /** 등록하지 않고 이름만 적어 둔 등장인물. */
  subject_names: string[] | null;
}

/** person 행을 PersonPicker 가 읽는 꼴로. */
function toOption(p: {
  id: string;
  display_name: string;
  aliases?: string[] | null;
  born_year?: number | null;
  died_year?: number | null;
}): PersonOption {
  return {
    id: p.id,
    name: p.display_name,
    aliases: p.aliases ?? [],
    born: p.born_year ?? null,
    died: p.died_year ?? null,
  };
}

const TYPES = [
  { value: 'StillImage', label: '사진' },
  { value: 'Sound', label: '목소리' },
  { value: 'MovingImage', label: '영상' },
  { value: 'Text', label: '편지·문서' },
  { value: 'PhysicalObject', label: '유품' },
];

/**
 * 기록 상세 기술.
 *
 * 상속 필드는 비워두면 묶음 값을 물려받는다는 뜻이다. 화면에서도 그렇게 보이도록
 * placeholder 에 물려받는 값을 그대로 띄운다 — 비어 있는 칸이 곧 "상속 중"이다.
 * 도움말에도 같은 말을 적어 두었다. 빈 칸은 "아직 안 적은 것"으로도 읽히므로
 * 글로 한 번 더 못을 박아야 한다.
 *
 * 칸마다 더블린코어 요소 코드를 달았다. 보는 화면의 상세정보 표와 같은 이름이
 * 같은 자리에 있어야, 기술하는 이가 무엇을 채우는지 안다.
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
      // PersonPicker 는 이름만이 아니라 다른 이름·생몰로도 찾는다. 같은
      // 이름이 둘일 때 생몰이 없으면 어느 쪽인지 고를 수 없다.
      supabase
        .from('person')
        .select('id, display_name, aliases, born_year, died_year')
        .order('display_name'),
      supabase.from('collection').select('id, title').order('title'),
      supabase.from('place').select('id, family_name').order('family_name'),
    ]);

  // 주제·시기분류는 따로 불러온다. 위의 Promise.all 은 기술 폼이 쓰는 것들이고,
  // 여기서 필요한 것은 고를 수 있는 분류와 지금 걸린 것뿐이다.
  const picker = await getClassPicker(id);
  const chosenSubjects = new Set(picker.chosenSubjects);
  const chosenPeriods = new Set(picker.chosenPeriods);

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
    { value: '', label: '— 이야기 —' },
    ...(allCollections ?? []).map((c) => ({ value: String(c.id), label: String(c.title) })),
  ];
  // '찍힘'은 위의 등장인물 칸이 다룬다. 여기 두면 같은 연결을 두 곳에서
  // 만들게 되고, 한쪽에서 저장할 때 다른 쪽이 지운다.
  const roleOptions = PERSON_ROLES.filter(([value]) => value !== 'depicted').map(
    ([value, label]) => ({ value, label }),
  );

  // 전거에서 고르는 칸이 쓰는 것들.
  const authority = item as unknown as AuthorityCols;
  const pickerOptions: PersonOption[] = (allPeople ?? []).map((p) =>
    toOption({
      id: String(p.id),
      display_name: String(p.display_name),
      aliases: (p.aliases as string[] | null) ?? [],
      born_year: p.born_year as number | null,
      died_year: p.died_year as number | null,
    }),
  );
  const byId = new Map(pickerOptions.map((o) => [o.id, o]));

  // 지금 걸려 있는 등장인물. 등록된 사람은 칩으로, 이름만 적어 둔 것은
  // 점선 칩으로 돌아온다 — 다시 저장해도 적어 둔 것이 사라지지 않게.
  const peoplePicks: PersonPick[] = [
    ...people
      .filter((p) => p.role === 'depicted')
      .map((p) => ({ id: p.id, name: p.display_name })),
    ...(authority.subject_names ?? []).map((n) => ({ name: n })),
  ];

  // 생산자는 한 사람이다. 전거에 있으면 그 사람, 없으면 적어 둔 이름.
  const creatorPerson = authority.creator_id ? byId.get(authority.creator_id) : undefined;
  const creatorPick: PersonPick[] = creatorPerson
    ? [{ id: creatorPerson.id, name: creatorPerson.name }]
    : item.creator
      ? [{ name: item.creator }]
      : [];

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
        <h2 className="sec-title jg-pixel">지금 이 기록</h2>
        {/* 뷰어(Viewer)는 상태를 쥐는 클라이언트 조각이라 기술 화면에는 두지 않는다 —
            여기서 필요한 것은 "고치고 있는 것이 이 기록이 맞는가" 확인뿐이다. */}
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
              name="doc_type"
              label="세부 형태"
              code="dc:type"
              help="편지·일기·족보 따위. 형태분류의 하위 단계가 됩니다."
              defaultValue={item.doc_type ?? ''}
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
            {/* 생산자는 전거에서 고르는 칸이라 폼이 따로다(아래 "생산자"). */}
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
        <h2 className="sec-title jg-pixel">생산자</h2>
        {/* 이 기록을 만든 사람. 한 사람이다.

            등록된 사람이면 전거에서 고른다 — 그래야 그가 찍은 사진들이 그의
            인물 페이지에 모인다. 군청·사진관 같은 기관이나 끝내 누구인지 모르는
            경우에만 이름만 적어 둔다(점선 칩). */}
        <form action={setItemCreator} className="edit-form">
          <input type="hidden" name="item_id" value={id} />
          <PersonPicker
            name="creator"
            label="생산자"
            code="dc:creator"
            options={pickerOptions}
            defaultValue={creatorPick}
            multiple={false}
            allowLoose
            placeholder="이름·호칭으로 찾기"
            help="등록된 사람이면 골라 주세요. 기관이나 미상은 이름만 적습니다."
          />
          <div className="form-actions">
            <button type="submit" className="jg-btn jg-btn-secondary">
              생산자 저장
            </button>
          </div>
        </form>
      </section>

      <section className="admin-sec">
        <h2 className="sec-title jg-pixel">분류</h2>
        {/* 찾기 화면이 거르는 네 축 가운데 손으로 붙이는 둘. 형태는 위의 유형과
            세부 형태에서, 출처는 묶음에서 저절로 따라온다.

            주제와 시기는 각각 폼이 따로다. 체크박스는 켠 것만 보내고 끈 것은
            보내지 않으므로, 한 폼에 둘을 담으면 한쪽을 저장할 때 다른 쪽이
            통째로 비워진다. */}
        <p className="jg-note">
          여기서 붙인 분류로 <strong>찾기</strong> 화면의 주제분류·시기분류가
          걸립니다. 분류 자체를 만들고 고치는 것은{' '}
          <Link href="/admin/classes">분류 관리</Link> 화면입니다.
        </p>

        <form action={setItemSubjects} className="edit-form">
          <input type="hidden" name="item_id" value={id} />
          <fieldset style={{ margin: 0, padding: 0, border: 0 }}>
            <legend className="jg-field-name">
              주제분류 <span className="jg-field-code">dc:subject</span>
            </legend>
            {picker.subjects.length === 0 ? (
              <p className="jg-note">
                세워둔 주제분류가 없습니다. 분류 관리 화면에서 먼저 만드세요.
              </p>
            ) : (
              <div className="form-checks">
                {picker.subjects.flatMap((top) => [
                  <Checkbox
                    key={top.id}
                    name="subject_ids"
                    value={top.id}
                    label={top.label}
                    defaultChecked={chosenSubjects.has(top.id)}
                  />,
                  // 하위는 어느 상위에 딸린 것인지 함께 적는다. "추석"만 있으면
                  // 상위가 여럿일 때 같은 이름이 어디 것인지 알 수 없다.
                  ...top.children.map((c) => (
                    <Checkbox
                      key={c.id}
                      name="subject_ids"
                      value={c.id}
                      label={`${top.label} > ${c.label}`}
                      defaultChecked={chosenSubjects.has(c.id)}
                    />
                  )),
                ])}
              </div>
            )}
          </fieldset>
          <div className="form-actions">
            <button type="submit" className="jg-btn jg-btn-secondary">
              주제분류 저장
            </button>
          </div>
        </form>

        <form action={setItemPeriods} className="edit-form">
          <input type="hidden" name="item_id" value={id} />
          <fieldset style={{ margin: 0, padding: 0, border: 0 }}>
            <legend className="jg-field-name">
              시기분류 <span className="jg-field-code">dcterms:temporal</span>
            </legend>
            {picker.periods.length === 0 ? (
              <p className="jg-note">
                나눠둔 생애 시기가 없습니다. 인물 화면에서 먼저 나누세요.
              </p>
            ) : (
              <div className="form-checks">
                {picker.periods.flatMap((p) =>
                  p.periods.map((s) => (
                    <Checkbox
                      key={s.id}
                      name="life_period_ids"
                      value={s.id}
                      label={`${p.name} > ${s.label}`}
                      defaultChecked={chosenPeriods.has(s.id)}
                    />
                  )),
                )}
              </div>
            )}
          </fieldset>
          <div className="form-actions">
            <button type="submit" className="jg-btn jg-btn-secondary">
              시기분류 저장
            </button>
          </div>
        </form>
      </section>

      <section className="admin-sec">
        <h2 className="sec-title jg-pixel">등장인물</h2>
        {/* 찍힌 사람들은 한 칸에서 통째로 다시 세운다 — 분류와 같은 방식이다.
            하나씩 넣고 빼면 "지금 누가 걸려 있는가"를 사람이 머리로 셈해야 한다.

            명단에 없는 사람은 그 자리에서 이름만으로 등록한다. 사진을 정리하다
            모르는 이름이 나왔다고 인물 등록 화면으로 갔다 오게 하면 하던 일을
            잃는다. 기관이나 끝내 모르는 사람은 등록하지 않고 이름만 적어 둔다. */}
        <form action={setItemPeople} className="edit-form">
          <input type="hidden" name="item_id" value={id} />
          <PersonPicker
            name="people"
            label="등장인물"
            code="dc:subject"
            options={pickerOptions}
            defaultValue={peoplePicks}
            allowLoose
            help="찍힌 사람들입니다. 여기서 연결한 사람의 인물 페이지에 이 기록이 나옵니다."
          />
          <div className="form-actions">
            <button type="submit" className="jg-btn jg-btn-secondary">
              등장인물 저장
            </button>
          </div>
        </form>

        {/* 찍음·씀·받음 같은 나머지 역할. 위 칸은 '찍힘'만 다루므로, 그것까지
            한 칸에 담으면 누가 어떤 자격으로 걸렸는지 알 수 없어진다. */}
        <h3 className="jg-field-name">그 밖의 역할</h3>
        {people.filter((p) => p.role !== 'depicted').length > 0 ? (
          <ul className="jg-chips">
            {people.filter((p) => p.role !== 'depicted').map((p) => (
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
          <p className="jg-note">그 밖의 역할로 걸린 인물이 없습니다.</p>
        )}

        <form action={linkPerson} className="edit-form">
          <input type="hidden" name="item_id" value={id} />
          <div className="form-grid">
            <Field
              label="인물"
              code="dc:contributor"
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
              defaultValue="photographer"
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
        <h2 className="sec-title jg-pixel">이야기</h2>
        {collections.length > 0 ? (
          <ul className="jg-chips">
            {collections.map((c) => (
              <li key={c.id}>{c.title}</li>
            ))}
          </ul>
        ) : (
          <p className="jg-note">들어간 이야기가 없습니다.</p>
        )}

        <form action={addToCollection} className="edit-form">
          <input type="hidden" name="item_id" value={id} />
          <div className="form-grid">
            <Field
              label="이야기"
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
