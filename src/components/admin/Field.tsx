import { cx } from '@/lib/ui';

/**
 * 관리 화면의 입력 한 칸.
 *
 * input·textarea·select 를 하나로 묶는다. 셋은 라벨·도움말·오류가 붙는
 * 방식이 똑같고, 다른 것은 가운데의 컨트롤 하나뿐이기 때문이다.
 *
 * 서버 컴포넌트다. 이 저장소의 폼은 전부 <form action={serverAction}> 으로
 * 제출하므로 입력값을 리액트가 들고 있을 이유가 없다 — 그래서 onChange 를
 * 받지 않고, 값은 defaultValue 로 심어 브라우저가 관리한다.
 *
 * 요소명 옆에 dc 요소 코드를 적는 것은 상세정보 표(MetadataTable)와 같은
 * 규칙이다. 보는 화면과 쓰는 화면에서 같은 이름이 같은 자리에 있어야 한다.
 */

export interface FieldOption {
  value: string;
  label: string;
}

export interface FieldProps {
  label: string;
  /** dc 요소 코드. 예: 'dc:creator'. */
  code?: string;
  name: string;
  /** 'textarea' 와 'select' 는 태그를 바꾸고, 나머지는 input 의 type 이 된다. */
  type?: 'text' | 'password' | 'email' | 'url' | 'number' | 'date' | 'search' | 'tel' | 'textarea' | 'select';
  rows?: number;
  options?: (string | FieldOption)[];
  value?: string;
  defaultValue?: string;
  required?: boolean;
  disabled?: boolean;
  /** 식별자·날짜처럼 자릿수가 맞아야 읽히는 값은 고정폭으로. */
  mono?: boolean;
  error?: string;
  help?: string;
  placeholder?: string;
  autoComplete?: string;
  /** 모바일 키패드. 2단계 인증의 6자리처럼 숫자만 받는 칸에 쓴다. */
  inputMode?: 'text' | 'numeric' | 'tel' | 'email' | 'url' | 'search';
  maxLength?: number;
  /** 화면에 칸이 하나뿐일 때만. 여러 칸에 걸면 어디로 갈지 알 수 없다. */
  autoFocus?: boolean;
  id?: string;
  className?: string;
}

function toOption(o: string | FieldOption): FieldOption {
  return typeof o === 'string' ? { value: o, label: o } : o;
}

export default function Field({
  label,
  code,
  name,
  type = 'text',
  rows,
  options,
  value,
  defaultValue,
  required,
  disabled,
  mono,
  error,
  help,
  placeholder,
  autoComplete,
  inputMode,
  maxLength,
  autoFocus,
  id,
  className,
}: FieldProps) {
  // 이름이 곧 아이디가 된다 — 서버에서 그리므로 매번 같은 값이어야 한다.
  const fieldId = id ?? `jg-f-${name}`;
  const hintId = `${fieldId}-hint`;
  const errId = `${fieldId}-err`;
  const describedBy = [help ? hintId : null, error ? errId : null].filter(Boolean).join(' ') || undefined;

  const common = {
    id: fieldId,
    name,
    required,
    disabled,
    placeholder,
    autoComplete,
    'aria-invalid': error ? (true as const) : undefined,
    'aria-describedby': describedBy,
    className: cx('jg-input', 'jg-field-input', error && 'is-error', mono && 'is-mono'),
  };

  // value 를 주면 읽기 전용이다 — 고치는 것은 폼 제출이지 리액트가 아니다.
  const bound = value !== undefined ? { value, readOnly: true } : { defaultValue };

  let control;
  if (type === 'textarea') {
    control = <textarea {...common} {...bound} rows={rows ?? 4} maxLength={maxLength} />;
  } else if (type === 'select') {
    control = (
      // select 에는 readOnly 가 없다 — 고르지 못하게 하려면 disabled 를 쓴다.
      // 그래서 주어진 값은 처음 고른 값으로만 심는다.
      <select {...common} defaultValue={value ?? defaultValue} className={cx('jg-select', common.className)}>
        {(options ?? []).map(toOption).map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
    );
  } else {
    control = (
      <input
        {...common}
        {...bound}
        type={type}
        inputMode={inputMode}
        maxLength={maxLength}
        autoFocus={autoFocus}
      />
    );
  }

  return (
    <div className={cx('jg-field', className)}>
      <label className="jg-field-label" htmlFor={fieldId}>
        <span className="jg-field-name">
          {label}
          {required ? (
            <span className="jg-field-req" aria-label="필수">
              {' *'}
            </span>
          ) : null}
        </span>
        {code ? <span className="jg-field-code">{code}</span> : null}
      </label>
      {control}
      {help ? (
        <p id={hintId} className="jg-field-help">
          {help}
        </p>
      ) : null}
      {error ? (
        <p id={errId} className="jg-field-error" role="alert">
          <span className="jg-field-bang" aria-hidden="true">
            !
          </span>
          {error}
        </p>
      ) : null}
    </div>
  );
}
