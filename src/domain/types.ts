export type FollowStatus = 'none' | 'pending' | 'accepted';
export type Profile = { id: string; username: string; full_name: string | null; avatar_url: string | null; bio: string | null; is_private: boolean };
export type ProfileInfo = { posts: number; followers: number; following: number; my_status: FollowStatus };
export type Post = {
  id: string; user_id: string; username: string; avatar_url: string | null; image_path: string; caption: string | null;
  created_at: string; like_count: number; comment_count: number; liked_by_me: boolean;
};
export type Comment = { id: string; post_id: string; user_id: string; username: string; avatar_url?: string | null; body: string; created_at: string; pending?: boolean };
export type Story = { id: string; user_id: string; image_path: string; created_at: string; expires_at: string };
export type StoryGroup = { user_id: string; username: string; avatar_url: string | null; stories: Story[] };
export type Message = { id: string; conversation_id: string; sender_id: string; body: string; created_at: string; delivered_at: string | null; read_at: string | null; pending?: boolean };
export type InboxItem = { id: string; last_message_at: string; last_message_body: string | null; unread?: boolean; other: Profile };
