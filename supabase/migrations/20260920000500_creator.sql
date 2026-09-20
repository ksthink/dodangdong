-- 생산자를 전거로 가리킨다.
--
-- 사람은 기록마다 이름을 새로 쓰지 않고, 한 번 등록해 두고 가리킨다.
-- 그래야 "할머니", "김순자", "안동댁"이 한 사람으로 모이고, 연표·나이·
-- 인물 페이지가 저절로 만들어진다. 등장인물은 이미 item_person 으로
-- 그렇게 하고 있었는데, 생산자만 자유 텍스트로 남아 있었다.
--
-- 자유 텍스트로 적힌 "김순자"는 인물 김순자와 이어지지 않는다. 그가 찍은
-- 사진은 그의 인물 페이지에 영영 나오지 않는다.

-- ---------------------------------------------------------------- 생산자

alter table item add column creator_id uuid references person(id) on delete set null;

-- 인물이 지워져도 기록은 남는다(on delete set null) — 기록을 지우는 것은
-- 기록을 지우는 화면에서만 한다.

create index item_creator_idx on item (creator_id) where creator_id is not null;

-- creator(자유 텍스트)는 지우지 않는다. 둘의 뜻이 다르다.
comment on column item.creator_id is
  'dc:creator — 전거에 등록된 생산자. 이 기록을 만든 사람이 person 에 있으면 여기로 가리킨다. 그래야 그 사람의 인물 페이지에 이 기록이 모인다. creator(자유 텍스트)와 함께 쓰지 않는다 — 한 기록의 생산자는 하나다.';
comment on column item.creator is
  'dc:creator — 전거에 없는 생산자를 이름만으로 적는 자리. 군청·사진관 같은 기관, 끝내 누구인지 모르는 사람, "미상". 사람을 등록할 수 없거나 등록할 것이 아닐 때만 쓴다. 등록된 사람이면 creator_id 로 가리킨다.';

-- ---------------------------------------------------------------- 이름만 적어 둔 등장인물
--
-- 등장인물도 마찬가지로, 사진관 사람이나 끝내 누구인지 모르는 옆 사람을
-- 인물로 등록할 수는 없다. 그렇다고 적어 둘 자리가 없으면 기술하던 이가
-- 알고 있던 것이 그대로 사라진다.
--
-- item_person 에는 넣을 수 없다 — 그 표는 person 을 가리키는 표이고,
-- 가리킬 사람이 없는 것이 바로 이 경우다. 그래서 기록 쪽에 이름만 둔다.
-- 나중에 그 사람이 누구인지 밝혀지면 인물로 등록하고 여기서 뺀다.

alter table item add column subject_names text[] not null default '{}';

comment on column item.subject_names is
  'dc:subject — 전거에 등록하지 않고 이름만 적어 둔 등장인물. 화면에서는 점선 칩으로 보인다("아직 사람으로 세우지 않았다"는 뜻). 등록된 사람은 item_person 으로 간다.';

-- ---------------------------------------------------------------- 뷰 갱신
--
-- 뷰는 열을 하나하나 적는다. 20260920000400_physical.sql 의 정의에
-- creator_id 와 subject_names 두 줄을 더한 것이다.

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
  i.creator_id,
  i.subject_names,
  i.contributor,
  i.publisher,
  i.language,
  i.medium,
  i.extent,
  i.physical_location,
  i.physical_condition,
  i.ai_optout,
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
