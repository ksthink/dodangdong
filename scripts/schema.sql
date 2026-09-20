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


-- ══════════════════════════════════════════════════════════
-- 20260920000000_chronicle.sql
-- ══════════════════════════════════════════════════════════
-- 연표.
--
-- 분류가 "무엇을·어디서 나온·무엇에 관한" 것으로 찾는 길이라면, 연표는
-- "언제, 그때 누가 몇 살이었나"로 찾는 길이다. 같은 자료를 다른 손잡이로
-- 잡는 것이고, 가족 아카이브에서는 이쪽이 훨씬 자주 쓰인다 — 사람은
-- 분류 체계를 기억하지 못해도 "내가 초등학교 들어가던 해"는 기억한다.
--
-- 연표는 따로 입력하지 않는다. 이미 있는 것에서 만들어진다:
--   사람의 생몰(person) + 생애 시기(life_period)
--   + 날짜 있는 모든 자료(item.created_start)
--   + 사건(dcmi_type = 'Event' 인 item)
--   + 그해의 바깥 세상(world_event)
-- 그래서 이 마이그레이션이 새로 만드는 표는 셋뿐이고, 나머지는 기존
-- 자료에 열을 몇 개 더하는 일이다.

-- ---------------------------------------------------------------- 확인된 날짜
--
-- 아카이브의 날짜 대부분은 추정이다. 사진 뒷면에 적힌 연도, 옷차림으로
-- 미루어 본 계절, 가족의 기억. 그런데 어떤 날짜는 증빙이 있다 —
-- 혼인신고서, 졸업장, 신문 기사. 이 둘을 같은 얼굴로 보여주면 아카이브
-- 전체의 신뢰도가 추정치 수준으로 내려앉는다.
--
-- 그래서 확인된 날짜에만 인장을 찍는다. 화면에서 유일한 색(mark)이
-- 여기에 쓰인다 — 그 색이 뜻하는 바는 "이건 우리가 지어낸 게 아니다"
-- 하나뿐이다.

alter table item
  add column date_verified    boolean not null default false,
  add column date_verified_by uuid references item(id) on delete set null;

comment on column item.date_verified is
  '생산일자가 증빙으로 확인되었는가. 참일 때만 화면에 "확인됨" 인장을 찍는다.';
comment on column item.date_verified_by is
  '그 근거가 된 기록(혼인신고서, 졸업장 따위). 근거가 아카이브 밖에 있으면 NULL.';

-- 자기 자신을 근거로 삼을 수는 없다. "이 사진의 날짜는 이 사진이 증명한다"는
-- 순환 논증이고, 인장이 뜻하는 바("우리가 지어낸 게 아니다")의 정반대다.
alter table item
  add constraint item_date_verified_by_not_self
    check (date_verified_by is null or date_verified_by <> id);

-- 근거가 달려 있는데 확인되지 않은 상태는 없다. 둘은 함께 세우고 함께 내린다 —
-- 확인을 취소하는 쪽에서 date_verified 만 끄고 date_verified_by 를 남기면
-- 여기서 막힌다. 기술 화면과 일괄 수정은 { date_verified: false,
-- date_verified_by: null } 을 함께 보내야 한다.
alter table item
  add constraint item_date_verified_consistent
    check (date_verified or date_verified_by is null);

-- 둘 사이를 오가는 고리(A 의 근거가 B, B 의 근거가 A)는 DB 로 막지 않는다.
-- 재귀 트리거가 필요한데 이 규모에 과하다. 기술 화면에서 거른다.

-- ---------------------------------------------------------------- 사람의 해
--
-- 나이를 쓰려면 태어난 해가 숫자로 있어야 한다. person 은 EDTF 원문만
-- 들고 있는데(1936?, 193X), 이건 정렬도 뺄셈도 안 된다. item 이
-- created_edtf 옆에 created_start 를 두는 것과 같은 이유로, 여기에도
-- 유도값을 둔다. 원문은 그대로 남는다 — 화면에는 원문을 보여주고
-- 계산에만 유도값을 쓴다.

alter table person
  add column born_year integer,
  add column died_year integer;

comment on column person.born_year is
  'birth_edtf 에서 뽑은 정렬·나이 계산용 연도. 추정이어도 숫자는 숫자다 — 불확실성은 birth_edtf 원문이 지고 화면이 ~ 로 표시한다.';
comment on column person.died_year is
  'death_edtf 에서 뽑은 연도. 살아 있으면 NULL.';

create index person_born_idx on person (born_year);

-- ---------------------------------------------------------------- 생애 시기
--
-- "할머니의 유년기", "혼인과 분가", "손주 시대". 네 갈래 분류 중
-- 시기분류(dcterms:temporal)가 바로 이것이다 — 서기 연도가 아니라
-- 한 사람의 생애를 기준으로 한 시간.
--
-- 이걸 별도 표로 두는 까닭: 같은 1978년이 할머니에게는 "자녀 양육기"고
-- 아버지에게는 "유년기"다. 절대 연도 하나로는 이 둘을 동시에 말할 수 없다.

create table life_period (
  id         uuid primary key default gen_random_uuid(),
  person_id  uuid not null references person(id) on delete cascade,
  label      text not null,              -- 유년기 · 혼인과 분가 · 손주 시대
  from_edtf  text,
  to_edtf    text,
  from_year  integer,                    -- 정렬·배치용 유도값
  to_year    integer,
  sort_order integer not null default 0,
  note       text,
  created_at timestamptz not null default now(),
  -- 거꾸로 된 구간은 레인에서 음수 너비가 되고, CSS 가 그걸 무시해 띠 하나가
  -- 줄 전체를 덮는다. 손으로 넣는 값이라 실제로 생긴다 — 들어오기 전에 막는다.
  constraint life_period_order check (from_year is null or to_year is null or from_year <= to_year)
);

comment on table life_period is
  '한 사람의 생애를 나눈 구간. 시기분류(dcterms:temporal)의 실체이자 연표 레인의 띠가 된다.';
comment on column life_period.to_year is
  '끝나지 않은 시기(지금도 이어지는)는 NULL. 화면은 열린 띠로 그린다.';

create index life_period_person_idx on life_period (person_id, sort_order);
create index life_period_span_idx on life_period (from_year, to_year);

-- ---------------------------------------------------------------- 사람 사이
--
-- 부모와 배우자만 둔다. 이 둘이면 나머지 호칭은 계산된다 —
-- 형제는 부모를 공유하는 사람이고, 조부모는 부모의 부모다. 관계마다
-- 표를 만들면 "큰아버지"와 "작은아버지"를 각각 넣게 되고, 그러다
-- 곧 누가 누구인지 아무도 모르는 상태가 된다.

-- 이름은 붙는 표를 앞에 단다 — bundle_kind, person_role, file_role 과 같은 결.
create type person_relation_kind as enum ('parent', 'spouse');

create table person_relation (
  from_person_id uuid not null references person(id) on delete cascade,
  to_person_id   uuid not null references person(id) on delete cascade,
  kind           person_relation_kind not null,
  note           text,
  primary key (from_person_id, to_person_id, kind),
  -- 자기 자신의 부모이거나 배우자일 수는 없다.
  constraint person_relation_not_self check (from_person_id <> to_person_id)
);

comment on table person_relation is
  'kind 는 to 가 from 에게 무엇인지를 말한다. parent 면 to 가 from 의 부모다 — 즉 (아버지, 할머니, parent) 는 "아버지의 부모는 할머니"로 읽는다. spouse 는 방향이 없으므로 양쪽 모두 넣는다.';

create index person_relation_to_idx on person_relation (to_person_id, kind);

-- ---------------------------------------------------------------- 바깥 세상
--
-- 1962년 화폐개혁, 1988년 서울 올림픽, 1997년 외환위기. 집안의 일을
-- 바깥의 일과 나란히 놓으면 "그게 그때였구나" 하는 순간이 생긴다.
--
-- 다만 이건 맥락일 뿐이다. 기록과 같은 무게로 보여주지 않는다 —
-- 연표에서 흐린 열 하나를 차지할 뿐이고, 검색에도 걸리지 않는다.

create table world_event (
  id         uuid primary key default gen_random_uuid(),
  year       integer not null,
  label      text not null,
  note       text,
  sort_order integer not null default 0,
  created_at timestamptz not null default now()
);

comment on table world_event is
  '그해의 큰 사회적 사건. 집안 기록의 배경으로만 쓴다 — 검색 대상이 아니고 기록과 같은 무게로 보여주지 않는다.';

create index world_event_year_idx on world_event (year, sort_order);

-- 같은 해에 같은 사건을 두 번 넣지 않는다. 손으로 넣는 표라 실제로 생기고,
-- 그러면 연표에 같은 줄이 두 번 나온다.
create unique index world_event_unique_idx on world_event (year, label);

-- ---------------------------------------------------------------- 뷰 갱신
--
-- item 에 열이 둘 늘었으므로 item_effective 도 다시 만든다.
-- 이 뷰는 열을 하나하나 적기 때문에, item 을 건드릴 때마다 같이 손봐야 한다.
-- (select * 를 쓰지 않는 이유는 상속 필드를 coalesce 로 덮어써야 하기 때문이다.)

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
  i.date_verified,
  i.date_verified_by,
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

-- ---------------------------------------------------------------- 권한
--
-- 이 앱은 service_role 하나로만 DB 에 닿는다. 접근 통제는 SQL 이 아니라
-- 응용 계층(lib/access.ts)에서 한다 — 공개 범위가 묶음 상속을 거쳐
-- 결정되기 때문에 RLS 정책으로 표현하면 뷰와 정책이 두 벌로 갈린다.
-- RLS 는 켜 두되 정책을 두지 않아, 다른 역할로는 아무것도 읽히지 않는다.

alter table life_period     enable row level security;
alter table person_relation enable row level security;
alter table world_event     enable row level security;

grant select, insert, update, delete on life_period     to service_role;
grant select, insert, update, delete on person_relation to service_role;
grant select, insert, update, delete on world_event     to service_role;


-- ══════════════════════════════════════════════════════════
-- 20260920000100_facets.sql
-- ══════════════════════════════════════════════════════════
-- 네 갈래 분류.
--
-- 모든 자료는 네 축에 하나 이상씩 걸린다. 축마다 두 단계(상위 > 하위)까지만
-- 쓴다. 세 단계로 늘리지 않는 까닭은 기록관 쪽 경험과 같다 — 세 단계가 되는
-- 순간 사람이 어디에 넣을지 판단을 미루고, 미룬 것은 영영 분류되지 않는다.
--
--   형태분류  dc:type             무엇인가        item.type + doc_type
--   출처분류  dc:source           어디서 나왔나    item.source > bundle.title
--   주제분류  dc:subject          무엇에 관한가    subject
--   시기분류  dcterms:temporal    누구의 어느 때   item_life_period
--
-- 새로 만드는 것은 둘뿐이다. 나머지 두 축은 이미 있는 구조가 그대로 축이 된다.
--
-- 출처분류가 특히 그렇다. "외갓집 > 앨범 3권"은 이 스키마에서 이미
-- source > bundle.title 이다. 분류표를 따로 만들면 같은 사실이 두 곳에
-- 적히고, 둘은 반드시 어긋난다. 있는 것을 축으로 읽는다.
--
-- 형태분류도 마찬가지다. 저장은 DCMI 유형 7종으로 하고, 화면 이름은 거기에
-- 붙인다. 세부 형태(편지·일기·족보)만 열 하나를 더하면 하위 단계가 된다.

-- ---------------------------------------------------------------- 세부 형태
--
-- DCMI 의 Text 하나로는 편지와 일기와 족보가 구별되지 않는다. 그런데 집안
-- 아카이브에서 이 구별은 유형 자체만큼 중요하다 — "편지를 보고 싶다"는
-- 요구가 "문서를 보고 싶다"보다 훨씬 자주 나온다.
--
-- 통제 어휘로 묶지 않고 자유어로 둔다. 어떤 형태가 나올지는 자료를 다
-- 훑기 전에는 알 수 없고, enum 으로 잠그면 새 형태가 나올 때마다
-- 마이그레이션을 써야 한다. 대신 화면에서 이미 쓴 값을 제안한다.

alter table item add column doc_type text;

comment on column item.doc_type is
  '형태분류의 하위 단계 — 편지·일기·족보·제문·증명서 따위. dc:type 의 세부. 자유어지만 화면이 이미 쓴 값을 제안해 표기가 갈라지지 않게 한다.';

create index item_doc_type_idx on item (doc_type) where doc_type is not null;

-- ---------------------------------------------------------------- 주제분류
--
-- 명절·기념일, 혼례, 학교, 일·농사, 음식, 이사. 네 축 가운데 유일하게
-- 기존 구조에서 끌어낼 수 없는 것이라 표를 만든다.
--
-- 두 단계까지만 둔다. 부모가 없으면 상위, 있으면 하위다.

create table subject (
  id         uuid primary key default gen_random_uuid(),
  parent_id  uuid references subject(id) on delete cascade,
  label      text not null,
  sort_order integer not null default 0,
  note       text,
  created_at timestamptz not null default now(),
  -- 같은 자리에 같은 이름을 두 번 두지 않는다. nulls not distinct 로 두어
  -- 최상위(parent_id is null)끼리도 이름이 겹치지 않게 한다.
  unique nulls not distinct (parent_id, label)
);

comment on table subject is
  '주제분류(dc:subject)의 두 단계 나무. 부모가 없으면 상위, 있으면 하위다. 세 단계로 늘리지 않는다.';

create index subject_parent_idx on subject (parent_id, sort_order);

-- 손자를 막는다. 두 단계라는 규칙을 주석이 아니라 DB 가 지킨다.
create or replace function subject_depth_guard() returns trigger language plpgsql as $$
begin
  if new.parent_id is not null
     and exists (select 1 from subject where id = new.parent_id and parent_id is not null) then
    raise exception '주제분류는 두 단계까지만 쓴다';
  end if;
  return new;
end $$;

create trigger subject_depth_trg before insert or update on subject
  for each row execute function subject_depth_guard();

create table item_subject (
  item_id    uuid not null references item(id) on delete cascade,
  subject_id uuid not null references subject(id) on delete cascade,
  primary key (item_id, subject_id)
);

comment on table item_subject is
  '자료와 주제분류의 연결. 한 자료가 여러 주제에 걸릴 수 있다 — 혼례이면서 음식인 사진이 있다.';

create index item_subject_by_subject_idx on item_subject (subject_id);

-- ---------------------------------------------------------------- 시기분류
--
-- 누구의 어느 때인가. "할머니 > 유년기".
--
-- 날짜에서 자동으로 끌어낼 수도 있을 것 같지만 그렇지 않다. 1978년 사진이
-- 할머니의 자녀 양육기이면서 어머니의 유년기다 — 어느 쪽으로 분류할지는
-- 그 사진이 무엇을 담고 있느냐에 달렸고, 그건 사람이 판단한다.

create table item_life_period (
  item_id        uuid not null references item(id) on delete cascade,
  life_period_id uuid not null references life_period(id) on delete cascade,
  primary key (item_id, life_period_id)
);

comment on table item_life_period is
  '자료와 생애 시기의 연결. 시기분류(dcterms:temporal)의 실체다. 날짜로 자동 판정하지 않는다 — 같은 해가 사람마다 다른 시기이고, 어느 쪽인지는 자료가 무엇을 담았느냐에 달렸다.';

create index item_life_period_by_period_idx on item_life_period (life_period_id);

-- ---------------------------------------------------------------- 뷰 갱신
--
-- item 에 doc_type 이 늘었다.

drop view if exists item_effective;
create view item_effective as
select
  i.id,
  i.identifier,
  i.bundle_id,
  i.seq,
  i.title,
  i.type,
  i.doc_type,
  i.created_edtf,
  i.created_start,
  i.created_end,
  i.created_precision,
  i.created_uncertain,
  i.created_approx,
  i.date_verified,
  i.date_verified_by,
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

-- ---------------------------------------------------------------- 권한

alter table subject          enable row level security;
alter table item_subject     enable row level security;
alter table item_life_period enable row level security;

grant select, insert, update, delete on subject          to service_role;
grant select, insert, update, delete on item_subject     to service_role;
grant select, insert, update, delete on item_life_period to service_role;


-- ══════════════════════════════════════════════════════════
-- 20260920000200_curation.sql
-- ══════════════════════════════════════════════════════════
-- 큐레이션과 첫 화면.
--
-- 여러 자료를 엮어 하나의 이야기로 보여주는 일. 큐레이션은 자료가 아니라
-- 자료를 가리키는 "묶음"이다 — 원 자료의 메타데이터는 고치지 않고,
-- 큐레이터의 말은 설명글에만 쓴다. 이 구별이 흐려지면 나중에 무엇이
-- 원래 기록이고 무엇이 나중에 붙인 해석인지 알 수 없게 된다.
--
-- 이야기는 collection(kind = 'story')의 한 행이고, 그 아래 블록이 달린다.
-- 블록은 글·소제목·기록·사진 묶음·구술 인용·연표 여섯 가지다.

-- ---------------------------------------------------------------- 블록

create type curation_block_kind as enum (
  'text',      -- 서술문
  'heading',   -- 소제목
  'record',    -- 자료 하나를 크게
  'gallery',   -- 사진 여러 장
  'quote',     -- 구술 인용
  'timeline'   -- 이야기 안의 작은 연표
);

create table curation_block (
  id            uuid primary key default gen_random_uuid(),
  collection_id uuid not null references collection(id) on delete cascade,
  position      integer not null,
  kind          curation_block_kind not null,
  -- 글·소제목은 body 만, 기록·사진·인용은 caption 과 참조를 쓴다.
  body          text,
  caption       text,
  -- 구술 인용에만 쓴다. 누가 말했고 녹음의 어느 지점인가.
  speaker_id    uuid references person(id) on delete set null,
  timecode_ms   integer,
  created_at    timestamptz not null default now(),
  unique (collection_id, position)
);

comment on table curation_block is
  '이야기를 이루는 블록 하나. position 으로 순서를 매긴다 — 편집 화면의 ↑↓ 가 이 값을 바꾼다.';
comment on column curation_block.body is
  '큐레이터가 쓴 글. 원 자료의 설명(item.description)과 섞지 않는다 — 이건 나중에 붙인 해석이다.';

create index curation_block_by_collection_idx on curation_block (collection_id, position);

-- 블록이 가리키는 자료. 기록·사진 묶음 블록에서 여럿일 수 있다.
create table curation_ref (
  block_id   uuid not null references curation_block(id) on delete cascade,
  item_id    uuid not null references item(id) on delete cascade,
  sort_order integer not null default 0,
  primary key (block_id, item_id)
);

comment on table curation_ref is
  '블록이 가리키는 자료. dcterms:hasPart 의 실체다. 자료 쪽에서는 dcterms:isPartOf 로 읽는다.';

create index curation_ref_by_item_idx on curation_ref (item_id);

-- ---------------------------------------------------------------- 히어로 편성
--
-- 첫 화면의 큰 자리 셋. 관리자가 자리마다 무엇을 걸지 정하고, 기간을 준다.
-- 빈 자리는 자동 큐레이션이 채운다 — "오늘, N년 전"이 먼저고, 그것도
-- 없으면 가장 최근 이야기.
--
-- 자동으로 넘기지 않는다. 사람이 화살표를 눌러야 다음 것을 본다.

create type hero_auto_kind as enum (
  'today',     -- 오늘과 월·일이 같고 날짜가 확인된 자료
  'recent',    -- 같은 출처로 최근 들어온 묶음
  'story'      -- 가장 최근 이야기
);

create table hero_slot (
  slot          integer primary key check (slot between 1 and 3),
  -- 둘 중 하나만 채운다. 직접 고른 이야기이거나, 자동 종류이거나.
  collection_id uuid references collection(id) on delete set null,
  auto_kind     hero_auto_kind,
  starts_on     date,
  ends_on       date,
  note          text,
  modified_at   timestamptz not null default now(),
  constraint hero_slot_one_source check (
    (collection_id is not null and auto_kind is null)
    or (collection_id is null and auto_kind is not null)
    or (collection_id is null and auto_kind is null)
  ),
  constraint hero_slot_dates check (starts_on is null or ends_on is null or starts_on <= ends_on)
);

comment on table hero_slot is
  '첫 화면 히어로의 자리 셋. 비어 있거나 기간이 지난 자리는 자동 큐레이션이 채운다.';
comment on column hero_slot.auto_kind is
  '자동 편성의 종류. collection_id 와 동시에 채우지 않는다 — 둘 다 있으면 어느 쪽이 참인지 판단할 근거가 없다.';

-- ---------------------------------------------------------------- 이야기
--
-- collection.kind 는 지금까지 자유 텍스트('topic' 기본)였다. 이야기가
-- 생기면서 종류가 실제로 갈라지므로 값을 제한한다. 기존 행은 건드리지
-- 않고 허용 목록에만 넣는다.

alter table collection
  add constraint collection_kind_known
    check (kind in ('topic', 'event', 'story'));

alter table collection
  add column summary text,
  add column cover_block_id uuid;

comment on column collection.summary is
  '이야기 카드와 히어로에 쓰는 한두 문장. description 보다 짧다.';

-- ---------------------------------------------------------------- 더블린코어 나머지
--
-- 상세정보 표 15행 가운데 아직 열이 없던 둘.

alter table item
  add column contributor text,
  add column publisher   text;

comment on column item.contributor is
  'dc:contributor — 촬영·녹음·전사를 도운 사람. 생산자(creator)와 구별한다.';
comment on column item.publisher is
  'dc:publisher — 사진관·신문사·기관처럼 제3자 생산처.';

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
  i.doc_type,
  i.created_edtf,
  i.created_start,
  i.created_end,
  i.created_precision,
  i.created_uncertain,
  i.created_approx,
  i.date_verified,
  i.date_verified_by,
  i.description,
  i.creator,
  i.contributor,
  i.publisher,
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

-- ---------------------------------------------------------------- 권한

alter table curation_block enable row level security;
alter table curation_ref   enable row level security;
alter table hero_slot      enable row level security;

grant select, insert, update, delete on curation_block to service_role;
grant select, insert, update, delete on curation_ref   to service_role;
grant select, insert, update, delete on hero_slot      to service_role;
