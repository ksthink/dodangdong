/**
 * 화면 조각들이 함께 쓰는 아주 작은 것들.
 *
 * 디자인 시스템 번들이 내부에 두고 있던 헬퍼를 옮겨온 것이다.
 * 여기 있는 것은 전부 순수 함수여서 서버·클라이언트 어느 쪽에서도 쓴다.
 */

/** 거짓인 값을 걸러 클래스명을 잇는다. */
export function cx(...parts: (string | false | null | undefined)[]): string {
  return parts.filter(Boolean).join(' ');
}

/** 천 단위 쉼표. 건수는 숫자로 읽히는 편이 빠르다. */
export function num(n: number): string {
  return n.toLocaleString('ko-KR');
}
