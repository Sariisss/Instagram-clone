import { useState } from 'react';
import { ActivityIndicator, Alert, Image, KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import { VideoView, useVideoPlayer } from 'expo-video';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { router, useLocalSearchParams } from 'expo-router';
import * as api from '@/data/api';
import { useFeed } from '@/state/feed';
import { useStories } from '@/state/stories';
import { Text, TextInput } from '@/ui/Text';
import { C, STORY_GRADIENT } from '@/ui/theme';

function VideoPreview({ uri }: { uri: string }) {
  const player = useVideoPlayer(uri, (p) => { p.loop = true; p.muted = true; p.play(); });
  return <VideoView player={player} style={{ width: '100%', height: '100%' }} contentFit="contain" nativeControls />;
}

export default function CreateScreen() {
  const [uri, setUri] = useState<string | null>(null);
  const [isVideo, setIsVideo] = useState(false);
  const [mimeType, setMimeType] = useState<string | null>(null);
  const [caption, setCaption] = useState('');
  const { mode } = useLocalSearchParams<{ mode?: string }>();
  const [kind, setKind] = useState<'post' | 'story' | 'reel'>(mode === 'story' ? 'story' : mode === 'reel' ? 'reel' : 'post');
  const [busy, setBusy] = useState(false);
  const asStory = kind === 'story';
  const aspect: [number, number] = asStory || kind === 'reel' ? [9, 16] : [1, 1];

  const fromGallery = async () => {
    const mediaTypes: ('images' | 'videos')[] = asStory ? ['images'] : kind === 'reel' ? ['videos'] : ['images', 'videos'];
    const r = await ImagePicker.launchImageLibraryAsync({ mediaTypes, allowsEditing: false, quality: 1 });
    if (!r.canceled) {
      setUri(r.assets[0].uri);
      setIsVideo(r.assets[0].type === 'video');
      setMimeType(r.assets[0].mimeType ?? null);
    }
  };
  const fromCamera = async () => {
    const perm = await ImagePicker.requestCameraPermissionsAsync();
    if (!perm.granted) return Alert.alert('Permiso necesario', 'Activa el permiso de cámara para tomar fotos.');
    const r = await ImagePicker.launchCameraAsync({ mediaTypes: ['images'], allowsEditing: true, aspect, quality: 1 });
    if (!r.canceled) { setUri(r.assets[0].uri); setIsVideo(false); setMimeType(null); }
  };
  const publish = async () => {
    if (!uri) return;
    setBusy(true);
    try {
      if (asStory) { await api.createStory(uri); await useStories.getState().load(); }
      else { await api.createPost(uri, caption.trim(), isVideo, mimeType); useFeed.getState().bump(); }
      router.back();
    } catch (e: any) { Alert.alert('No se pudo publicar', e?.message ?? 'Revisa tu conexión (publicar requiere internet).'); }
    setBusy(false);
  };

  return (
    <KeyboardAvoidingView style={{ flex: 1, backgroundColor: C.bg }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScrollView contentContainerStyle={{ padding: 16, gap: 16 }} keyboardShouldPersistTaps="handled">
        <View style={s.seg}>
          {([['post', 'PUBLICACIÓN'], ['reel', 'REEL'], ['story', 'HISTORIA']] as const).map(([v, label]) => (
            <Pressable key={label} onPress={() => { setKind(v); setUri(null); setIsVideo(false); setMimeType(null); }} style={[s.segItem, kind === v && { backgroundColor: C.chip }]}>
              <Text style={{ fontWeight: '700', fontSize: 12, letterSpacing: 1, color: kind === v ? C.text : C.sub }}>{label}</Text>
            </Pressable>
          ))}
        </View>

        <View style={[s.preview, { aspectRatio: asStory ? 9 / 16 : 1, maxHeight: 460, alignSelf: 'center', width: asStory ? undefined : '100%' }]}>
          {uri ? isVideo ? <VideoPreview uri={uri} /> : <Image source={{ uri }} style={{ width: '100%', height: '100%' }} resizeMode="cover" /> : (
            <View style={{ alignItems: 'center', gap: 14 }}>
              <Ionicons name={kind === 'reel' ? 'videocam-outline' : 'images-outline'} size={44} color={C.sub} />
              <Text style={{ color: C.sub }}>Elige {kind === 'reel' ? 'un video para tu reel' : `una foto o video para ${asStory ? 'tu historia' : 'tu publicación'}`}</Text>
              <View style={{ flexDirection: 'row', gap: 10 }}>
                <Pressable style={s.pick} onPress={fromGallery}><Ionicons name="image-outline" size={18} color={C.text} /><Text style={s.pickText}>Galería</Text></Pressable>
                <Pressable style={s.pick} onPress={fromCamera}><Ionicons name="camera-outline" size={18} color={C.text} /><Text style={s.pickText}>Cámara</Text></Pressable>
              </View>
            </View>
          )}
        </View>
        {uri ? <Pressable onPress={() => { setUri(null); setIsVideo(false); setMimeType(null); }}><Text style={{ color: C.blue, textAlign: 'center', fontWeight: '600' }}>Elegir otro archivo</Text></Pressable> : null}

        {!asStory ? <TextInput style={s.input} placeholder="Escribe un pie de foto…" value={caption} onChangeText={setCaption} multiline /> : null}

        <Pressable onPress={publish} disabled={!uri || busy} style={{ opacity: !uri ? 0.35 : 1, alignSelf: 'center' }}>
          <LinearGradient colors={STORY_GRADIENT} start={{ x: 0.1, y: 1 }} end={{ x: 0.9, y: 0 }} style={s.ring}>
            <View style={s.ringInner}>{busy ? <ActivityIndicator color="#fff" /> : <Ionicons name="arrow-up" size={30} color="#fff" />}</View>
          </LinearGradient>
          <Text style={{ textAlign: 'center', marginTop: 6, fontWeight: '700', fontSize: 12, letterSpacing: 1 }}>COMPARTIR</Text>
        </Pressable>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}
const s = StyleSheet.create({
  seg: { flexDirection: 'row', alignSelf: 'center', backgroundColor: '#141414', borderRadius: 20, padding: 3 },
  segItem: { paddingHorizontal: 18, paddingVertical: 8, borderRadius: 17 },
  preview: { backgroundColor: '#0e0e0e', borderRadius: 14, overflow: 'hidden', alignItems: 'center', justifyContent: 'center', borderWidth: StyleSheet.hairlineWidth, borderColor: C.border },
  pick: { flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: C.chip, paddingHorizontal: 16, paddingVertical: 10, borderRadius: 22 },
  pickText: { fontWeight: '600' },
  input: { backgroundColor: '#141414', borderRadius: 12, padding: 12, minHeight: 80, fontSize: 15, textAlignVertical: 'top' },
  ring: { width: 76, height: 76, borderRadius: 38, padding: 3, alignSelf: 'center' },
  ringInner: { flex: 1, borderRadius: 38, backgroundColor: C.bg, alignItems: 'center', justifyContent: 'center' },
});
