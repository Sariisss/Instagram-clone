import { StyleSheet, View } from 'react-native';
import { router, Tabs } from 'expo-router';
import { Feather, Ionicons } from '@expo/vector-icons';
import { useAuth } from '@/state/auth';
import { Avatar } from '@/ui/Avatar';
import { C } from '@/ui/theme';

const ion = (on: string, off: string) => ({ focused }: { focused: boolean }) => <Ionicons name={(focused ? on : off) as any} size={27} color="#fff" />;

export default function TabsLayout() {
  const me = useAuth((s) => s.me);
  return (
    <Tabs screenOptions={{
      headerShown: false, tabBarShowLabel: false, sceneStyle: { backgroundColor: C.bg },
      tabBarStyle: { backgroundColor: C.bg, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: C.border, elevation: 0 },
    }}>
      <Tabs.Screen name="(home)" options={{ tabBarIcon: ion('home', 'home-outline') }} />
      <Tabs.Screen name="(explore)" options={{ tabBarIcon: ion('search', 'search-outline') }} />
      {/* El "+" central no es una pantalla: abre el modal de creación */}
      <Tabs.Screen name="new-post" options={{ tabBarIcon: () => <Feather name="plus-square" size={25} color="#fff" /> }}
        listeners={{ tabPress: (e) => { e.preventDefault(); router.push('/create'); } }} />
      <Tabs.Screen name="reels" options={{ tabBarIcon: ion('play-circle', 'play-circle-outline') }} />
      <Tabs.Screen name="(activity)" options={{ href: null }} />
      <Tabs.Screen name="(profile)" options={{
        tabBarIcon: ({ focused }) => (
          <View style={{ borderWidth: focused ? 1.5 : 0, borderColor: '#fff', borderRadius: 20, padding: focused ? 1 : 0 }}>
            <Avatar path={me?.avatar_url} size={focused ? 24 : 26} />
          </View>
        ),
      }} />
    </Tabs>
  );
}
