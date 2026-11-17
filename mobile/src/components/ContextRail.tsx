import { router } from 'expo-router';
import React, { useMemo } from 'react';
import { loadChunk, scopeKey, subIndexOf, type Product } from '../api/shop';
import { RAIL_MAX } from '../config';
import { useAsync, useIndex } from '../hooks';
import { href } from '../routes';
import { useShop } from '../store/shopStore';
import { fmt, T } from '../strings';
import { ProductRail, type RailTone } from './ui';

const NONE: Product[] = [];

/**
 * Sepet ve boş sepet için gerçek bağlama dayanan şerit (her ekranda aynı örnek şerit yerine):
 * en yeni sepet satırının, yoksa Merkliste'ye en son eklenenin alt kategorisinden "Mehr aus …" (sepettekiler hariç);
 * o yoksa cihazdaki "Zuletzt angesehen"; ikisi de yoksa hiçbir şey.
 */
export function ContextRail({ tone = 'white' }: { tone?: RailTone }) {
  const { cart, favs, recent } = useShop();
  const { data: idx } = useIndex();
  const seed = cart[cart.length - 1]?.p ?? favs[0];
  const si = seed ? (seed.si >= 0 ? seed.si : idx ? subIndexOf(idx, seed.cat, seed.sub) : -1) : -1;
  const scope = seed && si >= 0 ? scopeKey(seed.cat, si) : '';
  const { data: chunk } = useAsync<Product[]>(() => (scope ? loadChunk(scope, 0) : Promise.resolve(NONE)), scope || 'none');
  const more = useMemo(() => {
    const inCart = new Set(cart.map(l => l.p.id));
    const seen = new Set<string>();
    return (chunk ?? NONE)
      .filter(x => !x.na && !inCart.has(x.id) && (seen.has(x.id) ? false : (seen.add(x.id), true)))
      .slice(0, RAIL_MAX);
  }, [chunk, cart]);

  if (seed && si >= 0 && more.length >= 3) {
    return (
      <ProductRail
        tone={tone}
        title={fmt(T.moreFromSub, { sub: seed.sub })}
        data={more}
        onAll={() => router.push(href.kategorie(seed.cat, { sub: si }))}
      />
    );
  }
  if (recent.length >= 2) return <ProductRail tone={tone} live title={T.recentlyViewed} data={recent} />;
  return null;
}
