import { permanentRedirect } from 'next/navigation';

/**
 * 철수한 화면.
 *
 * 유형별로 훑어보던 곳인데, 네 갈래 분류가 생기면서 할 일이 없어졌다 —
 * 형태분류 축이 같은 일을 더 잘한다. 가족이 주고받은 주소가 남아 있을 수
 * 있으므로 라우트는 지우지 않고 찾기 화면으로 넘긴다.
 */
export default async function GalleryPage({
  searchParams,
}: {
  searchParams: Promise<{ type?: string }>;
}) {
  const { type } = await searchParams;
  permanentRedirect(type ? `/search?form=${encodeURIComponent(type)}` : '/search');
}
