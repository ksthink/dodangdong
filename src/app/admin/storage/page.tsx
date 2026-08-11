import Link from 'next/link';
import { requireAdmin } from '@/lib/access';
import { db } from '@/lib/db';
import { isDriveConnected, getSetting } from '@/lib/drive';
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
    <main className="wrap narrow">
      <section className="stack">
        <span className="eyebrow">저장소</span>
        <h1>원본은 Drive, 축소본은 Supabase</h1>
        <p className="lede">
          용량의 대부분을 차지하는 원본은 Google Drive 에 두고, 갤러리에서 자주 읽히는 축소본만
          Supabase 에 둡니다. 원본이 사람이 읽을 수 있는 폴더로 남으므로, 이 사이트가 사라져도
          자료는 남습니다.
        </p>
      </section>

      {connected && <div className="callout" style={{ borderColor: 'var(--accent)', background: 'var(--accent-bg)', color: 'var(--accent)' }}>Google Drive 가 연결되었습니다.</div>}
      {error && <div className="callout err">연결 실패: {decodeURIComponent(error)}</div>}

      <div className="box stack">
        <div className="row">
          <h3>Google Drive</h3>
          <span className={`chip ${driveOn ? 'accent' : 'warn'} row-end`}>
            {driveOn ? '연결됨' : '연결 안 됨'}
          </span>
        </div>

        {!hasClient ? (
          <>
            <p className="small">
              <code>GOOGLE_CLIENT_ID</code> 와 <code>GOOGLE_CLIENT_SECRET</code> 이 설정되지
              않았습니다. Google Cloud Console 에서 OAuth 클라이언트를 만든 뒤 환경변수에 넣어
              주세요.
            </p>
            <p className="small dim">
              권한 범위는 <code>drive.file</code> 하나입니다 — 이 앱이 만든 파일에만 접근하며,
              나머지 Drive 내용은 읽지 못합니다.
            </p>
          </>
        ) : driveOn ? (
          <>
            <p className="small">
              업로드한 원본은 Drive 의 <b>도당동 아카이브</b> 폴더 아래, 묶음별 하위 폴더에
              들어갑니다.
            </p>
            {rootFolder && (
              <a
                href={`https://drive.google.com/drive/folders/${rootFolder}`}
                target="_blank"
                rel="noreferrer"
                className="btn small ghost"
                style={{ alignSelf: 'flex-start' }}
              >
                Drive 에서 폴더 열기
              </a>
            )}
            <form action={disconnectDrive}>
              <button type="submit" className="btn small ghost">
                연결 끊기
              </button>
            </form>
            <p className="small dim">
              연결을 끊어도 Drive 의 파일과 아카이브의 기술 정보는 그대로 남습니다. 새 업로드만
              막힙니다.
            </p>
          </>
        ) : (
          <>
            <p className="small">
              연결하면 이 앱이 Drive 에 <b>도당동 아카이브</b> 폴더를 만들고, 업로드한 원본을 그
              안에 넣습니다.
            </p>
            <a href="/api/google/start" className="btn" style={{ alignSelf: 'flex-start' }}>
              Google Drive 연결
            </a>
            <p className="small dim">
              동의 화면에서 &quot;확인되지 않은 앱&quot; 경고가 뜨면 <b>고급 → 안전하지 않은
              페이지로 이동</b>을 눌러 진행하세요. 본인이 만든 앱이라 목록에 없는 것입니다.
            </p>
          </>
        )}
      </div>

      <div className="statgrid">
        <div className="stat">
          <div className="n">{driveFiles ?? 0}</div>
          <div className="k">Drive 원본</div>
        </div>
        <div className="stat">
          <div className="n">{supaFiles ?? 0}</div>
          <div className="k">Supabase 파일</div>
        </div>
        <div className="stat">
          <div className="n" style={{ color: unverified ? 'var(--warn)' : undefined }}>
            {unverified ?? 0}
          </div>
          <div className="k">체크섬 미확인</div>
        </div>
      </div>

      <div className="callout">
        <b>체크섬 미확인</b>이란, 서버가 파일을 직접 읽어 sha256 을 계산하지 못한 원본을
        말합니다. 영상처럼 내려받지 않는 파일이 여기 들어가며, 대신 Drive 가 계산한 md5 를
        무결성 근거로 기록해 둡니다. &quot;체크섬이 있다&quot;와 &quot;무결성이 확인됐다&quot;를
        구분하기 위한 표시입니다.
      </div>

      <Link href="/admin" className="small">
        ← 작업 대기열
      </Link>
    </main>
  );
}
