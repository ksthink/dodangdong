import Link from 'next/link';
import { cx, num } from '@/lib/ui';
import { shortName } from '@/lib/chronicle';

/**
 * 인물 카드.
 *
 * 부르는 이름(호칭)을 크게, 실명을 작게 둔다. 가족이 찾는 것은 '김순자'가
 * 아니라 '할머니'이기 때문이다 — 전거의 display_name 은 "김순자(할머니)"
 * 꼴이므로 `shortName` 으로 괄호 안을 꺼낸다.
 */

export type FaceSize = 's' | 'm' | 'l' | 'xl';

/**
 * 얼굴 자리.
 *
 * 사진이 없으면 이름 첫 글자를 넣는다. 원형으로 깎지 않는 까닭은 명세가
 * 인물 얼굴도 정사각형으로 두기 때문이다 — 이 아카이브에서 사각형은
 * "사진 한 장"을 뜻하는 모양이고, 사람만 다른 모양을 쓸 이유가 없다.
 */
export function Face({
  face,
  name,
  short,
  size = 'm',
}: {
  face?: string | null;
  name?: string;
  short?: string;
  size?: FaceSize;
}) {
  // 카드에 적히는 이름과 같은 글자로 시작해야 한 사람으로 읽힌다.
  const initial = (short ?? (name ? shortName(name) : '?')).trim().charAt(0) || '?';
  return (
    <span className={cx('jg-face', `is-${size}`)} aria-hidden="true">
      {face ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={face} alt="" />
      ) : (
        <span className="jg-face-initial jg-pixel">{initial}</span>
      )}
    </span>
  );
}

/** '1931–2014'. 한쪽만 알면 그쪽만 적는다 — 모르는 것을 지어내지 않는다. */
export function lifeSpan({ born, died }: { born?: string | number | null; died?: string | number | null }): string {
  if (!born && !died) return '';
  return `${born ?? '?'}–${died ?? ''}`;
}

export interface PersonCardProps {
  /** 전거의 display_name. "김순자(할머니)" 꼴. */
  name: string;
  /** 호칭. 주지 않으면 `name` 에서 꺼낸다. */
  short?: string;
  face?: string | null;
  born?: string | number | null;
  died?: string | number | null;
  /** '아버지의 어머니' 처럼 관계를 설명하는 말. */
  relation?: string | null;
  made?: number | null;
  appears?: number | null;
  href?: string | null;
}

export default function PersonCard({
  name,
  short,
  face,
  born,
  died,
  relation,
  made,
  appears,
  href,
}: PersonCardProps) {
  const call = short ?? shortName(name);
  const span = lifeSpan({ born, died });

  const inner = (
    <>
      <Face face={face} name={name} short={call} size="l" />
      <div className="jg-pcard-body">
        <p className="jg-pcard-name jg-pixel">{call}</p>
        {call !== name ? <p className="jg-pcard-full">{name}</p> : null}
        <p className="jg-pcard-meta">
          {span ? <span className="jg-date">{span}</span> : null}
          {relation ? <span>{relation}</span> : null}
        </p>
        {made != null || appears != null ? (
          <p className="jg-pcard-count">
            {made != null ? (
              <span>
                만든 기록 <strong>{num(made)}</strong>
              </span>
            ) : null}
            {appears != null ? (
              <span>
                나오는 기록 <strong>{num(appears)}</strong>
              </span>
            ) : null}
          </p>
        ) : null}
      </div>
    </>
  );

  return href ? (
    <Link className="jg-pcard" href={href}>
      {inner}
    </Link>
  ) : (
    <article className="jg-pcard">{inner}</article>
  );
}
