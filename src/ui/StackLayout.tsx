import { Stack } from 'expo-router';
import { C } from './theme';

// Cada pestaña monta su PROPIO <Stack>: pilas de navegación independientes.
export const unstable_settings = { initialRouteName: 'index' };
export default function TabStack() {
  return (
    <Stack screenOptions={{
      headerStyle: { backgroundColor: C.bg }, headerTintColor: C.text, headerShadowVisible: false,
      headerTitleStyle: { fontWeight: '700' }, headerBackButtonDisplayMode: 'minimal', contentStyle: { backgroundColor: C.bg },
    }} />
  );
}
