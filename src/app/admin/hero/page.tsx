import { requireAdmin } from '@/lib/access';
import { getHeroSchedule } from '@/lib/admin-curation';
import { setHeroSlot } from '@/app/admin/actions';
import HeroSchedule from '@/components/curation/HeroSchedule';
import Notice from '@/components/admin/Notice';

export const dynamic = 'force-dynamic';

/**
 * 첫 화면 편성.
 *
 * 자리는 셋이고, 자리마다 직접 고른 이야기를 걸거나 자동 큐레이션에
 * 맡긴다. 둘을 동시에 채우지 못한다 — 어느 쪽이 참인지 판단할 근거가
 * 없기 때문이고, DB 가 그것을 막는다.
 *
 * 기간을 주면 그 사이에만 걸린다. 지난 자리는 자동 큐레이션이 대신
 * 채우므로 첫 화면이 비는 일은 없다.
 */
export default async function HeroAdminPage() {
  await requireAdmin();
  const { rows, stories } = await getHeroSchedule();

  const today = new Date().toISOString().slice(0, 10);

  return (
    <div className="page-admin">
      <section className="admin-sec">
        <h1 className="sec-title jg-pixel">첫 화면 편성</h1>

        {stories.length === 0 ? (
          <Notice tone="info" title="걸 이야기가 없습니다">
            이야기를 먼저 엮으면 자리에 걸 수 있습니다. 그때까지는 자동
            큐레이션이 세 자리를 채웁니다.
          </Notice>
        ) : null}

        <HeroSchedule
          rows={rows.map((r) => {
            const story = stories.find((s) => s.id === r.collectionId);
            const live =
              (!r.startsOn || r.startsOn <= today) && (!r.endsOn || r.endsOn >= today);
            return {
              slot: r.slot,
              collectionId: r.collectionId,
              title: story?.title ?? null,
              href: story ? `/admin/curation/${story.id}` : null,
              autoKind: r.autoKind,
              startsOn: r.startsOn,
              endsOn: r.endsOn,
              // 컴포넌트는 StatusBadge 와 같은 어휘를 쓴다. 걸려 있으면 public,
              // 기간 밖이면 scheduled, 빈 자리는 private 로 흐리게 둔다.
              status: (!r.collectionId && !r.autoKind
                ? 'private'
                : live
                  ? 'public'
                  : 'scheduled') as 'public' | 'private' | 'scheduled',
              statusLabel: !r.collectionId && !r.autoKind
                ? '비어 있음'
                : live
                  ? '걸려 있음'
                  : '기간 밖',
            };
          })}
          collections={stories}
          saveAction={setHeroSlot}
        />

        <p className="jg-note">
          자동 큐레이션은 셋입니다. <strong>오늘 N년 전</strong>은 오늘과 월·일이
          같고 날짜가 확인된 자료를 찾습니다 — 추정 날짜로는 그 숫자를 말하지
          않습니다. <strong>새로 들어온 기록</strong>은 가장 최근 묶음을,{' '}
          <strong>가장 최근 이야기</strong>는 마지막으로 엮은 이야기를 겁니다.
        </p>
      </section>
    </div>
  );
}
