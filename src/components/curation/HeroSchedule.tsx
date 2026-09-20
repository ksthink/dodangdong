import Link from 'next/link';
import { cx } from '@/lib/ui';

/**
 * 히어로 편성표.
 *
 * 첫 화면 맨 위의 자리 셋(hero_slot)에 무엇을 언제까지 걸지 정한다.
 * 프로토타입은 보여주기만 하는 표였다. 여기서는 줄마다 고쳐 저장한다.
 *
 * 줄 하나가 폼 하나다. 다만 `<form>` 은 `<tr>` 을 감쌀 수 없어서 — 브라우저가
 * 표 안의 폼 태그를 들어내 버린다 — 폼은 표 바깥에 두고, 칸 안의 입력들이
 * `form=` 으로 자기 폼을 가리킨다. 표준 동작이라 자바스크립트가 없어도 된다.
 *
 * 자리에 거는 것은 둘 중 하나다. 고른 큐레이션이거나, 그때그때 알아서 고르는
 * 규칙(auto_kind)이거나. 둘 다 비면 그 자리는 비어 있는 것이다.
 */

/** hero_slot.auto_kind. 큐레이션을 고르지 않았을 때 무엇으로 채울지. */
export type AutoKind = 'today' | 'recent' | 'story';

const AUTO_KINDS: { value: AutoKind; label: string }[] = [
  { value: 'today', label: '오늘의 기록' },
  { value: 'recent', label: '최근 들어온 것' },
  { value: 'story', label: '이야기' },
];

/** 편성 상태. 점의 모양이 상태를 말하고 글자가 그것을 읽어 준다. */
export type SlotStatus = 'public' | 'private' | 'scheduled';

const STATUS_LABELS: Record<SlotStatus, string> = {
  public: '걸려 있음',
  private: '감춤',
  scheduled: '예정',
};

export interface HeroSlotRow {
  /** hero_slot.slot. 1~3. */
  slot: number;
  /** 지금 걸린 큐레이션. 비어 있으면 auto_kind 가 자리를 채운다. */
  collectionId?: string | null;
  /** 그 큐레이션의 제목. 링크가 있으면 눌러서 보러 간다. */
  title?: string | null;
  href?: string | null;
  /** 제목 옆 덧말 — '초안', '비공개' 같은 것. */
  note?: string | null;
  autoKind?: AutoKind | null;
  /** hero_slot.starts_on / ends_on. 'YYYY-MM-DD'. */
  startsOn?: string | null;
  endsOn?: string | null;
  status: SlotStatus;
  statusLabel?: string;
}

export interface HeroScheduleProps {
  rows: HeroSlotRow[];
  /** 자리에 걸 수 있는 큐레이션 목록. */
  collections: { id: string; title: string }[];
  /**
   * 줄 하나를 저장하는 서버 액션.
   * formData: slot, collectionId, autoKind, startsOn, endsOn.
   */
  saveAction: (formData: FormData) => Promise<void>;
}

export default function HeroSchedule({ rows, collections, saveAction }: HeroScheduleProps) {
  return (
    <div className="jg-rtable-wrap">
      {/* 칸 안의 입력들이 form= 으로 가리킬 폼. 표 바깥에 있어야 살아남는다. */}
      {rows.map((r) => (
        <form key={r.slot} id={`jg-hero-${r.slot}`} action={saveAction}>
          <input type="hidden" name="slot" value={r.slot} />
        </form>
      ))}

      <table className="jg-rtable">
        <thead>
          <tr>
            <th>자리</th>
            <th>큐레이션</th>
            <th>종류</th>
            <th>편성 기간</th>
            <th>상태</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => {
            const formId = `jg-hero-${r.slot}`;
            return (
              <tr key={r.slot}>
                <td className="is-mono">{r.slot}</td>
                <td className="is-title">
                  <select
                    form={formId}
                    name="collectionId"
                    className="jg-input"
                    defaultValue={r.collectionId ?? ''}
                    aria-label={`${r.slot}번 자리에 걸 큐레이션`}
                  >
                    <option value="">— 고르지 않음(규칙에 맡김)</option>
                    {collections.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.title}
                      </option>
                    ))}
                  </select>
                  {/* 지금 걸린 것을 보러 가는 길. 고르는 칸과는 별개다. */}
                  {r.title && r.href ? <Link href={r.href}>{r.title}</Link> : null}
                  {r.note ? <span className="jg-rtable-note">{r.note}</span> : null}
                </td>
                <td className="is-muted">
                  <select
                    form={formId}
                    name="autoKind"
                    className="jg-input"
                    defaultValue={r.autoKind ?? ''}
                    aria-label={`${r.slot}번 자리를 채울 규칙`}
                  >
                    <option value="">—</option>
                    {AUTO_KINDS.map((k) => (
                      <option key={k.value} value={k.value}>
                        {k.label}
                      </option>
                    ))}
                  </select>
                </td>
                <td className="is-mono is-muted">
                  {/* 끝을 비우면 내릴 때까지 걸어 둔다는 뜻이다. */}
                  <input
                    form={formId}
                    type="date"
                    name="startsOn"
                    className="jg-input"
                    defaultValue={r.startsOn ?? ''}
                    aria-label={`${r.slot}번 자리 시작일`}
                  />
                  {' ~ '}
                  <input
                    form={formId}
                    type="date"
                    name="endsOn"
                    className="jg-input"
                    defaultValue={r.endsOn ?? ''}
                    aria-label={`${r.slot}번 자리 종료일`}
                  />
                </td>
                <td>
                  <span className={cx('jg-status', `is-${r.status}`)}>
                    <span className="jg-status-dot" aria-hidden="true" />
                    {r.statusLabel ?? STATUS_LABELS[r.status]}
                  </span>
                  <button form={formId} type="submit" className="jg-btn jg-btn-secondary">
                    저장
                  </button>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
