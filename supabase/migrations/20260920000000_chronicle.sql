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

-- 근거가 달려 있는데 확인되지 않은 상태는 없다. 둘은 함께 세운다.
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
  created_at timestamptz not null default now()
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
