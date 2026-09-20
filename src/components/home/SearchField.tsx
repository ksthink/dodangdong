/**
 * 첫 화면의 찾기 칸.
 *
 * 프로토타입은 onSubmit 으로 값을 가로챘지만 여기서는 그냥 GET 폼이다.
 * 찾은 말이 주소에 남아야 가족끼리 주고받을 수 있고, 자바스크립트가
 * 오기 전에도 눌러진다. 덕분에 이 파일은 서버 컴포넌트로 남는다.
 */

export interface SearchFieldProps {
  id?: string;
  label?: string;
  placeholder?: string;
  defaultValue?: string;
  submitLabel?: string;
}

export function SearchField({
  id = 'jg-search',
  label = '기록 찾기',
  placeholder = '제목, 인물, 장소, 연도',
  defaultValue,
  submitLabel = '찾기',
}: SearchFieldProps) {
  return (
    <form className="jg-search" role="search" action="/search" method="get">
      <label className="jg-search-label" htmlFor={id}>
        {label}
      </label>
      <div className="jg-search-row">
        <input
          id={id}
          name="q"
          type="search"
          className="jg-input"
          placeholder={placeholder}
          defaultValue={defaultValue}
        />
        <button type="submit" className="jg-btn jg-btn-primary">
          {submitLabel}
        </button>
      </div>
    </form>
  );
}
