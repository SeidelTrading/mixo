import { useNavigation, useRouter } from 'expo-router';
import React, { useCallback, useLayoutEffect, useMemo } from 'react';
import { SavedPriceNote } from '../../components/SavedPriceNote';
import { ListIntro } from '../../components/ListIntro';
import { EmptyState, HeaderAction, Loading, ProductGrid } from '../../components/ui';
import { useCurrentPrices } from '../../hooks';
import { href } from '../../routes';
import { MERKLISTE_ID, useShop } from '../../store/shopStore';
import { T } from '../../strings';

export default function Favoriten() {
  const { favs, lists, ready } = useShop();
  const router = useRouter();
  const navigation = useNavigation();

  // Başlığın sağında "Meine Listen" bağlantısı
  useLayoutEffect(() => {
    navigation.setOptions({
      headerRight: () => <HeaderAction icon="albums-outline" label={T.myLists} role="link" onPress={() => router.push(href.listen())} />,
    });
  }, [navigation, router]);

  const items = lists.find(l => l.id === MERKLISTE_ID)?.items;
  const byId = useMemo(() => new Map((items ?? []).map(i => [i.p.id, i])), [items]);
  const ids = useMemo(() => favs.map(p => p.id), [favs]);
  const { prices } = useCurrentPrices(ids);

  const renderFooter = useCallback(
    (p: { id: string }) => <SavedPriceNote item={byId.get(p.id)} current={prices[p.id]} />,
    [byId, prices],
  );

  if (!ready) return <Loading />;
  return (
    <ProductGrid
      data={favs}
      live
      renderFooter={renderFooter}
      header={favs.length > 0 ? <ListIntro count={favs.length} hint={T.merklisteHint} /> : null}
      empty={
        <EmptyState
          title={T.merklisteEmpty}
          icon="heart-outline"
          tint="peach"
          action={{ label: T.discoverProducts, icon: 'compass-outline', onPress: () => router.navigate(href.start()) }}
        />
      }
      bottomInset={false}
    />
  );
}
