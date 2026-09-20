import Link from 'next/link';
import { db } from '@/lib/db';
import { requireAdmin } from '@/lib/access';
import { thumbsFor } from '@/lib/queries';
import { num } from '@/lib/ui';
import type { AccessLevel } from '@/lib/session';
import StatusBadge from '@/components/admin/StatusBadge';
import { Thumb, TypeTag } from '@/components/search/parts';

export const dynamic = 'force-dynamic';

/**
 * 관리자 첫 화면은 대시보드가 아니라 작업 대기열이다.
 * "무엇이 아직 기술되지 않았는가"가 이 아카이브의 진짜 진행률이다.
 */
export default async function AdminHome() {
  await requireAdmin();
  const supabase = db();

  const [totalRes, undatedRes, untitledRes, unfeaturedRes, bundleRes, recentRes] = await Promise.all([
    supabase.from('item').select('id', { count: 'exact', head: true }).eq('is_archived', false),
    supabase
      .from('item')
      .select('id', { count: 'exact', head: true })
      .is('created_start', null)
      .eq('is_archived', false),
    supabase
      .from('item')
      .select('id', { count: 'exact', head: true })
      .is('description', null)
      .eq('is_archived', false),
    supabase
      .from('item')
      .select('id', { count: 'exact', head: true })
      .eq('is_featured', true)
      .eq('is_archived', false),
    supabase.from('bundle').select('id', { count: 'exact', head: true }).eq('is_archived', false),
    supabase
      .from('item_effective')
      .select('*')
      .is('created_start', null)
      .eq('is_archived', false)
      .order('submitted_at', { ascending: false })
      .limit(12),
  ]);

  const needsWork = recentRes.data ?? [];
  const thumbs = await thumbsFor(needsWork.map((i) => i.id));

  // 숫자 다섯은 성적표가 아니라 할 일의 크기다. 카드로 흩어놓으면 서로
  // 견줄 수 없어서, 한 줄에 한 항목씩 표로 세운다.
  const counts = [
    { key: '전체 자료', n: totalRes.count ?? 0, note: '버리지 않은 것 전부' },
    { key: '묶음', n: bundleRes.count ?? 0, note: '앨범·테이프 같은 원본 단위' },
    { key: '시기 미상', n: undatedRes.count ?? 0, note: '연표에 나타나지 못하는 자료' },
    { key: '설명 없음', n: untitledRes.count ?? 0, note: '무엇인지 적지 않은 자료' },
    { key: '대표 표시', n: unfeaturedRes.count ?? 0, note: '첫 화면에 걸릴 수 있는 자료' },
  ];

  return (
    <div className="page page-admin">
      <section className="admin-sec">
        <h1 className="page-title jg-pixel">무엇이 아직 남았나</h1>
        <p className="page-lead">
          자료를 넣는 것과 기술하는 것은 다른 일입니다. 여기 남아 있는 것이 곧 할 일입니다.
        </p>

        <div className="jg-rtable-wrap">
          <table className="jg-rtable">
            <thead>
              <tr>
                <th>항목</th>
                <th>수</th>
                <th>뜻</th>
              </tr>
            </thead>
            <tbody>
              {counts.map((c) => (
                <tr key={c.key}>
                  <td className="is-title">{c.key}</td>
                  <td className="is-mono">{num(c.n)}</td>
                  <td className="is-muted">{c.note}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

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
        <h2 className="sec-title jg-pixel">시기가 비어 있는 자료</h2>
        <p className="jg-note">
          시기가 없으면 연표에 나타나지 못합니다. 묶음 단위로 한꺼번에 채우는 편이 빠릅니다.
        </p>

        {needsWork.length === 0 ? (
          <div className="empty">
            <p className="jg-pixel">비어 있는 자료가 없다</p>
            <p>기술이 모두 끝났습니다.</p>
          </div>
        ) : (
          <div className="jg-rtable-wrap">
            <table className="jg-rtable">
              <thead>
                <tr>
                  {/* 그림 칸은 머리글을 비운다 — 읽어줄 이름이 없는 칸이다. */}
                  <th aria-label="그림" />
                  <th>자료</th>
                  <th>형태</th>
                  <th>공개 범위</th>
                  <th>들어온 날</th>
                </tr>
              </thead>
              <tbody>
                {needsWork.map((i) => (
                  <tr key={i.id}>
                    <td>
                      {/* 자료 고르기 화면과 같은 56×42 칸. 표 안에서 크기를
                          정해주지 않으면 Thumb 이 높이를 잡지 못한다. */}
                      <div className="jg-picker-thumb">
                        <Thumb
                          src={thumbs.has(i.id) ? `/media/${thumbs.get(i.id)}` : null}
                          type={i.type}
                          alt={i.title}
                        />
                      </div>
                    </td>
                    <td className="is-title">
                      <Link href={`/admin/items/${i.id}`}>{i.title}</Link>
                    </td>
                    <td>
                      <TypeTag type={i.type} />
                    </td>
                    <td>
                      <StatusBadge level={i.access_level as AccessLevel} />
                    </td>
                    <td className="is-mono is-muted">
                      {i.submitted_at ? String(i.submitted_at).slice(0, 10) : '—'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
