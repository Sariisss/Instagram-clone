import { useState } from 'react';
import { ActivityIndicator, Alert, KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet } from 'react-native';
import { supabase } from '@/core/supabase';
import { Text, TextInput } from '@/ui/Text';
import { C, logoFont } from '@/ui/theme';

const translate = (m: string) =>
  /already registered/i.test(m) ? 'Ese correo ya está registrado. Inicia sesión.'
  : /invalid login/i.test(m) ? 'Correo o contraseña incorrectos.'
  : /rate limit/i.test(m) ? 'Demasiados intentos de correo. Espera un rato o desactiva "Confirm email" en Supabase.'
  : /Database error/i.test(m) ? 'Error de base de datos: ejecuta supabase/fix.sql en Supabase y prueba con otro nombre de usuario.'
  : m;

export default function LoginScreen() {
  const [signup, setSignup] = useState(false);
  const [email, setEmail] = useState('');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);

  const submit = async () => {
    const mail = email.trim();
    const user = username.trim().toLowerCase();
    if (!mail || !password) return Alert.alert('Faltan datos', 'Escribe tu correo y contraseña.');
    if (signup) {
      if (!/^[a-z0-9_.]{3,20}$/.test(user)) return Alert.alert('Usuario inválido', 'Usa 3 a 20 caracteres: letras minúsculas, números, punto o guion bajo.');
      if (password.length < 6) return Alert.alert('Contraseña corta', 'Debe tener al menos 6 caracteres.');
    }
    setBusy(true);
    try {
      const res = signup
        ? await supabase.auth.signUp({ email: mail, password, options: { data: { username: user } } })
        : await supabase.auth.signInWithPassword({ email: mail, password });
      if (res.error) Alert.alert('Error', translate(res.error.message));
      else if (signup && !res.data.session) Alert.alert('Revisa tu correo', 'Confirma tu cuenta para continuar (o desactiva "Confirm email" en Supabase).');
    } catch (e: any) {
      Alert.alert('Error de conexión', e?.message ?? 'Intenta de nuevo.');
    }
    setBusy(false);
  };

  return (
    <KeyboardAvoidingView style={{ flex: 1, backgroundColor: C.bg }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScrollView contentContainerStyle={s.wrap} keyboardShouldPersistTaps="handled">
        <Text style={s.logo}>Instagram</Text>
        <TextInput style={s.input} placeholder="Correo electrónico" autoCapitalize="none" keyboardType="email-address" value={email} onChangeText={setEmail} />
        {signup ? <TextInput style={s.input} placeholder="Nombre de usuario" autoCapitalize="none" value={username} onChangeText={setUsername} /> : null}
        <TextInput style={s.input} placeholder="Contraseña" secureTextEntry value={password} onChangeText={setPassword} />
        <Pressable style={[s.btn, busy && { opacity: 0.6 }]} onPress={submit} disabled={busy}>
          {busy ? <ActivityIndicator color="#fff" /> : <Text style={s.btnText}>{signup ? 'Registrarte' : 'Iniciar sesión'}</Text>}
        </Pressable>
        <Pressable onPress={() => setSignup(!signup)}><Text style={{ color: C.blue, marginTop: 20, textAlign: 'center', fontWeight: '600' }}>{signup ? '¿Ya tienes cuenta? Inicia sesión' : '¿No tienes cuenta? Regístrate'}</Text></Pressable>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}
const s = StyleSheet.create({
  wrap: { flexGrow: 1, justifyContent: 'center', padding: 28 },
  logo: { fontFamily: logoFont, fontSize: 56, lineHeight: 70, textAlign: 'center', marginBottom: 28 },
  input: { backgroundColor: '#121212', borderWidth: 1, borderColor: C.border, borderRadius: 10, padding: 14, marginBottom: 10, fontSize: 15 },
  btn: { backgroundColor: C.blue, borderRadius: 10, padding: 14, alignItems: 'center', marginTop: 6 },
  btnText: { fontWeight: '700', fontSize: 15 },
});
