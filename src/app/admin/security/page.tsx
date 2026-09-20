import Link from 'next/link';
import { requireAdmin } from '@/lib/access';
import { totpState, pendingSecret } from '@/lib/two-factor';
import { otpauthUri, formatSecret } from '@/lib/totp';
import { db } from '@/lib/db';
import QRCode from 'qrcode';
import Field from '@/components/admin/Field';
import Notice from '@/components/admin/Notice';
import StatusBadge from '@/components/admin/StatusBadge';
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
    <div className="page page-admin">
      <section className="admin-sec">
        <h1 className="page-title jg-pixel">2단계 인증</h1>
        <p className="page-lead">
          비밀번호는 새어나가고, 새어나간 사실을 한동안 모릅니다. 인증 앱의 6자리 코드를 두 번째
          자물쇠로 겁니다.
        </p>

        {error ? <Notice tone="error">{decodeURIComponent(error)}</Notice> : null}
        {done ? <Notice tone="success">{decodeURIComponent(done)}</Notice> : null}
      </section>

      {recoveryCodes && (
        <section className="admin-sec">
          <h2 className="sec-title jg-pixel">복구 코드 — 지금 옮겨 적으세요</h2>
          {/* 되돌릴 수 없는 일이라 가장 무거운 상자로 말한다. 이 코드는
              해시로만 저장되므로 화면을 떠나면 서버도 원문을 모른다. */}
          <Notice tone="error" title="이 화면을 벗어나면 다시 볼 수 없습니다">
            휴대폰을 잃어버렸을 때 들어올 수 있는 유일한 길입니다. 한 코드는 한 번만 씁니다.
          </Notice>
          <ul className="jg-chips">
            {recoveryCodes.map((c) => (
              <li key={c}>
                <code>{c}</code>
              </li>
            ))}
          </ul>
        </section>
      )}

      {/* ---------------- 상태에 따른 화면 ---------------- */}

      {!state.enrolled && (
        <section className="admin-sec">
          {/* 켜짐·꺼짐은 색이 아니라 네모의 모양으로 가른다 — 이 화면에는
              강조색이 없다. 빈 네모가 꺼진 것이다. */}
          <h2 className="sec-title jg-pixel">
            꺼져 있음 <StatusBadge level="private" label="비밀번호만으로 들어올 수 있음" />
          </h2>
          <p className="page-lead">
            켜면 로그인할 때 아이디·비밀번호 다음에 인증 앱 코드를 한 번 더 묻습니다.
            Google Authenticator, 1Password, Authy 등 어떤 TOTP 앱이든 됩니다.
          </p>
          <form action={startEnrollment} className="form-actions">
            <button type="submit" className="jg-btn jg-btn-primary">2단계 인증 켜기</button>
          </form>
        </section>
      )}

      {state.enrolled && !state.activated && secret && (
        <>
          <section className="admin-sec">
            <h2 className="sec-title jg-pixel">1. 인증 앱에 등록</h2>
            <p className="page-lead">Google Authenticator 를 열고 QR 을 찍으세요.</p>

            {qrDataUrl && (
              // QR 은 흰 바탕에서만 읽힌다 — 화면 배경이 무엇이든 여기만
              // 흰 종이를 깐다.
              <span
                style={{
                  display: 'inline-block',
                  width: 'fit-content',
                  padding: 8,
                  background: '#FFFFFF',
                  border: '2px solid var(--ink)',
                }}
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={qrDataUrl} alt="2단계 인증 QR 코드" width={220} height={220} />
              </span>
            )}

            <dl className="jg-meta">
              <div className="jg-meta-row">
                <dt className="jg-meta-key">
                  <span className="jg-meta-name">비밀 키</span>
                  <span className="jg-meta-code">secret</span>
                </dt>
                <dd className="jg-meta-val is-mono">{formatSecret(secret)}</dd>
              </div>
              <div className="jg-meta-row">
                <dt className="jg-meta-key">
                  <span className="jg-meta-name">계정 이름</span>
                </dt>
                <dd className="jg-meta-val">{account}</dd>
              </div>
              <div className="jg-meta-row">
                <dt className="jg-meta-key">
                  <span className="jg-meta-name">발급자</span>
                </dt>
                <dd className="jg-meta-val">{ISSUER}</dd>
              </div>
            </dl>
            <p className="jg-note">QR 을 찍을 수 없다면 이 셋을 앱에 직접 넣습니다.</p>
          </section>

          <section className="admin-sec">
            <h2 className="sec-title jg-pixel">2. 코드로 확인</h2>
            <p className="page-lead">
              앱에 뜬 6자리를 넣어야 켜집니다. 등록이 제대로 되지 않았는데 켜지면 들어올 길이
              없어지기 때문입니다.
            </p>
            {/* 한 화면에 code 칸이 여럿 설 수 있으므로 id 를 따로 준다.
                넘어가는 이름(name="code")은 셋 다 같아야 한다. */}
            <form action={confirmEnrollment} className="edit-form">
              <div className="form-grid">
                <Field
                  id="totp-confirm"
                  label="인증 앱 코드"
                  name="code"
                  mono
                  inputMode="numeric"
                  maxLength={6}
                  placeholder="000000"
                  required
                />
              </div>
              <div className="form-actions">
                <button type="submit" className="jg-btn jg-btn-primary">확인하고 켜기</button>
              </div>
            </form>
          </section>
        </>
      )}

      {state.activated && (
        <>
          <section className="admin-sec">
            <h2 className="sec-title jg-pixel">
              켜져 있음 <StatusBadge level="public" label="로그인에 코드 필요" />
            </h2>
            <p className="page-lead">
              남은 복구 코드 <strong>{state.recoveryRemaining}개</strong>
              {state.recoveryRemaining <= 3 && ' — 곧 떨어집니다. 재발급을 권합니다.'}
            </p>
          </section>

          <section className="admin-sec">
            <h2 className="sec-title jg-pixel">복구 코드 재발급</h2>
            <p className="page-lead">
              새로 만들면 이전 코드는 모두 무효가 됩니다. 현재 코드를 한 번 확인합니다.
            </p>
            <form action={newRecoveryCodes} className="edit-form">
              <div className="form-grid">
                <Field
                  id="totp-reissue"
                  label="인증 앱 코드"
                  name="code"
                  mono
                  inputMode="numeric"
                  maxLength={9}
                  placeholder="000000"
                  required
                />
              </div>
              <div className="form-actions">
                <button type="submit" className="jg-btn jg-btn-secondary">재발급</button>
              </div>
            </form>
          </section>

          <section className="admin-sec">
            <h2 className="sec-title jg-pixel">끄기</h2>
            <Notice tone="error" title="끄면 자물쇠가 하나만 남습니다">
              비밀번호 하나만으로 들어올 수 있게 됩니다. 권하지 않습니다.
            </Notice>
            <form action={turnOffTotp} className="edit-form">
              <div className="form-grid">
                <Field
                  id="totp-off"
                  label="인증 앱 코드"
                  name="code"
                  mono
                  inputMode="numeric"
                  maxLength={9}
                  placeholder="000000"
                  required
                />
              </div>
              <div className="form-actions">
                <button type="submit" className="jg-btn jg-btn-text">2단계 인증 끄기</button>
              </div>
            </form>
          </section>
        </>
      )}

      <section className="admin-sec">
        <h2 className="sec-title jg-pixel">최근 접속 시도</h2>
        {(attempts ?? []).length === 0 ? (
          <div className="empty">
            <p className="jg-pixel">기록 없음</p>
          </div>
        ) : (
          <div className="jg-rtable-wrap">
            <table className="jg-rtable">
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
                    <td className="is-mono is-muted">{new Date(a.at).toLocaleString('ko-KR')}</td>
                    <td className="is-mono is-muted">{a.ip}</td>
                    <td className="is-muted">{a.username ?? '—'}</td>
                    {/* 성공·실패도 네모의 모양으로 가른다. 채운 네모가 성공. */}
                    <td>
                      <StatusBadge
                        level={a.succeeded ? 'public' : 'private'}
                        label={a.succeeded ? '성공' : '실패'}
                      />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <div className="form-actions">
        <Link href="/admin" className="jg-btn jg-btn-text">← 기록 목록</Link>
      </div>
    </div>
  );
}
