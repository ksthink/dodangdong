'use client';

import { useState } from 'react';

/**
 * 상세 페이지 끝의 두 버튼 — 주소 복사와 인쇄.
 *
 * 공유 버튼은 두지 않는다(가족 사이트다). 대신 주소를 그대로 건네고,
 * 종이로 뽑을 길을 연다 — 이 아카이브를 가장 자주 쓰는 사람은 화면보다
 * 종이를 편하게 여기는 어른들이다.
 *
 * 이 파일에만 'use client' 가 붙는다. 클립보드와 window.print() 는 브라우저
 * 없이는 할 수 없는 일이지만, 나머지 상세 화면 전체를 브라우저로 끌고 갈
 * 이유는 없다.
 */
export default function ShareRow() {
  const [copied, setCopied] = useState(false);
  /** 복사가 막힌 환경(비보안 출처, 권한 거부)에서는 주소를 눈에 보이게 내준다. */
  const [fallback, setFallback] = useState<string | null>(null);

  async function copy() {
    const url = window.location.href;
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setFallback(null);
    } catch {
      setCopied(false);
      setFallback(url);
    }
  }

  return (
    <>
      <button type="button" className="jg-btn jg-btn-text" onClick={copy}>
        {copied ? '주소를 복사했습니다' : '주소 복사'}
      </button>
      <button type="button" className="jg-btn jg-btn-text" onClick={() => window.print()}>
        인쇄
      </button>
      {fallback ? (
        <span className="jg-note">복사가 막혀 있습니다. 이 주소를 직접 옮겨 적으세요 — {fallback}</span>
      ) : null}
    </>
  );
}
