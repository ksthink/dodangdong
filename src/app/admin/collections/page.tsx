import Link from 'next/link';
import { db } from '@/lib/db';
import { requireAdmin } from '@/lib/access';
import { num } from '@/lib/ui';
import Field from '@/components/admin/Field';
import Notice from '@/components/admin/Notice';
import { createCollection } from '../actions';

export const dynamic = 'force-dynamic';

/**
 * 모음집 관리.
 * 묶음(원본이 어디 있었나)과 다른 축이다 — 이쪽은 "무엇에 관한 이야기인가".
 *
 * 같은 collection 표에 이야기(kind='story')도 들어 있다. 이야기는 블록을
 * 쌓아 글을 짓는 것이라 편집 화면이 따로 있고(/admin/curation), 여기서는
 * 주제·사건만 만든다. 목록은 표 전체를 그대로 보여준다 — 이야기를 숨기면
 * "왜 내가 만든 것이 안 보이나"가 되고, 감춘 줄을 모른 채 같은 제목을
 * 두 번 만들게 된다.
 */
export default async function AdminCollectionsPage() {
  await requireAdmin();
  const supabase = db();

  const { data: collections } = await supabase
    .from('collection')
    .select('id, title, kind, description, period_edtf')
    .order('sort_order');

  const { data: links } = await supabase.from('item_collection').select('collection_id');
  const counts = new Map<string, number>();
  for (const l of links ?? []) counts.set(l.collection_id, (counts.get(l.collection_id) ?? 0) + 1);

  return (
    <div className="page page-admin">
      <section className="admin-sec">
        <h1 className="page-title jg-pixel">모음집</h1>
        <p className="page-lead">
          자료는 묶음 하나에 속하지만, 모음집에는 여럿에 들어갈 수 있습니다. 자료 상세 화면에서
          넣습니다.
        </p>

        {(collections ?? []).length === 0 ? (
          <div className="empty">
            <p className="jg-pixel">아직 모음집이 없다</p>
            <p>아래에서 하나 만들어 보세요.</p>
          </div>
        ) : (
          <div className="jg-rtable-wrap">
            <table className="jg-rtable">
              <thead>
                <tr>
                  <th>제목</th>
                  <th>종류</th>
                  <th>시기</th>
                  <th>엮인 자료</th>
                </tr>
              </thead>
              <tbody>
                {(collections ?? []).map((c) => {
                  const isStory = c.kind === 'story';
                  return (
                    <tr key={c.id}>
                      <td className="is-title">
                        {/* 이야기는 편집하는 곳이 다르므로 링크도 그쪽으로 보낸다. */}
                        <Link href={isStory ? `/admin/curation/${c.id}` : `/collections/${c.id}`}>
                          {c.title}
                        </Link>
                        {c.description ? <span className="jg-note">{c.description}</span> : null}
                      </td>
                      <td className="is-muted">
                        {isStory ? '이야기' : c.kind === 'event' ? '사건' : '주제'}
                      </td>
                      <td className="is-mono is-muted">{c.period_edtf ?? '—'}</td>
                      <td className="is-mono">{num(counts.get(c.id) ?? 0)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section className="admin-sec">
        <h2 className="sec-title jg-pixel">모음집 만들기</h2>

        <Notice tone="info" title="이야기는 여기서 만들지 않습니다">
          여기서 만드는 것은 주제와 사건, 즉 자료를 모아두는 자리뿐입니다. 글을 붙여 엮는{' '}
          <Link href="/admin/curation">이야기</Link>는 블록 편집기가 따로 있습니다.
        </Notice>

        <form action={createCollection} className="edit-form">
          <div className="form-grid">
            <Field label="제목" name="title" required placeholder="할머니의 부엌" />
            <Field
              label="종류"
              name="kind"
              type="select"
              defaultValue="topic"
              options={[
                { value: 'topic', label: '주제 모음집' },
                { value: 'event', label: '사건' },
              ]}
              help="주제는 이어지는 것, 사건은 한 번 있었던 일입니다."
            />
            <Field label="시기" code="dcterms:temporal" name="period_edtf" mono
                   placeholder="1958/1990"
                   help="EDTF 로 적습니다 — 1958/1990, 1978-05-14" />
            <Field label="설명" name="description" type="textarea" rows={2} className="span2"
                   help="모음집 화면 맨 위에 쓰입니다." />
          </div>
          <div className="form-actions">
            <button type="submit" className="jg-btn jg-btn-primary">만들기</button>
          </div>
        </form>
      </section>
    </div>
  );
}
