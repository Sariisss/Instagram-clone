import { memo, useEffect, useState } from 'react';
import { Image, StyleProp, StyleSheet, View, ViewStyle } from 'react-native';
import { imageCache } from '@/cache/imageCache';

type Props = { url?: string | null; style?: StyleProp<ViewStyle>; active?: boolean; resizeMode?: 'cover' | 'contain' };

/**
 * Usa el <Image> nativo de RN (sin librerías de carga) + nuestro motor de caché.
 * El cleanup del efecto cancela la descarga: se ejecuta al desmontar la celda
 * o cuando `active` pasa a false (la celda salió del viewport).
 */
export const CachedImage = memo(function CachedImage({ url, style, active = true, resizeMode = 'cover' }: Props) {
  const [uri, setUri] = useState<string | undefined>(() => (url ? imageCache.peek(url) : undefined));

  useEffect(() => {
    if (!url || !active) return;
    let alive = true;
    const h = imageCache.acquire(url);
    h.promise.then((u) => alive && setUri(u)).catch(() => {});
    return () => { alive = false; h.release(); };
  }, [url, active]);

  return (
    <View style={[{ backgroundColor: '#1c1c1c', overflow: 'hidden' }, style]}>
      {uri ? <Image source={{ uri }} style={StyleSheet.absoluteFill} resizeMode={resizeMode} fadeDuration={0} /> : null}
    </View>
  );
});
