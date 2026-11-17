import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { BottomBar, Btn, CardGroup, EmptyState, Loading, PageScroll, ProductImage } from '../components/ui';
import { useFreeShip, useLiveCart } from '../hooks';
import { shippingFor } from '../shipping';
import { useShop } from '../store/shopStore';
import { cardTitle, fmt, T } from '../strings';
import { colors, eur, radius, shadow, space, typo } from '../theme';

/**
 * "Kasa" yerine açık demo ekranı. Hiçbir sipariş, ödeme ya da kişisel veri gönderilmez
 * (sunucudaki /api/orders ve /api/cart-save çağrılmaz). Sonraki adım: Shopify Checkout Kit.
 */
export default function Kasse() {
  const { ready } = useShop();
  // Canlı fiyatlar; sunucuda bulunmayan satırlar kasaya ve toplama girmez
  const { lines: all, subtotal, selectedCount, confirmed } = useLiveCart();
  const { freeShip, fromServer } = useFreeShip();
  const ship = shippingFor(subtotal, freeShip);
  const lines = all.filter(l => l.line.sel && !l.unavailable);
  if (!ready) return <Loading />;
  if (lines.length === 0) {
    return (
      <View style={{ flex: 1, backgroundColor: colors.bg }}>
        <EmptyState
          icon="cart-outline"
          title={T.nothingSelected}
          text={T.nothingSelectedText}
          action={{ label: T.backToCart, onPress: () => router.back() }}
        />
      </View>
    );
  }
  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      <PageScroll bottomInset={false}>
        {/* Demo bildirimi: şeftali kart, beyaz diskte ikon */}
        <View style={st.notice}>
          <View style={st.noticeDisc}><Ionicons name="information-circle-outline" size={26} color={colors.primary} /></View>
          <View style={{ flex: 1, gap: 2 }}>
            <Text style={[typo.h3, { color: colors.warnText }]}>{T.checkoutDemoTitle}</Text>
            <Text style={[typo.small, { color: colors.warnText }]}>{T.checkoutDemoText}</Text>
          </View>
        </View>

        <CardGroup title={fmt(T.yourSelection, { n: selectedCount })} divider={space.l + 56 + space.m + space.l}>
          {lines.map(l => (
            <View key={l.line.p.id} style={st.row}>
              <View style={st.tile}>
                <ProductImage img={l.line.p.img} size={160} blend style={{ width: '100%', height: '100%' }} />
              </View>
              <View style={{ flex: 1, gap: 2 }}>
                <Text numberOfLines={2} style={typo.small}>{cardTitle(l.line.p.vendor, l.line.p.title)}</Text>
                <Text style={typo.meta}>{l.line.qty} × {eur(l.unit)}</Text>
              </View>
              <Text style={[typo.price, { fontSize: 15 }]}>{eur(l.unit * l.line.qty)}</Text>
            </View>
          ))}
        </CardGroup>

        <View style={st.totals}>
          <Line a={T.subtotal} b={eur(subtotal)} />
          {/* "Annahme" yalnız eşik sunucudan gelmediyse (Über'deki söz) */}
          <Line a={fromServer ? T.shipping : T.shippingAssumed} b={ship ? eur(ship) : T.free} />
          <View style={st.sep} />
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline', gap: space.m }}>
            {/* Eşik sunucudan gelmediyse ya da bir fiyat henüz doğrulanmadıysa toplam "geschätzt" etiketlenir */}
            <Text style={[typo.h3, { flex: 1 }]}>{fromServer && confirmed ? T.total : T.totalEstimated}</Text>
            <Text style={[typo.title, { fontSize: 22 }]}>{eur(subtotal + ship)}</Text>
          </View>
        </View>
      </PageScroll>
      <BottomBar>
        <Btn label={T.payUnavailable} icon="lock-closed" disabled />
        <Text style={[typo.caption, { textAlign: 'center' }]}>{T.payWhy}</Text>
        <Btn label={T.backToCart} kind="ghost" onPress={() => router.back()} />
      </BottomBar>
    </View>
  );
}

function Line({ a, b }: { a: string; b: string }) {
  return (
    <View style={{ flexDirection: 'row', justifyContent: 'space-between', gap: space.m }}>
      <Text style={typo.small}>{a}</Text>
      <Text style={typo.smallStrong}>{b}</Text>
    </View>
  );
}

const st = StyleSheet.create({
  notice: { flexDirection: 'row', gap: space.m, marginHorizontal: space.l, padding: space.l, borderRadius: radius.l, backgroundColor: colors.warn },
  noticeDisc: { width: 40, height: 40, borderRadius: 20, backgroundColor: colors.card, alignItems: 'center', justifyContent: 'center' },
  row: { flexDirection: 'row', alignItems: 'center', gap: space.m, paddingVertical: space.m, paddingHorizontal: space.l },
  tile: { width: 56, height: 56, borderRadius: radius.m, backgroundColor: colors.mist, padding: 4, overflow: 'hidden' },
  totals: { marginHorizontal: space.l, padding: space.l, gap: space.s, borderRadius: radius.l, backgroundColor: colors.card, ...shadow.card },
  sep: { height: 1, backgroundColor: colors.lineSoft, marginVertical: space.xs },
});
