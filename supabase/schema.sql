-- Ejecutar completo en Supabase > SQL Editor.
create extension if not exists pgcrypto;

create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  username text unique not null,
  full_name text, avatar_url text, bio text,
  is_private boolean not null default false,
  created_at timestamptz not null default now()
);
create table public.posts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  image_path text not null, caption text,
  created_at timestamptz not null default now()
);
create index on public.posts (user_id, created_at desc);
create table public.likes (
  post_id uuid references public.posts(id) on delete cascade,
  user_id uuid references public.profiles(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (post_id, user_id)
);
create table public.comments (
  id uuid primary key,                       -- UUID generado en el cliente => reintentos idempotentes
  post_id uuid not null references public.posts(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  body text not null check (char_length(body) between 1 and 500),
  created_at timestamptz not null default now()
);
create index on public.comments (post_id, created_at);
create table public.follows (
  follower_id uuid references public.profiles(id) on delete cascade,
  following_id uuid references public.profiles(id) on delete cascade,
  status text not null default 'pending' check (status in ('pending','accepted')),
  created_at timestamptz not null default now(),
  primary key (follower_id, following_id),
  check (follower_id <> following_id)
);
create table public.stories (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  image_path text not null,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null default now() + interval '24 hours'
);
create table public.conversations (
  id uuid primary key default gen_random_uuid(),
  user_a uuid not null references public.profiles(id) on delete cascade,
  user_b uuid not null references public.profiles(id) on delete cascade,
  last_message_at timestamptz not null default now(),
  last_message_body text,
  unique (user_a, user_b), check (user_a < user_b)
);
create table public.messages (
  id uuid primary key,
  conversation_id uuid not null references public.conversations(id) on delete cascade,
  sender_id uuid not null references public.profiles(id) on delete cascade,
  body text not null,
  created_at timestamptz not null default now(),
  delivered_at timestamptz, read_at timestamptz
);
create index on public.messages (conversation_id, created_at desc);

-- ===== Helpers de seguridad =====
create or replace function public.can_view(owner uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select owner = auth.uid()
    or exists (select 1 from profiles p where p.id = owner and not p.is_private)
    or exists (select 1 from follows f where f.follower_id = auth.uid() and f.following_id = owner and f.status = 'accepted');
$$;
create or replace function public.is_member(conv uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from conversations c where c.id = conv and auth.uid() in (c.user_a, c.user_b));
$$;

-- El servidor (no el cliente) decide si un follow es directo o queda pendiente.
create or replace function public.follows_set_status() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if exists (select 1 from profiles where id = new.following_id and is_private) then new.status := 'pending';
  else new.status := 'accepted'; end if;
  return new;
end $$;
create trigger trg_follows_status before insert on public.follows for each row execute function public.follows_set_status();

create or replace function public.touch_conversation() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'INSERT' then
    update conversations set last_message_at = new.created_at, last_message_body = left(new.body, 80) where id = new.conversation_id;
    return new;
  end if;
  update conversations c
    set last_message_at = coalesce((select max(m.created_at) from messages m where m.conversation_id = old.conversation_id), now()),
        last_message_body = (select left(m.body, 80) from messages m where m.conversation_id = old.conversation_id order by m.created_at desc limit 1)
    where c.id = old.conversation_id;
  return old;
end $$;
create trigger trg_touch_conv after insert or delete on public.messages for each row execute function public.touch_conversation();

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


create trigger on_auth_user_created after insert on auth.users for each row execute function public.handle_new_user();

-- ===== RLS =====
alter table profiles enable row level security;
alter table posts enable row level security;
alter table likes enable row level security;
alter table comments enable row level security;
alter table follows enable row level security;
alter table stories enable row level security;
alter table conversations enable row level security;
alter table messages enable row level security;

create policy profiles_read on profiles for select using (true);
create policy profiles_update on profiles for update using (id = auth.uid());
create policy profiles_insert on profiles for insert with check (id = auth.uid());

create policy posts_read on posts for select using (can_view(user_id));
create policy posts_insert on posts for insert with check (user_id = auth.uid());
create policy posts_delete on posts for delete using (user_id = auth.uid());

-- Las subconsultas a posts heredan su RLS: solo ves likes/comentarios de posts visibles.
create policy likes_read on likes for select using (exists (select 1 from posts p where p.id = post_id));
create policy likes_insert on likes for insert with check (user_id = auth.uid() and exists (select 1 from posts p where p.id = post_id));
create policy likes_delete on likes for delete using (user_id = auth.uid());
create policy comments_read on comments for select using (exists (select 1 from posts p where p.id = post_id));
create policy comments_insert on comments for insert with check (user_id = auth.uid() and exists (select 1 from posts p where p.id = post_id));
create policy comments_delete on comments for delete using (user_id = auth.uid());

create policy follows_read on follows for select using (
  auth.uid() in (follower_id, following_id) or (can_view(follower_id) and can_view(following_id)));
create policy follows_insert on follows for insert with check (follower_id = auth.uid());
create policy follows_accept on follows for update using (following_id = auth.uid()) with check (following_id = auth.uid());
create policy follows_delete on follows for delete using (auth.uid() in (follower_id, following_id));
revoke update on follows from authenticated, anon;
grant update (status) on follows to authenticated;

create policy stories_read on stories for select using (expires_at > now() and can_view(user_id));
create policy stories_insert on stories for insert with check (user_id = auth.uid());

create policy conv_read on conversations for select using (auth.uid() in (user_a, user_b));
create policy msg_read on messages for select using (is_member(conversation_id));
create policy msg_insert on messages for insert with check (sender_id = auth.uid() and is_member(conversation_id));
create policy msg_receipts on messages for update using (is_member(conversation_id) and sender_id <> auth.uid());
create policy msg_delete on messages for delete using (sender_id = auth.uid() and is_member(conversation_id));
revoke update on messages from authenticated, anon;
grant update (delivered_at, read_at) on messages to authenticated;

-- ===== RPCs =====
create or replace function public.feed_posts(p_scope text, p_user uuid default null, p_post uuid default null, p_limit int default 10, p_before timestamptz default null)
returns table (id uuid, user_id uuid, username text, avatar_url text, image_path text, caption text, created_at timestamptz,
               like_count bigint, comment_count bigint, liked_by_me boolean)
language sql stable security invoker set search_path = public as $$
  select p.id, p.user_id, pr.username, pr.avatar_url, p.image_path, p.caption, p.created_at,
    (select count(*) from likes l where l.post_id = p.id),
    (select count(*) from comments c where c.post_id = p.id),
    exists (select 1 from likes l where l.post_id = p.id and l.user_id = auth.uid())
  from posts p join profiles pr on pr.id = p.user_id
  where (p_before is null or p.created_at < p_before)
    and case p_scope
      when 'home' then (p.user_id = auth.uid() or exists (select 1 from follows f where f.follower_id = auth.uid() and f.following_id = p.user_id and f.status = 'accepted'))
      when 'user' then p.user_id = p_user
      when 'one'  then p.id = p_post
      when 'reels' then p.user_id <> auth.uid() and lower(p.image_path) ~ '\.(mp4|mov|m4v|webm)$'
      else p.user_id <> auth.uid() end
  order by p.created_at desc limit p_limit;
$$;

create or replace function public.profile_info(p_user uuid) returns json
language sql stable security definer set search_path = public as $$
  select json_build_object(
    'posts', (select count(*) from posts where user_id = p_user),
    'followers', (select count(*) from follows where following_id = p_user and status = 'accepted'),
    'following', (select count(*) from follows where follower_id = p_user and status = 'accepted'),
    'my_status', coalesce((select status from follows where follower_id = auth.uid() and following_id = p_user), 'none'));
$$;

create or replace function public.get_activity()
returns table (kind text, actor_id uuid, actor_username text, post_id uuid, body text, created_at timestamptz)
language sql stable security invoker set search_path = public as $$
  select * from (
    select 'like'::text, l.user_id, pr.username, l.post_id, null::text, l.created_at
      from likes l join posts p on p.id = l.post_id join profiles pr on pr.id = l.user_id
      where p.user_id = auth.uid() and l.user_id <> auth.uid()
    union all
    select 'comment', c.user_id, pr.username, c.post_id, c.body, c.created_at
      from comments c join posts p on p.id = c.post_id join profiles pr on pr.id = c.user_id
      where p.user_id = auth.uid() and c.user_id <> auth.uid()
  ) a order by 6 desc limit 50;
$$;

create or replace function public.get_or_create_conversation(p_other uuid) returns uuid
language plpgsql security definer set search_path = public as $$
declare a uuid; b uuid; cid uuid;
begin
  if auth.uid() < p_other then a := auth.uid(); b := p_other; else a := p_other; b := auth.uid(); end if;
  select id into cid from conversations where user_a = a and user_b = b;
  if cid is null then insert into conversations (user_a, user_b) values (a, b) returning id into cid; end if;
  return cid;
end $$;

-- ===== Storage =====
insert into storage.buckets (id, name, public) values ('media', 'media', true) on conflict do nothing;
create policy media_read on storage.objects for select using (bucket_id = 'media');
create policy media_upload on storage.objects for insert to authenticated
  with check (bucket_id = 'media' and (storage.foldername(name))[1] = auth.uid()::text);

-- ===== Realtime =====
alter publication supabase_realtime add table public.messages, public.comments, public.conversations;

-- ===== Permisos =====
-- PERMISOS de la Data API. Los proyectos nuevos de Supabase ya no dan acceso automático a las
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

