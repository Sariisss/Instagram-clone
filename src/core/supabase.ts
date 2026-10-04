import 'react-native-url-polyfill/auto';
import Storage from 'expo-sqlite/kv-store';
import { createClient } from '@supabase/supabase-js';
import { AppState } from 'react-native';

export const supabase = createClient(
  process.env.EXPO_PUBLIC_SUPABASE_URL!,
  process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY!,
  { auth: { storage: Storage, autoRefreshToken: true, persistSession: true, detectSessionInUrl: false } },
);

AppState.addEventListener('change', (s) => {
  if (s === 'active') supabase.auth.startAutoRefresh();
  else supabase.auth.stopAutoRefresh();
});

export const mediaUrl = (path: string) => supabase.storage.from('media').getPublicUrl(path).data.publicUrl;
