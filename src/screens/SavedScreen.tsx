import { useEffect, useState } from 'react';
import { FlatList } from 'react-native';
import { useSaved } from '@/state/saved';
import { useFeed } from '@/state/feed';
import { Text } from '@/ui/Text';
import { C } from '@/ui/theme';
import { GridItem } from './ExploreScreen';

export default function SavedScreen() {
  const [ids, setIds] = useState<string[]>([]);
  const count = useSaved((s) => s.ids.size);
  useEffect(() => {
    useSaved.getState().list().then((list) => {
      const known = useFeed.getState().posts;
      useFeed.getState().upsert(list.filter((p) => !known[p.id]));
      setIds(list.map((p) => p.id));
    });
  }, [count]);
  return (
    <FlatList style={{ backgroundColor: C.bg }} data={ids} numColumns={3} keyExtractor={(i) => i} renderItem={({ item }) => <GridItem id={item} />}
      ListEmptyComponent={<Text style={{ textAlign: 'center', color: C.sub, marginTop: 60 }}>Aún no has guardado publicaciones.</Text>} />
  );
}
