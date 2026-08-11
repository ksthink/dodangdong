-- 원본 파일명 보관.
--
-- 스토리지 키는 ASCII 로만 만들 수 있어서 "1958_혼례_04.jpg" 같은 이름을
-- 그대로 경로에 쓸 수 없다. 어차피 파일명에 의미를 담지 않는 것이 원칙이므로
-- 경로는 기계적으로 짓고, 사람이 붙였던 이름은 기록으로 남긴다.

alter table file add column original_filename text;

comment on column file.original_filename is
  '업로드 당시의 파일명. 스토리지 경로와 무관하며, 출처를 되짚을 때 쓴다.';
