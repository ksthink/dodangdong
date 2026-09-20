'use client';

import { useId, useState } from 'react';
import { cx } from '@/lib/ui';

/**
 * 인물 고르기.
 *
 * 이 저장소에서 'use client' 를 쓰는 몇 안 되는 자리다. 이유는 하나다 —
 * 고르는 동안의 상태(친 글자, 열린 목록, 지금까지 고른 사람들)가 서버를
 * 한 번도 다녀오지 않고 바뀌어야 하기 때문이다. 이름 한 글자마다 화면이
 * 다시 그려져서는 쓸 수 없다.
 *
 * 다만 제출은 여전히 폼이 한다. 고른 결과를 hidden input 으로 뱉어 두면
 * 이 조각을 감싼 부모 `<form>` 의 서버 액션이 그대로 받아 간다 — 이 조각은
 * 자기 서버 액션을 따로 갖지 않는다.
 *
 * 없는 사람은 그 자리에서 이름만으로 만든다. 사진을 정리하다 모르는 이름이
 * 나왔다고 해서 인물 등록 화면으로 갔다 오게 하면, 하던 일을 잃는다.
 *
 * 얼굴 인식 제안은 점선 칩으로 온다. 점선은 "아직 사람이 확인하지 않았다"는
 * 뜻이다. 누르면 보통 칩이 되어 확정된다. 인식 자체는 여기서 하지 않는다 —
 * 제안은 위에서 내려온다.
 *
 * 얼굴 자리와 이름 다루기를 PersonCard·chronicle 에서 가져오지 않고 여기에
 * 다시 적은 까닭: 그 둘은 `@/lib/chronicle` 을 타고 `server-only` 에 닿는다.
 * 클라이언트 조각이 그것을 끌어오면 빌드가 깨진다. 같은 클래스를 쓰므로
 * 화면은 한 벌이고, 갈라진 것은 이 몇 줄뿐이다.
 */

/** "김순자(할머니)" 에서 부르는 이름만. 괄호가 없으면 이름 그대로. */
function shortName(displayName: string): string {
  const m = displayName.match(/\(([^)]+)\)\s*$/);
  return m ? m[1] : displayName;
}

/** '1931–2014'. 한쪽만 알면 그쪽만 적는다 — 모르는 것을 지어내지 않는다. */
function lifeSpan({ born, died }: { born?: string | number | null; died?: string | number | null }): string {
  if (!born && !died) return '';
  return `${born ?? '?'}–${died ?? ''}`;
}

/** 얼굴 자리. 사진이 없으면 이름 첫 글자를 넣는다 — PersonCard 의 Face 와 같은 모양. */
function Face({ face, name, short }: { face?: string | null; name?: string; short?: string }) {
  const initial = (short ?? (name ? shortName(name) : '?')).trim().charAt(0) || '?';
  return (
    <span className="jg-face is-s" aria-hidden="true">
      {face ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={face} alt="" />
      ) : (
        <span className="jg-face-initial jg-pixel">{initial}</span>
      )}
    </span>
  );
}

export interface PersonOption {
  /** person.id. */
  id: string;
  /** person.display_name. "김순자(할머니)" 꼴. */
  name: string;
  /** 호칭. 주지 않으면 name 에서 꺼낸다. */
  short?: string;
  face?: string | null;
  /** person.aliases. 찾을 때 같이 뒤진다. */
  aliases?: string[];
  born?: string | number | null;
  died?: string | number | null;
}

export interface PersonSuggestion extends PersonOption {
  /** 0~1. 얼굴 인식이 스스로 매긴 확신. */
  confidence?: number;
}

/** 고른 한 사람. id 가 없으면 아직 전거에 없는 사람이다. */
export interface PersonPick {
  id?: string;
  name: string;
  short?: string;
  face?: string | null;
  /** id 가 없을 때: true 면 새 인물로 등록, false 면 이름만 적어 둔다. */
  create?: boolean;
}

export interface PersonPickerProps {
  /** 고른 사람의 id 가 실릴 input 이름. 여럿이면 같은 이름이 여러 번 실린다. */
  name: string;
  /** 새로 등록할 이름이 실릴 input 이름. 기본 `${name}_new`. */
  newName?: string;
  /** 등록하지 않고 이름만 적어 둔 것이 실릴 input 이름. 기본 `${name}_loose`. */
  looseName?: string;
  label: string;
  /** 요소 코드 — 'dc:subject' 같은 것. */
  code?: string;
  options: PersonOption[];
  /** 처음에 이미 골라져 있는 사람들. */
  defaultValue?: PersonPick[];
  suggestions?: PersonSuggestion[];
  suggestLabel?: string;
  /** false 면 한 명만. 기본은 여럿. */
  multiple?: boolean;
  /** 기관이나 끝내 모르는 사람을 이름만으로 적어 두게 한다. */
  allowLoose?: boolean;
  required?: boolean;
  placeholder?: string;
  help?: string;
  error?: string;
  className?: string;
  id?: string;
}

/** 칩과 목록에 적을 이름. 호칭이 따로 있으면 호칭을 부른다. */
function callName(p: { name: string; short?: string }): string {
  const s = p.short ?? shortName(p.name);
  return s || p.name;
}

export default function PersonPicker({
  name,
  newName,
  looseName,
  label,
  code,
  options,
  defaultValue,
  suggestions,
  suggestLabel = '얼굴 인식 제안',
  multiple = true,
  allowLoose,
  required,
  placeholder,
  help,
  error,
  className,
  id,
}: PersonPickerProps) {
  const reactId = useId();
  const fieldId = id ?? reactId;
  const [value, setValue] = useState<PersonPick[]>(defaultValue ?? []);
  const [q, setQ] = useState('');
  const [open, setOpen] = useState(false);

  const chosen = new Set(value.map((v) => v.id).filter((v): v is string => Boolean(v)));
  const term = q.trim();

  // 이름·호칭·다른 이름 중 아무 데나 걸리면 보여준다. 여섯 줄이면 충분하다 —
  // 더 내려가야 한다면 글자를 더 치는 편이 빠르다.
  const matches = term
    ? options
        .filter((o) => !chosen.has(o.id))
        .filter((o) =>
          [o.name, o.short, ...(o.aliases ?? [])].some((n) => n && n.includes(term)),
        )
        .slice(0, 6)
    : [];

  function add(pick: PersonPick) {
    setValue(multiple ? [...value, pick] : [pick]);
    setQ('');
    setOpen(false);
  }

  function remove(i: number) {
    setValue(value.filter((_, k) => k !== i));
  }

  // 한 명만 고르는 칸은 다 차면 입력칸을 걷는다. 빼야 다른 사람을 넣는다.
  const full = !multiple && value.length >= 1;

  return (
    <div className={cx('jg-field', 'jg-ppick', className)}>
      <label className="jg-field-label" htmlFor={fieldId}>
        <span className="jg-field-name">
          {label}
          {required ? <span className="jg-field-req"> *</span> : null}
        </span>
        {code ? <span className="jg-field-code">{code}</span> : null}
      </label>

      {/* 고른 결과는 여기로만 나간다. 부모 <form> 의 서버 액션이 이것을 읽는다. */}
      {value.map((v, i) =>
        v.id ? (
          <input key={`v${i}`} type="hidden" name={name} value={v.id} />
        ) : (
          <input
            key={`v${i}`}
            type="hidden"
            name={v.create ? (newName ?? `${name}_new`) : (looseName ?? `${name}_loose`)}
            value={v.name}
          />
        ),
      )}

      <div className={cx('jg-ppick-box', error && 'is-error')}>
        {value.map((v, i) => (
          <span key={`c${i}`} className={cx('jg-ppick-chip', !v.id && !v.create && 'is-loose')}>
            {v.id || v.create ? <Face face={v.face} name={v.name} short={v.short} /> : null}
            <span>{callName(v)}</span>
            {!v.id && !v.create ? <span className="jg-ppick-loose">등록 안 됨</span> : null}
            {!v.id && v.create ? <span className="jg-ppick-loose">새 인물</span> : null}
            <button type="button" aria-label={`${v.name} 빼기`} onClick={() => remove(i)}>
              ×
            </button>
          </span>
        ))}

        {full ? null : (
          <input
            id={fieldId}
            className="jg-ppick-input"
            value={q}
            placeholder={value.length ? '더 찾기' : (placeholder ?? '이름·호칭으로 찾기')}
            autoComplete="off"
            role="combobox"
            aria-expanded={open && term.length > 0}
            aria-controls={`${fieldId}-list`}
            onChange={(e) => {
              setQ(e.target.value);
              setOpen(true);
            }}
            onKeyDown={(e) => {
              // 엔터가 폼을 제출해 버리면 고르다 말고 저장된다. 첫 후보를 넣는다.
              if (e.key === 'Enter') {
                e.preventDefault();
                if (matches[0]) add(matches[0]);
              }
              // 빈 칸에서 지우기는 마지막 칩을 뺀다 — 태그 칸의 관례다.
              if (e.key === 'Backspace' && !q && value.length) remove(value.length - 1);
            }}
          />
        )}
      </div>

      {open && term ? (
        <ul id={`${fieldId}-list`} className="jg-ppick-list" role="listbox">
          {matches.map((o) => (
            <li key={o.id} role="option" aria-selected="false">
              <button type="button" onClick={() => add(o)}>
                <Face face={o.face} name={o.name} short={o.short} />
                <span className="jg-ppick-oname">{callName(o)}</span>
                <span className="jg-ppick-ometa">
                  {[
                    callName(o) === o.name ? null : o.name,
                    lifeSpan({ born: o.born, died: o.died }),
                    (o.aliases ?? []).join(', '),
                  ]
                    .filter(Boolean)
                    .join(' · ')}
                </span>
              </button>
            </li>
          ))}
          <li className="jg-ppick-create">
            <button type="button" onClick={() => add({ name: term, create: true })}>
              {`+ ‘${term}’ 새 인물로 등록`}
            </button>
          </li>
          {allowLoose ? (
            <li className="jg-ppick-create">
              <button type="button" onClick={() => add({ name: term })}>
                등록하지 않고 이름만 쓰기 (기관·모르는 사람)
              </button>
            </li>
          ) : null}
        </ul>
      ) : null}

      {suggestions && suggestions.length ? (
        <div className="jg-ppick-sugg">
          <span className="jg-field-code">{suggestLabel}</span>
          {suggestions
            .filter((s) => !chosen.has(s.id))
            .map((s) => (
              <button
                key={s.id}
                type="button"
                className="jg-ppick-schip"
                onClick={() => add(s)}
              >
                <Face face={s.face} name={s.name} short={s.short} />
                {`+ ${callName(s)}`}
                {s.confidence != null ? (
                  <span className="jg-date">{Math.round(s.confidence * 100)}%</span>
                ) : null}
              </button>
            ))}
        </div>
      ) : null}

      {help ? <p className="jg-field-help">{help}</p> : null}
      {error ? (
        <p className="jg-field-error" role="alert">
          <span className="jg-field-bang" aria-hidden="true">
            !
          </span>
          {error}
        </p>
      ) : null}
    </div>
  );
}
