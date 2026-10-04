import { View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { C, STORY_GRADIENT } from './theme';

/** Aro de historia: degradado si hay historias sin ver, gris si ya las viste, sin aro si no hay. */
export function StoryRing({ state, children }: { state: 'none' | 'unseen' | 'seen'; children: React.ReactNode }) {
  const inner = <View style={{ backgroundColor: C.bg, padding: 2, borderRadius: 100 }}>{children}</View>;
  if (state === 'unseen') return <LinearGradient colors={STORY_GRADIENT} start={{ x: 0.1, y: 1 }} end={{ x: 0.9, y: 0 }} style={{ padding: 2, borderRadius: 100 }}>{inner}</LinearGradient>;
  if (state === 'seen') return <View style={{ padding: 1.5, borderRadius: 100, backgroundColor: '#3a3a3a' }}>{inner}</View>;
  return <View style={{ padding: 3.5 }}>{children}</View>;
}
