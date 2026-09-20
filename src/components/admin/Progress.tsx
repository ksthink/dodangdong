/**
 * 칸 단위 진행 막대.
 *
 * 매끈한 띠 대신 칸을 세어 채운다 — 픽셀 화면과 결이 맞고, 몇 칸 남았는지
 * 눈으로 셀 수 있다.
 */

export interface ProgressProps {
  /** 0부터 100까지. */
  value: number;
  /** 칸 수. 좁은 자리에서는 줄인다. */
  segments?: number;
  label?: string;
}

export default function Progress({ value, segments = 20, label }: ProgressProps) {
  const clamped = Math.min(100, Math.max(0, value));
  const on = Math.round((clamped / 100) * segments);

  return (
    <span
      className="jg-progress"
      role="progressbar"
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={Math.round(clamped)}
      aria-label={label}
    >
      {Array.from({ length: segments }, (_, i) => (
        <span key={i} className={i < on ? 'is-on' : undefined} />
      ))}
    </span>
  );
}
