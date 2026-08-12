import pkg from '../../package.json';

/**
 * 화면에 띄우는 버전.
 *
 * 아카이브는 오래 쓰는 물건이라 "지금 보고 있는 것이 어느 판인지"가 중요하다.
 * 문제가 생겼을 때 커밋 하나로 되짚을 수 있게, 배포된 커밋의 앞자리를 함께 보인다.
 */

const commit =
  process.env.VERCEL_GIT_COMMIT_SHA ??
  process.env.GIT_COMMIT_SHA ??
  '';

export const APP_VERSION = pkg.version;
export const APP_COMMIT = commit ? commit.slice(0, 7) : null;

/** "v0.2.0 · 0117013" 형태. 커밋을 모르면 버전만. */
export const VERSION_LABEL = APP_COMMIT
  ? `v${APP_VERSION} · ${APP_COMMIT}`
  : `v${APP_VERSION}`;
