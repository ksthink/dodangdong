/**
 * 사각 픽셀 체크박스.
 *
 * 브라우저 기본 모양을 지우고 8px 네모를 직접 그린다(globals.css). 글자가
 * 없는 자리 — 표의 첫 칸 — 에서는 ariaLabel 로 무엇을 고르는지 읽어준다.
 */

export interface CheckboxProps {
  name?: string;
  value?: string;
  label?: string;
  /** 눈에 보이는 label 이 없을 때 읽어줄 이름. */
  ariaLabel?: string;
  id?: string;
  defaultChecked?: boolean;
  checked?: boolean;
  disabled?: boolean;
  /**
   * 고른 줄이 바로 화면에 반영되어야 하는 클라이언트 화면(RecordTable)에서만
   * 넘긴다. 서버에서 그리는 폼은 이것 없이 제출로 값을 넘긴다.
   */
  onChange?: (checked: boolean) => void;
}

export default function Checkbox({
  name,
  value,
  label,
  ariaLabel,
  id,
  defaultChecked,
  checked,
  disabled,
  onChange,
}: CheckboxProps) {
  return (
    <label className="jg-check" htmlFor={id}>
      <input
        id={id}
        type="checkbox"
        name={name}
        value={value}
        defaultChecked={defaultChecked}
        checked={checked}
        // 값을 밖에서 주면서 바꿀 길이 없으면 읽기 전용이다.
        readOnly={checked !== undefined && !onChange}
        onChange={onChange ? (e) => onChange(e.target.checked) : undefined}
        disabled={disabled}
        aria-label={ariaLabel}
      />
      {label ? <span>{label}</span> : null}
    </label>
  );
}
