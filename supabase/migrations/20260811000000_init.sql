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
