-- 도당동 아카이브 — 로컬 개발용 시드.
--
-- 집안기록 프로토타입의 예시 데이터를 실제 스키마에 맞춘 것이다.
-- 사람·자료·사건은 모두 지어낸 예시다 — 실제 가족 자료가 아니다.
--
-- 화면을 만들면서 눈으로 확인할 것이 필요해서 둔다. 연표·패싯·상세정보
-- 표가 제대로 그려지는지는 자료가 있어야만 알 수 있다.
--
--   로컬에만 넣는다. 운영 DB 에 넣지 않는다.
--   docker exec -i supabase_db_family psql -U postgres -d postgres < scripts/seed-local.sql
--
-- 여러 번 돌려도 괜찮다. 맨 앞에서 자기가 넣은 것을 지우고 시작한다.
-- 파일(file)은 넣지 않는다 — 실제 바이트가 없으면 /media 가 죽는다.
-- 그래서 썸네일 자리에는 디더 무늬가 깔린다.

begin;

-- ---------------------------------------------------------------- 지우기
delete from item_person;
delete from life_period;
delete from person_relation;
delete from world_event;
delete from item;
delete from bundle;
delete from acquisition;
delete from place;
delete from person;

-- ---------------------------------------------------------------- 장소
insert into place (family_name, admin_name) values ('시골집', '경북 안동');
insert into place (family_name, admin_name) values ('외갓집', '경북 안동');
insert into place (family_name, admin_name) values ('큰집 마당', '경북 안동');
insert into place (family_name, admin_name) values ('풍산국민학교', '경북 안동');
insert into place (family_name, admin_name) values ('서울 아파트', '서울');
insert into place (family_name, admin_name) values ('대구 예식장', '대구');
insert into place (family_name, admin_name) values ('속초', '강원 속초');

-- ---------------------------------------------------------------- 사람
insert into person (display_name, aliases, birth_edtf, death_edtf, born_year, died_year, relation_to_root, note) values ('김순자(할머니)', '{"안동댁"}', '1936', null, 1936, null, '아버지의 어머니', '경북 안동에서 태어나 1962년 혼인했다. 1998년 서울로 옮기기 전까지 시골집 부엌을 지켰다.');
insert into person (display_name, aliases, birth_edtf, death_edtf, born_year, died_year, relation_to_root, note) values ('김영호(외할아버지)', '{}', '1931', '1996', 1931, 1996, '어머니의 아버지', '외갓집 사진 대부분을 찍었고, 일기를 30년 넘게 썼다.');
insert into person (display_name, aliases, birth_edtf, death_edtf, born_year, died_year, relation_to_root, note) values ('박철수(아버지)', '{}', '1960', null, 1960, null, '아버지', '안동에서 자라 1982년 입대했다. 1988년 결혼했다.');
insert into person (display_name, aliases, birth_edtf, death_edtf, born_year, died_year, relation_to_root, note) values ('김영희(어머니)', '{}', '1963', null, 1963, null, '어머니', '외갓집 셋째 딸.');
insert into person (display_name, aliases, birth_edtf, death_edtf, born_year, died_year, relation_to_root, note) values ('김미영(큰이모)', '{}', '1958?', null, 1958, null, '어머니의 언니', '2026년 여름 앨범 두 권을 보내 주었다.');
insert into person (display_name, aliases, birth_edtf, death_edtf, born_year, died_year, relation_to_root, note) values ('나', '{}', '1990', null, 1990, null, '아카이브를 만든 사람', null);

-- 호칭으로 사람을 찾기 쉽게 하는 임시 대응표
create temp table pkey (key text primary key, id uuid);
insert into pkey select 'grandma', id from person where display_name = '김순자(할머니)';
insert into pkey select 'grandpa', id from person where display_name = '김영호(외할아버지)';
insert into pkey select 'dad', id from person where display_name = '박철수(아버지)';
insert into pkey select 'mom', id from person where display_name = '김영희(어머니)';
insert into pkey select 'aunt', id from person where display_name = '김미영(큰이모)';
insert into pkey select 'me', id from person where display_name = '나';

-- ---------------------------------------------------------------- 생애 시기
insert into life_period (person_id, label, from_edtf, to_edtf, from_year, to_year, sort_order) select id, '유년기', '1936', '1955', 1936, 1955, 0 from pkey where key = 'grandma';
insert into life_period (person_id, label, from_edtf, to_edtf, from_year, to_year, sort_order) select id, '혼인과 분가', '1955', '1962', 1955, 1962, 1 from pkey where key = 'grandma';
insert into life_period (person_id, label, from_edtf, to_edtf, from_year, to_year, sort_order) select id, '자녀 양육기', '1962', '1990', 1962, 1990, 2 from pkey where key = 'grandma';
insert into life_period (person_id, label, from_edtf, to_edtf, from_year, to_year, sort_order) select id, '손주 시대', '1990', null, 1990, null, 3 from pkey where key = 'grandma';
insert into life_period (person_id, label, from_edtf, to_edtf, from_year, to_year, sort_order) select id, '학창 시절', '1966', '1979', 1966, 1979, 0 from pkey where key = 'dad';
insert into life_period (person_id, label, from_edtf, to_edtf, from_year, to_year, sort_order) select id, '군 복무', '1982', '1985', 1982, 1985, 1 from pkey where key = 'dad';
insert into life_period (person_id, label, from_edtf, to_edtf, from_year, to_year, sort_order) select id, '유년기', '1963', '1976', 1963, 1976, 0 from pkey where key = 'mom';

-- ---------------------------------------------------------------- 사람 사이
-- kind 는 to 가 from 에게 무엇인지를 말한다. parent 면 to 가 from 의 부모다.
insert into person_relation (from_person_id, to_person_id, kind) select c.id, p.id, 'parent' from pkey c, pkey p where c.key = 'dad' and p.key = 'grandma';
insert into person_relation (from_person_id, to_person_id, kind) select c.id, p.id, 'parent' from pkey c, pkey p where c.key = 'mom' and p.key = 'grandpa';
insert into person_relation (from_person_id, to_person_id, kind) select c.id, p.id, 'parent' from pkey c, pkey p where c.key = 'aunt' and p.key = 'grandpa';
insert into person_relation (from_person_id, to_person_id, kind) select c.id, p.id, 'parent' from pkey c, pkey p where c.key = 'me' and p.key = 'dad';
insert into person_relation (from_person_id, to_person_id, kind) select c.id, p.id, 'parent' from pkey c, pkey p where c.key = 'me' and p.key = 'mom';
insert into person_relation (from_person_id, to_person_id, kind) select x.id, y.id, 'spouse' from pkey x, pkey y where x.key = 'dad' and y.key = 'mom';
insert into person_relation (from_person_id, to_person_id, kind) select x.id, y.id, 'spouse' from pkey x, pkey y where x.key = 'mom' and y.key = 'dad';

-- ---------------------------------------------------------------- 바깥 세상
insert into world_event (year, label) values (1962, '화폐개혁');
insert into world_event (year, label) values (1978, '제10대 총선');
insert into world_event (year, label) values (1983, '이산가족 찾기 방송');
insert into world_event (year, label) values (1988, '서울 올림픽');
insert into world_event (year, label) values (1998, '외환위기 뒤 첫 해');

-- ---------------------------------------------------------------- 수집과 묶음
insert into acquisition (visited_on, location, note) values ('2026-02-11', '서울', '설에 내려가 할머니 댁 자료를 훑고 구술을 녹음했다.');
insert into bundle (acquisition_id, title, kind, source, default_access_level, note) select id, '할머니댁', 'folder'::bundle_kind, '할머니댁', 'family', null from acquisition limit 1;
insert into bundle (acquisition_id, title, kind, source, default_access_level, note) select id, '외갓집', 'folder'::bundle_kind, '외갓집', 'family', null from acquisition limit 1;
insert into bundle (acquisition_id, title, kind, source, default_access_level, note) select id, '부모님댁', 'folder'::bundle_kind, '부모님댁', 'family', null from acquisition limit 1;
insert into bundle (acquisition_id, title, kind, source, default_access_level, note) select id, '친척 기증', 'folder'::bundle_kind, '친척 기증', 'family', null from acquisition limit 1;
insert into bundle (acquisition_id, title, kind, source, default_access_level, note) select id, '기관 발급', 'folder'::bundle_kind, '기관 발급', 'family', null from acquisition limit 1;
insert into bundle (acquisition_id, title, kind, source, default_access_level, note) select id, '구술 채록', 'folder'::bundle_kind, '구술 채록', 'family', null from acquisition limit 1;
insert into bundle (acquisition_id, title, kind, source, default_access_level, note) select id, '사건', 'single'::bundle_kind, '사건', 'family', '날짜만 있고 파일이 없는 사건들.' from acquisition limit 1;

-- ---------------------------------------------------------------- 사건
-- 파일이 없어도 온전한 기록이다. 오히려 이런 것이 연표의 뼈대가 된다.
insert into item (bundle_id, seq, title, type, created_edtf, created_start, created_end, created_precision, created_uncertain, created_approx, date_verified, access_level) select id, 0, '외할아버지 제대', 'Event', '1953', '1953-01-01', '1953-12-31', 'year'::date_precision, false, false, false, 'public' from bundle where title = '사건';
insert into item_person (item_id, person_id, role) select i.id, k.id, 'depicted' from item i, pkey k where i.title = '외할아버지 제대' and k.key = 'grandpa';
insert into item (bundle_id, seq, title, type, created_edtf, created_start, created_end, created_precision, created_uncertain, created_approx, date_verified, access_level) select id, 1, '아버지 태어남', 'Event', '1960', '1960-01-01', '1960-12-31', 'year'::date_precision, false, false, false, 'public' from bundle where title = '사건';
insert into item_person (item_id, person_id, role) select i.id, k.id, 'depicted' from item i, pkey k where i.title = '아버지 태어남' and k.key = 'dad';
insert into item (bundle_id, seq, title, type, created_edtf, created_start, created_end, created_precision, created_uncertain, created_approx, date_verified, access_level) select id, 2, '할머니 혼례', 'Event', '1962-03-10', '1962-03-10', '1962-03-10', 'day'::date_precision, false, false, true, 'public' from bundle where title = '사건';
insert into item_person (item_id, person_id, role) select i.id, k.id, 'depicted' from item i, pkey k where i.title = '할머니 혼례' and k.key = 'grandma';
insert into item (bundle_id, seq, title, type, created_edtf, created_start, created_end, created_precision, created_uncertain, created_approx, date_verified, access_level) select id, 3, '어머니 태어남', 'Event', '1963', '1963-01-01', '1963-12-31', 'year'::date_precision, false, false, false, 'public' from bundle where title = '사건';
insert into item_person (item_id, person_id, role) select i.id, k.id, 'depicted' from item i, pkey k where i.title = '어머니 태어남' and k.key = 'mom';
insert into item (bundle_id, seq, title, type, created_edtf, created_start, created_end, created_precision, created_uncertain, created_approx, date_verified, access_level) select id, 4, '아버지 입대', 'Event', '1982-05', '1982-05-01', '1982-06-01', 'month'::date_precision, false, false, true, 'public' from bundle where title = '사건';
insert into item_person (item_id, person_id, role) select i.id, k.id, 'depicted' from item i, pkey k where i.title = '아버지 입대' and k.key = 'dad';
insert into item (bundle_id, seq, title, type, created_edtf, created_start, created_end, created_precision, created_uncertain, created_approx, date_verified, access_level) select id, 5, '아버지 제대', 'Event', '1985-02', '1985-02-01', '1985-03-01', 'month'::date_precision, false, false, false, 'public' from bundle where title = '사건';
insert into item_person (item_id, person_id, role) select i.id, k.id, 'depicted' from item i, pkey k where i.title = '아버지 제대' and k.key = 'dad';
insert into item (bundle_id, seq, title, type, created_edtf, created_start, created_end, created_precision, created_uncertain, created_approx, date_verified, access_level) select id, 6, '부모님 결혼', 'Event', '1988-10-09', '1988-10-09', '1988-10-09', 'day'::date_precision, false, false, true, 'public' from bundle where title = '사건';
insert into item_person (item_id, person_id, role) select i.id, k.id, 'depicted' from item i, pkey k where i.title = '부모님 결혼' and k.key = 'mom';
insert into item (bundle_id, seq, title, type, created_edtf, created_start, created_end, created_precision, created_uncertain, created_approx, date_verified, access_level) select id, 7, '나 태어남', 'Event', '1990-04-02', '1990-04-02', '1990-04-02', 'day'::date_precision, false, false, true, 'public' from bundle where title = '사건';
insert into item_person (item_id, person_id, role) select i.id, k.id, 'depicted' from item i, pkey k where i.title = '나 태어남' and k.key = 'me';
insert into item (bundle_id, seq, title, type, created_edtf, created_start, created_end, created_precision, created_uncertain, created_approx, date_verified, access_level) select id, 8, '외할아버지 돌아가심', 'Event', '1996', '1996-01-01', '1996-12-31', 'year'::date_precision, false, false, false, 'public' from bundle where title = '사건';
insert into item_person (item_id, person_id, role) select i.id, k.id, 'depicted' from item i, pkey k where i.title = '외할아버지 돌아가심' and k.key = 'grandpa';
insert into item (bundle_id, seq, title, type, created_edtf, created_start, created_end, created_precision, created_uncertain, created_approx, date_verified, access_level) select id, 9, '할머니 서울 이사', 'Event', '1998-11-02', '1998-11-02', '1998-11-02', 'day'::date_precision, false, false, true, 'public' from bundle where title = '사건';
insert into item_person (item_id, person_id, role) select i.id, k.id, 'depicted' from item i, pkey k where i.title = '할머니 서울 이사' and k.key = 'grandma';

-- ---------------------------------------------------------------- 자료
insert into item (bundle_id, seq, title, type, created_edtf, created_start, created_end, created_precision, created_uncertain, created_approx, date_verified, description, creator, medium, extent, language, place_id, access_level) select b.id, 0, '할머니 처녀 적 사진', 'StillImage'::dcmi_type, '1955?', '1955-01-01', '1955-12-31', 'year'::date_precision, true, false, false, '할머니가 혼인 전에 사진관에서 찍은 한 장. 뒷면에 사진관 도장이 흐리게 남아 있다.', '미상', '인화 사진', '1장', 'ko', (select id from place where family_name = '시골집'), 'public'::access_level from bundle b where b.title = '할머니댁';
insert into item_person (item_id, person_id, role) select i.id, k.id, 'depicted' from item i, pkey k where i.title = '할머니 처녀 적 사진' and k.key = 'grandma';
insert into item (bundle_id, seq, title, type, created_edtf, created_start, created_end, created_precision, created_uncertain, created_approx, date_verified, description, creator, medium, extent, language, place_id, access_level) select b.id, 1, '할머니 혼례 사진', 'StillImage'::dcmi_type, '1962-03-10', '1962-03-10', '1962-03-10', 'day'::date_precision, false, false, true, '전통 혼례를 올리던 날 큰집 마당에서 찍었다.', '미상', '인화 사진', '3장', 'ko', (select id from place where family_name = '큰집 마당'), 'public'::access_level from bundle b where b.title = '할머니댁';
insert into item_person (item_id, person_id, role) select i.id, k.id, 'depicted' from item i, pkey k where i.title = '할머니 혼례 사진' and k.key = 'grandma';
insert into item (bundle_id, seq, title, type, created_edtf, created_start, created_end, created_precision, created_uncertain, created_approx, date_verified, description, creator, medium, extent, language, place_id, access_level) select b.id, 2, '혼인신고서 사본', 'Text'::dcmi_type, '1962-03-10', '1962-03-10', '1962-03-10', 'day'::date_precision, false, false, true, '할머니 혼례 날짜를 확인해 준 문서.', '안동군청', '증명서', '1장', 'ko', null, 'private'::access_level from bundle b where b.title = '기관 발급';
insert into item_person (item_id, person_id, role) select i.id, k.id, 'depicted' from item i, pkey k where i.title = '혼인신고서 사본' and k.key = 'grandma';
insert into item_person (item_id, person_id, role) select i.id, k.id, 'depicted' from item i, pkey k where i.title = '혼인신고서 사본' and k.key = 'grandpa';
insert into item (bundle_id, seq, title, type, created_edtf, created_start, created_end, created_precision, created_uncertain, created_approx, date_verified, description, creator, medium, extent, language, place_id, access_level) select b.id, 3, '시골집 부엌 앞에서', 'StillImage'::dcmi_type, '1962?', '1962-01-01', '1962-12-31', 'year'::date_precision, true, false, false, '새로 들어온 시골집의 부엌 문 앞. 할머니 뒤로 아궁이가 보인다.', '미상', '인화 사진', '1장', 'ko', (select id from place where family_name = '시골집'), 'public'::access_level from bundle b where b.title = '할머니댁';
insert into item_person (item_id, person_id, role) select i.id, k.id, 'depicted' from item i, pkey k where i.title = '시골집 부엌 앞에서' and k.key = 'grandma';
insert into item (bundle_id, seq, title, type, created_edtf, created_start, created_end, created_precision, created_uncertain, created_approx, date_verified, description, creator, medium, extent, language, place_id, access_level) select b.id, 4, '외갓집 마당에서 찍은 가족사진', 'StillImage'::dcmi_type, '1978-05-14', '1978-05-14', '1978-05-14', 'day'::date_precision, false, false, true, '어린이날 외갓집 마당에 모여 찍었다.', '김영호(외할아버지)', '인화 사진', '2장', 'ko', (select id from place where family_name = '외갓집'), 'public'::access_level from bundle b where b.title = '외갓집';
insert into item_person (item_id, person_id, role) select i.id, k.id, 'depicted' from item i, pkey k where i.title = '외갓집 마당에서 찍은 가족사진' and k.key = 'grandma';
insert into item_person (item_id, person_id, role) select i.id, k.id, 'depicted' from item i, pkey k where i.title = '외갓집 마당에서 찍은 가족사진' and k.key = 'mom';
insert into item_person (item_id, person_id, role) select i.id, k.id, 'depicted' from item i, pkey k where i.title = '외갓집 마당에서 찍은 가족사진' and k.key = 'aunt';
insert into item (bundle_id, seq, title, type, created_edtf, created_start, created_end, created_precision, created_uncertain, created_approx, date_verified, description, creator, medium, extent, language, place_id, access_level) select b.id, 5, '시골집 부엌과 수돗가', 'StillImage'::dcmi_type, '1974?', '1974-01-01', '1974-12-31', 'year'::date_precision, true, false, false, '부엌 앞 수돗가. 할머니는 여기서 겨울에도 쌀을 씻었다.', '아버지', '인화 사진', '1장', 'ko', (select id from place where family_name = '시골집'), 'public'::access_level from bundle b where b.title = '부모님댁';
insert into item_person (item_id, person_id, role) select i.id, k.id, 'depicted' from item i, pkey k where i.title = '시골집 부엌과 수돗가' and k.key = 'grandma';
insert into item (bundle_id, seq, title, type, created_edtf, created_start, created_end, created_precision, created_uncertain, created_approx, date_verified, description, creator, medium, extent, language, place_id, access_level) select b.id, 6, '외할아버지의 1978년 일기 — 5월', 'Text'::dcmi_type, '1978-05', '1978-05-01', '1978-06-01', 'month'::date_precision, false, false, false, '어린이날에 손님이 많아 닭 두 마리를 잡았다는 대목이 있다.', '김영호(외할아버지)', '일기', '2장', 'ko', null, 'public'::access_level from bundle b where b.title = '외갓집';
insert into item_person (item_id, person_id, role) select i.id, k.id, 'depicted' from item i, pkey k where i.title = '외할아버지의 1978년 일기 — 5월' and k.key = 'grandpa';
insert into item (bundle_id, seq, title, type, created_edtf, created_start, created_end, created_precision, created_uncertain, created_approx, date_verified, description, creator, medium, extent, language, place_id, access_level) select b.id, 7, '아버지 국민학교 졸업식', 'StillImage'::dcmi_type, '1973-02-16', '1973-02-16', '1973-02-16', 'day'::date_precision, false, false, true, '졸업장 날짜로 확인했다.', '미상', '인화 사진', '1장', 'ko', (select id from place where family_name = '풍산국민학교'), 'public'::access_level from bundle b where b.title = '부모님댁';
insert into item_person (item_id, person_id, role) select i.id, k.id, 'depicted' from item i, pkey k where i.title = '아버지 국민학교 졸업식' and k.key = 'dad';
insert into item_person (item_id, person_id, role) select i.id, k.id, 'depicted' from item i, pkey k where i.title = '아버지 국민학교 졸업식' and k.key = 'grandma';
insert into item (bundle_id, seq, title, type, created_edtf, created_start, created_end, created_precision, created_uncertain, created_approx, date_verified, description, creator, medium, extent, language, place_id, access_level) select b.id, 8, '국민학교 졸업장', 'PhysicalObject'::dcmi_type, '1973-02-16', '1973-02-16', '1973-02-16', 'day'::date_precision, false, false, true, '아버지의 국민학교 졸업장. 액자에 넣어 두었다.', '풍산국민학교', '상장·증서', '1장', 'ko', null, 'private'::access_level from bundle b where b.title = '부모님댁';
insert into item_person (item_id, person_id, role) select i.id, k.id, 'depicted' from item i, pkey k where i.title = '국민학교 졸업장' and k.key = 'dad';
insert into item (bundle_id, seq, title, type, created_edtf, created_start, created_end, created_precision, created_uncertain, created_approx, date_verified, description, creator, medium, extent, language, place_id, access_level) select b.id, 9, '군대 간 아버지에게 보낸 할머니의 편지', 'Text'::dcmi_type, '1983?', '1983-01-01', '1983-12-31', 'year'::date_precision, true, false, false, '농사일과 동생들 소식을 적은 편지. 봉투의 소인이 흐려 연도만 추정했다.', '김순자(할머니)', '편지', '2장', 'ko', null, 'public'::access_level from bundle b where b.title = '부모님댁';
insert into item_person (item_id, person_id, role) select i.id, k.id, 'depicted' from item i, pkey k where i.title = '군대 간 아버지에게 보낸 할머니의 편지' and k.key = 'grandma';
insert into item_person (item_id, person_id, role) select i.id, k.id, 'depicted' from item i, pkey k where i.title = '군대 간 아버지에게 보낸 할머니의 편지' and k.key = 'dad';
insert into item (bundle_id, seq, title, type, created_edtf, created_start, created_end, created_precision, created_uncertain, created_approx, date_verified, description, creator, medium, extent, language, place_id, access_level) select b.id, 10, '아버지의 답장', 'Text'::dcmi_type, '1983-06-02', '1983-06-02', '1983-06-02', 'day'::date_precision, false, false, true, '훈련이 끝났고 밥은 잘 먹는다는 짧은 답장. 소인으로 날짜를 확인했다.', '아버지', '편지', '1장', 'ko', null, 'public'::access_level from bundle b where b.title = '할머니댁';
insert into item_person (item_id, person_id, role) select i.id, k.id, 'depicted' from item i, pkey k where i.title = '아버지의 답장' and k.key = 'dad';
insert into item_person (item_id, person_id, role) select i.id, k.id, 'depicted' from item i, pkey k where i.title = '아버지의 답장' and k.key = 'grandma';
insert into item (bundle_id, seq, title, type, created_edtf, created_start, created_end, created_precision, created_uncertain, created_approx, date_verified, description, creator, medium, extent, language, place_id, access_level) select b.id, 11, '휴가 나온 아버지', 'StillImage'::dcmi_type, '1984-08', '1984-08-01', '1984-09-01', 'month'::date_precision, false, false, false, '첫 휴가 때 군복을 입은 채로 마루에 앉아 있다.', '큰이모', '인화 사진', '1장', 'ko', (select id from place where family_name = '시골집'), 'public'::access_level from bundle b where b.title = '친척 기증';
insert into item_person (item_id, person_id, role) select i.id, k.id, 'depicted' from item i, pkey k where i.title = '휴가 나온 아버지' and k.key = 'dad';
insert into item_person (item_id, person_id, role) select i.id, k.id, 'depicted' from item i, pkey k where i.title = '휴가 나온 아버지' and k.key = 'grandma';
insert into item (bundle_id, seq, title, type, created_edtf, created_start, created_end, created_precision, created_uncertain, created_approx, date_verified, description, creator, medium, extent, language, place_id, access_level) select b.id, 12, '쌀 장부 한 권', 'Text'::dcmi_type, '1974-09', '1974-09-01', '1974-10-01', 'month'::date_precision, false, false, false, '한 해 동안 쌀을 사고 판 기록. 할머니 글씨.', '김순자(할머니)', '장부', '3장', 'ko', null, 'public'::access_level from bundle b where b.title = '할머니댁';
insert into item_person (item_id, person_id, role) select i.id, k.id, 'depicted' from item i, pkey k where i.title = '쌀 장부 한 권' and k.key = 'grandma';
insert into item (bundle_id, seq, title, type, created_edtf, created_start, created_end, created_precision, created_uncertain, created_approx, date_verified, description, creator, medium, extent, language, place_id, access_level) select b.id, 13, '부모님 결혼식', 'StillImage'::dcmi_type, '1988-10-09', '1988-10-09', '1988-10-09', 'day'::date_precision, false, false, true, '결혼 앨범 한 권 가운데 가족사진 여섯 장.', '대구 예식장 사진부', '앨범', '6장', 'ko', (select id from place where family_name = '대구 예식장'), 'public'::access_level from bundle b where b.title = '부모님댁';
insert into item_person (item_id, person_id, role) select i.id, k.id, 'depicted' from item i, pkey k where i.title = '부모님 결혼식' and k.key = 'dad';
insert into item_person (item_id, person_id, role) select i.id, k.id, 'depicted' from item i, pkey k where i.title = '부모님 결혼식' and k.key = 'mom';
insert into item_person (item_id, person_id, role) select i.id, k.id, 'depicted' from item i, pkey k where i.title = '부모님 결혼식' and k.key = 'grandma';
insert into item (bundle_id, seq, title, type, created_edtf, created_start, created_end, created_precision, created_uncertain, created_approx, date_verified, description, creator, medium, extent, language, place_id, access_level) select b.id, 14, '청첩장', 'PhysicalObject'::dcmi_type, '1988-10', '1988-10-01', '1988-11-01', 'month'::date_precision, false, false, false, '결혼 앨범 맨 앞장에 끼워 둔 청첩장.', '아버지', '인쇄물', '1장', 'ko', null, 'public'::access_level from bundle b where b.title = '부모님댁';
insert into item_person (item_id, person_id, role) select i.id, k.id, 'depicted' from item i, pkey k where i.title = '청첩장' and k.key = 'dad';
insert into item_person (item_id, person_id, role) select i.id, k.id, 'depicted' from item i, pkey k where i.title = '청첩장' and k.key = 'mom';
insert into item (bundle_id, seq, title, type, created_edtf, created_start, created_end, created_precision, created_uncertain, created_approx, date_verified, description, creator, medium, extent, language, place_id, access_level) select b.id, 15, '돌잔치', 'StillImage'::dcmi_type, '1991-04', '1991-04-01', '1991-05-01', 'month'::date_precision, false, false, false, '돌상 앞에서. 할머니가 실타래를 쥐여 주었다.', '아버지', '인화 사진', '4장', 'ko', (select id from place where family_name = '서울 아파트'), 'public'::access_level from bundle b where b.title = '부모님댁';
insert into item_person (item_id, person_id, role) select i.id, k.id, 'depicted' from item i, pkey k where i.title = '돌잔치' and k.key = 'me';
insert into item_person (item_id, person_id, role) select i.id, k.id, 'depicted' from item i, pkey k where i.title = '돌잔치' and k.key = 'grandma';
insert into item_person (item_id, person_id, role) select i.id, k.id, 'depicted' from item i, pkey k where i.title = '돌잔치' and k.key = 'mom';
insert into item (bundle_id, seq, title, type, created_edtf, created_start, created_end, created_precision, created_uncertain, created_approx, date_verified, description, creator, medium, extent, language, place_id, access_level) select b.id, 16, '가족여행 비디오', 'MovingImage'::dcmi_type, '1994-08', '1994-08-01', '1994-09-01', 'month'::date_precision, false, false, false, 'VHS 한 개를 디지털로 옮겼다. 32분.', '아버지', '비디오테이프', '1장', 'ko', (select id from place where family_name = '속초'), 'private'::access_level from bundle b where b.title = '부모님댁';
insert into item_person (item_id, person_id, role) select i.id, k.id, 'depicted' from item i, pkey k where i.title = '가족여행 비디오' and k.key = 'me';
insert into item_person (item_id, person_id, role) select i.id, k.id, 'depicted' from item i, pkey k where i.title = '가족여행 비디오' and k.key = 'mom';
insert into item_person (item_id, person_id, role) select i.id, k.id, 'depicted' from item i, pkey k where i.title = '가족여행 비디오' and k.key = 'dad';
insert into item (bundle_id, seq, title, type, created_edtf, created_start, created_end, created_precision, created_uncertain, created_approx, date_verified, description, creator, medium, extent, language, place_id, access_level) select b.id, 17, '외할아버지 영정 사진', 'StillImage'::dcmi_type, '1996', '1996-01-01', '1996-12-31', 'year'::date_precision, false, false, false, '장례 때 쓴 영정 사진.', '미상', '인화 사진', '1장', 'ko', null, 'private'::access_level from bundle b where b.title = '외갓집';
insert into item_person (item_id, person_id, role) select i.id, k.id, 'depicted' from item i, pkey k where i.title = '외할아버지 영정 사진' and k.key = 'grandpa';
insert into item (bundle_id, seq, title, type, created_edtf, created_start, created_end, created_precision, created_uncertain, created_approx, date_verified, description, creator, medium, extent, language, place_id, access_level) select b.id, 18, '아파트 부엌의 할머니', 'StillImage'::dcmi_type, '1999-01', '1999-01-01', '1999-02-01', 'month'::date_precision, false, false, false, '이사하고 두 달 뒤, 새 부엌에서 처음 김장을 하던 날.', '어머니', '디지털 사진', '2장', 'ko', (select id from place where family_name = '서울 아파트'), 'public'::access_level from bundle b where b.title = '부모님댁';
insert into item_person (item_id, person_id, role) select i.id, k.id, 'depicted' from item i, pkey k where i.title = '아파트 부엌의 할머니' and k.key = 'grandma';
insert into item (bundle_id, seq, title, type, created_edtf, created_start, created_end, created_precision, created_uncertain, created_approx, date_verified, description, creator, medium, extent, language, place_id, access_level) select b.id, 19, '이삿짐 목록', 'Text'::dcmi_type, '1998-11-02', '1998-11-02', '1998-11-02', 'day'::date_precision, false, false, true, '이삿짐센터 영수증 뒷면에 적은 짐 목록. 영수증 날짜로 확인했다.', '어머니', '메모', '1장', 'ko', null, 'private'::access_level from bundle b where b.title = '부모님댁';
insert into item_person (item_id, person_id, role) select i.id, k.id, 'depicted' from item i, pkey k where i.title = '이삿짐 목록' and k.key = 'grandma';
insert into item_person (item_id, person_id, role) select i.id, k.id, 'depicted' from item i, pkey k where i.title = '이삿짐 목록' and k.key = 'mom';
insert into item (bundle_id, seq, title, type, created_edtf, created_start, created_end, created_precision, created_uncertain, created_approx, date_verified, description, creator, medium, extent, language, place_id, access_level) select b.id, 20, '명절 음식 준비', 'StillImage'::dcmi_type, '2009-10-02', '2009-10-02', '2009-10-02', 'day'::date_precision, false, false, false, '추석 전날 전을 부치는 할머니와 어머니.', '나', '디지털 사진', '5장', 'ko', (select id from place where family_name = '서울 아파트'), 'public'::access_level from bundle b where b.title = '부모님댁';
insert into item_person (item_id, person_id, role) select i.id, k.id, 'depicted' from item i, pkey k where i.title = '명절 음식 준비' and k.key = 'grandma';
insert into item_person (item_id, person_id, role) select i.id, k.id, 'depicted' from item i, pkey k where i.title = '명절 음식 준비' and k.key = 'mom';
insert into item (bundle_id, seq, title, type, created_edtf, created_start, created_end, created_precision, created_uncertain, created_approx, date_verified, description, creator, medium, extent, language, place_id, access_level) select b.id, 21, '할머니 구술: 피란 가던 겨울', 'Sound'::dcmi_type, '2026-02-11', '2026-02-11', '2026-02-11', 'day'::date_precision, false, false, true, '2026년 설에 녹음한 구술. 1951년 1월 피란길을 이야기한다.', '김순자(할머니)', '구술', '1장', 'ko', null, 'public'::access_level from bundle b where b.title = '구술 채록';
insert into item_person (item_id, person_id, role) select i.id, k.id, 'depicted' from item i, pkey k where i.title = '할머니 구술: 피란 가던 겨울' and k.key = 'grandma';
insert into item (bundle_id, seq, title, type, created_edtf, created_start, created_end, created_precision, created_uncertain, created_approx, date_verified, description, creator, medium, extent, language, place_id, access_level) select b.id, 22, '할머니 구술: 두 부엌 이야기', 'Sound'::dcmi_type, '2026-02-12', '2026-02-12', '2026-02-12', 'day'::date_precision, false, false, true, '시골집 부엌과 아파트 부엌을 비교하며 이야기한다.', '김순자(할머니)', '구술', '1장', 'ko', null, 'public'::access_level from bundle b where b.title = '구술 채록';
insert into item_person (item_id, person_id, role) select i.id, k.id, 'depicted' from item i, pkey k where i.title = '할머니 구술: 두 부엌 이야기' and k.key = 'grandma';
insert into item (bundle_id, seq, title, type, created_edtf, created_start, created_end, created_precision, created_uncertain, created_approx, date_verified, description, creator, medium, extent, language, place_id, access_level) select b.id, 23, '큰이모 앨범: 외갓집 추석', 'StillImage'::dcmi_type, '1979-09-20', '1979-09-20', '1979-09-20', 'day'::date_precision, false, false, true, '큰이모가 2026년 여름 보내 준 앨범에서.', '큰이모', '앨범', '4장', 'ko', (select id from place where family_name = '외갓집'), 'public'::access_level from bundle b where b.title = '친척 기증';
insert into item_person (item_id, person_id, role) select i.id, k.id, 'depicted' from item i, pkey k where i.title = '큰이모 앨범: 외갓집 추석' and k.key = 'aunt';
insert into item_person (item_id, person_id, role) select i.id, k.id, 'depicted' from item i, pkey k where i.title = '큰이모 앨범: 외갓집 추석' and k.key = 'grandpa';
insert into item_person (item_id, person_id, role) select i.id, k.id, 'depicted' from item i, pkey k where i.title = '큰이모 앨범: 외갓집 추석' and k.key = 'mom';

-- ---------------------------------------------------------------- 확인
commit;

select '사람' as t, count(*) from person
union all select '생애 시기', count(*) from life_period
union all select '사람 사이', count(*) from person_relation
union all select '바깥 세상', count(*) from world_event
union all select '묶음', count(*) from bundle
union all select '사건', count(*) from item where type = 'Event'
union all select '자료', count(*) from item where type <> 'Event'
union all select '인물 연결', count(*) from item_person
union all select '확인된 날짜', count(*) from item where date_verified;
