import Link from 'next/link';
import { db } from '@/lib/db';
import { requireAdmin } from '@/lib/access';
import { num } from '@/lib/ui';
import type { AccessLevel } from '@/lib/session';
import Field from '@/components/admin/Field';
import Notice from '@/components/admin/Notice';
import RecordTable, { type RecordTableRow } from '@/components/admin/RecordTable';
import { archiveItems, bulkUpdateItems, moveItemsToBundle } from './actions';

export const dynamic = 'force-dynamic';

/** 한 쪽에 세우는 줄 수. 훑어보는 화면이라 넉넉히 둔다. */
const PAGE_SIZE = 100;

const ACCESS_CHOICES: { value: string; label: string }[] = [
  { value: '', label: '— 그대로 —' },
  { value: 'family', label: '가족' },
  { value: 'public', label: '공개' },
  { value: 'private', label: '비공개' },
];

/**
 * 관리 첫 화면은 대시보드가 아니라 기록 목록이다.
 * 전체를 한자리에서 훑고, 고른 것을 한꺼번에 처리하는 곳이다.
 *
 * 일괄 처리에 쓸 값(공개 범위·묶음)은 표 위의 칸에서 주소로 넘어온다.
 * RecordTable 의 폼 안에는 칸을 끼워 넣을 수 없으므로, 고른 값을 서버
 * 액션이 품고 있다가 눌린 단추(op)에 따라 적용한다.
 */
export default async function AdminHome({
  searchParams,
}: {
  searchParams: Promise<{ todo?: string; access_level?: string; bundle_id?: string }>;
}) {
  await requireAdmin();
  const { todo, access_level: access, bundle_id: bundle } = await searchParams;
  const onlyTodo = todo === '1';
  const supabase = db();

  const listQuery = supabase
    .from('item_effective')
    .select('id, title, type, access_level, modified_at, created_start')
    .eq('is_archived', false)
    .order('modified_at', { ascending: false })
    .limit(PAGE_SIZE);
  if (onlyTodo) listQuery.eq('is_featured', false);

  const [totalRes, todoRes, listRes, bundleRes] = await Promise.all([
    supabase
      .from('item')
      .select('id', { count: 'exact', head: true })
      .eq('is_archived', false),
    supabase
      .from('item')
      .select('id', { count: 'exact', head: true })
      .eq('is_featured', false)
      .eq('is_archived', false),
    listQuery,
    supabase
      .from('bundle')
      .select('id, title')
      .eq('is_archived', false)
      .order('created_at', { ascending: false }),
  ]);

  const total = (onlyTodo ? todoRes.count : totalRes.count) ?? 0;
  const todoCount = todoRes.count ?? 0;
  const bundles = bundleRes.data ?? [];

  const rows: RecordTableRow[] = (listRes.data ?? []).map((i) => ({
    id: String(i.id),
    title: String(i.title ?? '제목 없음'),
    href: `/admin/items/${i.id}`,
    type: String(i.type),
    access: i.access_level as AccessLevel,
    updated: i.modified_at ? String(i.modified_at).slice(0, 10) : '—',
    // 시기가 없으면 연표에 나타나지 못한다 — 줄에서 바로 보이게 덧말로 단다.
    note: i.created_start ? undefined : '시기 미상',
  }));

  /**
   * RecordTable 이 보내는 폼을 액션 셋에 맞춰 옮겨 담는다.
   * 표는 고른 id 를 name="id" 로, 눌린 단추를 name="op" 로 보내고,
   * 세 액션은 모두 item_ids 를 읽으므로 여기서 이름을 바꿔 싣는다.
   *
   * 적용할 값은 표 위 칸에서 주소로 넘어온다 — RecordTable 의 <form> 안에
   * 칸을 끼워 넣을 자리가 없어서다(폼은 겹칠 수 없다).
   */
  async function applyBulk(formData: FormData) {
    'use server';
    await requireAdmin();
    const op = String(formData.get('op') ?? '');
    const next = new FormData();
    for (const id of formData.getAll('id')) next.append('item_ids', String(id));

    if (op === 'archive') return archiveItems(next);
    if (op === 'bundle') {
      next.set('bundle_id', bundle ?? '');
      return moveItemsToBundle(next);
    }
    next.set('bundle_id', bundle ?? '');
    next.set('access_level', access ?? '');
    return bulkUpdateItems(next);
  }

  return (
    <div className="page page-admin">
      <section className="admin-sec">
        <h1 className="page-title jg-pixel">기록 목록</h1>
        <p className="page-lead">
          들어온 기록 전부가 여기 있습니다. 골라서 한꺼번에 공개 범위를 바꾸거나, 묶음을 옮기거나,
          보관으로 내릴 수 있습니다.
        </p>

        {todoCount > 0 && (
          <Notice tone="info" title={`아직 기술되지 않은 기록 ${num(todoCount)}건`}>
            <p>
              기록을 넣는 것과 기술하는 것은 다른 일입니다. 남아 있는 것이 곧 할 일입니다.{' '}
              {onlyTodo ? (
                <Link href="/admin">전체 보기 →</Link>
              ) : (
                <Link href="/admin?todo=1">남은 것만 보기 →</Link>
              )}
            </p>
          </Notice>
        )}

        <div className="form-actions">
          <Link href="/admin/acquisitions" className="jg-btn jg-btn-primary">
            수집 세션 만들기
          </Link>
          <Link href="/admin/bundles" className="jg-btn jg-btn-secondary">
            묶음 목록
          </Link>
        </div>
      </section>

      <section className="admin-sec">
        <h2 className="sec-title jg-pixel">일괄 처리 값</h2>
        <p className="jg-note">
          여기서 고른 값이 아래 표의 일괄 단추에 쓰입니다. 먼저 값을 정해 두고, 표에서 줄을 고른 뒤
          단추를 누릅니다.
        </p>
        {/* 주소로 값을 넘긴다 — 무엇이 적용될지 주소에 남아 눈으로 확인된다. */}
        <form method="get" className="edit-form">
          {onlyTodo && <input type="hidden" name="todo" value="1" />}
          <div className="form-grid">
            <Field
              label="공개 범위"
              code="dcterms:accessRights"
              name="access_level"
              type="select"
              options={ACCESS_CHOICES}
              defaultValue={access ?? ''}
              help="고른 기록의 공개 범위를 이 값으로 바꿉니다."
            />
            <Field
              label="묶음"
              name="bundle_id"
              type="select"
              options={[
                { value: '', label: '— 그대로 —' },
                ...bundles.map((b) => ({ value: String(b.id), label: String(b.title) })),
              ]}
              defaultValue={bundle ?? ''}
              help="고른 기록을 이 묶음으로 옮깁니다."
            />
          </div>
          <div className="form-actions">
            <button type="submit" className="jg-btn jg-btn-secondary">
              값 정하기
            </button>
          </div>
        </form>
      </section>

      <section className="admin-sec">
        <h2 className="sec-title jg-pixel">
          {onlyTodo ? '아직 기술되지 않은 기록' : '모든 기록'} {num(total)}건
        </h2>

        {rows.length === 0 ? (
          <div className="empty">
            <p className="jg-pixel">아직 기록이 없다</p>
            <p>수집 세션을 만들고 묶음을 붙이면 여기에 쌓입니다.</p>
          </div>
        ) : (
          <RecordTable rows={rows} total={total} action={applyBulk} />
        )}
      </section>
    </div>
  );
}
