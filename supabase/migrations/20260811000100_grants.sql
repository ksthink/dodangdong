-- 권한.
--
-- 서버는 secret key(service_role)로만 접근한다. 그 역할에만 읽기·쓰기를 주고,
-- 브라우저가 쓰는 anon/authenticated 에는 아무것도 주지 않는다.
-- RLS 는 켜져 있고 정책이 없으므로, 설령 키가 새더라도 직접 읽히지 않는다.

grant usage on schema public to service_role;

grant select, insert, update, delete on all tables in schema public to service_role;
grant usage, select on all sequences in schema public to service_role;

-- 앞으로 추가될 테이블에도 같은 권한이 자동으로 붙게.
alter default privileges in schema public
  grant select, insert, update, delete on tables to service_role;
alter default privileges in schema public
  grant usage, select on sequences to service_role;

-- 뷰가 소유자 권한이 아니라 호출자 권한으로 돌게 해서,
-- 뒤에 RLS 정책을 붙이더라도 뷰가 우회로가 되지 않도록 한다.
alter view item_effective set (security_invoker = on);

-- anon/authenticated 에서 회수. Supabase 기본 설정이 열어둔 것이 있어도 닫는다.
revoke all on all tables in schema public from anon, authenticated;
revoke all on all sequences in schema public from anon, authenticated;
