import { useEffect, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import type { StyleProp, ViewStyle } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { VideoView, useVideoPlayer } from 'expo-video';
import { mediaUrl } from '@/core/supabase';
import { CachedImage } from './CachedImage';

export const isVideoPath = (path: string) => /\.(mp4|mov|m4v|webm)$/i.test(path);

function VideoMedia({ uri, active, muted, showMuteButton, style, contentFit }: { uri: string; active: boolean; muted: boolean; showMuteButton: boolean; style?: StyleProp<ViewStyle>; contentFit: 'cover' | 'contain' }) {
  const [isMuted, setIsMuted] = useState(muted);
  const player = useVideoPlayer(uri, (p) => { p.loop = true; p.muted = muted; });
  useEffect(() => {
    if (active) player.play();
    else player.pause();
  }, [active, player]);
  const toggleMuted = () => {
    const nextMuted = !player.muted;
    player.muted = nextMuted;
    setIsMuted(nextMuted);
  };
  return (
    <View style={[style, { overflow: 'hidden' }]}>
      <VideoView player={player} style={StyleSheet.absoluteFill} contentFit={contentFit} nativeControls={false} />
      {showMuteButton ? (
        <Pressable onPress={(event) => { event.stopPropagation(); toggleMuted(); }} hitSlop={8} accessibilityLabel={isMuted ? 'Activar sonido' : 'Silenciar'} style={s.muteButton}>
          <Ionicons name={isMuted ? 'volume-mute' : 'volume-high'} size={20} color="#fff" />
        </Pressable>
      ) : null}
    </View>
  );
}

export function PostMedia({ path, active = false, muted = true, showMuteButton = false, style, contentFit = 'cover' }: { path: string; active?: boolean; muted?: boolean; showMuteButton?: boolean; style?: StyleProp<ViewStyle>; contentFit?: 'cover' | 'contain' }) {
  const url = mediaUrl(path);
  return isVideoPath(path)
    ? <VideoMedia key={path} uri={url} active={active} muted={muted} showMuteButton={showMuteButton} style={style} contentFit={contentFit} />
    : <CachedImage url={url} active={active} style={style} resizeMode={contentFit} />;
}

const s = StyleSheet.create({
  muteButton: { position: 'absolute', right: 12, bottom: 12, width: 40, height: 40, borderRadius: 20, backgroundColor: 'rgba(0,0,0,0.62)', alignItems: 'center', justifyContent: 'center' },
});