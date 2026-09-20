import { permanentRedirect } from 'next/navigation';

/** 모음집 하나는 이야기 하나로. id 는 같은 collection 행이라 그대로 쓴다. */
export default async function CollectionPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  permanentRedirect(`/stories/${id}`);
}
