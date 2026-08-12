import Link from 'next/link';
import { requireAdmin } from '@/lib/access';
import { totpState, pendingSecret, beginEnrollment } from '@/lib/two-factor';
import { otpauthUri, formatSecret } from '@/lib/totp';
import { db } from '@/lib/db';
import QRCode from 'qrcode';
import { startEnrollment, confirmEnrollment, turnOffTotp, newRecoveryCodes } from '../actions';

export const dynamic = 'force-dynamic';

const ISSUER = '도당동 아카이브';

/**
 * 2단계 인증 관리.
 *
 * 비밀번호 하나가 아카이브 전체의 유일한 자물쇠였다. 여기서 두 번째를 건다.
 * 등록은 코드를 한 번 맞혀야 완료된다 — 인증 앱에 제대로 들어가지 않았는데
 * 켜져 버리면 관리자가 자기 사이트에서 잠긴다.
 */
export default async function SecurityPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; codes?: string; done?: string }>;
}) {
  await requireAdmin();
  const { error, codes, done } = await searchParams;

  const state = await totpState();
  const account = process.env.ADMIN_USERNAME ?? 'admin';

  // 등록 중(아직 활성화 전)이면 QR 을 보여준다.
  let qrDataUrl: string | null = null;
  let secret: string | null = null;
  if (state.enrolled && !state.activated) {
    secret = await pendingSecret();
    if (secret) {
      const uri = otpauthUri(secret, account, ISSUER);
      // QR 은 서버에서 그려 data URI 로 넣는다. 외부로 나가는 요청이 없다.
      qrDataUrl = await QRCode.toDataURL(uri, { margin: 1, width: 220, errorCorrectionLevel: 'M' });
    }
  }

  const recoveryCodes = codes ? decodeURIComponent(codes).split(',') : null;

  // 최근 접속 기록
  const { data: attempts } = await db()
    .from('login_attempt')
    .select('ip, username, succeeded, at')
    .order('at', { ascending: false })
    .limit(8);

  return (
    <main className="wrap narrow">
      <section className="stack">
        <span className="eyebrow">보안</span>
        <h1>2단계 인증</h1>
        <p className="lede">
          비밀번호는 새어나가고, 새어나간 사실을 한동안 모릅니다. 인증 앱의 6자리 코드를 두 번째
          자물쇠로 겁니다.
        </p>
      </section>

      {error && <div className="callout err">{decodeURIComponent(error)}</div>}
      {done && (
        <div
          className="callout"
          style={{ borderColor: 'var(--accent)', background: 'var(--accent-bg)', color: 'var(--accent)' }}
        >
          {decodeURIComponent(done)}
        </div>
      )}

      {recoveryCodes && (
        <div className="box stack">
          <h3>복구 코드 — 지금 옮겨 적으세요</h3>
          <p className="small">
            휴대폰을 잃어버렸을 때 들어올 수 있는 유일한 길입니다. <b>이 화면을 벗어나면 다시 볼
            수 없습니다.</b> 한 코드는 한 번만 씁니다.
          </p>
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(9rem, 1fr))',
              gap: '0.4rem',
            }}
          >
            {recoveryCodes.map((c) => (
              <span key={c} className="chip" style={{ justifyContent: 'center', fontSize: 14 }}>
                {c}
              </span>
            ))}
          </div>
        </div>
      )}

      {/* ---------------- 상태에 따른 화면 ---------------- */}

      {!state.enrolled && (
        <div className="box stack">
          <div className="row">
            <h3>꺼져 있음</h3>
            <span className="chip warn row-end">비밀번호만으로 들어올 수 있음</span>
          </div>
          <p className="small">
            켜면 로그인할 때 아이디·비밀번호 다음에 인증 앱 코드를 한 번 더 묻습니다.
            Google Authenticator, 1Password, Authy 등 어떤 TOTP 앱이든 됩니다.
          </p>
          <form action={startEnrollment}>
            <button type="submit" className="btn">
              2단계 인증 켜기
            </button>
          </form>
        </div>
      )}

      {state.enrolled && !state.activated && secret && (
        <div className="box stack">
          <h3>1. 인증 앱에 등록</h3>
          <p className="small">Google Authenticator 를 열고 QR 을 찍으세요.</p>

          {qrDataUrl && (
            <span
              className="tile"
              style={{ width: 220, height: 220, alignSelf: 'flex-start', background: '#FFFFFF' }}
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={qrDataUrl} alt="2단계 인증 QR 코드" width={220} height={220} />
            </span>
          )}

          <div className="panel">
            <h5>QR 을 찍을 수 없다면 직접 입력</h5>
            <p style={{ fontSize: 14, letterSpacing: '0.08em', wordBreak: 'break-all' }}>
              {formatSecret(secret)}
            </p>
            <p className="small">계정 이름: {account} · 발급자: {ISSUER}</p>
          </div>

          <div className="rule" />

          <h3>2. 코드로 확인</h3>
          <p className="small">
            앱에 뜬 6자리를 넣어야 켜집니다. 등록이 제대로 되지 않았는데 켜지면 들어올 길이
            없어지기 때문입니다.
          </p>
          <form action={confirmEnrollment} className="row">
            <input
              name="code"
              type="text"
              inputMode="numeric"
              maxLength={6}
              placeholder="000000"
              required
              style={{ maxWidth: '8rem', letterSpacing: '0.2em', textAlign: 'center' }}
            />
            <button type="submit" className="btn">
              확인하고 켜기
            </button>
          </form>
        </div>
      )}

      {state.activated && (
        <div className="box stack">
          <div className="row">
            <h3>켜져 있음</h3>
            <span className="chip accent row-end">로그인에 코드 필요</span>
          </div>
          <p className="small">
            남은 복구 코드 <b>{state.recoveryRemaining}개</b>
            {state.recoveryRemaining <= 3 && ' — 곧 떨어집니다. 재발급을 권합니다.'}
          </p>

          <div className="rule" />

          <h3>복구 코드 재발급</h3>
          <p className="small">
            새로 만들면 이전 코드는 모두 무효가 됩니다. 현재 코드를 한 번 확인합니다.
          </p>
          <form action={newRecoveryCodes} className="row">
            <input
              name="code"
              type="text"
              inputMode="numeric"
              maxLength={9}
              placeholder="000000"
              required
              style={{ maxWidth: '8rem', letterSpacing: '0.2em', textAlign: 'center' }}
            />
            <button type="submit" className="btn ghost">
              재발급
            </button>
          </form>

          <div className="rule" />

          <h3>끄기</h3>
          <p className="small">
            끄면 비밀번호 하나만으로 들어올 수 있게 됩니다. 권하지 않습니다.
          </p>
          <form action={turnOffTotp} className="row">
            <input
              name="code"
              type="text"
              inputMode="numeric"
              maxLength={9}
              placeholder="000000"
              required
              style={{ maxWidth: '8rem', letterSpacing: '0.2em', textAlign: 'center' }}
            />
            <button type="submit" className="btn ghost">
              2단계 인증 끄기
            </button>
          </form>
        </div>
      )}

      <section className="stack">
        <div className="rule" />
        <h2>최근 접속 시도</h2>
        <div className="tw">
          <table>
            <thead>
              <tr>
                <th>시각</th>
                <th>주소</th>
                <th>아이디</th>
                <th>결과</th>
              </tr>
            </thead>
            <tbody>
              {(attempts ?? []).map((a, i) => (
                <tr key={i}>
                  <td className="dim">{new Date(a.at).toLocaleString('ko-KR')}</td>
                  <td className="dim">{a.ip}</td>
                  <td className="dim">{a.username ?? '—'}</td>
                  <td style={{ color: a.succeeded ? 'var(--accent)' : 'var(--danger)' }}>
                    {a.succeeded ? '성공' : '실패'}
                  </td>
                </tr>
              ))}
              {(attempts ?? []).length === 0 && (
                <tr>
                  <td colSpan={4} className="dim">
                    기록 없음
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>

      <Link href="/admin" className="small">
        ← 작업 대기열
      </Link>
    </main>
  );
}
