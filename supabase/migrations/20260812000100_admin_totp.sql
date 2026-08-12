-- 관리자 2단계 인증 (TOTP).
--
-- 비밀번호 하나가 아카이브 전체의 유일한 자물쇠였다. 비밀번호는 새어나가고,
-- 새어나간 사실을 한동안 모른다. 두 번째 자물쇠를 둔다.
--
-- 관리자가 한 명뿐이므로 한 행짜리 표다. id 를 true 로 고정해 두 번째 행이
-- 생기지 않게 한다 — 두 개의 2단계 인증 설정이 공존하면 어느 쪽이 참인지
-- 판단할 근거가 없어진다.

create table admin_totp (
  id               boolean primary key default true check (id),
  -- 평문으로 두지 않는다. SESSION_SECRET 에서 파생한 키로 AES-GCM 암호화한 값.
  secret_encrypted text not null,
  activated_at     timestamptz,
  -- 같은 코드를 두 번 쓰지 못하게 마지막으로 쓴 시간대를 기록한다.
  -- 어깨너머로 본 코드가 30초 안에 재사용되는 것을 막는다.
  last_step        bigint,
  -- 복구 코드의 해시. 원본은 발급 순간 한 번만 보여주고 어디에도 남기지 않는다.
  recovery_hashes  text[] not null default '{}',
  created_at       timestamptz not null default now(),
  modified_at      timestamptz not null default now()
);

comment on table admin_totp is
  '관리자 2단계 인증 설정. 한 행만 존재한다.';
comment on column admin_totp.last_step is
  '마지막으로 인증에 쓰인 TOTP 시간대. 같은 코드의 재사용을 막는다.';
comment on column admin_totp.recovery_hashes is
  '복구 코드 SHA-256 해시. 쓰면 목록에서 지운다.';

alter table admin_totp enable row level security;
grant select, insert, update, delete on admin_totp to service_role;
