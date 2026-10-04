import { useState } from 'react';
import { Alert, Pressable, ScrollView, StyleSheet, Switch, View } from 'react-native';
import { router } from 'expo-router';
import * as ImagePicker from 'expo-image-picker';
import * as api from '@/data/api';
import { useAuth } from '@/state/auth';
import { Avatar } from '@/ui/Avatar';
import { Text, TextInput } from '@/ui/Text';
import { C } from '@/ui/theme';

export default function EditProfileScreen() {
  const me = useAuth((s) => s.me)!;
  const [name, setName] = useState(me.full_name ?? '');
  const [bio, setBio] = useState(me.bio ?? '');
  const [priv, setPriv] = useState(me.is_private);
  const [avatar, setAvatar] = useState(me.avatar_url);

  const changePhoto = async () => {
    const r = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], allowsEditing: true, aspect: [1, 1] });
    if (r.canceled) return;
    try { setAvatar(await api.uploadImage(r.assets[0].uri, 'avatars', 400)); } catch (e: any) { Alert.alert('Error', e?.message); }
  };
  const save = async () => {
    try { await api.updateProfile({ full_name: name.trim() || null, bio: bio.trim() || null, is_private: priv, avatar_url: avatar }); router.back(); }
    catch (e: any) { Alert.alert('No se pudo guardar', e?.message); }
  };

  return (
    <ScrollView style={{ backgroundColor: C.bg }} contentContainerStyle={{ padding: 18, gap: 18 }} keyboardShouldPersistTaps="handled">
      <View style={{ alignItems: 'center', gap: 10 }}>
        <Avatar path={avatar} size={90} />
        <Pressable onPress={changePhoto}><Text style={{ color: C.blue, fontWeight: '600' }}>Cambiar foto de perfil</Text></Pressable>
      </View>
      <View><Text style={s.label}>Nombre</Text><TextInput style={s.input} placeholder="Nombre" value={name} onChangeText={setName} /></View>
      <View><Text style={s.label}>Biografía</Text><TextInput style={[s.input, { minHeight: 64 }]} placeholder="Biografía" value={bio} onChangeText={setBio} multiline /></View>
      <View style={s.row}>
        <View style={{ flex: 1 }}><Text style={{ fontWeight: '600' }}>Cuenta privada</Text><Text style={{ color: C.sub, fontSize: 12, marginTop: 2 }}>Solo tus seguidores aprobados verán tus publicaciones.</Text></View>
        <Switch value={priv} onValueChange={setPriv} trackColor={{ true: C.blue, false: '#3a3a3a' }} thumbColor="#fff" />
      </View>
      <Pressable style={s.btn} onPress={save}><Text style={{ fontWeight: '700' }}>Listo</Text></Pressable>
    </ScrollView>
  );
}
const s = StyleSheet.create({
  label: { color: C.sub, fontSize: 12, marginBottom: 2 },
  input: { borderBottomWidth: StyleSheet.hairlineWidth, borderColor: '#4a4a4a', paddingVertical: 8, fontSize: 15 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  btn: { backgroundColor: C.blue, padding: 12, borderRadius: 10, alignItems: 'center' },
});
