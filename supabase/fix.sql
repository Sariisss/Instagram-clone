-- Ejecutar UNA vez en Supabase > SQL Editor (arregla registro y cuentas ya existentes).

-- 0) PERMISOS de la Data API. Los proyectos nuevos de Supabase ya no dan acceso automático a las
--    tablas creadas con SQL; sin esto la app recibe "permission denied" y no puede cargar nada.
grant usage on schema public to anon, authenticated;
grant select, insert, update, delete on all tables in schema public to authenticated;
grant select on all tables in schema public to anon;
grant execute on all functions in schema public to anon, authenticated;
alter default privileges in schema public grant select, insert, update, delete on tables to authenticated;
alter default privileges in schema public grant execute on functions to anon, authenticated;
-- Restaurar restricciones por columna (el grant anterior las amplió):
revoke update on public.follows from authenticated, anon;
grant update (status) on public.follows to authenticated;
revoke update on public.messages from authenticated, anon;
grant update (delivered_at, read_at) on public.messages to authenticated;

-- 1) Trigger de alta robusto: normaliza el usuario y evita choques de nombre.
create or replace function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = public as $$
declare base text; uname text;
begin
  base := regexp_replace(lower(coalesce(nullif(trim(new.raw_user_meta_data->>'username'), ''), split_part(new.email, '@', 1))), '[^a-z0-9_.]', '', 'g');
  if base = '' then base := 'user'; end if;
  uname := base;
  if exists (select 1 from public.profiles where username = uname) then uname := base || floor(random() * 9999)::int; end if;
  insert into public.profiles (id, username, full_name)
  values (new.id, uname, new.raw_user_meta_data->>'full_name')
  on conflict (id) do nothing;
  return new;
end $$;

-- 2) Crea el perfil de cuentas que quedaron sin él.
insert into public.profiles (id, username)
select u.id, regexp_replace(lower(split_part(u.email, '@', 1)), '[^a-z0-9_.]', '', 'g') || floor(random() * 9999)::int
from auth.users u where not exists (select 1 from public.profiles p where p.id = u.id);

-- 3) Confirma correos pendientes (desarrollo).
update auth.users set email_confirmed_at = now() where email_confirmed_at is null;

-- 4) Permisos y políticas de profiles (idempotente) + función de respaldo.
grant usage on schema public to anon, authenticated;
grant select, insert, update, delete on all tables in schema public to authenticated;
grant select on public.profiles, public.posts, public.likes, public.comments, public.follows, public.stories to anon;
grant execute on all functions in schema public to anon, authenticated;
alter table public.profiles enable row level security;
drop policy if exists profiles_read on public.profiles;
drop policy if exists profiles_update on public.profiles;
drop policy if exists profiles_insert on public.profiles;
create policy profiles_read on public.profiles for select using (true);
create policy profiles_update on public.profiles for update using (id = auth.uid());
create policy profiles_insert on public.profiles for insert with check (id = auth.uid());

create or replace function public.my_profile() returns public.profiles
language sql stable security definer set search_path = public as $$
  select * from public.profiles where id = auth.uid();
$$;
grant execute on function public.my_profile() to authenticated;

-- 5) Fuerza a la API de Supabase a recargar el esquema.
notify pgrst, 'reload schema';
