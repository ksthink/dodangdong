import { cx } from '@/lib/ui';

/**
 * 이야기 한 덩이.
 *
 * 프로토타입은 끌어서 옮기게 되어 있었다. 여기서는 위·아래 버튼만 둔다 —
 * 끌기는 자바스크립트가 와야 움직이고, 손가락으로는 잘 잡히지 않으며,
 * 무엇보다 순서가 서버에 남는 방식이 따로 있어야 한다. 버튼 하나가
 * 폼 하나이고, 폼 하나가 순서를 한 칸 옮기는 서버 액션을 부른다.
 * (`.is-dragging` 은 CSS 에 남아 있다. 나중에 끌기를 붙일 자리다.)
 */

export type BlockKind = 'text' | 'heading' | 'record' | 'gallery' | 'quote' | 'timeline';

/** curation_block.kind 의 한국어 이름. 스키마의 여섯 값이 전부다. */
const BLOCK_KINDS: Record<string, string> = {
  text: '글',
  heading: '소제목',
  record: '기록',
  gallery: '사진 묶음',
  quote: '구술 인용',
  timeline: '연표',
};

export interface CurationBlockProps {
  /** curation_block.id. 세 액션 모두 이것으로 블록을 찾는다. */
  id: string;
  /** curation_block.position. 1부터. */
  position: number;
  kind: BlockKind | string;
  /** 본문. 글·소제목·인용이 쓴다. */
  text?: string | null;
  /** 딸린 기록의 이름들(curation_ref). */
  refs?: string[];
  /** 사진 묶음 미리보기. 여섯 장까지만 보인다. */
  thumbs?: string[];
  /** 딸린 기록 건수. */
  count?: number;
  /**
   * 설명글. `undefined` 면 줄 자체를 내지 않고, 빈 글자면 '비어 있음' 으로
   * 남긴다 — 설명글을 쓸 수 있는 블록인데 아직 안 썼다는 뜻이다.
   */
  caption?: string | null;
  selected?: boolean;
  /** 맨 위/맨 아래. 해당 버튼을 잠근다. */
  first?: boolean;
  last?: boolean;
  /** 순서 옮기기. formData: blockId, dir('up'|'down'). */
  moveAction: (formData: FormData) => Promise<void>;
  /** 블록 빼기. formData: blockId. */
  removeAction: (formData: FormData) => Promise<void>;
}

export default function CurationBlock({
  id,
  position,
  kind,
  text,
  refs,
  thumbs,
  count,
  caption,
  selected,
  first,
  last,
  moveAction,
  removeAction,
}: CurationBlockProps) {
  return (
    <article className={cx('jg-cblock', selected && 'is-selected')}>
      <header className="jg-cblock-bar">
        <span className="jg-cblock-no">{String(position).padStart(2, '0')}</span>
        <span className="jg-cblock-kind jg-pixel">{BLOCK_KINDS[kind] ?? kind}</span>
        {count ? <span className="jg-date">기록 {count}건</span> : null}
        <span className="jg-cblock-tools">
          <form action={moveAction}>
            <input type="hidden" name="blockId" value={id} />
            <input type="hidden" name="dir" value="up" />
            <button type="submit" aria-label="위로" disabled={first}>
              ↑
            </button>
          </form>
          <form action={moveAction}>
            <input type="hidden" name="blockId" value={id} />
            <input type="hidden" name="dir" value="down" />
            <button type="submit" aria-label="아래로" disabled={last}>
              ↓
            </button>
          </form>
          <form action={removeAction}>
            <input type="hidden" name="blockId" value={id} />
            <button type="submit" aria-label="빼기">
              ×
            </button>
          </form>
        </span>
      </header>

      <div className="jg-cblock-body">
        {thumbs && thumbs.length ? (
          <div className="jg-cblock-thumbs">
            {thumbs.slice(0, 6).map((m) => (
              // eslint-disable-next-line @next/next/no-img-element
              <img key={m} src={m} alt="" />
            ))}
          </div>
        ) : null}
        {text ? (
          <p className={cx('jg-cblock-text', kind === 'quote' && 'is-quote')}>{text}</p>
        ) : null}
        {refs && refs.length ? <p className="jg-cblock-refs">{refs.join(' · ')}</p> : null}
        {caption !== undefined ? (
          <p className="jg-cblock-cap">
            <span className="jg-field-code">설명글</span>
            {caption ? caption : <span className="jg-empty">비어 있음</span>}
          </p>
        ) : null}
      </div>
    </article>
  );
}
