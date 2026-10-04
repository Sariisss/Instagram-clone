import { FlatList, KeyboardAvoidingView, Platform, Pressable, Share, StyleSheet, View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { usePostData } from '@/hooks/usePostData';
import { CommentInput, CommentRow } from '@/ui/Comments';
import { Text } from '@/ui/Text';
import { C } from '@/ui/theme';

/** Hoja inferior de comentarios (estilo Instagram). */
export default function CommentsSheet() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { post, comments, missing, send, remove } = usePostData(id);

  return (
    <KeyboardAvoidingView style={{ flex: 1, backgroundColor: '#121212' }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <View style={s.grabber} />
      <View style={s.header}>
        <Pressable onPress={() => router.back()} hitSlop={10} style={{ width: 28 }}><Ionicons name="close" size={24} color={C.text} /></Pressable>
        <Text style={{ fontWeight: '700', fontSize: 15 }}>Comentarios</Text>
        <Pressable onPress={() => Share.share({ message: `instagramclone://post/${id}` })} hitSlop={10} style={{ width: 28, alignItems: 'flex-end' }}><Ionicons name="paper-plane-outline" size={22} color={C.text} /></Pressable>
      </View>
      {missing ? <Text style={{ textAlign: 'center', color: C.sub, marginTop: 40 }}>Esta publicación no existe o es privada.</Text> : (
        <FlatList
          data={comments}
          keyExtractor={(c) => c.id}
          keyboardShouldPersistTaps="handled"
          contentInsetAdjustmentBehavior="never"
          contentContainerStyle={{ paddingTop: 14, paddingBottom: 6 }}
          ListHeaderComponent={post?.caption ? <CommentRow author c={{ username: post.username, avatar_url: post.avatar_url, body: post.caption, created_at: post.created_at }} /> : null}
          ListEmptyComponent={<Text style={{ textAlign: 'center', color: C.sub, marginTop: 30 }}>Aún no hay comentarios. Sé el primero.</Text>}
          renderItem={({ item }) => <CommentRow c={item} onDelete={() => remove(item)} />}
        />
      )}
      <CommentInput onSend={send} emojis />
    </KeyboardAvoidingView>
  );
}
const s = StyleSheet.create({
  grabber: { alignSelf: 'center', width: 36, height: 4, borderRadius: 2, backgroundColor: 'rgba(255,255,255,0.25)', marginTop: 8 },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingVertical: 12, borderBottomWidth: StyleSheet.hairlineWidth, borderColor: C.border },
});
