import Link from 'next/link';
import { getTimeline, thumbsFor } from '@/lib/queries';
import { currentRole, canView } from '@/lib/access';
import { parseEdtf } from '@/lib/edtf';
import { maskItem } from '@/lib/mask';
import { ItemTile } from '@/components/ItemTile';
import { TypeIcon, TYPE_LABELS } from '@/components/icons';

export const dynamic = 'force-dynamic';

/**
 * 연표 — 가족이 처음 만나는 화면.
 *
 * 화면을 따로 만드는 게 아니라 dcterms:created 가 있는 자료가 스스로 자리를 잡는다.
 * 시기가 비면 연표에 나타나지 못하므로, 미상 자료는 맨 아래 따로 모아
 * "여기 손볼 것이 있다"는 사실을 관리자와 가족 모두에게 보여준다.
 */
export default async function TimelinePage() {
  const role = await currentRole();
  const { groups, undated } = await getTimeline();

  const allIds = [...groups.flatMap((g) => g.items.map((i) => i.id)), ...undated.map((i) => i.id)];
  const thumbs = await thumbsFor(allIds);

  const total = allIds.length;

  return (
    <main className="wrap">
      <section className="stack">
        <span className="eyebrow">연표</span>
        <h1>생애를 따라 훑어보기</h1>
        <p className="lede">
          연도 위에 자료가 걸립니다. 파란 네모는 관리자가 대표로 표시한 대목입니다.
        </p>
        <div className="row">
          <span className="chip">자료 {total}건</span>
          <span className="chip">연도 {groups.length}개</span>
          {undated.length > 0 && <span className="chip warn">시기 미상 {undated.length}건</span>}
        </div>
      </section>

      {total === 0 ? (
        <div className="box">
          <p>아직 등록된 자료가 없습니다.</p>
          <p className="small">
            관리자 화면에서 수집 세션과 묶음을 만든 뒤 폴더째 올리면 여기에 나타납니다.
          </p>
        </div>
      ) : (
        <section className="tl">
          <div className="tl-spine" />
          {groups.map((g) => {
            const featured = g.items.filter((i) => i.is_featured);
            const lead = featured[0] ?? g.items[0];
            const rest = g.items.filter((i) => i.id !== lead.id);
            const parsed = parseEdtf(lead.created_edtf);
            return (
              <ContinuedGroup
                key={g.year}
                year={g.year!}
                lead={lead}
                leadLabel={parsed.label}
                rest={rest}
                role={role}
                thumbs={thumbs}
              />
            );
          })}
        </section>
      )}

      {undated.length > 0 && (
        <section className="stack">
          <div className="rule" />
          <h2>시기 미상</h2>
          <p className="small">
            연표에 자리를 잡으려면 시기가 필요합니다. 관리자가 EDTF 로 채우면 위로 올라갑니다.
          </p>
          <div className="grid">
            {undated.slice(0, 12).map((i) => (
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
                <span className="cap">
                  {maskItem(i, canView(i.access_level, role)).title}
                </span>
              </div>
            ))}
          </div>
        </section>
      )}
    </main>
  );
}

function ContinuedGroup({
  year,
  lead,
  leadLabel,
  rest,
  role,
  thumbs,
}: {
  year: number;
  lead: Awaited<ReturnType<typeof getTimeline>>['undated'][number];
  leadLabel: string;
  rest: Awaited<ReturnType<typeof getTimeline>>['undated'];
  role: Awaited<ReturnType<typeof currentRole>>;
  thumbs: Map<string, string>;
}) {
  const leadVisible = canView(lead.access_level, role);
  const shown = rest.slice(0, 5);
  const more = rest.length - shown.length;
  // 볼 수 없는 자료는 제목·설명·묶음명까지 가린다. 제목도 내용이다.
  const masked = maskItem(lead, leadVisible);

  return (
    <>
      <div className="tl-year">{year}</div>
      <div className={`tl-item${lead.is_featured ? ' pinned' : ''}`}>
        <h4>
          {leadVisible ? (
            <Link href={`/item/${lead.id}`}>{masked.title}</Link>
          ) : (
            <span className="dim">{masked.title}</span>
          )}
        </h4>
        <div className="row" style={{ gap: '0.5rem' }}>
          <span className="small">{leadLabel}</span>
          {masked.bundleTitle && (
            <>
              <span className="small dim">·</span>
              <span className="small dim">{masked.bundleTitle}</span>
            </>
          )}
        </div>
        {masked.description && <p>{masked.description}</p>}

        <div className="tl-media">
          <ItemTile
            id={lead.id}
            title={lead.title}
            type={lead.type}
            accessLevel={lead.access_level}
            visible={leadVisible}
            thumbFileId={thumbs.get(lead.id)}
            width={96}
            height={72}
          />
          {shown.map((i) => (
            <ItemTile
              key={i.id}
              id={i.id}
              title={i.title}
              type={i.type}
              accessLevel={i.access_level}
              visible={canView(i.access_level, role)}
              thumbFileId={thumbs.get(i.id)}
              width={96}
              height={72}
            />
          ))}
          {more > 0 && (
            <span className="tile" style={{ width: 96, height: 72, display: 'grid', placeItems: 'center' }}>
              <span className="small">+{more}</span>
            </span>
          )}
        </div>

        <div className="row" style={{ gap: '0.7rem' }}>
          {typeSummary([lead, ...rest]).map(([type, n]) => (
            <span key={type} className="small" style={{ display: 'inline-flex', alignItems: 'center', gap: '0.25rem' }}>
              <TypeIcon type={type} size={11} />
              {TYPE_LABELS[type] ?? type} {n}
            </span>
          ))}
        </div>
      </div>
    </>
  );
}

function typeSummary(items: { type: string }[]): [string, number][] {
  const counts: Record<string, number> = {};
  for (const i of items) counts[i.type] = (counts[i.type] ?? 0) + 1;
  return Object.entries(counts).sort((a, b) => b[1] - a[1]);
}
