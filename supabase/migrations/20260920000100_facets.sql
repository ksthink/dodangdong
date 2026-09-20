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
