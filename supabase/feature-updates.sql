-- Execute in Supabase SQL Editor for existing projects.
drop policy if exists msg_delete on public.messages;
create policy msg_delete on public.messages for delete
  using (sender_id = auth.uid() and public.is_member(conversation_id));

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
drop trigger if exists trg_touch_conv on public.messages;
create trigger trg_touch_conv after insert or delete on public.messages for each row execute function public.touch_conversation();

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
      when 'one' then p.id = p_post
      when 'reels' then p.user_id <> auth.uid() and lower(p.image_path) ~ '\.(mp4|mov|m4v|webm)$'
      else p.user_id <> auth.uid() end
  order by p.created_at desc limit p_limit;
$$;
notify pgrst, 'reload schema';