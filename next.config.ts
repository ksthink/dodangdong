import type { NextConfig } from 'next';

/**
 * dev 서버를 localhost 아닌 주소로 열어두면 Next 가 개발용 리소스(_next/static/…)에 대한
 * 교차 출처 요청을 막는다. 접속에 쓰는 호스트를 DEV_ORIGINS 에 쉼표로 적어두면 통과시킨다.
 * 배포(build + start)에서는 필요 없다.
 *
 *   DEV_ORIGINS=203.0.113.10,archive.example.kr npm run dev
 */
const devOrigins = (process.env.DEV_ORIGINS ?? '')
  .split(',')
  .map((s) => s.trim())
  .filter(Boolean);

/**
 * 보안 헤더.
 *
 * 이 사이트는 관리자가 자료를 지우고 등급을 바꾸는 화면을 품고 있다.
 * 남의 페이지에 iframe 으로 얹혀 클릭을 가로채이면 그 조작이 그대로 일어난다.
 * frame-ancestors 로 액자에 끼우는 것 자체를 막는다.
 *
 * CSP 는 Next 의 인라인 스크립트 때문에 script-src 를 완전히 조일 수 없다.
 * 대신 외부로 나가는 길(default-src, connect-src)과 액자(frame-ancestors)를 막아
 * 자료가 밖으로 새는 경로를 좁힌다.
 */
const CSP = [
  "default-src 'self'",
  "script-src 'self' 'unsafe-inline' 'unsafe-eval'",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob:",
  "font-src 'self'",
  // 업로드는 브라우저에서 Google 로 직접 간다. 그 길만 열어둔다.
  "connect-src 'self' https://www.googleapis.com",
  "form-action 'self'",
  "frame-ancestors 'none'",
  "base-uri 'self'",
  "object-src 'none'",
].join('; ');

const securityHeaders = [
  { key: 'Content-Security-Policy', value: CSP },
  { key: 'X-Frame-Options', value: 'DENY' },
  { key: 'X-Content-Type-Options', value: 'nosniff' },
  { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
  { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=(), interest-cohort=()' },
  // 로그인 뒤에만 보이는 사이트다. 검색엔진에 남을 이유가 없다.
  { key: 'X-Robots-Tag', value: 'noindex, nofollow, noarchive' },
];

const nextConfig: NextConfig = {
  allowedDevOrigins: ['127.0.0.1', 'localhost', ...devOrigins],
  async headers() {
    return [{ source: '/:path*', headers: securityHeaders }];
  },
};

export default nextConfig;
