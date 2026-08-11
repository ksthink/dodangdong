/**
 * 도트 아이콘. 사각형만으로 그려서 어떤 크기에서도 픽셀이 어긋나지 않는다.
 * viewBox 는 12x12 로 통일.
 */

type Props = { size?: number; className?: string };

function Svg({ size = 12, className, children }: Props & { children: React.ReactNode }) {
  return (
    <svg
      viewBox="0 0 12 12"
      width={size}
      height={size}
      fill="currentColor"
      shapeRendering="crispEdges"
      aria-hidden="true"
      className={className}
    >
      {children}
    </svg>
  );
}

export function IconPhoto(p: Props) {
  return (
    <Svg {...p}>
      <rect x="1" y="2" width="10" height="2" />
      <rect x="1" y="9" width="10" height="2" />
      <rect x="1" y="4" width="2" height="5" />
      <rect x="9" y="4" width="2" height="5" />
      <rect x="3" y="7" width="6" height="2" />
      <rect x="4" y="6" width="4" height="1" />
      <rect x="5" y="5" width="2" height="1" />
      <rect x="7" y="4" width="2" height="2" />
    </Svg>
  );
}

export function IconSound(p: Props) {
  return (
    <Svg {...p}>
      <rect x="1" y="5" width="2" height="2" />
      <rect x="4" y="4" width="2" height="4" />
      <rect x="7" y="2" width="2" height="8" />
      <rect x="10" y="4" width="2" height="4" />
    </Svg>
  );
}

export function IconVideo(p: Props) {
  return (
    <Svg {...p}>
      <rect x="0" y="2" width="12" height="2" />
      <rect x="0" y="9" width="12" height="2" />
      <rect x="0" y="4" width="2" height="5" />
      <rect x="10" y="4" width="2" height="5" />
      <rect x="5" y="4" width="1" height="5" />
      <rect x="6" y="5" width="1" height="3" />
      <rect x="7" y="6" width="1" height="1" />
    </Svg>
  );
}

export function IconLetter(p: Props) {
  return (
    <Svg {...p}>
      <rect x="0" y="2" width="12" height="2" />
      <rect x="0" y="9" width="12" height="2" />
      <rect x="0" y="4" width="2" height="5" />
      <rect x="10" y="4" width="2" height="5" />
      <rect x="2" y="4" width="1" height="1" />
      <rect x="3" y="5" width="1" height="1" />
      <rect x="4" y="6" width="1" height="1" />
      <rect x="5" y="7" width="2" height="1" />
      <rect x="7" y="6" width="1" height="1" />
      <rect x="8" y="5" width="1" height="1" />
      <rect x="9" y="4" width="1" height="1" />
    </Svg>
  );
}

export function IconDoc(p: Props) {
  return (
    <Svg {...p}>
      <rect x="2" y="0" width="8" height="2" />
      <rect x="2" y="10" width="8" height="2" />
      <rect x="2" y="2" width="2" height="8" />
      <rect x="8" y="2" width="2" height="8" />
      <rect x="4" y="4" width="4" height="1" />
      <rect x="4" y="6" width="4" height="1" />
      <rect x="4" y="8" width="3" height="1" />
    </Svg>
  );
}

export function IconLock(p: Props) {
  return (
    <Svg {...p}>
      <rect x="4" y="2" width="4" height="2" />
      <rect x="3" y="3" width="1" height="3" />
      <rect x="8" y="3" width="1" height="3" />
      <rect x="2" y="6" width="8" height="6" />
    </Svg>
  );
}

export function IconHeart(p: Props) {
  return (
    <Svg {...p}>
      <rect x="1" y="2" width="3" height="1" />
      <rect x="8" y="2" width="3" height="1" />
      <rect x="0" y="3" width="5" height="2" />
      <rect x="7" y="3" width="5" height="2" />
      <rect x="0" y="5" width="12" height="2" />
      <rect x="1" y="7" width="10" height="1" />
      <rect x="2" y="8" width="8" height="1" />
      <rect x="3" y="9" width="6" height="1" />
      <rect x="4" y="10" width="4" height="1" />
      <rect x="5" y="11" width="2" height="1" />
    </Svg>
  );
}

export function IconBox(p: Props) {
  return (
    <Svg {...p}>
      <rect x="0" y="2" width="12" height="2" />
      <rect x="0" y="4" width="2" height="7" />
      <rect x="10" y="4" width="2" height="7" />
      <rect x="0" y="9" width="12" height="2" />
      <rect x="5" y="4" width="2" height="2" />
    </Svg>
  );
}

export function IconStar(p: Props) {
  return (
    <Svg {...p}>
      <rect x="5" y="0" width="2" height="12" />
      <rect x="0" y="5" width="12" height="2" />
      <rect x="2" y="2" width="2" height="2" />
      <rect x="8" y="2" width="2" height="2" />
      <rect x="2" y="8" width="2" height="2" />
      <rect x="8" y="8" width="2" height="2" />
    </Svg>
  );
}

/** DCMI 유형에 맞는 아이콘 */
export function TypeIcon({ type, size = 12 }: { type: string; size?: number }) {
  switch (type) {
    case 'StillImage':
      return <IconPhoto size={size} />;
    case 'Sound':
      return <IconSound size={size} />;
    case 'MovingImage':
      return <IconVideo size={size} />;
    case 'Text':
      return <IconLetter size={size} />;
    default:
      return <IconBox size={size} />;
  }
}

export const TYPE_LABELS: Record<string, string> = {
  StillImage: '사진',
  Sound: '목소리',
  MovingImage: '영상',
  Text: '편지·문서',
  PhysicalObject: '유품',
  Collection: '모음집',
  Event: '사건',
};
