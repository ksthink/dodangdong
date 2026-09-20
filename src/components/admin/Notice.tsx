import type { ReactNode } from 'react';
import { cx } from '@/lib/ui';

/**
 * 알림 상자.
 *
 * 왼쪽에 "오류" 같은 꼬리표를 붙여 색 없이도 종류가 읽히게 한다 — 이 화면은
 * 흑백이라 색으로 구분할 수 없고, 오류 상자는 테두리를 두껍게 해서 무게를
 * 준다(globals.css).
 *
 * 오류는 role="alert" 로 즉시 읽어주고, 나머지는 role="status" 로 흐름을
 * 끊지 않는다.
 */

export type NoticeTone = 'info' | 'error' | 'success';

const TONE_LABELS: Record<NoticeTone, string> = {
  info: '알림',
  success: '완료',
  error: '오류',
};

export interface NoticeProps {
  tone?: NoticeTone;
  title?: string;
  /** 꼬리표 글자를 직접 정할 때. 기본은 tone 에 딸린 말. */
  label?: string;
  children?: ReactNode;
}

export default function Notice({ tone = 'info', title, label, children }: NoticeProps) {
  return (
    <div className={cx('jg-notice', `is-${tone}`)} role={tone === 'error' ? 'alert' : 'status'}>
      <span className="jg-notice-tag jg-pixel">{label ?? TONE_LABELS[tone]}</span>
      <div className="jg-notice-body">
        {title ? <p className="jg-notice-title">{title}</p> : null}
        {children ? <div className="jg-notice-text">{children}</div> : null}
      </div>
    </div>
  );
}
