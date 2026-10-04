import { RefObject, useState } from 'react';
import { Alert, Pressable, StyleSheet, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { timeAgo } from '@/core/time';
import { useAuth } from '@/state/auth';
import type { Comment } from '@/domain/types';
import { Avatar } from './Avatar';
import { Text, TextInput } from './Text';
import { C } from './theme';

export function CommentRow({ c, author, onDelete }: { c: Pick<Comment, 'username' | 'avatar_url' | 'body' | 'created_at'> & Partial<Pick<Comment, 'id' | 'user_id'>> & { pending?: boolean }; author?: boolean; onDelete?: () => Promise<void> }) {
  const me = useAuth((x) => x.me);
  const canDelete = !author && !!onDelete && c.user_id === me?.id && !c.pending;
  const confirmDelete = () => Alert.alert('¿Eliminar comentario?', 'Esta acción no se puede deshacer.', [
    { text: 'Cancelar', style: 'cancel' },
    { text: 'Eliminar', style: 'destructive', onPress: () => { onDelete?.().catch((e: any) => Alert.alert('No se pudo eliminar', e?.message ?? 'Inténtalo de nuevo.')); } },
  ]);
  return (
    <View style={[s.row, c.pending && { opacity: 0.5 }]}>
      <Avatar path={c.avatar_url} size={36} />
      <View style={{ flex: 1 }}>
        <Text style={s.body}>
          <Text style={{ fontWeight: '700' }}>{c.username} </Text>
          {author ? <Text style={s.badge}> Autor </Text> : null}
          {author ? ' ' : ''}{c.body}
        </Text>
        <Text style={s.meta}>{c.pending ? 'Enviando…' : timeAgo(c.created_at)}</Text>
      </View>
      {canDelete ? <Pressable onPress={confirmDelete} hitSlop={10} accessibilityLabel="Eliminar comentario"><Ionicons name="trash-outline" size={17} color={C.sub} /></Pressable> : null}
    </View>
  );
}

const EMOJIS = ['❤️', '🙌', '🔥', '👏', '😢', '😍', '😮', '😂'];

export function CommentInput({ onSend, inputRef, emojis }: { onSend: (t: string) => void; inputRef?: RefObject<any>; emojis?: boolean }) {
  const me = useAuth((x) => x.me)!;
  const [text, setText] = useState('');
  const can = text.trim().length > 0;
  const submit = () => { if (!can) return; onSend(text); setText(''); };
  return (
    <View style={s.dock}>
      {emojis ? (
        <View style={s.emojis}>
          {EMOJIS.map((e) => <Pressable key={e} onPress={() => setText((t) => t + e)}><Text style={{ fontSize: 25 }}>{e}</Text></Pressable>)}
        </View>
      ) : null}
      <View style={s.inputRow}>
        <Avatar path={me.avatar_url} size={34} />
        <View style={s.capsule}>
          <TextInput ref={inputRef} style={s.input} placeholder="Añade un comentario…" value={text} onChangeText={setText} onSubmitEditing={submit} returnKeyType="send" />
          <Pressable onPress={submit} disabled={!can}><Text style={{ color: C.blue, fontWeight: '700', opacity: can ? 1 : 0.4 }}>Publicar</Text></Pressable>
        </View>
      </View>
    </View>
  );
}

const s = StyleSheet.create({
  row: { flexDirection: 'row', gap: 12, paddingHorizontal: 14, paddingVertical: 9 },
  body: { fontSize: 13.5, lineHeight: 18 },
  badge: { backgroundColor: C.chip, color: C.sub, fontSize: 10, fontWeight: '700' },
  meta: { color: C.mute, fontSize: 12, marginTop: 4, fontWeight: '500' },
  dock: { borderTopWidth: StyleSheet.hairlineWidth, borderColor: C.border, backgroundColor: '#121212', paddingBottom: 6 },
  emojis: { flexDirection: 'row', justifyContent: 'space-around', paddingHorizontal: 12, paddingTop: 10, paddingBottom: 4 },
  inputRow: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 14, paddingVertical: 8 },
  capsule: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: C.chip, borderRadius: 22, paddingHorizontal: 14, height: 40, borderWidth: StyleSheet.hairlineWidth, borderColor: '#363636' },
  input: { flex: 1, fontSize: 14, padding: 0 },
});
