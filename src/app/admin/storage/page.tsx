import Link from 'next/link';
import { requireAdmin } from '@/lib/access';
import { db } from '@/lib/db';
import { isDriveConnected, getSetting } from '@/lib/drive';
import { num } from '@/lib/ui';
import Notice from '@/components/admin/Notice';
import StatusBadge from '@/components/admin/StatusBadge';
import { disconnectDrive } from '../actions';

export const dynamic = 'force-dynamic';

/**
 * 저장소 설정.
 *
 * 원본은 Google Drive, 화면용 축소본은 Supabase — 이 구성이 지금 어떤 상태인지
 * 한 화면에서 보이게 한다. 관리자가 확인해야 할 것은 결국 "지금 올릴 수 있는가"다.
 */
export default async function StoragePage({
  searchParams,
}: {
  searchParams: Promise<{ connected?: string; error?: string }>;
}) {
  await requireAdmin();
  const { connected, error } = await searchParams;

  const hasClient = Boolean(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET);
  const driveOn = hasClient ? await isDriveConnected() : false;
  const rootFolder = driveOn ? await getSetting('google_root_folder_id') : null;

  const supabase = db();
  const [{ count: driveFiles }, { count: supaFiles }, { count: unverified }] = await Promise.all([
    supabase.from('file').select('id', { count: 'exact', head: true }).eq('provider', 'gdrive'),
    supabase.from('file').select('id', { count: 'exact', head: true }).eq('provider', 'supabase'),
    supabase
      .from('file')
      .select('id', { count: 'exact', head: true })
      .eq('role', 'original')
      .eq('checksum_verified', false),
  ]);

  return (
    <div className="page page-admin">
      <section className="admin-sec">
        <h1 className="page-title jg-pixel">원본은 Drive, 축소본은 Supabase</h1>
        <p className="page-lead">
          용량의 대부분을 차지하는 원본은 Google Drive 에 두고, 갤러리에서 자주 읽히는 축소본만
          Supabase 에 둡니다. 원본이 눈으로 바로 확인할 수 있는 폴더로 남으므로, 이 사이트가 사라져도
          기록은 남습니다.
        </p>

        {connected ? (
          <Notice tone="success" title="Google Drive 가 연결되었습니다">
            이제 올리는 원본은 Drive 로 들어갑니다.
          </Notice>
        ) : null}
        {error ? (
          <Notice tone="error" title="연결하지 못했습니다">{decodeURIComponent(error)}</Notice>
        ) : null}
      </section>

      <section className="admin-sec">
        {/* 연결 여부는 색이 아니라 네모의 모양으로 말한다 — 이 화면에는
            강조색이 없고, 채운 네모와 빈 네모는 흑백에서도 구분된다. */}
        <h2 className="sec-title jg-pixel">
          Google Drive <StatusBadge level={driveOn ? 'public' : 'private'}
                                    label={driveOn ? '연결됨' : '연결 안 됨'} />
        </h2>

        {!hasClient ? (
          <>
            <Notice tone="info" title="OAuth 클라이언트가 없습니다">
              <code>GOOGLE_CLIENT_ID</code> 와 <code>GOOGLE_CLIENT_SECRET</code> 이 설정되지
              않았습니다. Google Cloud Console 에서 OAuth 클라이언트를 만든 뒤 환경변수에 넣어
              주세요.
            </Notice>
            <p className="jg-note">
              권한 범위는 <code>drive.file</code> 하나입니다 — 이 앱이 만든 파일에만 접근하며,
              나머지 Drive 내용은 읽지 못합니다.
            </p>
          </>
        ) : driveOn ? (
          <>
            <p className="page-lead">
              업로드한 원본은 Drive 의 <strong>도당동 아카이브</strong> 폴더 아래, 묶음별 하위
              폴더에 들어갑니다.
            </p>
            <div className="form-actions">
              {rootFolder && (
                <a
                  href={`https://drive.google.com/drive/folders/${rootFolder}`}
                  target="_blank"
                  rel="noreferrer"
                  className="jg-btn jg-btn-secondary"
                >
                  Drive 에서 폴더 열기
                </a>
              )}
              <form action={disconnectDrive}>
                <button type="submit" className="jg-btn jg-btn-text">연결 끊기</button>
              </form>
            </div>
            <p className="jg-note">
              연결을 끊어도 Drive 의 파일과 아카이브의 기술 정보는 그대로 남습니다. 새 업로드만
              막힙니다.
            </p>
          </>
        ) : (
          <>
            <p className="page-lead">
              연결하면 이 앱이 Drive 에 <strong>도당동 아카이브</strong> 폴더를 만들고, 업로드한
              원본을 그 안에 넣습니다.
            </p>
            <div className="form-actions">
              <a href="/api/google/start" className="jg-btn jg-btn-primary">
                Google Drive 연결
              </a>
            </div>
            <p className="jg-note">
              동의 화면에서 &quot;확인되지 않은 앱&quot; 경고가 뜨면 <strong>고급 → 안전하지 않은
              페이지로 이동</strong>을 눌러 진행하세요. 본인이 만든 앱이라 목록에 없는 것입니다.
            </p>
          </>
        )}
      </section>

      <section className="admin-sec">
        <h2 className="sec-title jg-pixel">지금 어디에 몇 개가 있나</h2>
        <div className="jg-rtable-wrap">
          <table className="jg-rtable">
            <thead>
              <tr>
                <th>항목</th>
                <th>수</th>
                <th>뜻</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td className="is-title">Drive 원본</td>
                <td className="is-mono">{num(driveFiles ?? 0)}</td>
                <td className="is-muted">Google Drive 에 올라간 원본 파일</td>
              </tr>
              <tr>
                <td className="is-title">Supabase 파일</td>
                <td className="is-mono">{num(supaFiles ?? 0)}</td>
                <td className="is-muted">화면에 바로 띄우는 축소본</td>
              </tr>
              <tr>
                <td className="is-title">체크섬 미확인</td>
                <td className="is-mono">{num(unverified ?? 0)}</td>
                <td className="is-muted">sha256 을 직접 계산하지 못한 원본</td>
              </tr>
            </tbody>
          </table>
        </div>

        <Notice tone="info" title="체크섬 미확인이란">
          서버가 파일을 직접 읽어 sha256 을 계산하지 못한 원본을 말합니다. 영상처럼 내려받지 않는
          파일이 여기 들어가며, 대신 Drive 가 계산한 md5 를 무결성 근거로 기록해 둡니다.
          &quot;체크섬이 있다&quot;와 &quot;무결성이 확인됐다&quot;를 구분하기 위한 표시입니다.
        </Notice>
      </section>

      <div className="form-actions">
        <Link href="/admin" className="jg-btn jg-btn-text">← 기록 목록</Link>
      </div>
    </div>
  );
}
