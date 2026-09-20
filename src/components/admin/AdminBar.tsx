import Link from 'next/link';
import { num } from '@/lib/ui';

/**
 * 관리 모드 띠.
 *
 * 화면 맨 위에 검은 띠를 깔아 "지금은 고칠 수 있는 화면" 임을 한눈에
 * 알린다 — 보는 화면과 고치는 화면이 같은 주소 체계를 쓰므로, 어느 쪽에
 * 있는지 헷갈리면 실수로 지운다.
 *
 * 로그아웃은 버튼이 아니라 /logout 링크다. 이 저장소는 그 경로에서 쿠키를
 * 지우므로 자바스크립트 없이도 나갈 수 있다.
 */

export interface AdminBarLink {
  label: string;
  href: string;
  /** 지금 보고 있는 화면. 밑줄이 그어진다. */
  current?: boolean;
  count?: number;
}

export interface AdminBarProps {
  user: string;
  role?: string;
  links: AdminBarLink[];
  /** 주소별 건수. 링크마다 세어 넘기기 번거로울 때 한 번에 준다. */
  counts?: Record<string, number>;
}

export default function AdminBar({ user, role, links, counts }: AdminBarProps) {
  return (
    <nav className="jg-adminbar" aria-label="관리 메뉴">
      <span className="jg-adminbar-mode jg-pixel">관리 모드</span>
      <ul className="jg-adminbar-links">
        {links.map((l) => {
          const count = l.count ?? counts?.[l.href];
          return (
            <li key={l.href}>
              <Link
                href={l.href}
                aria-current={l.current ? 'page' : undefined}
                className={l.current ? 'is-current' : undefined}
              >
                {l.label}
                {count ? <span className="jg-adminbar-count">{num(count)}</span> : null}
              </Link>
            </li>
          );
        })}
      </ul>
      <span className="jg-adminbar-user">
        {user}
        {role ? <span className="jg-adminbar-role">{role}</span> : null}
      </span>
      <Link href="/logout" className="jg-adminbar-out">
        로그아웃
      </Link>
    </nav>
  );
}
