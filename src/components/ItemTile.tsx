import Link from 'next/link';
import { TypeIcon, TYPE_LABELS, IconLock } from './icons';
import { lockLabel, type AccessLevel } from '@/lib/access';

interface Props {
  id: string;
  title: string;
  type: string;
  accessLevel: AccessLevel;
  visible: boolean;
  thumbFileId?: string;
  width?: number | string;
  height?: number | string;
  aspect?: string;
}

/**
 * 자료 한 칸.
 *
 * 볼 수 없는 자료도 자리는 남긴다 — 무엇을 못 보고 있는지는 알 수 있어야 한다.
 * 다만 썸네일은 내려보내지 않는다. 축소본도 자료다.
 */
export function ItemTile({
  id,
  title,
  type,
  accessLevel,
  visible,
  thumbFileId,
  width,
  height,
  aspect,
}: Props) {
  const style = { width, height, aspectRatio: aspect };

  // 잠긴 자료는 제목을 툴팁으로도 흘리지 않는다.
  if (!visible) {
    return (
      <span className="tile locked" style={style} title={lockLabel(accessLevel)}>
        <span className="lock">
          <span>
            <IconLock size={12} />
            <br />
            {lockLabel(accessLevel)}
          </span>
        </span>
      </span>
    );
  }

  return (
    <Link href={`/item/${id}`} className="tile" style={style} title={title}>
      {thumbFileId ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={`/media/${thumbFileId}`} alt={title} loading="lazy" />
      ) : (
        <span className="lock" style={{ background: 'var(--panel-2)', color: 'var(--muted)' }}>
          <span>
            <TypeIcon type={type} size={12} />
            <br />
            {TYPE_LABELS[type] ?? type}
          </span>
        </span>
      )}
      {thumbFileId && type !== 'StillImage' && (
        <span className="kindmark">
          <TypeIcon type={type} size={10} />
          {TYPE_LABELS[type] ?? type}
        </span>
      )}
    </Link>
  );
}
