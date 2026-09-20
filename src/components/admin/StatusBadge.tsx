import { cx } from '@/lib/ui';
// 타입만 가져오되 session 에서 직접 받는다 — access.ts 는 next/headers 를
// 거치므로 클라이언트 표(RecordTable)에서 이 조각을 쓸 때 경계가 흐려진다.
import type { AccessLevel } from '@/lib/session';

/**
 * 공개 범위 뱃지.
 *
 * 이 저장소의 접근 등급은 세 단계다. 점의 모양이 먼저 말하고 글자가
 * 확인해준다 — 채운 네모는 열린 것, 빈 네모는 닫힌 것, 점선 네모는 그 중간.
 * 흑백 화면이라 색으로는 구분할 수 없다.
 *
 * 디자인 시스템의 점 세 가지(is-public/is-private/is-scheduled)를 그대로
 * 쓰되, 가운데 단계인 '가족'에 점선을 맡겼다.
 */

const DOT_CLASS: Record<AccessLevel, string> = {
  public: 'is-public',
  family: 'is-scheduled',
  private: 'is-private',
};

const LABELS: Record<AccessLevel, string> = {
  public: '가족 공개',
  family: '가족 제한',
  private: '비공개',
};

export interface StatusBadgeProps {
  level: AccessLevel;
  /** 화면에 따라 다른 말을 써야 할 때만. 기본은 등급에 딸린 말. */
  label?: string;
}

export default function StatusBadge({ level, label }: StatusBadgeProps) {
  return (
    <span className={cx('jg-status', DOT_CLASS[level])}>
      <span className="jg-status-dot" aria-hidden="true" />
      {label ?? LABELS[level]}
    </span>
  );
}
