-- 도당동 아카이브 — 전체 스키마
--
-- supabase/migrations/ 의 마이그레이션을 순서대로 이어붙인 것.
-- 새 Supabase 프로젝트의 SQL Editor 에 통째로 붙여넣어 한 번에 적용한다.


-- ══════════════════════════════════════════════════════════
-- 20260811000000_init.sql
-- ══════════════════════════════════════════════════════════
-- 가족 아카이브 — 초기 스키마
--
-- 설계 원칙(설계 문서 3판)을 그대로 옮긴 것:
--   * 기술 계층은 bundle(원본 묶음) > item(낱장) > file(파일 실체) 세 겹.
--   * item 의 상속 가능 필드는 NULL 이면 bundle 값을 물려받는다는 뜻이다.
--     값을 직접 넣은 순간 그 항목만 "덮어쓴 것"이 되고, 이후 묶음을 고쳐도 영향받지 않는다.
--   * 날짜는 EDTF 원문을 그대로 보관하고, 정렬용 범위를 따로 계산해 둔다.
--   * 삭제는 없다. is_archived 로 내려갈 뿐이다.

create extension if not exists "pgcrypto";

-- ---------------------------------------------------------------- 통제 어휘

-- DCMI Type Vocabulary 중 이 아카이브가 쓰는 것만.
create type dcmi_type as enum (
  'StillImage',     -- 사진, 스캔 이미지
  'Sound',          -- 육성, 녹음
  'MovingImage',    -- 영상
  'Text',           -- 편지, 문서, 글
  'PhysicalObject', -- 유품, 물건
  'Collection',     -- 모음집
  'Event'           -- 사건
);

-- 세 단계 이상으로 늘리지 않는다. 늘어나면 관리자가 판단을 미룬다.
create type access_level as enum ('public', 'family', 'private');

-- EDTF 원문에서 유도되는 시기의 정밀도.
create type date_precision as enum ('day', 'month', 'year', 'decade', 'century', 'interval', 'unknown');

create type bundle_kind as enum ('album', 'roll', 'bundle', 'tape', 'folder', 'single');

create type file_role as enum ('original', 'display', 'thumb', 'stream', 'poster');

create type person_role as enum ('depicted', 'photographer', 'author', 'recipient', 'speaker', 'mentioned');

-- ---------------------------------------------------------------- 전거

create table person (
  id               uuid primary key default gen_random_uuid(),
  display_name     text not null,
  aliases          text[] not null default '{}',   -- 할머니 / 순덕이 / 어머니 … 어느 이름으로 검색해도 찾히게
  birth_edtf       text,
  death_edtf       text,
  relation_to_root text,                            -- 아카이브 중심 인물 기준의 관계
  note             text,
  created_at       timestamptz not null default now()
);
-- array_to_string 은 immutable 이 아니라 색인식에 넣을 수 없다.
-- 이름은 전문 색인으로, 별칭은 배열 색인으로 나눠 건다.
create index person_name_idx on person using gin (to_tsvector('simple', display_name));
create index person_alias_idx on person using gin (aliases);

create table place (
  id          uuid primary key default gen_random_uuid(),
  family_name text not null,   -- "초량 가게" 처럼 가족만 아는 이름
  admin_name  text,            -- "부산 동구 초량동" 행정 지명
  note        text,
  created_at  timestamptz not null default now()
);

-- ---------------------------------------------------------------- 수집과 묶음

create table acquisition (
  id             uuid primary key default gen_random_uuid(),
  visited_on     date not null,
  from_person_id uuid references person(id) on delete set null,
  from_label     text,          -- 전거에 없는 제공자를 적을 때
  location       text,
  note           text,
  created_at     timestamptz not null default now()
);

create table bundle (
  id                   uuid primary key default gen_random_uuid(),
  acquisition_id       uuid references acquisition(id) on delete set null,
  title                text not null,
  kind                 bundle_kind not null default 'folder',
  -- 아래 다섯은 낱장이 물려받는 값이다.
  source               text not null,                       -- 묶음에서는 출처가 필수
  provenance           text,
  place_id             uuid references place(id) on delete set null,
  rights               text,
  default_access_level access_level not null default 'family',
  period_edtf          text,
  period_start         date,
  period_end           date,
  digitized_by         text,
  digitized_on         date,
  note                 text,
  is_archived          boolean not null default false,
  created_at           timestamptz not null default now(),
  modified_at          timestamptz not null default now()
);
create index bundle_acquisition_idx on bundle (acquisition_id);

-- ---------------------------------------------------------------- 자료

create table item (
  id           uuid primary key default gen_random_uuid(),
  bundle_id    uuid not null references bundle(id) on delete cascade,
  identifier   text not null unique,       -- ARC-0000001 · 파일명이 바뀌어도 변하지 않는다
  seq          integer not null default 0, -- 묶음 안에서의 순서
  title        text not null,
  type         dcmi_type not null,

  -- 시기: EDTF 원문 + 정렬용 유도값
  created_edtf      text,
  created_start     date,
  created_end       date,
  created_precision date_precision not null default 'unknown',
  created_uncertain boolean not null default false,  -- 1958?
  created_approx    boolean not null default false,  -- 1958~

  description  text,
  creator      text,
  language     text,
  medium       text,
  extent       text,

  -- 상속 필드: NULL = 묶음에서 물려받음, 값 있음 = 덮어씀
  source       text,
  provenance   text,
  place_id     uuid references place(id) on delete set null,
  rights       text,
  access_level access_level,

  is_featured  boolean not null default false,  -- 선별 상세 기술 대상
  is_archived  boolean not null default false,
  submitted_at timestamptz not null default now(),
  modified_at  timestamptz not null default now()
);
create index item_bundle_idx on item (bundle_id, seq);
create index item_created_idx on item (created_start);
create index item_type_idx on item (type);
create index item_search_idx on item using gin (to_tsvector('simple', coalesce(title,'') || ' ' || coalesce(description,'')));

-- 사람이 손대지 않아도 식별자가 붙게 한다.
create sequence item_identifier_seq;
create or replace function assign_item_identifier() returns trigger language plpgsql as $$
begin
  if new.identifier is null or new.identifier = '' then
    new.identifier := 'ARC-' || lpad(nextval('item_identifier_seq')::text, 7, '0');
  end if;
  return new;
end $$;
create trigger item_identifier_trg before insert on item
  for each row execute function assign_item_identifier();

create or replace function touch_modified() returns trigger language plpgsql as $$
begin
  new.modified_at := now();
  return new;
end $$;
create trigger item_touch_trg before update on item
  for each row execute function touch_modified();
create trigger bundle_touch_trg before update on bundle
  for each row execute function touch_modified();

-- ---------------------------------------------------------------- 파일 실체

create table file (
  id              uuid primary key default gen_random_uuid(),
  item_id         uuid not null references item(id) on delete cascade,
  role            file_role not null,
  storage_bucket  text not null,
  storage_path    text not null,
  mime            text,
  bytes           bigint,
  width           integer,
  height          integer,
  duration_ms     integer,
  checksum_sha256 text,
  exif            jsonb,
  created_at      timestamptz not null default now(),
  unique (storage_bucket, storage_path)
);
create index file_item_idx on file (item_id, role);
-- 같은 원본을 두 번 올리는 일을 막는다.
create unique index file_original_checksum_idx on file (checksum_sha256) where role = 'original';

-- ---------------------------------------------------------------- 관계

create table item_person (
  item_id   uuid not null references item(id) on delete cascade,
  person_id uuid not null references person(id) on delete cascade,
  role      person_role not null default 'depicted',
  primary key (item_id, person_id, role)
);

create table collection (
  id            uuid primary key default gen_random_uuid(),
  title         text not null,
  kind          text not null default 'topic',   -- topic | event
  description   text,
  period_edtf   text,
  cover_item_id uuid references item(id) on delete set null,
  sort_order    integer not null default 0,
  created_at    timestamptz not null default now()
);

create table item_collection (
  item_id       uuid not null references item(id) on delete cascade,
  collection_id uuid not null references collection(id) on delete cascade,
  sort_order    integer not null default 0,
  primary key (item_id, collection_id)
);

create table transcript (
  id         uuid primary key default gen_random_uuid(),
  item_id    uuid not null references item(id) on delete cascade,
  source     text not null default 'auto',   -- auto | manual
  reviewed   boolean not null default false,
  segments   jsonb not null default '[]'::jsonb,  -- [{start_ms, end_ms, text}]
  full_text  text,
  created_at timestamptz not null default now(),
  modified_at timestamptz not null default now()
);
create index transcript_item_idx on transcript (item_id);
create index transcript_search_idx on transcript using gin (to_tsvector('simple', coalesce(full_text, '')));

create table event_log (
  id         uuid primary key default gen_random_uuid(),
  item_id    uuid references item(id) on delete set null,
  bundle_id  uuid references bundle(id) on delete set null,
  action     text not null,
  before     jsonb,
  after      jsonb,
  at         timestamptz not null default now()
);
create index event_log_item_idx on event_log (item_id, at desc);

-- ---------------------------------------------------------------- 상속을 펼친 뷰
--
-- 화면과 내보내기는 전부 이 뷰를 본다. 상속 규칙이 한 곳에만 존재하도록.

create view item_effective as
select
  i.id,
  i.identifier,
  i.bundle_id,
  i.seq,
  i.title,
  i.type,
  i.created_edtf,
  i.created_start,
  i.created_end,
  i.created_precision,
  i.created_uncertain,
  i.created_approx,
  i.description,
  i.creator,
  i.language,
  i.medium,
  i.extent,
  i.is_featured,
  i.is_archived,
  i.submitted_at,
  i.modified_at,
  coalesce(i.source, b.source)                           as source,
  coalesce(i.provenance, b.provenance)                   as provenance,
  coalesce(i.place_id, b.place_id)                       as place_id,
  coalesce(i.rights, b.rights)                           as rights,
  coalesce(i.access_level, b.default_access_level)       as access_level,
  (i.source is not null)       as source_overridden,
  (i.provenance is not null)   as provenance_overridden,
  (i.place_id is not null)     as place_overridden,
  (i.rights is not null)       as rights_overridden,
  (i.access_level is not null) as access_overridden,
  b.title       as bundle_title,
  b.kind        as bundle_kind,
  b.period_edtf as bundle_period_edtf,
  b.is_archived as bundle_archived
from item i
join bundle b on b.id = i.bundle_id;

-- ---------------------------------------------------------------- 접근 통제
--
-- 모든 DB 접근은 Next.js 서버에서 secret key 로만 이루어진다.
-- RLS 를 켜두고 정책을 두지 않음으로써, 브라우저에 유출된 키로는
-- 어떤 행도 읽히지 않게 한다. 열람 권한 판정은 서버 코드가 담당한다.

alter table person          enable row level security;
alter table place           enable row level security;
alter table acquisition     enable row level security;
alter table bundle          enable row level security;
alter table item            enable row level security;
alter table file            enable row level security;
alter table item_person     enable row level security;
alter table collection      enable row level security;
alter table item_collection enable row level security;
alter table transcript      enable row level security;
alter table event_log       enable row level security;

-- ---------------------------------------------------------------- 스토리지
--
-- originals: 업로드된 원본 그대로. 웹에서 직접 접근하지 않는다.
-- derivatives: 화면용 축소본. 언제든 원본에서 다시 만들 수 있다.
-- 둘 다 비공개이며, 접근 등급을 확인한 뒤 서버가 스트리밍한다.

insert into storage.buckets (id, name, public) values
  ('originals', 'originals', false),
  ('derivatives', 'derivatives', false)
on conflict (id) do nothing;


-- ══════════════════════════════════════════════════════════
-- 20260811000100_grants.sql
-- ══════════════════════════════════════════════════════════
-- 권한.
--
-- 서버는 secret key(service_role)로만 접근한다. 그 역할에만 읽기·쓰기를 주고,
-- 브라우저가 쓰는 anon/authenticated 에는 아무것도 주지 않는다.
-- RLS 는 켜져 있고 정책이 없으므로, 설령 키가 새더라도 직접 읽히지 않는다.

grant usage on schema public to service_role;

grant select, insert, update, delete on all tables in schema public to service_role;
grant usage, select on all sequences in schema public to service_role;

-- 앞으로 추가될 테이블에도 같은 권한이 자동으로 붙게.
alter default privileges in schema public
  grant select, insert, update, delete on tables to service_role;
alter default privileges in schema public
  grant usage, select on sequences to service_role;

-- 뷰가 소유자 권한이 아니라 호출자 권한으로 돌게 해서,
-- 뒤에 RLS 정책을 붙이더라도 뷰가 우회로가 되지 않도록 한다.
alter view item_effective set (security_invoker = on);

-- anon/authenticated 에서 회수. Supabase 기본 설정이 열어둔 것이 있어도 닫는다.
revoke all on all tables in schema public from anon, authenticated;
revoke all on all sequences in schema public from anon, authenticated;


-- ══════════════════════════════════════════════════════════
-- 20260811000200_original_filename.sql
-- ══════════════════════════════════════════════════════════
-- 원본 파일명 보관.
--
-- 스토리지 키는 ASCII 로만 만들 수 있어서 "1958_혼례_04.jpg" 같은 이름을
-- 그대로 경로에 쓸 수 없다. 어차피 파일명에 의미를 담지 않는 것이 원칙이므로
-- 경로는 기계적으로 짓고, 사람이 붙였던 이름은 기록으로 남긴다.

alter table file add column original_filename text;

comment on column file.original_filename is
  '업로드 당시의 파일명. 스토리지 경로와 무관하며, 출처를 되짚을 때 쓴다.';


-- ══════════════════════════════════════════════════════════
-- 20260811000300_checksum_verified.sql
-- ══════════════════════════════════════════════════════════
-- 체크섬을 누가 계산했는가.
--
-- 브라우저가 스토리지로 직접 올리는 방식으로 바꾸면서, 파일 바이트가 서버를
-- 거치지 않는 경로가 생겼다. 그런 경우 체크섬은 브라우저가 계산한 값이므로
-- 무결성 근거로 쓸 수 없다. 서버가 실제로 내려받아 확인한 것만 참으로 둔다.
--
-- 이 구분이 없으면 "체크섬이 있다"는 사실이 "무결성이 확인됐다"로 잘못 읽힌다.

alter table file add column checksum_verified boolean not null default false;

comment on column file.checksum_verified is
  '서버가 파일을 직접 읽어 계산한 체크섬인가. false 면 클라이언트가 보고한 값이며 나중에 재확인이 필요하다.';

-- 아직 확인되지 않은 원본을 찾는 색인 — 정기 검사 작업이 쓴다.
create index file_unverified_idx on file (created_at)
  where role = 'original' and checksum_verified = false;


-- ══════════════════════════════════════════════════════════
-- 20260811000400_drive.sql
-- ══════════════════════════════════════════════════════════
-- 원본은 Google Drive, 화면용 사본은 Supabase.
--
-- 왜 나눴나
--   용량의 99%를 차지하는 원본(스캔본·영상)은 크고, 거의 안 읽히고, 관리자만 본다.
--   반대로 축소본은 작고, 갤러리 한 화면에 수십 장씩 읽히고, 접근 등급 통제가 필요하다.
--   각각에 맞는 저장소가 다르다.
--
-- 업로드 경로
--   브라우저 → (우리 서버가 발급한 Drive 재개가능 업로드 세션) → Drive
--   파일 바이트가 우리 서버를 통과하지 않는다. 크기 제한이 없고, 끊겨도 이어 올린다.
--
-- 부수 효과가 하나 더 있다. 원본이 사람이 읽을 수 있는 폴더 구조로 Drive 에 그대로
-- 남으므로, 이 사이트가 사라져도 자료는 남는다. 앱은 그것을 가리키는 색인이 된다.

create type storage_provider as enum ('supabase', 'gdrive');

alter table file
  add column provider storage_provider not null default 'supabase',
  -- Drive 는 md5 를 준다. 영상처럼 내려받지 않는 파일의 유일한 무결성 근거다.
  add column checksum_md5 text;

comment on column file.provider is
  '이 파일의 바이트가 어디에 있는가. gdrive 면 storage_path 가 Drive file id 다.';
comment on column file.checksum_md5 is
  'Drive 가 보고한 md5. 내려받지 않는 파일(영상·음성)의 무결성 근거.';

-- 같은 Drive 파일을 두 번 등록하지 않는다.
create unique index file_drive_id_idx on file (storage_path)
  where provider = 'gdrive' and role = 'original';

-- 원본 체크섬 유일 색인은 sha256 이 있는 것에만 적용한다.
-- (Drive 경유 영상은 sha256 이 없고 md5 만 있다)
drop index if exists file_original_checksum_idx;
create unique index file_original_checksum_idx on file (checksum_sha256)
  where role = 'original' and checksum_sha256 is not null;
create unique index file_original_md5_idx on file (checksum_md5)
  where role = 'original' and checksum_md5 is not null;

-- 묶음마다 Drive 폴더 하나. 앱이 만들고, 앱이 올린 파일만 그 안에 들어간다.
alter table bundle
  add column drive_folder_id text;

comment on column bundle.drive_folder_id is
  '이 묶음의 원본이 담기는 Drive 폴더 id. 앱이 처음 업로드할 때 만든다.';

-- ---------------------------------------------------------------- 앱 설정
--
-- Google 리프레시 토큰을 둘 곳. 배포 환경에서는 환경변수를 코드가 바꿀 수 없으므로,
-- 관리자가 화면에서 연결한 결과를 여기에 저장한다.

create table app_setting (
  key        text primary key,
  value      text not null,
  updated_at timestamptz not null default now()
);

comment on table app_setting is
  '관리자가 화면에서 설정하는 값. 지금은 Google 리프레시 토큰 하나뿐이다.';

alter table app_setting enable row level security;
grant select, insert, update, delete on app_setting to service_role;

-- ---------------------------------------------------------------- 뷰 갱신

drop view if exists item_effective;
create view item_effective as
select
  i.id,
  i.identifier,
  i.bundle_id,
  i.seq,
  i.title,
  i.type,
  i.created_edtf,
  i.created_start,
  i.created_end,
  i.created_precision,
  i.created_uncertain,
  i.created_approx,
  i.description,
  i.creator,
  i.language,
  i.medium,
  i.extent,
  i.is_featured,
  i.is_archived,
  i.submitted_at,
  i.modified_at,
  coalesce(i.source, b.source)                           as source,
  coalesce(i.provenance, b.provenance)                   as provenance,
  coalesce(i.place_id, b.place_id)                       as place_id,
  coalesce(i.rights, b.rights)                           as rights,
  coalesce(i.access_level, b.default_access_level)       as access_level,
  (i.source is not null)       as source_overridden,
  (i.provenance is not null)   as provenance_overridden,
  (i.place_id is not null)     as place_overridden,
  (i.rights is not null)       as rights_overridden,
  (i.access_level is not null) as access_overridden,
  b.title           as bundle_title,
  b.kind            as bundle_kind,
  b.period_edtf     as bundle_period_edtf,
  b.is_archived     as bundle_archived,
  b.drive_folder_id as bundle_drive_folder_id
from item i
join bundle b on b.id = i.bundle_id;

grant select on item_effective to service_role;
alter view item_effective set (security_invoker = on);


-- ══════════════════════════════════════════════════════════
-- 20260812000000_login_attempt.sql
-- ══════════════════════════════════════════════════════════
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


-- ══════════════════════════════════════════════════════════
-- 20260812000100_admin_totp.sql
-- ══════════════════════════════════════════════════════════
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
