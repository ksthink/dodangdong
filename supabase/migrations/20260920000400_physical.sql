-- 실물과 이용 제한.
--
-- 명세의 상세정보 표는 출처분류 줄에 "실물이 있으면 실물 원본 인장"을
-- 찍는다고 말하고, 이용조건 줄에는 "공개 범위, ai_optout 제한"을 적는다.
-- 그런데 그 셋을 담을 열이 없었다. 화면에서 물어볼 수 없으니 영영 비어
-- 있었다.

-- ---------------------------------------------------------------- 실물
--
-- 디지털 사본이 있다고 종이가 사라지는 것은 아니다. 오히려 사본을 만든
-- 뒤에 원본을 어디에 두었는지가 더 헷갈린다 — 스캔하고 돌려준 것인지,
-- 우리가 보관 중인지, 보관 중이라면 어느 상자인지.
--
-- 이 열이 채워져 있으면 상세정보 표의 출처분류 줄에 "실물 원본" 인장이
-- 붙는다. 그 인장은 "이 기록은 화면에만 있는 것이 아니다"라는 뜻이다.

alter table item
  add column physical_location  text,
  add column physical_condition text;

comment on column item.physical_location is
  '실물이 지금 어디 있는가. "할머니댁 안방 장롱 둘째 칸"처럼 사람이 찾아갈 수 있게 적는다. 비어 있으면 실물이 없거나 어디 있는지 모른다는 뜻이다 — 둘을 구별해야 하면 physical_condition 에 적는다.';
comment on column item.physical_condition is
  '실물의 상태. "귀퉁이 물 얼룩", "반으로 접힌 자국". 다음에 꺼낼 때 무엇을 조심해야 하는지 적는 자리다.';

-- 실물이 있는 것만 훑을 일이 생긴다(보관 상자를 정리할 때).
create index item_physical_idx on item (physical_location)
  where physical_location is not null;

-- ---------------------------------------------------------------- 이용 제한
--
-- 가족이 남긴 것을 기계 학습에 쓰지 말라는 뜻이다. 강제할 방법은 없지만,
-- 적어 두지 않으면 나중에 누군가 이 아카이브를 통째로 넘길 때 무엇을
-- 빼야 하는지 알 수 없다. 기본값은 참이다 — 빼는 쪽이 기본이어야 한다.

alter table item
  add column ai_optout boolean not null default true;

comment on column item.ai_optout is
  '기계 학습에 쓰지 않는다는 표시. 기본이 참이다 — 가족 기록은 빼는 쪽이 기본이어야 하고, 허락은 한 건씩 받는 것이지 한꺼번에 받는 것이 아니다.';

-- ---------------------------------------------------------------- 인물 식별자
--
-- 기록에 ARC- 가 붙듯 인물에도 붙인다. uuid 는 사람이 주고받을 수 없다 —
-- "FP-001 이 누구더라" 는 되지만 "3661662f-... 가 누구더라" 는 안 된다.
--
-- 명세는 FP-001 꼴을 쓴다. 세 자리면 한 집안에 충분하다.

create sequence person_identifier_seq;

alter table person add column identifier text unique;

create or replace function assign_person_identifier() returns trigger language plpgsql as $$
begin
  if new.identifier is null or new.identifier = '' then
    new.identifier := 'FP-' || lpad(nextval('person_identifier_seq')::text, 3, '0');
  end if;
  return new;
end $$;

create trigger person_identifier_trg before insert on person
  for each row execute function assign_person_identifier();

-- 이미 있는 인물에도 붙인다. 태어난 순서로 — 그래야 번호가 가계를 따른다.
update person p set identifier = 'FP-' || lpad(x.n::text, 3, '0')
from (
  select id, row_number() over (order by born_year nulls last, display_name) as n
  from person
) x
where p.id = x.id and p.identifier is null;

-- 붙인 만큼 시퀀스를 밀어 둔다. 그러지 않으면 다음 인물이 FP-001 을 다시 받는다.
select setval('person_identifier_seq', greatest((select count(*) from person), 1));

comment on column person.identifier is
  '인물 식별자 FP-001. uuid 는 사람이 주고받을 수 없어서 따로 둔다.';

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
