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

const nextConfig: NextConfig = {
  allowedDevOrigins: ['127.0.0.1', 'localhost', ...devOrigins],
};

export default nextConfig;
