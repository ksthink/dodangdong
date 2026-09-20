import { redirect } from 'next/navigation';
import { headers } from 'next/headers';
import { currentRole } from '@/lib/access';
import { db } from '@/lib/db';
import AdminBar from '@/components/admin/AdminBar';

export const dynamic = 'force-dynamic';

const NAV = [
  { href: '/admin', label: '대기열' },
  { href: '/admin/acquisitions', label: '수집' },
  { href: '/admin/bundles', label: '묶음' },
  { href: '/admin/people', label: '인물' },
  { href: '/admin/collections', label: '모음집' },
  { href: '/admin/curation', label: '이야기' },
  { href: '/admin/hero', label: '첫 화면' },
  { href: '/admin/storage', label: '저장소' },
  { href: '/admin/security', label: '보안' },
];

/**
 * 관리 화면의 틀.
 *
 * 관리 화면도 열람 화면과 같은 픽셀 문법을 쓴다. 다른 것은 맨 위의 먹색
 * 띠 하나뿐이다 — 지금 고치는 중이라는 것을 한눈에 알리되, 화면 전체를
 * 다른 세상으로 만들지는 않는다. 관리자가 보는 것과 가족이 보는 것이
 * 같아야 "이렇게 보이겠구나"를 짐작할 수 있다.
 *
 * 바깥 테두리(main.wrap)는 여기서 한 번만 두른다. 화면마다 제 것을
 * 두르면 안쪽으로 한 겹 더 들어가 폭이 어긋난다.
 */
export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const role = await currentRole();
  if (role !== 'admin') redirect('/login?next=/admin');

  const pathname = (await headers()).get('x-pathname') ?? '';

  // 대기열에 몇 건이 쌓였는지 띠에 적는다. 관리자가 관리 화면에 들어오는
  // 까닭은 대개 "아직 안 한 것"을 하기 위해서다.
  const { count } = await db()
    .from('item')
    .select('id', { count: 'exact', head: true })
    .eq('is_featured', false)
    .eq('is_archived', false);

  return (
    <>
      <AdminBar
        user="관리자"
        links={NAV.map((n) => ({
          ...n,
          // 하위 경로도 그 항목으로 친다. 다만 '/admin' 은 모든 경로의
          // 앞이라 정확히 일치할 때만 표시한다.
          current: n.href === '/admin' ? pathname === '/admin' : pathname.startsWith(n.href),
        }))}
        counts={{ '/admin': count ?? 0 }}
      />
      <main className="wrap">{children}</main>
    </>
  );
}
