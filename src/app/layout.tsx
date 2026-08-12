import type { Metadata } from 'next';
import localFont from 'next/font/local';
import Link from 'next/link';
import { headers } from 'next/headers';
import { currentRole } from '@/lib/access';
import { IconHeart } from '@/components/icons';
import './globals.css';

const galmuri = localFont({
  src: [
    { path: './fonts/Galmuri11.woff2', weight: '400', style: 'normal' },
    { path: './fonts/Galmuri11-Bold.woff2', weight: '700', style: 'normal' },
  ],
  variable: '--font-galmuri',
  display: 'swap',
});

export const metadata: Metadata = {
  title: '도당동 아카이브',
  description: '도당동 가족의 사진·글·음성·영상·편지를 모아 남기는 아카이브',
};

const NAV = [
  { href: '/', label: '연표' },
  { href: '/collections', label: '이야기' },
  { href: '/gallery', label: '자료' },
  { href: '/people', label: '사람' },
];

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const role = await currentRole();
  // 문 앞 화면에서는 상단 머리글을 두지 않는다. 이름·버전·로그인 창만 남긴다.
  const pathname = (await headers()).get('x-pathname') ?? '';
  const bare = pathname === '/login';

  return (
    <html lang="ko" className={galmuri.variable}>
      <body>
        {!bare && role === 'admin' && (
          <div className="adminbar">
            <div className="adminbar-inner">
              <span>관리자로 접속 중</span>
              <Link href="/admin" className="navlink">
                관리 화면
              </Link>
              <Link href="/logout" className="navlink row-end">
                나가기
              </Link>
            </div>
          </div>
        )}

        {!bare && (
        <header className="sitehead">
          <div className="sitehead-inner">
            <Link href="/" className="brand">
              <IconHeart />
              도당동 아카이브
            </Link>
            {NAV.map((n) => (
              <Link key={n.href} href={n.href} className="navlink">
                {n.label}
              </Link>
            ))}
            {role === 'visitor' ? (
              <Link href="/login" className="navlink">
                가족 로그인
              </Link>
            ) : role === 'family' ? (
              <Link href="/logout" className="navlink">
                로그아웃
              </Link>
            ) : null}
          </div>
        </header>
        )}

        {children}
      </body>
    </html>
  );
}
