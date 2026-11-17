import { Ionicons } from '@expo/vector-icons';
import { Link, router, useFocusEffect, useNavigation } from 'expo-router';
import React, { useCallback, useLayoutEffect, useRef, useState } from 'react';
import { FlatList, type LayoutChangeEvent, Pressable, StyleSheet, Text, View } from 'react-native';
import {
  Btn, BottomBar, Checkbox, ConfirmDialog, EmptyState, IconButton, IconDisc, Loading, Price, ProductImage, ProgressBar,
  QtyStepper, useToast,
} from '../../components/ui';
import { ContextRail } from '../../components/ContextRail';
import { UNDO_MS } from '../../config';
import { useFreeShip, useLiveCart, type LiveCartLine } from '../../hooks';
import { href } from '../../routes';
import { freeShipProgress, missingForFree, shippingFor } from '../../shipping';
import { useShop } from '../../store/shopStore';
import { cardTitle, fmt, selectedOfLabel, T } from '../../strings';
import { colors, eur, radius, shadow, sizes, space, typo } from '../../theme';

/** Sepet sekmesi: satır seçimi, geri alınabilir silme, ücretsiz kargo ilerlemesi ve sabit özet çubuğu. */
export default function Warenkorb() {
  const {
    cart, cartCount, ready,
    setQty, removeLine, undoRemove, dismissUndo, toggleSelect, selectAll, clearCart,
  } = useShop();
  // Fiyatlar, toplam ve seçim sayıları canlı: sunucuda bulunmayan satırlar seçime ve toplama girmez
  const live = useLiveCart();
  const { subtotal, selectedCount, buyableCount, allSelected } = live;
  const fs = useFreeShip();
  const { freeShip } = fs;
  // "Gesamt" yalnız eşik sunucudan geldiyse ve toplamdaki her fiyat doğrulandıysa; değilse "geschätzt"
  const totalLabel = fs.fromServer && live.confirmed ? T.total : T.totalEstimated;
  const toast = useToast();
  const { setOffset } = toast;
  const empty = cart.length === 0;
  // Yapışık Kasse çubuğu: toast onun üstünde açılır. Yükseklik ref'te tutulur ve sekmeye her dönüşte yeniden verilir;
  // satır silmek kaymayı sıfırlamaz (geri al bildirimi çubuğun üstünde kalır). Sekmeden çıkınca ve sepet boşalınca 0.
  const barH = useRef(0);
  const focused = useRef(false);
  useFocusEffect(useCallback(() => {
    focused.current = true;
    setOffset(empty ? 0 : barH.current);
    return () => { focused.current = false; setOffset(0); };
  }, [setOffset, empty]));
  const onBarLayout = (e: LayoutChangeEvent) => {
    barH.current = e.nativeEvent.layout.height;
    if (focused.current) setOffset(barH.current);
  };
  const navigation = useNavigation();
  const [confirmClear, setConfirmClear] = useState(false);
  const [open, setOpen] = useState(false);

  useLayoutEffect(() => {
    navigation.setOptions({
      headerTitle: empty ? T.tabWarenkorb : fmt(T.cartTitle, { n: cartCount }),
      headerRight: empty ? undefined : () => (
        <View style={{ marginRight: 8 }}>
          <IconButton icon="trash-outline" label={T.cartClear} onPress={() => setConfirmClear(true)} />
        </View>
      ),
    });
  }, [navigation, cartCount, empty]);

  if (!ready) return <Loading />;

  const ship = shippingFor(subtotal, freeShip);
  const missing = missingForFree(subtotal, freeShip);
  const reached = missing <= 0;

  // Silme: olay işleyicisinde; toast eylemi ve kapanışı satırın tekil belirtecine bağlı
  const remove = (id: string) => {
    const at = removeLine(id);
    if (at < 0) return;
    toast.show({
      text: T.itemRemoved,
      action: { label: T.undo, onPress: () => undoRemove(at) },
      ms: UNDO_MS,
      onHide: () => dismissUndo(at),
    });
  };

  // Sepetin altında gerçek bağlam: son eklenenin alt kategorisi ya da son bakılanlar (her ekranda aynı örnek şerit değil)
  const bestRail = <ContextRail tone="white" />;

  const renderItem = ({ item: { line: l, unit, was, unavailable, changed } }: { item: LiveCartLine }) => {
    const hasWas = was != null && was > unit;
    return (
      <View style={[st.line, unavailable && { opacity: 0.75 }]}>
        <View style={st.lineTop}>
          {unavailable
            ? <View style={{ width: 32 }} />
            : <Checkbox checked={l.sel} onPress={() => toggleSelect(l.p.id)} label={T.selectLine} />}
          <Link href={href.produkt(l.p.id)} asChild>
            <Pressable accessibilityRole="link" accessibilityLabel={l.p.title} style={st.tile}>
              <ProductImage img={l.p.img} size={240} blend style={st.tileImg} />
            </Pressable>
          </Link>
          <View style={{ flex: 1, gap: 2 }}>
            {l.p.vendor ? <Text numberOfLines={1} style={s2.vendor}>{l.p.vendor}</Text> : null}
            <Link href={href.produkt(l.p.id)} asChild>
              <Pressable accessibilityRole="link">
                <Text numberOfLines={2} style={[typo.small, { color: colors.text }]}>{cardTitle(l.p.vendor, l.p.title)}</Text>
              </Pressable>
            </Link>
            {unavailable ? (
              <View style={st.pillOff}><Text style={[typo.caption, { color: colors.text }]}>{T.currentlyUnavailable}</Text></View>
            ) : l.qty > 1 ? (
              <Text style={typo.meta}>{fmt(T.perPiece, { x: eur(unit) })}</Text>
            ) : null}
            {changed && !unavailable ? <Text style={typo.caption}>{T.priceUpdated}</Text> : null}
          </View>
        </View>
        <View style={st.lineBottom}>
          <QtyStepper
            value={l.qty}
            onChange={n => setQty(l.p.id, n)}
            onRemove={() => remove(l.p.id)}
            labels={{ less: T.qtyLess, more: T.qtyMore, remove: T.remove, value: fmt(T.qtyN, { n: l.qty }) }}
          />
          {unavailable ? null : <Price price={unit * l.qty} was={hasWas ? was * l.qty : undefined} size="m" />}
        </View>
      </View>
    );
  };

  // Ücretsiz kargo kartı: sunucu eşiği → ilerleme (ulaşınca güneş); eşik bilinmiyorsa varsayım açıkça etiketli, çubuk yok
  const shipCard = fs.fromServer ? (
    <View style={[st.ship, reached && { backgroundColor: colors.sunSoft }]}>
      <View style={st.shipRow}>
        {reached ? (
          <View style={st.discWhite}><Ionicons name="checkmark" size={20} color={colors.text} /></View>
        ) : <IconDisc icon="cube-outline" tint="lilac" size={36} />}
        <Text style={[typo.smallStrong, { flex: 1, fontSize: 14, lineHeight: 20 }]}>
          {reached ? T.freeReached : fmt(T.missingFree, { x: eur(missing) })}
        </Text>
      </View>
      <ProgressBar value={freeShipProgress(subtotal, freeShip)} tone={reached ? 'good' : 'neutral'} />
    </View>
  ) : fs.loading ? (
    // Sunucu eşiği yüklenirken yer ayrılır: liste yüklenince aşağı kaymaz
    <View style={[st.ship, { minHeight: 82 }]} accessible={false} />
  ) : (
    <Pressable onPress={fs.retry} accessibilityRole="button" accessibilityLabel={fmt(T.freeShipFallback, { x: eur(freeShip) })} style={st.ship}>
      <View style={st.shipRow}>
        <IconDisc icon="information-circle-outline" tint="lilac" size={36} />
        <Text style={[typo.small, { flex: 1, color: colors.muted }]}>{fmt(T.freeShipFallback, { x: eur(freeShip) })}</Text>
      </View>
    </Pressable>
  );

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      <FlatList
        style={{ flex: 1 }}
        data={live.lines}
        keyExtractor={l => l.line.p.id}
        contentContainerStyle={{ paddingTop: space.l, gap: sizes.groupGap, paddingBottom: space.xl }}
        ListHeaderComponent={empty ? undefined : (
          <View style={{ gap: sizes.groupGap, marginBottom: 0 }}>
            {shipCard ? <View style={{ marginHorizontal: space.l }}>{shipCard}</View> : null}
            {buyableCount === 0 ? null : (
              <View style={[st.selectAll, { marginHorizontal: space.l }]}>
                <Checkbox checked={allSelected} onPress={() => selectAll(!allSelected)} label={T.selectAll} text={T.selectAll} />
              </View>
            )}
          </View>
        )}
        ListEmptyComponent={(
          <View>
            <EmptyState
              icon="cart-outline"
              tint="lilac"
              title={T.cartEmpty}
              text={T.cartEmptyText}
              action={{ label: T.continueShopping, onPress: () => router.navigate(href.start()) }}
            />
            {bestRail}
          </View>
        )}
        renderItem={({ item }) => <View style={{ marginHorizontal: space.l }}>{renderItem({ item })}</View>}
        ListFooterComponent={empty ? undefined : bestRail}
      />
      {empty ? null : (
        <BottomBar safe={false} onLayout={onBarLayout}>
          {open ? (
            <View style={st.sums}>
              <SumLine a={T.subtotal} b={eur(subtotal)} />
              <SumLine a={fs.fromServer ? T.shipping : T.shippingAssumed} b={ship ? eur(ship) : T.free} />
            </View>
          ) : null}
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.m }}>
            <Pressable
              onPress={() => setOpen(o => !o)}
              accessibilityRole="button"
              accessibilityLabel={`${totalLabel} ${eur(subtotal + ship)}`}
              accessibilityState={{ expanded: open }}
              style={{ flex: 1, minHeight: sizes.touch, justifyContent: 'center' }}
            >
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                <Text style={typo.meta}>{totalLabel}</Text>
                <Ionicons name={open ? 'chevron-down' : 'chevron-up'} size={14} color={colors.muted} />
              </View>
              <Text style={[typo.title, { fontSize: 22 }]} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.7}>{eur(subtotal + ship)}</Text>
              {selectedCount === 0 ? (
                <Text style={typo.caption}>{T.nothingSelected}</Text>
              ) : selectedCount < buyableCount ? (
                <Text style={typo.caption}>{selectedOfLabel(selectedCount, buyableCount)}</Text>
              ) : null}
            </Pressable>
            <View style={{ flex: 1 }}>
              <Btn label={T.toCheckout} disabled={selectedCount === 0} onPress={() => router.push(href.kasse())} />
            </View>
          </View>
        </BottomBar>
      )}
      <ConfirmDialog
        visible={confirmClear}
        title={T.cartClear}
        text={T.cartClearConfirm}
        confirmLabel={T.cartClear}
        destructive
        onConfirm={() => { setConfirmClear(false); clearCart(); }}
        onCancel={() => setConfirmClear(false)}
      />
    </View>
  );
}

const s2 = StyleSheet.create({
  vendor: { ...typo.eyebrow, letterSpacing: 0.6 },
});

const st = StyleSheet.create({
  line: { backgroundColor: colors.card, borderRadius: radius.l, padding: space.m, gap: space.m, ...shadow.card },
  lineTop: { flexDirection: 'row', alignItems: 'center', gap: space.s },
  lineBottom: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: space.m },
  tile: { width: 88, height: 88, borderRadius: radius.m, backgroundColor: colors.mist, padding: 6, overflow: 'hidden' },
  tileImg: { width: '100%', height: '100%' },
  pillOff: { alignSelf: 'flex-start', backgroundColor: colors.peach, borderRadius: radius.pill, paddingHorizontal: 10, paddingVertical: 3, marginTop: 2 },
  ship: { backgroundColor: colors.card, borderRadius: radius.l, padding: space.m, gap: space.m, ...shadow.card },
  discWhite: { width: 36, height: 36, borderRadius: 18, backgroundColor: colors.sun, alignItems: 'center', justifyContent: 'center' },
  shipRow: { flexDirection: 'row', alignItems: 'center', gap: space.m },
  selectAll: { backgroundColor: colors.card, borderRadius: radius.l, paddingHorizontal: space.l, minHeight: sizes.row, justifyContent: 'center', ...shadow.soft },
  sums: { gap: space.xs, backgroundColor: colors.mist, borderRadius: radius.m, padding: space.m },
});

function SumLine({ a, b }: { a: string; b: string }) {
  return (
    <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
      <Text style={typo.small}>{a}</Text>
      <Text style={typo.smallStrong}>{b}</Text>
    </View>
  );
}
