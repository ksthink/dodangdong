import { permanentRedirect } from 'next/navigation';

/** 모음집은 이야기로 합쳤다. 옛 주소를 새 자리로 넘긴다. */
export default function CollectionsPage() {
  permanentRedirect('/stories');
}
