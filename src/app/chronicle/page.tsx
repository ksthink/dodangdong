import Link from 'next/link';
import { getChronicle } from '@/lib/chronicle';
import { currentRole } from '@/lib/access';
import { num } from '@/lib/ui';
import DecadeNav from '@/components/chronicle/DecadeNav';
import LifeLanes from '@/components/chronicle/LifeLanes';
import ChronicleYear from '@/components/chronicle/ChronicleYear';

export const dynamic = 'force-dynamic';

export const metadata = {
  title: '연표 — 도당동 아카이브',
  description: '집안의 일을 해마다 펼쳐 본다. 그때 누가 몇 살이었는지와 함께.',
};

/**
 * 연표.
 *
 * 분류가 "무엇을·어디서 나온·무엇에 관한" 것으로 찾는 길이라면, 이쪽은
 * "언제, 그때 누가 몇 살이었나"로 찾는 길이다.
 *
 * 세 층을 위에서 아래로 쌓는다. 연대 막대에서 10년을 고르면 그 연대의
 * 해들만 아래에 펼쳐진다 — 한 화면에 100년을 쏟지 않으려는 것이다.
 * 고른 연대는 주소에 남으므로 가족끼리 주고받을 수 있다.
 */
export default async function ChroniclePage({
  searchParams,
}: {
  searchParams: Promise<{ decade?: string }>;
}) {
  const { decade } = await searchParams;
  const role = await currentRole();

  const picked = decade && /^\d{4}$/.test(decade) ? Number(decade) : undefined;
  const data = await getChronicle(role, picked);

  if (data.decades.length === 0) {
    return (
      <main className="wrap">
        <section className="page-head">
          <h1 className="page-title jg-pixel">연표</h1>
        </section>
        <div className="box">
          <p>날짜가 붙은 기록이 아직 없습니다.</p>
          <p className="small">
            기록에 생산일자를 적으면 여기에 해마다 쌓입니다.
            {data.undatedCount > 0 ? ` 지금 시기 미상인 기록이 ${num(data.undatedCount)}건 있습니다.` : ''}
          </p>
        </div>
      </main>
    );
  }

  return (
    <main className="wrap">
      <section className="page-head">
        <h1 className="page-title jg-pixel">연표</h1>
        <p className="page-lead">
          집안의 일을 해마다 펼쳐 봅니다. 연대를 고르면 그 열 해가 아래에 펼쳐집니다.
        </p>
      </section>

      <DecadeNav decades={data.decades} />

      {data.lanes.length > 0 ? (
        <section className="chron-lanes">
          <LifeLanes
            lanes={data.lanes}
            from={data.from}
            to={data.to}
            cursor={data.cursor}
            label="가족 생애 연표"
          />
        </section>
      ) : null}

      <section className="chron-years">
        {data.years.map((y) => (
          <ChronicleYear key={y.year} data={y} />
        ))}
      </section>

      {data.undatedCount > 0 ? (
        <p className="small dim">
          시기가 밝혀지지 않은 기록이 {num(data.undatedCount)}건 있습니다. 연표에는 자리가 없어
          빠져 있습니다 — <Link href="/search">기록 찾기</Link>에서 볼 수 있습니다.
        </p>
      ) : null}
    </main>
  );
}
