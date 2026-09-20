-- 얼굴 인식 기준.
--
-- 사진을 올리면 그 안의 얼굴이 누구인지 후보를 내놓기 위한 것이다.
-- 다만 제안까지만 한다 — 확정은 관리자가 누른다. 확정 전에는 공개 화면에
-- 나오지 않는다.
--
-- 왜 사람이 확정해야 하나. 가족사진의 얼굴은 닮았다. 형제자매는 특히
-- 그렇고, 같은 사람의 스무 살과 예순 살은 오히려 덜 닮았다. 기계가
-- 틀리면 그 틀린 이름이 아카이브에 남아 사실이 된다 — 몇 해 뒤에는
-- 아무도 그것이 추측이었다는 것을 기억하지 못한다.
--
-- 그래서 이 표는 "판정"이 아니라 "기준"만 담는다. 확정된 결과는
-- item_person 에 들어간다.

create table face_reference (
  id         uuid primary key default gen_random_uuid(),
  person_id  uuid not null references person(id) on delete cascade,
  -- 어느 나이대의 얼굴인가. 같은 사람이라도 나이대마다 기준이 따로 있어야
  -- 한다. 'child' · 'youth' · 'adult' · 'elder' 처럼 자유어로 둔다 —
  -- 몇 갈래가 필요한지는 실제 사진을 보기 전에는 알 수 없다.
  era        text,
  -- 기준으로 삼은 사진. 그 사진에서 잘라낸 얼굴이 이 사람의 본보기가 된다.
  item_id    uuid references item(id) on delete set null,
  file_id    uuid references file(id) on delete set null,
  -- 얼굴이 사진 안 어디에 있는가. 0~1 의 비율로 둔다 — 원본과 축소본의
  -- 크기가 달라도 같은 자리를 가리킨다.
  box        jsonb,
  -- 인식 모델이 내놓은 벡터. 모델을 바꾸면 값의 뜻이 달라지므로 어느
  -- 모델로 뽑았는지 함께 적는다.
  embedding  double precision[],
  model      text,
  note       text,
  created_at timestamptz not null default now()
);

comment on table face_reference is
  '인물의 얼굴 기준 사진. 얼굴 인식이 후보를 낼 때 견주는 대상이다. 확정된 결과는 여기가 아니라 item_person 에 들어간다.';
comment on column face_reference.era is
  '나이대. 같은 사람의 스무 살과 예순 살은 서로 덜 닮았으므로 기준을 나이대마다 따로 둔다.';
comment on column face_reference.model is
  '이 벡터를 뽑은 모델. 모델이 바뀌면 값의 뜻도 바뀌므로 함께 적는다 — 적어 두지 않으면 다음 사람이 섞어 쓴다.';

create index face_reference_person_idx on face_reference (person_id, era);

-- ---------------------------------------------------------------- 제안
--
-- 인식이 내놓은 후보. 관리자가 누르면 item_person 으로 옮겨가고 여기서는
-- 사라진다. 누르지 않으면 계속 제안으로만 남는다.
--
-- item_person 과 따로 두는 까닭이 여기 있다. 한 표에 "확정"과 "추측"을
-- 같이 담으면, 언젠가 플래그 하나를 빠뜨린 질의가 추측을 사실처럼 읽는다.

create table face_suggestion (
  id         uuid primary key default gen_random_uuid(),
  item_id    uuid not null references item(id) on delete cascade,
  person_id  uuid not null references person(id) on delete cascade,
  -- 0~1. 화면에는 숫자보다 "꽤 닮음 / 조금 닮음" 정도로 보여주는 편이 낫다 —
  -- 0.87 이라는 숫자는 실제보다 정확해 보인다.
  confidence double precision,
  box        jsonb,
  model      text,
  created_at timestamptz not null default now(),
  -- 같은 사진에서 같은 사람을 두 번 제안하지 않는다. 다시 돌리면 덮어쓴다.
  unique (item_id, person_id)
);

comment on table face_suggestion is
  '얼굴 인식이 내놓은 후보. 관리자가 확정하면 item_person 으로 옮기고 이 줄은 지운다. 공개 화면에는 절대 나오지 않는다.';

create index face_suggestion_item_idx on face_suggestion (item_id, confidence desc);

-- ---------------------------------------------------------------- 권한

alter table face_reference  enable row level security;
alter table face_suggestion enable row level security;

grant select, insert, update, delete on face_reference  to service_role;
grant select, insert, update, delete on face_suggestion to service_role;
