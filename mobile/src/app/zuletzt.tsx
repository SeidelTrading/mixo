import { useRouter } from 'expo-router';
import React from 'react';
import { ListIntro } from '../components/ListIntro';
import { EmptyState, Loading, ProductGrid } from '../components/ui';
import { href } from '../routes';
import { useShop } from '../store/shopStore';
import { T } from '../strings';

/** Zuletzt angesehen: cihazdaki son bakılan ürünlerin tamamı (en çok 20); fiyat ve durum sunucudan doğrulanır. */
export default function Zuletzt() {
  const { recent, ready } = useShop();
  const router = useRouter();
  if (!ready) return <Loading />;
  return (
    <ProductGrid
      data={recent}
      live
      header={recent.length > 0 ? <ListIntro count={recent.length} /> : null}
      empty={
        <EmptyState
          title={T.recentEmpty}
          icon="time-outline"
          action={{ label: T.discoverProducts, icon: 'compass-outline', onPress: () => router.navigate(href.start()) }}
        />
      }
    />
  );
}
