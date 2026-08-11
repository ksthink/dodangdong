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
