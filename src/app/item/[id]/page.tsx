import Link from 'next/link';
import { notFound } from 'next/navigation';
import { getItem, thumbsFor } from '@/lib/queries';
import { currentRole, canView, lockLabel, ACCESS_LABELS } from '@/lib/access';
import { parseEdtf } from '@/lib/edtf';
import { ItemTile } from '@/components/ItemTile';
import { TYPE_LABELS, IconLock } from '@/components/icons';

export const dynamic = 'force-dynamic';

const PERSON_ROLE_LABELS: Record<string, string> = {
  depicted: '찍힘',
  photographer: '찍음',
  author: '씀',
  recipient: '받음',
  speaker: '말함',
  mentioned: '언급됨',
};

/**
 * 자료 상세 — 원본 옆에 해설을 나란히.
 *
 * 상속받은 값은 어디서 왔는지 함께 보여준다. "이 사진의 출처가 무엇인가"
 * 못지않게 "그게 어디에 적힌 값인가"가 기록의 신뢰를 만든다.
 */
export default async function ItemPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const role = await currentRole();
  const detail = await getItem(id);
  if (!detail) notFound();

  const { item, files, people, place, collections, transcript, siblings } = detail;
  const visible = canView(item.access_level, role);

  if (!visible) {
    return (
      <main className="wrap narrow">
        <div className="box stack">
          <div className="row">
            <IconLock size={12} />
            <h2>{lockLabel(item.access_level)}</h2>
          </div>
          <p className="small">
            이 자료는 {ACCESS_LABELS[item.access_level]} 등급입니다. 가족 로그인 후 다시 시도해
            주세요.
          </p>
          <div className="row">
            <Link href="/login" className="btn">
              가족 로그인
            </Link>
            <Link href="/" className="btn ghost">
              연표로
            </Link>
          </div>
        </div>
      </main>
    );
  }

  const display = files.find((f) => f.role === 'display') ?? files.find((f) => f.role === 'thumb');
  const original = files.find((f) => f.role === 'original');
  const parsed = parseEdtf(item.created_edtf);
  const sibThumbs = await thumbsFor(siblings.map((s) => s.id));

  const isPlayable = item.type === 'Sound' || item.type === 'MovingImage';

  return (
    <main className="wrap">
      <div className="row">
        <span className="eyebrow">{TYPE_LABELS[item.type] ?? item.type}</span>
        <span className="eyebrow dim">{item.identifier}</span>
        {item.access_level !== 'public' && (
          <span className="chip mint">
            <IconLock size={10} />
            {ACCESS_LABELS[item.access_level]}
          </span>
        )}
        {item.is_featured && <span className="chip accent">대표</span>}
      </div>

      <div className="detail">
        <div className="stage">
          {display ? (
            <span className="tile">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={`/media/${display.id}`} alt={item.title} />
            </span>
          ) : isPlayable && original ? (
            item.type === 'Sound' ? (
              <audio controls src={`/media/${original.id}`} style={{ width: '100%' }} />
            ) : (
              <video controls src={`/media/${original.id}`} style={{ width: '100%' }} />
            )
          ) : (
            <div className="panel">
              <p className="small">
                이 자료에는 화면용 사본이 없습니다. 원본은 보관되어 있습니다.
              </p>
            </div>
          )}

          <div className="stack-s">
            <h1 style={{ fontSize: 24 }}>{item.title}</h1>
            <p className="small">
              {parsed.label}
              {place && ` · ${place.family_name}`}
              {item.medium && ` · ${item.medium}`}
              {item.extent && ` · ${item.extent}`}
            </p>
            {item.description && <p style={{ fontSize: 14, color: 'var(--text-2)' }}>{item.description}</p>}
          </div>

          {transcript && transcript.segments.length > 0 && (
            <div className="panel">
              <h5>
                전사 {transcript.reviewed ? '· 교정 완료' : '· 자동(교정 전)'}
              </h5>
              <div className="transcript">
                {transcript.segments.map((s, idx) => (
                  <div className="line" key={idx}>
                    <span className="t">{formatMs(s.start_ms)}</span>
                    <span>{s.text}</span>
                  </div>
                ))}
              </div>
              {!transcript.reviewed && (
                <p className="small" style={{ marginTop: '0.4rem' }}>
                  자동 전사본입니다. 잘못 받아적힌 부분이 있을 수 있습니다.
                </p>
              )}
            </div>
          )}
        </div>

        <aside className="side">
          <div className="panel">
            <h5>기술 정보</h5>
            <dl className="meta-list">
              <dt>시기</dt>
              <dd>
                {parsed.label}
                {item.created_edtf && <span className="dim"> · {item.created_edtf}</span>}
              </dd>
              <dt>유형</dt>
              <dd>{TYPE_LABELS[item.type] ?? item.type}</dd>
              {item.creator && (
                <>
                  <dt>기록자</dt>
                  <dd>{item.creator}</dd>
                </>
              )}
              <dt>출처</dt>
              <dd>
                {item.source ?? '—'}
                {!item.source_overridden && <span className="inh"> (묶음에서 상속)</span>}
              </dd>
              {item.provenance && (
                <>
                  <dt>입수 경위</dt>
                  <dd>
                    {item.provenance}
                    {!item.provenance_overridden && <span className="inh"> (상속)</span>}
                  </dd>
                </>
              )}
              {place && (
                <>
                  <dt>장소</dt>
                  <dd>
                    {place.family_name}
                    {place.admin_name && <span className="dim"> · {place.admin_name}</span>}
                    {!item.place_overridden && <span className="inh"> (상속)</span>}
                  </dd>
                </>
              )}
              {item.rights && (
                <>
                  <dt>권리</dt>
                  <dd>
                    {item.rights}
                    {!item.rights_overridden && <span className="inh"> (상속)</span>}
                  </dd>
                </>
              )}
              <dt>묶음</dt>
              <dd>{item.bundle_title}</dd>
            </dl>
          </div>

          {people.length > 0 && (
            <div className="panel">
              <h5>이 자료 속 사람</h5>
              <div className="people">
                {people.map((p) => (
                  <Link key={`${p.id}-${p.role}`} href={`/people/${p.id}`} className="person">
                    {p.display_name}
                    <span className="dim"> · {PERSON_ROLE_LABELS[p.role] ?? p.role}</span>
                  </Link>
                ))}
              </div>
            </div>
          )}

          {collections.length > 0 && (
            <div className="panel">
              <h5>이야기 모음집</h5>
              <div className="people">
                {collections.map((c) => (
                  <Link key={c.id} href={`/collections/${c.id}`} className="person">
                    {c.title}
                  </Link>
                ))}
              </div>
            </div>
          )}

          {role === 'admin' && (
            <div className="panel">
              <h5>관리자</h5>
              <div className="row">
                <Link href={`/admin/items/${item.id}`} className="btn small">
                  기술 편집
                </Link>
                {original && (
                  <a href={`/media/${original.id}`} className="btn small ghost">
                    원본 내려받기
                  </a>
                )}
              </div>
            </div>
          )}
        </aside>
      </div>

      {siblings.length > 0 && (
        <section className="stack">
          <div className="rule" />
          <h2>같은 묶음의 다른 자료</h2>
          <p className="small">{item.bundle_title}</p>
          <div className="grid">
            {siblings.map((s) => (
              <div className="cell" key={s.id}>
                <ItemTile
                  id={s.id}
                  title={s.title}
                  type={s.type}
                  accessLevel={s.access_level}
                  visible={canView(s.access_level, role)}
                  thumbFileId={sibThumbs.get(s.id)}
                  aspect="1"
                />
                <span className="cap">{parseEdtf(s.created_edtf).label}</span>
              </div>
            ))}
          </div>
        </section>
      )}
    </main>
  );
}

function formatMs(ms: number) {
  const total = Math.floor(ms / 1000);
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}
