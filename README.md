# Instagram Clone — Expo SDK 57 (Expo Go) + Supabase

Parcial de Desarrollo Móvil · Proyecto 3 (V2). React Native + TypeScript + expo-router.

## Puesta en marcha
1. **Supabase**: crea un proyecto → *SQL Editor* → pega y ejecuta `supabase/schema.sql`.
   En *Authentication → Providers → Email* desactiva "Confirm email" (para probar rápido).
2. `cp .env.example .env` y rellena `EXPO_PUBLIC_SUPABASE_URL` y `EXPO_PUBLIC_SUPABASE_ANON_KEY`.
3. `npm install` y luego `npx expo install --fix` (alinea las versiones de los módulos nativos con el SDK 57).
4. `npm run start:tailscale` (o `npx expo start` si estás solo en la misma Wi-Fi) y abre en **Expo Go SDK 57**.
   - Android: Expo Go se instala desde Expo CLI. iOS: `eas go` (Expo Go 57 podría no estar aún en la App Store).
5. Crea 2 cuentas (2 dispositivos / emulador + celular) para probar follows, DMs y privacidad.

**Deep link en Expo Go** (el esquema `instagramclone://` solo funciona en builds propias; en Expo Go usa exp://):
`npx uri-scheme open "exp://TU_HOST_TAILSCALE:8081/--/post/UUID_DEL_POST" --android` (o `--ios`).

## Acceso por Tailscale (Wi-Fi o datos móviles)
1. Instala Tailscale en el computador de desarrollo **y** en el celular, con la misma cuenta (misma tailnet), y mantenlo conectado.
2. En `.env` define `TAILSCALE_HOST` (IP `100.x.y.z` de `tailscale ip -4`, o nombre MagicDNS) y `EXPO_DEV_PORT`.
3. `npm run start:tailscale` → Metro escucha en todas las interfaces (0.0.0.0) y anuncia `exp://<TAILSCALE_HOST>:<puerto>`.
4. En Expo Go escanea el QR o pega esa URL. Funciona igual por Wi-Fi que por datos móviles.
5. Supabase en la nube ya es público (no pasa por Tailscale). Si lo auto-alojas, usa su IP/host de Tailscale en `EXPO_PUBLIC_SUPABASE_URL`.

## Si el correo de confirmación no funciona
Supabase → *Authentication → Sign In / Providers → Email* → desactiva **Confirm email**. Para cuentas ya creadas, en el SQL Editor:
`update auth.users set email_confirmed_at = now() where email_confirmed_at is null;`

Si el registro falla con "Database error", ejecuta `supabase/fix.sql` una vez en el SQL Editor.

## Diseño (modo oscuro OLED)
Tema en `src/ui/theme.ts` (fondo #000000). Componentes de texto con color de tema en `src/ui/Text.tsx`.
Pantallas: feed con historias, hoja de comentarios (`app/comments/[id]`), Explorar (Para ti / Cuentas), crear (galería o cámara),
Actividad (secciones Nuevo/Esta semana/Este mes, solicitudes y "Seguir también"), Mensajes (no leídos, enviar publicación por chat),
chat (tarjetas de publicación, "Escribiendo…", Visto), perfil, Editar perfil, Configuración y privacidad, Guardados.
Fuente del logo: `@expo-google-fonts/grand-hotel` (se instala con `npm install`).

## Arquitectura (capas)
```
app/            Rutas (expo-router). Solo re-exportan pantallas.
src/screens/    UI de cada pantalla.
src/ui/         Componentes (PostCard, CachedImage, StoriesBar…).
src/state/      Estado global (zustand): auth, feed optimista, historias.
src/hooks/      useFeedList (paginación), useNav (navegación por pila).
src/data/       api.ts (Supabase), outbox.ts (cola offline), db.ts (SQLite), realtime.ts.
src/cache/      lru.ts + imageCache.ts (caché 2 niveles).
supabase/       schema.sql (tablas, RLS, triggers, RPCs, storage, realtime).
```

## Mapa módulo → código (útil para la defensa)
| Módulo | Dónde | Idea clave que debes saber explicar |
|---|---|---|
| 1 Privacidad | `schema.sql` (`can_view`, políticas `follows_*`, trigger `follows_set_status`) | El **servidor** decide si un follow es directo o `pending`; RLS oculta posts/stories/listas a quien no esté aprobado. |
| 2 Caché | `cache/lru.ts`, `cache/imageCache.ts`, `ui/CachedImage.tsx` | RAM (Map con orden de inserción = LRU O(1), tope 32 MB) → disco (archivos + índice SQLite con `last_access`, tope 120 MB). Descargas con `AbortController`, deduplicadas por URL con contador de referencias; el último consumidor que se va cancela la petición. |
| 2 60 FPS | `HomeScreen.tsx`, `PostCard` (memo) | `onViewableItemsChanged` → solo celdas visibles descargan (`active`); `windowSize`, `removeClippedSubviews`, `getItem` por id + selector de zustand por post (re-render mínimo). |
| 3 UI optimista | `state/feed.ts` (`toggleLike`, `addComment`) | Se actualiza el estado al instante y la red va por la cola; si falla permanentemente se revierte (`bindOutbox`). |
| 3 Offline | `data/outbox.ts` | SQLite persistente, orden por `id AUTOINCREMENT`, un solo *flush* a la vez (mutex), reintento al volver la red (NetInfo/AppState), idempotencia (upsert + UUID de cliente), coalescing LIKE↔UNLIKE, error transitorio vs permanente. |
| 4 DMs | `ChatScreen.tsx`, `InboxScreen.tsx`, `data/realtime.ts` | `postgres_changes` (mensajes y recibos), `broadcast` efímero para "Escribiendo…", `delivered_at`/`read_at`, trigger SQL que actualiza `last_message_at` y reordena la bandeja. |
| 5 Pilas | `app/(tabs)/(home|explore|activity|profile)/_layout.tsx` | Cada pestaña monta su propio `<Stack>`; `useNav` navega siempre dentro del grupo activo. |
| 5 Deep link | `app/+native-intent.tsx`, `app.json` (`scheme`) | `redirectSystemPath` reescribe `post/{uuid}` a la pestaña Home. |
| 5 Historias | `StoryViewerScreen.tsx`, `state/stories.ts` | Barras con `Animated.timing`; pausa = `stop()` guardando el valor, reanudar = nueva animación desde ese valor; "visto" en SQLite (`story_seen`); expiran por `expires_at > now()` en RLS. |

## Límites conocidos (decláralos si te preguntan)
- Crear publicaciones/historias/mensajes nuevos requiere conexión (la cola offline cubre likes, comentarios y follow/unfollow).
- El nivel RAM guarda data-URIs de imágenes ya comprimidas a 1080 px (JPEG 0.7); el `<Image>` nativo mantiene además su propio caché de decodificación.
- Contadores de la lista de seguidores pueden diferir del total si algún seguidor es privado (RLS).
- No se pudo ejecutar `npm install` ni compilar en el entorno donde se generó: corre `npm run typecheck` y revisa versiones con `npx expo install --fix`.
