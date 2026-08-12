-- 로그인 시도 기록.
--
-- 이 사이트는 아이디 하나(관리자)만 열려 있고 비밀번호가 유일한 자물쇠다.
-- 무제한으로 찔러볼 수 있으면 자물쇠가 없는 것과 다르지 않으므로,
-- 같은 주소에서 실패가 쌓이면 잠시 막는다.
--
-- 성공한 시도도 남긴다. "언제 누가 들어왔는가"는 사고가 났을 때
-- 가장 먼저 확인하게 되는 기록이다.

create table login_attempt (
  id        uuid primary key default gen_random_uuid(),
  ip        text not null,
  username  text,
  succeeded boolean not null,
  at        timestamptz not null default now()
);

-- 최근 실패를 세는 질의만 빠르면 된다.
create index login_attempt_ip_idx on login_attempt (ip, at desc);

comment on table login_attempt is
  '로그인 시도 기록. 무차별 대입을 막고, 접속 이력을 남긴다.';

alter table login_attempt enable row level security;
grant select, insert, delete on login_attempt to service_role;
