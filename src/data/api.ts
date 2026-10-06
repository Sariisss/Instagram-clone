import * as Crypto from 'expo-crypto';
import { ImageManipulator, SaveFormat } from 'expo-image-manipulator';
import { supabase } from '@/core/supabase';
import { useAuth } from '@/state/auth';
import type { Comment, InboxItem, Message, Post, Profile, ProfileInfo, Story, StoryGroup } from '@/domain/types';

const must = <T,>(r: { data: T | null; error: any }): T => { if (r.error) throw r.error; return r.data as T; };
export const uid = () => useAuth.getState().session!.user.id;

// ---------- Feed / posts ----------
export async function fetchFeed(o: { scope: 'home' | 'explore' | 'user' | 'one' | 'reels'; user?: string; post?: string; before?: string | null; limit?: number }) {
  return must(await supabase.rpc('feed_posts', {
    p_scope: o.scope, p_user: o.user ?? null, p_post: o.post ?? null, p_limit: o.limit ?? 10, p_before: o.before ?? null,
  })) as Post[];
}
/** Comprime (1080px, JPEG 0.7) y sube a Storage. Devuelve la ruta. */
export async function uploadImage(localUri: string, folder: 'posts' | 'stories' | 'avatars', width = 1080) {
  const ctx = ImageManipulator.manipulate(localUri);
  ctx.resize({ width });
  const img = await ctx.renderAsync();
  const out = await img.saveAsync({ compress: 0.7, format: SaveFormat.JPEG });
  const buf = await (await fetch(out.uri)).arrayBuffer();
  const path = `${uid()}/${folder}/${Crypto.randomUUID()}.jpg`;
  const { error } = await supabase.storage.from('media').upload(path, buf, { contentType: 'image/jpeg' });
  if (error) throw error;
  return path;
}
export async function uploadVideo(localUri: string, mimeType = 'video/mp4') {
  const contentType = mimeType.startsWith('video/') ? mimeType : 'video/mp4';
  const extension = contentType === 'video/quicktime' ? 'mov' : contentType === 'video/x-m4v' ? 'm4v' : contentType.split('/')[1]?.split(';')[0] || 'mp4';
  const path = `${uid()}/posts/${Crypto.randomUUID()}.${extension}`;
  // Obtener la URL firmada de upload para hacer streaming directo (evita cargar todo en RAM)
  const { data: uploadData, error: urlError } = await supabase.storage.from('media').createSignedUploadUrl(path);
  if (urlError) throw urlError;
  // FileSystem.uploadAsync hace streaming desde disco sin pasar por el heap de JS
  const FileSystem = (await import('expo-file-system')).default ?? (await import('expo-file-system'));
  const result = await (FileSystem as any).uploadAsync(uploadData.signedUrl, localUri, {
    httpMethod: 'PUT',
    headers: { 'Content-Type': contentType, 'x-upsert': 'false' },
  });
  if (result.status < 200 || result.status >= 300) throw new Error(`Upload failed: ${result.status}`);
  return path;
}
export async function createPost(localUri: string, caption: string, video = false, mimeType?: string | null) {
  const path = video ? await uploadVideo(localUri, mimeType ?? undefined) : await uploadImage(localUri, 'posts');
  must(await supabase.from('posts').insert({ user_id: uid(), image_path: path, caption: caption || null }));
}
export async function deletePost(id: string) { must(await supabase.from('posts').delete().eq('id', id)); }
export async function createStory(localUri: string) {
  const path = await uploadImage(localUri, 'stories');
  must(await supabase.from('stories').insert({ user_id: uid(), image_path: path }));
}

// ---------- Acciones idempotentes (las ejecuta la cola offline) ----------
export async function likePost(postId: string) {
  const { error } = await supabase.from('likes').upsert({ post_id: postId, user_id: uid() }, { onConflict: 'post_id,user_id', ignoreDuplicates: true });
  if (error) throw error;
}
export async function unlikePost(postId: string) {
  const { error } = await supabase.from('likes').delete().eq('post_id', postId).eq('user_id', uid());
  if (error) throw error;
}
export async function sendComment(c: { id: string; postId: string; body: string }) {
  const { error } = await supabase.from('comments').upsert({ id: c.id, post_id: c.postId, user_id: uid(), body: c.body }, { onConflict: 'id', ignoreDuplicates: true });
  if (error) throw error;
}
export async function deleteComment(id: string) {
  const { error } = await supabase.from('comments').delete().eq('id', id).eq('user_id', uid());
  if (error) throw error;
}
export async function follow(userId: string) {
  const { error } = await supabase.from('follows').upsert({ follower_id: uid(), following_id: userId }, { onConflict: 'follower_id,following_id', ignoreDuplicates: true });
  if (error) throw error;
}
export async function unfollow(userId: string) {
  const { error } = await supabase.from('follows').delete().eq('follower_id', uid()).eq('following_id', userId);
  if (error) throw error;
}

// ---------- Comentarios ----------
export async function fetchComments(postId: string): Promise<Comment[]> {
  const rows = must(await supabase.from('comments').select('id,post_id,user_id,body,created_at,profiles(username,avatar_url)').eq('post_id', postId).order('created_at', { ascending: true })) as any[];
  return rows.map((r) => ({ id: r.id, post_id: r.post_id, user_id: r.user_id, body: r.body, created_at: r.created_at, username: r.profiles?.username ?? '?', avatar_url: r.profiles?.avatar_url ?? null }));
}

// ---------- Perfiles / seguimiento ----------
export async function getProfile(id: string) { return must(await supabase.from('profiles').select('*').eq('id', id).single()) as Profile; }
export async function profileInfo(id: string) { return must(await supabase.rpc('profile_info', { p_user: id })) as ProfileInfo; }
export async function updateProfile(patch: Partial<Pick<Profile, 'is_private' | 'bio' | 'avatar_url' | 'full_name'>>) {
  must(await supabase.from('profiles').update(patch).eq('id', uid()));
  await useAuth.getState().refreshMe();
}
export async function profilesByIds(ids: string[]) {
  if (!ids.length) return {} as Record<string, Profile>;
  const rows = must(await supabase.from('profiles').select('*').in('id', ids)) as Profile[];
  return Object.fromEntries(rows.map((p) => [p.id, p]));
}
export async function searchProfiles(q: string) {
  return must(await supabase.from('profiles').select('*').ilike('username', `%${q}%`).limit(20)) as Profile[];
}
/** RLS decide si puedes ver estas filas (cuenta privada sin aprobación => lista vacía). */
export async function fetchFollowList(userId: string, type: 'followers' | 'following') {
  const col = type === 'followers' ? 'following_id' : 'follower_id';
  const other = type === 'followers' ? 'follower_id' : 'following_id';
  const rows = must(await supabase.from('follows').select('follower_id,following_id').eq(col, userId).eq('status', 'accepted')) as any[];
  const map = await profilesByIds(rows.map((r) => r[other]));
  return rows.map((r) => map[r[other]]).filter(Boolean) as Profile[];
}
export async function fetchFollowRequests() {
  const rows = must(await supabase.from('follows').select('follower_id,created_at').eq('following_id', uid()).eq('status', 'pending').order('created_at', { ascending: false })) as any[];
  const map = await profilesByIds(rows.map((r) => r.follower_id));
  return rows.map((r) => map[r.follower_id]).filter(Boolean) as Profile[];
}
export async function respondRequest(followerId: string, accept: boolean) {
  if (accept) must(await supabase.from('follows').update({ status: 'accepted' }).eq('follower_id', followerId).eq('following_id', uid()));
  else must(await supabase.from('follows').delete().eq('follower_id', followerId).eq('following_id', uid()));
}
export async function fetchNewFollowers() {
  const rows = must(await supabase.from('follows').select('follower_id,created_at').eq('following_id', uid()).eq('status', 'accepted').order('created_at', { ascending: false }).limit(30)) as any[];
  const map = await profilesByIds(rows.map((r) => r.follower_id));
  return rows.map((r) => ({ profile: map[r.follower_id], created_at: r.created_at as string })).filter((r) => r.profile);
}
export async function myFollowingMap() {
  const rows = must(await supabase.from('follows').select('following_id,status').eq('follower_id', uid())) as any[];
  return Object.fromEntries(rows.map((r) => [r.following_id, r.status])) as Record<string, string>;
}
export async function postImages(ids: string[]) {
  if (!ids.length) return {} as Record<string, string>;
  const rows = must(await supabase.from('posts').select('id,image_path').in('id', ids)) as any[];
  return Object.fromEntries(rows.map((r) => [r.id, r.image_path])) as Record<string, string>;
}
export async function postById(id: string) { const [p] = await fetchFeed({ scope: 'one', post: id, limit: 1 }); return p ?? null; }
export async function fetchUnreadByConv() {
  const rows = must(await supabase.from('messages').select('conversation_id').is('read_at', null).neq('sender_id', uid()).limit(500)) as any[];
  return new Set<string>(rows.map((r) => r.conversation_id));
}
export async function fetchActivity() {
  return must(await supabase.rpc('get_activity')) as { kind: 'like' | 'comment'; actor_id: string; actor_username: string; post_id: string; body: string | null; created_at: string }[];
}

// ---------- Historias ----------
export async function fetchStoryGroups(): Promise<StoryGroup[]> {
  const me = uid();
  const fol = must(await supabase.from('follows').select('following_id').eq('follower_id', me).eq('status', 'accepted')) as any[];
  const ids = [me, ...fol.map((f) => f.following_id)];
  const rows = must(await supabase.from('stories').select('id,user_id,image_path,created_at,expires_at,profiles(username,avatar_url)').in('user_id', ids).gt('expires_at', new Date().toISOString()).order('created_at', { ascending: true })) as any[];
  const groups = new Map<string, StoryGroup>();
  for (const r of rows) {
    const g = groups.get(r.user_id) ?? { user_id: r.user_id, username: r.profiles?.username ?? '?', avatar_url: r.profiles?.avatar_url ?? null, stories: [] as Story[] };
    g.stories.push({ id: r.id, user_id: r.user_id, image_path: r.image_path, created_at: r.created_at, expires_at: r.expires_at });
    groups.set(r.user_id, g);
  }
  const list = [...groups.values()];
  return list.sort((a, b) => (a.user_id === me ? -1 : b.user_id === me ? 1 : 0)); // mis historias primero
}

// ---------- Mensajería ----------
export async function getOrCreateConversation(otherId: string) { return must(await supabase.rpc('get_or_create_conversation', { p_other: otherId })) as string; }
export async function fetchInbox(): Promise<InboxItem[]> {
  const me = uid();
  const convs = must(await supabase.from('conversations').select('*').order('last_message_at', { ascending: false })) as any[];
  const map = await profilesByIds(convs.map((c) => (c.user_a === me ? c.user_b : c.user_a)));
  const unread = await fetchUnreadByConv().catch(() => new Set<string>());
  return convs.map((c) => ({ id: c.id, last_message_at: c.last_message_at, last_message_body: c.last_message_body, unread: unread.has(c.id), other: map[c.user_a === me ? c.user_b : c.user_a] })).filter((c) => c.other);
}
export async function fetchMessages(convId: string) {
  return must(await supabase.from('messages').select('*').eq('conversation_id', convId).order('created_at', { ascending: false }).limit(60)) as Message[];
}
export async function sendMessage(m: { id: string; conversation_id: string; body: string }) {
  const { error } = await supabase.from('messages').upsert({ ...m, sender_id: uid() }, { onConflict: 'id', ignoreDuplicates: true });
  if (error) throw error;
}
export async function deleteMessage(id: string) {
  const { error } = await supabase.from('messages').delete().eq('id', id).eq('sender_id', uid());
  if (error) throw error;
}
export async function markRead(convId: string) {
  const now = new Date().toISOString();
  await supabase.from('messages').update({ read_at: now, delivered_at: now }).eq('conversation_id', convId).neq('sender_id', uid()).is('read_at', null);
}
export async function markAllDelivered() {
  await supabase.from('messages').update({ delivered_at: new Date().toISOString() }).neq('sender_id', uid()).is('delivered_at', null);
}

// ---------- Extras para las pantallas (badges, actividad, bandeja) ----------
export async function unreadCount() {
  const { count } = await supabase.from('messages').select('id', { count: 'exact', head: true }).neq('sender_id', uid()).is('read_at', null);
  return count ?? 0;
}
export async function unreadConversationIds() {
  const rows = must(await supabase.from('messages').select('conversation_id').neq('sender_id', uid()).is('read_at', null).limit(500)) as any[];
  return new Set<string>(rows.map((r) => r.conversation_id));
}
export async function followingProfiles() {
  const rows = must(await supabase.from('follows').select('following_id').eq('follower_id', uid()).eq('status', 'accepted').limit(30)) as any[];
  const map = await profilesByIds(rows.map((r) => r.following_id));
  return rows.map((r) => map[r.following_id]).filter(Boolean) as Profile[];
}
export async function recentFollowers() {
  const me = uid();
  const rows = must(await supabase.from('follows').select('follower_id,created_at').eq('following_id', me).eq('status', 'accepted').order('created_at', { ascending: false }).limit(30)) as any[];
  const mine = must(await supabase.from('follows').select('following_id,status').eq('follower_id', me)) as any[];
  const map = await profilesByIds(rows.map((r) => r.follower_id));
  return {
    followers: rows.map((r) => ({ profile: map[r.follower_id] as Profile, created_at: r.created_at as string })).filter((x) => x.profile),
    mine: Object.fromEntries(mine.map((r) => [r.following_id, r.status])) as Record<string, string>,
  };
}
export async function postThumbs(ids: string[]) {
  if (!ids.length) return {} as Record<string, string>;
  const rows = must(await supabase.from('posts').select('id,image_path').in('id', ids)) as any[];
  return Object.fromEntries(rows.map((r) => [r.id, r.image_path])) as Record<string, string>;
}
