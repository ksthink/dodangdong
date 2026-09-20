import type { ReactNode } from 'react';
import Notice from '@/components/admin/Notice';
import Checkbox from '@/components/admin/Checkbox';

/**
 * 문 앞의 창(window).
 *
 * 타이틀바가 있는 한 장의 창이다. 위 막대에 무엇을 하는 자리인지와 어느
 * 사이트인지를 적고, 본문에 들어갈 칸과 단추를 둔다. 아이디·비밀번호를
 * 받는 첫 칸과 인증 앱 코드를 받는 두 번째 칸은 창의 모양이 같아야 한다 —
 * 같은 문을 두 번 여는 일이지 다른 곳에 온 것이 아니기 때문이다.
 *
 * 그래서 칸은 props 로 정하지 않고 children 으로 받는다. 바깥에서 Field 를
 * 원하는 만큼 넣으면 되고, 창은 틀과 알림·단추·도움말만 책임진다.
 *
 * 서버 컴포넌트다. form 의 action 에는 서버 액션이 그대로 들어간다 —
 * 입력값을 리액트가 들고 있을 이유가 없다.
 *
 * 오류는 색이 아니라 모양으로 알린다(globals.css): 테두리가 굵어지고 문장이
 * 굵어진다. 인장색(--mark)은 "확인됨" 전용이라 오류에 쓰지 않는다.
 */

export interface LoginFormProps {
  /** 서버 액션. 이 창은 값을 만지지 않고 그대로 넘긴다. */
  action: (formData: FormData) => void | Promise<void>;
  /** 타이틀바 왼쪽. 무엇을 하는 자리인가. */
  title: string;
  /** 타이틀바 오른쪽. 어느 사이트인가. */
  siteName?: string;
  /** 오류 한 줄. 어느 쪽이 틀렸는지는 밝히지 않는다. */
  error?: string;
  /** 오류 밑에 덧붙이는 설명. 남은 시도 횟수 같은 것. */
  errorDetail?: ReactNode;
  /** 잠겼을 때의 문장. 주어지면 단추가 눌리지 않는다. */
  locked?: string;
  /** 본문의 입력 칸들. */
  children: ReactNode;
  /**
   * "이 기기에서 로그인 유지" 체크박스. 서버 액션이 remember 를 실제로 읽는
   * 화면에서만 켠다 — 아무 일도 하지 않는 칸을 보이는 것은 거짓말이다.
   */
  remember?: boolean;
  submitLabel?: string;
  /** 창 맨 아래 줄. 가입·비밀번호 찾기는 없으므로 링크가 아니라 설명이다. */
  help?: ReactNode;
  /** 도움말 아래에 더 둘 것이 있으면. */
  footer?: ReactNode;
}

export default function LoginForm({
  action,
  title,
  siteName = '도당동 아카이브',
  error,
  errorDetail,
  locked,
  children,
  remember,
  submitLabel = '로그인',
  help,
  footer,
}: LoginFormProps) {
  return (
    <section className="jg-window jg-login" aria-labelledby="jg-login-title">
      <header className="jg-window-bar">
        <h1 id="jg-login-title" className="jg-window-title jg-pixel">
          {title}
        </h1>
        <span className="jg-window-site">{siteName}</span>
      </header>

      <form action={action} className="jg-window-body">
        {locked ? (
          <Notice tone="error" title="지금은 로그인할 수 없습니다.">
            {locked}
          </Notice>
        ) : error ? (
          <Notice tone="error" title={error}>
            {errorDetail}
          </Notice>
        ) : null}

        {children}

        {remember ? <Checkbox name="remember" label="이 기기에서 로그인 유지" /> : null}

        <button type="submit" className="jg-btn jg-btn-primary jg-login-submit" disabled={!!locked}>
          {submitLabel}
        </button>

        {help ? <p className="jg-login-help">{help}</p> : null}
        {footer}
      </form>
    </section>
  );
}
