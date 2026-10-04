/**
 * Deep linking: instagramclone://post/{uuid}  ->  /(tabs)/(home)/post/{uuid}
 * Como `post/[id]` existe en las 4 pestañas, aquí decidimos en cuál abrirlo.
 * (En Expo Go la URL llega como exp://host/--/post/{uuid}; el regex también la cubre.)
 */
export function redirectSystemPath({ path }: { path: string; initial: boolean }) {
  const post = path.match(/post\/([0-9a-fA-F-]{36})/);
  if (post) return `/(tabs)/(home)/post/${post[1]}`;
  const prof = path.match(/profile\/([0-9a-fA-F-]{36})/);
  if (prof) return `/(tabs)/(home)/profile/${prof[1]}`;
  return path;
}
