import { useCallback, useEffect, useRef, useState } from 'react';
import { Animated, Dimensions, Easing, Pressable, StyleSheet, Text, View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { mediaUrl } from '@/core/supabase';
import { useStories } from '@/state/stories';
import { Avatar } from '@/ui/Avatar';
import { CachedImage } from '@/ui/CachedImage';

const DURATION = 5000;
const { width: W, height: H } = Dimensions.get('window');

export default function StoryViewerScreen() {
  const { userId } = useLocalSearchParams<{ userId: string }>();
  const groups = useStories((s) => s.groups);
  const markSeen = useStories((s) => s.markSeen);
  const insets = useSafeAreaInsets();
  const [g, setG] = useState(Math.max(0, groups.findIndex((x) => x.user_id === userId)));
  const [i, setI] = useState(0);
  const [now, setNow] = useState(Date.now());
  const group = groups[g];
  const story = group?.stories[i];

  const progress = useRef(new Animated.Value(0)).current;
  const value = useRef(0);
  const anim = useRef<Animated.CompositeAnimation | null>(null);
  const pressedAt = useRef(0);

  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 30_000);
    return () => clearInterval(timer);
  }, []);

  useEffect(() => { const id = progress.addListener(({ value: v }) => { value.current = v; }); return () => progress.removeListener(id); }, [progress]);

  const next = useCallback(() => {
    if (!group) return router.back();
    if (i < group.stories.length - 1) setI(i + 1);
    else if (g < groups.length - 1) { setG(g + 1); setI(0); }
    else router.back();
  }, [g, i, group, groups.length]);
  const prev = () => { if (i > 0) setI(i - 1); else if (g > 0) { setG(g - 1); setI(0); } };

  const run = useCallback((from: number) => {
    progress.setValue(from);
    anim.current = Animated.timing(progress, { toValue: 1, duration: DURATION * (1 - from), easing: Easing.linear, useNativeDriver: false });
    anim.current.start(({ finished }) => { if (finished) next(); });
  }, [next, progress]);

  useEffect(() => { // nueva historia => reinicia barra y marca "visto" (persistido en SQLite)
    if (!story) return;
    markSeen(story.id);
    run(0);
    return () => anim.current?.stop();
  }, [story?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!story) return <View style={{ flex: 1, backgroundColor: '#000' }} />;
  const remaining = Math.max(0, new Date(story.expires_at).getTime() - now);
  const remainingHours = Math.floor(remaining / 3_600_000);
  const remainingMinutes = Math.floor((remaining % 3_600_000) / 60_000);
  const uploadedAt = new Date(story.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

  return (
    <View style={{ flex: 1, backgroundColor: '#000' }}>
      <CachedImage url={mediaUrl(story.image_path)} resizeMode="contain" style={{ width: W, height: H, backgroundColor: '#000' }} />
      {/* Mantener presionado = pausa; soltar = reanudar; toque corto = izquierda/derecha */}
      <Pressable
        style={StyleSheet.absoluteFill}
        onPressIn={() => { pressedAt.current = Date.now(); anim.current?.stop(); }}
        onPressOut={(e) => {
          if (Date.now() - pressedAt.current < 220) { e.nativeEvent.locationX < W / 3 ? prev() : next(); }
          else run(value.current);
        }}
      />
      <View pointerEvents="none" style={{ position: 'absolute', top: insets.top + 6, left: 8, right: 8 }}>
        <View style={{ flexDirection: 'row', gap: 4 }}>
          {group.stories.map((st, k) => (
            <View key={st.id} style={s.track}>
              <Animated.View style={[s.fill, { width: k < i ? '100%' : k === i ? progress.interpolate({ inputRange: [0, 1], outputRange: ['0%', '100%'] }) : '0%' }]} />
            </View>
          ))}
        </View>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 10 }}>
          <Avatar path={group.avatar_url} size={32} />
          <View>
            <Text style={{ color: '#fff', fontWeight: '700' }}>{group.username}</Text>
            <Text style={{ color: 'rgba(255,255,255,0.8)', fontSize: 11 }}>{`Subida a las ${uploadedAt} · ${remainingHours} h ${remainingMinutes} min restantes`}</Text>
          </View>
        </View>
      </View>
      <Pressable onPress={() => router.back()} style={{ position: 'absolute', top: insets.top + 10, right: 14 }}><Text style={{ color: '#fff', fontSize: 26 }}>✕</Text></Pressable>
    </View>
  );
}
const s = StyleSheet.create({
  track: { flex: 1, height: 3, backgroundColor: 'rgba(255,255,255,0.35)', borderRadius: 2, overflow: 'hidden' },
  fill: { height: 3, backgroundColor: '#fff' },
});
