import Link from 'next/link';
import { notFound } from 'next/navigation';
import { requireAdmin } from '@/lib/access';
import { getStoryEditor, pickItems, BLOCK_KINDS } from '@/lib/admin-curation';
import { updateStory, addBlock, updateBlock, moveBlock, removeBlock, addRef, removeRef } from '@/app/admin/actions';
import Field from '@/components/admin/Field';
import CurationBlock from '@/components/curation/CurationBlock';
import RecordPicker from '@/components/curation/RecordPicker';

export const dynamic = 'force-dynamic';

/**
 * 이야기 편집.
 *
 * 왼쪽에 블록을 쌓고, 오른쪽에서 자료를 골라 넣는다. 프로토타입은
 * 드래그로 순서를 바꿨지만 여기서는 ↑↓ 버튼을 쓴다 — 드래그는 자바스크립트
 * 없이는 되지 않고, 블록이 스무 개를 넘는 이야기는 없을 것이다.
 *
 * 고른 블록은 주소에 남는다(`?block=`). 자료를 넣을 때 어느 블록에 넣는지가
 * 분명해야 하고, 새로고침해도 하던 자리로 돌아와야 한다.
 */
export default async function StoryEditorPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ block?: string; q?: string }>;
}) {
  await requireAdmin();
  const { id } = await params;
  const { block: blockParam, q } = await searchParams;

  const story = await getStoryEditor(id);
  if (!story) notFound();

  // 고른 블록이 없으면 자료를 받을 수 있는 첫 블록을 고른다.
  const takesRefs = (k: string) => k === 'record' || k === 'gallery' || k === 'timeline' || k === 'quote';
  const selected =
    story.blocks.find((b) => b.id === blockParam) ??
    story.blocks.find((b) => takesRefs(b.kind)) ??
    null;

  const picks = selected ? await pickItems(q) : [];
  const already = new Set(selected?.refs.map((r) => r.itemId) ?? []);

  return (
    <div className="page-admin">
      <section className="admin-sec">
        <div className="block-head">
          <h1 className="sec-title jg-pixel">{story.title}</h1>
          <Link href={`/stories/${story.id}`}>이야기 보기 →</Link>
        </div>

        <form action={updateStory} className="edit-form">
          <input type="hidden" name="collection_id" value={story.id} />
          <div className="form-grid">
            <Field label="제목" name="title" defaultValue={story.title} required />
            <Field label="시기" code="dcterms:temporal" name="period_edtf" mono
                   defaultValue={story.periodEdtf ?? ''} />
            <Field label="한 줄 소개" name="summary" type="textarea" rows={2} className="span2"
                   defaultValue={story.summary ?? ''} />
            <Field label="표지 자료" name="cover_item_id" mono className="span2"
                   defaultValue={story.coverItemId ?? ''}
                   help="자료의 id. 아래에서 자료를 고르면 그 id 를 볼 수 있습니다." />
          </div>
          <div className="form-actions">
            <button type="submit" className="jg-btn jg-btn-primary">저장</button>
          </div>
        </form>
      </section>

      <div className="cur-layout">
        <div className="cur-blocks">
          <h2 className="sec-title jg-pixel">블록</h2>

          {story.blocks.length === 0 ? (
            <div className="empty">
              <p className="jg-pixel">블록이 없다</p>
              <p>아래에서 종류를 골라 하나 얹어 보세요.</p>
            </div>
          ) : (
            story.blocks.map((b, i) => (
              <div key={b.id}>
                <CurationBlock
                  id={b.id}
                  position={i + 1}
                  kind={b.kind}
                  text={b.body}
                  caption={b.caption}
                  refs={b.refs.map((r) => r.title)}
                  thumbs={b.refs.map((r) => r.thumb).filter((t): t is string => Boolean(t))}
                  count={b.refs.length}
                  selected={selected?.id === b.id}
                  first={i === 0}
                  last={i === story.blocks.length - 1}
                  moveAction={moveBlock}
                  removeAction={removeBlock}
                />

                {/* 블록마다 제 내용을 고치는 작은 폼. 종류에 따라 칸이 다르다. */}
                <form action={updateBlock} className="edit-form">
                  <input type="hidden" name="block_id" value={b.id} />
                  <input type="hidden" name="collection_id" value={story.id} />
                  <div className="form-grid">
                    {b.kind === 'text' || b.kind === 'heading' || b.kind === 'quote' ? (
                      <Field
                        label={b.kind === 'heading' ? '소제목' : b.kind === 'quote' ? '인용문' : '글'}
                        name="body"
                        type={b.kind === 'heading' ? 'text' : 'textarea'}
                        rows={b.kind === 'quote' ? 2 : 4}
                        className="span2"
                        defaultValue={b.body ?? ''}
                      />
                    ) : (
                      <Field label="설명글" name="caption" className="span2"
                             defaultValue={b.caption ?? ''} />
                    )}

                    {b.kind === 'quote' ? (
                      <>
                        <Field label="말한 사람" name="speaker_id" type="select"
                               defaultValue={b.speakerId ?? ''}
                               options={[
                                 { value: '', label: '(고르지 않음)' },
                                 ...story.people.map((p) => ({ value: p.id, label: p.name })),
                               ]} />
                        <Field label="녹음의 지점" name="timecode_ms" mono
                               defaultValue={b.timecodeMs != null ? String(b.timecodeMs) : ''}
                               help="밀리초. 412000 이면 6분 52초." />
                      </>
                    ) : null}
                  </div>
                  <div className="form-actions">
                    <button type="submit" className="jg-btn jg-btn-secondary">이 블록 저장</button>
                    {takesRefs(b.kind) && selected?.id !== b.id ? (
                      <Link className="jg-btn jg-btn-text"
                            href={`/admin/curation/${story.id}?block=${b.id}`}>
                        이 블록에 자료 넣기
                      </Link>
                    ) : null}
                  </div>
                </form>

                {/* 이 블록에 들어간 자료. 빼는 것도 여기서. */}
                {b.refs.length > 0 ? (
                  <ul className="jg-chips">
                    {b.refs.map((r) => (
                      <li key={r.itemId}>
                        {r.title}
                        <form action={removeRef} style={{ display: 'inline' }}>
                          <input type="hidden" name="block_id" value={b.id} />
                          <input type="hidden" name="item_id" value={r.itemId} />
                          <input type="hidden" name="collection_id" value={story.id} />
                          <button type="submit" className="jg-btn jg-btn-text" aria-label={`${r.title} 빼기`}>
                            ✕
                          </button>
                        </form>
                      </li>
                    ))}
                  </ul>
                ) : null}
              </div>
            ))
          )}

          <div className="cur-add">
            <p className="cur-add-row">블록 얹기</p>
            {BLOCK_KINDS.map((k) => (
              <form key={k.key} action={addBlock} style={{ display: 'inline' }}>
                <input type="hidden" name="collection_id" value={story.id} />
                <input type="hidden" name="kind" value={k.key} />
                <button type="submit" className="cur-add-btn jg-btn jg-btn-secondary" title={k.hint}>
                  {k.label}
                </button>
              </form>
            ))}
          </div>
        </div>

        <aside className="cur-side">
          <div className="cur-panel">
            {selected ? (
              <RecordPicker
                title={`${BLOCK_KINDS.find((k) => k.key === selected.kind)?.label ?? ''} 블록에 넣기`}
                items={picks.map((p) => ({
                  id: p.id,
                  title: p.title,
                  identifier: p.identifier,
                  date: p.date,
                  type: p.type,
                  thumb: p.thumb,
                  added: already.has(p.id),
                }))}
                query={q}
                searchAction={`/admin/curation/${story.id}`}
                hidden={{ block: selected.id }}
                addAction={addRef}
                blockId={selected.id}
              />
            ) : (
              <p className="jg-note">
                자료를 받을 수 있는 블록(기록·사진 묶음·구술 인용·연표)을 먼저 얹으세요.
              </p>
            )}
          </div>
        </aside>
      </div>
    </div>
  );
}
