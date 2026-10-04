import { Alert, Pressable, ScrollView, StyleSheet, Switch, View } from 'react-native';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import * as api from '@/data/api';
import { supabase } from '@/core/supabase';
import { useAuth } from '@/state/auth';
import { useSaved } from '@/state/saved';
import { Text } from '@/ui/Text';
import { C } from '@/ui/theme';

function Row({ icon, label, value, onPress, right, danger }: { icon?: keyof typeof Ionicons.glyphMap; label: string; value?: string; onPress?: () => void; right?: React.ReactNode; danger?: boolean }) {
  return (
    <Pressable onPress={onPress} disabled={!onPress} style={s.row}>
      {icon ? <Ionicons name={icon} size={22} color={danger ? C.red : C.text} /> : null}
      <Text style={{ flex: 1, fontSize: 15, color: danger ? C.red : C.text, fontWeight: danger ? '600' : '400' }}>{label}</Text>
      {value ? <Text style={{ color: C.sub, fontSize: 13 }}>{value}</Text> : null}
      {right ?? (onPress && !danger ? <Ionicons name="chevron-forward" size={18} color={C.mute} /> : null)}
    </Pressable>
  );
}
const Section = ({ title, children }: { title: string; children: React.ReactNode }) => (
  <View style={{ marginTop: 22 }}><Text style={s.section}>{title.toUpperCase()}</Text>{children}</View>
);

export default function SettingsScreen() {
  const me = useAuth((x) => x.me)!;
  const saved = useSaved((x) => x.ids.size);
  const setPrivate = async (v: boolean) => { try { await api.updateProfile({ is_private: v }); } catch (e: any) { Alert.alert('No se pudo cambiar', e?.message); } };
  const logout = () => Alert.alert('Cerrar sesión', `¿Salir de @${me.username}?`, [
    { text: 'Cancelar', style: 'cancel' },
    { text: 'Cerrar sesión', style: 'destructive', onPress: () => supabase.auth.signOut() },
  ]);

  return (
    <ScrollView style={{ backgroundColor: C.bg }} contentContainerStyle={{ paddingBottom: 50 }}>
      <Section title="Cómo usas Instagram">
        <Row icon="bookmark-outline" label="Guardados" value={String(saved)} onPress={() => router.push('/saved')} />
        <Row icon="pencil-outline" label="Editar perfil" onPress={() => router.push('/edit-profile')} />
        <Row icon="heart-outline" label="Tu actividad" onPress={() => router.navigate('/(tabs)/(activity)')} />
      </Section>
      <Section title="Quién puede ver tu contenido">
        <Row icon="lock-closed-outline" label="Cuenta privada" value={me.is_private ? 'Privada' : 'Pública'}
          right={<Switch value={me.is_private} onValueChange={setPrivate} trackColor={{ true: C.blue, false: '#3a3a3a' }} thumbColor="#fff" />} />
      </Section>
      <Section title="Cómo pueden interactuar contigo">
        <Row icon="paper-plane-outline" label="Mensajes" onPress={() => router.navigate('/(tabs)/(home)/inbox')} />
      </Section>
      <Section title="Inicio de sesión">
        <Row label={`Cerrar sesión de ${me.username}`} danger onPress={logout} />
      </Section>
    </ScrollView>
  );
}
const s = StyleSheet.create({
  section: { color: C.sub, fontSize: 11, fontWeight: '700', letterSpacing: 0.8, paddingHorizontal: 16, marginBottom: 4 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 14, paddingHorizontal: 16, minHeight: 52 },
});
