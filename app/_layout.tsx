import { useEffect } from 'react';
import { ActivityIndicator, Pressable, View } from 'react-native';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { GrandHotel_400Regular, useFonts } from '@expo-google-fonts/grand-hotel';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { supabase } from '@/core/supabase';
import { useAuth } from '@/state/auth';
import { bindOutbox } from '@/state/feed';
import { useSaved } from '@/state/saved';
import { outbox } from '@/data/outbox';
import { startDeliveryListener } from '@/data/realtime';
import { Text } from '@/ui/Text';
import { C, darkHeader } from '@/ui/theme';

export default function Root() {
  const [fontsLoaded, fontError] = useFonts({ GrandHotel_400Regular });
  const session = useAuth((s) => s.session);
  const ready = useAuth((s) => s.ready);
  const me = useAuth((s) => s.me);
  const loading = useAuth((s) => s.loading);
  const error = useAuth((s) => s.error);
  const init = useAuth((s) => s.init);
  useEffect(() => init(), [init]);

  const uid = session?.user.id;
  useEffect(() => {
    if (!uid) return;
    bindOutbox();
    useSaved.getState().load();
    outbox.start();                 // cola offline: reanuda al abrir la app / al volver la red
    return startDeliveryListener(uid);
  }, [uid]);

  const fontsReady = fontsLoaded || !!fontError;
  if (!fontsReady || !ready || (session && !me && loading)) {
    return <View style={{ flex: 1, backgroundColor: C.bg, alignItems: 'center', justifyContent: 'center' }}><StatusBar style="light" /><ActivityIndicator color="#fff" /></View>;
  }

  if (session && !me) {
    return (
      <View style={{ flex: 1, backgroundColor: C.bg, alignItems: 'center', justifyContent: 'center', gap: 14, padding: 24 }}>
        <StatusBar style="light" />
        <Text style={{ textAlign: 'center' }}>No se pudo cargar tu perfil. Revisa tu conexión y que hayas ejecutado supabase/schema.sql y supabase/fix.sql.</Text>
        {error ? <Text selectable style={{ textAlign: 'center', color: C.red }}>Detalle: {error}</Text> : null}
        <Pressable onPress={() => useAuth.getState().refreshMe()}><Text style={{ color: C.blue, fontWeight: '700' }}>Reintentar</Text></Pressable>
        <Pressable onPress={() => supabase.auth.signOut()}><Text style={{ fontWeight: '600' }}>Cerrar sesión</Text></Pressable>
      </View>
    );
  }

  return (
    <SafeAreaProvider>
      <StatusBar style="light" />
      <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: C.bg } }}>
        <Stack.Protected guard={!!session}>
          <Stack.Screen name="(tabs)" />
          <Stack.Screen name="create" options={{ ...darkHeader, presentation: 'modal', title: 'Nuevo' }} />
          <Stack.Screen name="edit-profile" options={{ ...darkHeader, presentation: 'modal', title: 'Editar perfil' }} />
          <Stack.Screen name="settings" options={{ ...darkHeader, title: 'Configuración y privacidad', headerBackButtonDisplayMode: 'minimal' }} />
          <Stack.Screen name="saved" options={{ ...darkHeader, title: 'Guardados', headerBackButtonDisplayMode: 'minimal' }} />
          <Stack.Screen name="comments/[id]" options={{
            presentation: 'formSheet', sheetAllowedDetents: [0.92], sheetGrabberVisible: false, sheetCornerRadius: 20,
            contentStyle: { backgroundColor: '#121212' },
          }} />
          <Stack.Screen name="story/[userId]" options={{ presentation: 'fullScreenModal', animation: 'fade' }} />
        </Stack.Protected>
        <Stack.Protected guard={!session}>
          <Stack.Screen name="login" />
        </Stack.Protected>
      </Stack>
    </SafeAreaProvider>
  );
}
