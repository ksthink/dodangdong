import { cx } from '@/lib/ui';
import type { Lane } from '@/lib/chronicle';

/**
 * 생애 레인.
 *
 * 한 줄에 한 사람. 가로축은 서기 연도 하나로 공유한다 — 그래야 "할머니가
 * 혼인하던 해에 외할아버지는 군대에 있었다" 같은 것이 한눈에 보인다.
 * 사람마다 따로 그린 연표를 나란히 두는 것과는 다르다.
 *
 * 띠는 생애 시기(시기분류), 네모는 사건, 점은 기록이다. 날짜가 증빙으로
 * 확인된 사건만 인장색을 얻는다.
 *
 * 추정 날짜는 그 해에 놓는다 — 197X 는 1975, 1975/1979 는 시작 해.
 * 축 위의 위치는 근사일 뿐이고, 정확한 표기는 아래 해별 펼침이 맡는다.
 */

export default function LifeLanes({
  lanes,
  from,
  to,
  cursor,
  label,
}: {
  lanes: Lane[];
  from: number;
  to: number;
  cursor?: number | null;
  label?: string;
}) {
  const span = to - from || 1;
  const x = (v: number) => Math.max(0, Math.min(100, ((v - from) / span) * 100));

  const ticks: number[] = [];
  for (let t = Math.ceil(from / 10) * 10; t <= to; t += 10) ticks.push(t);

  return (
    <div className="jg-lanes" role="img" aria-label={label ?? '가족 생애 연표'}>
      <div className="jg-lanes-body">
        <div className="jg-lanes-axis" aria-hidden="true">
          <span className="jg-lanes-name" />
          <div className="jg-lanes-track">
            {ticks
              .filter((t) => x(t) > 0 && x(t) < 100)
              .map((t) => (
                <span key={t} className="jg-lanes-tick" style={{ left: `${x(t)}%` }}>
                  {t}
                </span>
              ))}
          </div>
        </div>

        {lanes.map((p) => (
          <div key={p.id} className="jg-lanes-row">
            <span className="jg-lanes-name">
              {p.name}
              {p.born ? (
                <span className="jg-lanes-born">
                  {p.born}–{p.died ?? ''}
                </span>
              ) : null}
            </span>
            <div className="jg-lanes-track">
              {p.born ? (
                <span
                  className="jg-lanes-life"
                  style={{ left: `${x(p.born)}%`, width: `${x(p.died ?? to) - x(p.born)}%` }}
                />
              ) : null}

              {p.periods.map((s, j) => (
                <span
                  key={`p${j}`}
                  className={cx('jg-lanes-period', j % 2 === 1 && 'is-alt')}
                  style={{ left: `${x(s.from)}%`, width: `${x(s.to) - x(s.from)}%` }}
                  title={`${s.label} ${s.from}–${s.to}`}
                >
                  {s.label}
                </span>
              ))}

              {p.events.map((e, j) => (
                <span
                  key={`e${j}`}
                  className={cx('jg-lanes-event', e.verified && 'is-verified')}
                  style={{ left: `${x(e.date)}%` }}
                  title={`${e.date} ${e.title}`}
                />
              ))}

              {p.records.map((r, j) => (
                <span key={`r${j}`} className="jg-lanes-rec" style={{ left: `${x(r)}%` }} />
              ))}
            </div>
          </div>
        ))}

        {cursor ? (
          <div className="jg-lanes-overlay" aria-hidden="true">
            <span className="jg-lanes-cursor" style={{ left: `${x(cursor)}%` }}>
              <span className="jg-lanes-cursor-label">{cursor}</span>
            </span>
          </div>
        ) : null}
      </div>

      <p className="jg-lanes-legend">
        <span>
          <i className="k-period" />
          시기분류
        </span>
        <span>
          <i className="k-event" />
          사건
        </span>
        <span>
          <i className="k-verified" />
          날짜가 확인된 사건
        </span>
        <span>
          <i className="k-rec" />
          기록
        </span>
        {cursor ? (
          <span>
            <i className="k-cursor" />
            지금 보는 연대
          </span>
        ) : null}
      </p>
    </div>
  );
}
