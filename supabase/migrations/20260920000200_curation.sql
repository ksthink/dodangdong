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
