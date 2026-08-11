import { redirect } from 'next/navigation';
import { cookies } from 'next/headers';
import { SESSION_COOKIE } from '@/lib/access';

export const dynamic = 'force-dynamic';

export default async function LogoutPage() {
  async function logout() {
    'use server';
    const jar = await cookies();
    jar.delete(SESSION_COOKIE);
    redirect('/');
  }

  return (
    <main className="wrap narrow">
      <form action={logout} className="box stack">
        <h2>로그아웃할까요?</h2>
        <p className="small">다시 들어오려면 암호를 한 번 더 넣어야 합니다.</p>
        <div className="row">
          <button type="submit" className="btn">
            로그아웃
          </button>
        </div>
      </form>
    </main>
  );
}
