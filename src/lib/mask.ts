import type { AccessLevel } from './access';
import { lockLabel } from './access';

/**
 * 잠긴 자료를 목록에 어떻게 내보낼 것인가.
 *
 * 원칙은 두 가지가 함께 간다 —
 *   1. 무엇을 못 보고 있는지는 알 수 있어야 한다. 그래서 자리는 남긴다.
 *   2. 볼 수 없는 자료의 내용은 새어나가면 안 된다. 제목과 설명도 내용이다.
 *
 * "가계부에 끼워져 있던 쪽지" 같은 제목은 그 자체로 사적인 정보다.
 * 그래서 볼 수 없는 자료는 제목·설명·묶음명을 전부 가리고 자리만 남긴다.
 */

export interface Maskable {
  title: string;
  description?: string | null;
  bundle_title?: string;
  access_level: AccessLevel;
}

export interface Masked {
  title: string;
  description: string | null;
  bundleTitle: string | null;
  masked: boolean;
}

export function maskItem<T extends Maskable>(item: T, visible: boolean): Masked {
  if (visible) {
    return {
      title: item.title,
      description: item.description ?? null,
      bundleTitle: item.bundle_title ?? null,
      masked: false,
    };
  }
  return {
    title: lockLabel(item.access_level) || '잠긴 자료',
    description: null,
    bundleTitle: null,
    masked: true,
  };
}
