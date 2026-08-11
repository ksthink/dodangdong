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
