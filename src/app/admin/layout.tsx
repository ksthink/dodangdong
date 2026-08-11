import Link from 'next/link';
import { redirect } from 'next/navigation';
import { currentRole } from '@/lib/access';

export const dynamic = 'force-dynamic';

const NAV = [
  { href: '/admin', label: '대기열' },
  { href: '/admin/acquisitions', label: '수집' },
  { href: '/admin/bundles', label: '묶음' },
  { href: '/admin/people', label: '인물' },
  { href: '/admin/collections', label: '모음집' },
  { href: '/admin/storage', label: '저장소' },
];

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const role = await currentRole();
  if (role !== 'admin') redirect('/login?next=/admin');

  return (
    <>
      <div className="sitehead" style={{ borderTop: 'none' }}>
        <div className="sitehead-inner">
          <span className="eyebrow">관리</span>
          {NAV.map((n) => (
            <Link key={n.href} href={n.href} className="navlink">
              {n.label}
            </Link>
          ))}
        </div>
      </div>
      {children}
    </>
  );
}
