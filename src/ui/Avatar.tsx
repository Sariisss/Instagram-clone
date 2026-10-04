import { View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { mediaUrl } from '@/core/supabase';
import { CachedImage } from './CachedImage';
import { C } from './theme';

export function Avatar({ path, size = 32 }: { path?: string | null; size?: number }) {
  const style = { width: size, height: size, borderRadius: size / 2 };
  if (!path) return <View style={[style, { backgroundColor: C.chip, alignItems: 'center', justifyContent: 'center' }]}><Ionicons name="person" size={size * 0.55} color={C.sub} /></View>;
  return <CachedImage url={mediaUrl(path)} style={style} />;
}
