import type { Metadata } from 'next';
import localFont from 'next/font/local';
import Link from 'next/link';
import { headers } from 'next/headers';
import { currentRole } from '@/lib/access';
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

/**
 * 주 메뉴.
 *
 * 넷뿐이다. 사이트 이름이 곧 첫 화면으로 가는 링크이므로 "처음"을 따로
 * 두지 않는다 — 메뉴에 넣으면 이름과 같은 일을 하는 항목이 둘이 된다.
 *
 * 순서는 쓰는 빈도다. 찾는 일이 가장 잦고, 그다음이 엮어 읽는 일,
 * 시간으로 훑는 일, 사람으로 훑는 일이다.
 */
const NAV = [
  { href: '/search', label: '기록 찾기' },
  { href: '/stories', label: '이야기' },
  { href: '/chronicle', label: '연표' },
  { href: '/people', label: '인물' },
];

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const role = await currentRole();
  const pathname = (await headers()).get('x-pathname') ?? '';

  // 문 앞 화면에서는 머리글을 두지 않는다. 창 하나만 남긴다.
  // 2단계 인증(/login/verify)도 문 앞이다 — 정확히 일치로 보면 하위 경로가
  // 빠져서 창만 있어야 할 화면에 머리글이 따라 들어온다.
  const bare = pathname === '/login' || pathname.startsWith('/login/');

  // 관리 화면에는 제 띠(AdminBar)가 따로 선다. 여기서 또 얹으면 머리에
  // 띠가 세 겹이 된다 — 명세는 "맨 위 ink 띠 하나로 구분한다"고 말한다.
  const inAdmin = pathname.startsWith('/admin');

  const current = (href: string) =>
    href === '/' ? pathname === '/' : pathname.startsWith(href);

  return (
    <html lang="ko" className={galmuri.variable}>
      <body>
        {!bare && !inAdmin && role === 'admin' && (
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
          <div className="shell">
            <header className="site-head">
              <Link href="/" className="site-name jg-pixel">
                도당동 아카이브
              </Link>
              <nav className="site-nav" aria-label="주 메뉴">
                {NAV.map((n) => (
                  <Link
                    key={n.href}
                    href={n.href}
                    className={`site-nav-link${current(n.href) ? ' is-current' : ''}`}
                    aria-current={current(n.href) ? 'page' : undefined}
                  >
                    {n.label}
                  </Link>
                ))}
              </nav>
              <div className="site-user">
                {role === 'visitor' ? (
                  <Link href="/login" className="site-login">
                    가족 로그인
                  </Link>
                ) : (
                  <>
                    <span>
                      {role === 'admin' ? '관리자' : '가족'}
                      <span className="site-role">{role}</span>
                    </span>
                    <Link href="/logout" className="jg-btn jg-btn-text">
                      로그아웃
                    </Link>
                  </>
                )}
              </div>
            </header>
          </div>
        )}

        {children}

        {!bare && !inAdmin && (
          <div className="shell">
            <footer className="site-foot">
              <p>
                <strong className="jg-pixel">도당동 아카이브</strong>
              </p>
              <p>
                도당동 가족의 사진·글·음성·영상·편지를 모아 남깁니다. 기록마다 누가 언제
                어디서 만들었는지를 더블린코어 15요소로 적어 둡니다.
              </p>
              <p className="site-foot-meta">
                더블린코어 기반 가족 아카이브 · 디자인 시스템 집안기록 v1
              </p>
            </footer>
          </div>
        )}
      </body>
    </html>
  );
}
