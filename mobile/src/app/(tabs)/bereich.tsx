import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import React, { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import type { IconName } from '../../categoryIcons';
import { CardGroup, ConfirmDialog, ListRow, PageScroll, ProductRail, useToast } from '../../components/ui';
import { href } from '../../routes';
import { useShop } from '../../store/shopStore';
import { nListen, T } from '../../strings';
import { colors, discTints, fonts, num, radius, shadow, space, typo, type DiscTint } from '../../theme';

type Dialog = 'data' | 'search' | null;

/** Lila paneldeki sayı karosu: pastel disk + ikon, Fraunces sayı, kısa etiket; dokununca ilgili ekran. */
function StatTile({ icon, tint, n, label, onPress }: { icon: IconName; tint: DiscTint; n: number; label: string; onPress: () => void }) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={`${label}: ${num(n)}`}
      style={({ pressed }) => [st.tile, pressed && { backgroundColor: colors.mist }]}
    >
      <View style={[st.disc, { backgroundColor: discTints[tint] }]}>
        <Ionicons name={icon} size={18} color={colors.primary} />
      </View>
      <Text style={st.num} numberOfLines={1}>{num(n)}</Text>
      <Text style={st.label} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.85}>{label}</Text>
    </Pressable>
  );
}

export default function BereichScreen() {
  const router = useRouter();
  const toast = useToast();
  const { lists, recent, searches, favs, cartCount, clearAllData, clearSearches } = useShop();
  // Aynı anda tek onay penceresi görünür
  const [dialog, setDialog] = useState<Dialog>(null);

  const confirmData = async () => {
    await clearAllData();
    setDialog(null);
    toast.show({ text: T.dataDeleted });
  };
  const confirmSearch = () => {
    clearSearches();
    setDialog(null);
  };

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      <PageScroll bottomInset={false}>
        {/* Üst panel: yalnız bu cihazdaki gerçek sayılar (hesap ya da sunucu verisi yok) */}
        <View style={st.panel}>
          <Text style={typo.title} accessibilityRole="header">{T.onDevice}</Text>
          <View style={{ flexDirection: 'row', gap: space.s }}>
            <StatTile icon="heart-outline" tint="peach" n={favs.length} label={T.tabMerkliste} onPress={() => router.navigate(href.merkliste())} />
            <StatTile icon="cart-outline" tint="lilac" n={cartCount} label={T.tabWarenkorb} onPress={() => router.navigate(href.warenkorb())} />
            <StatTile icon="albums-outline" tint="sun" n={lists.length} label={T.listsShort} onPress={() => router.push(href.listen())} />
          </View>
        </View>
        {/* Gezinme satırları tek kartta; yıkıcı satırlar ayrı kartta, en altta */}
        <CardGroup>
          <ListRow icon="albums-outline" label={T.myLists} sub={nListen(lists.length)} onPress={() => router.push(href.listen())} />
          <ListRow icon="information-circle-outline" tint="sun" label={T.aboutDemo} onPress={() => router.push(href.ueber())} />
        </CardGroup>
        {recent.length >= 2 ? (
          <ProductRail live title={T.recentlyViewed} data={recent} onAll={() => router.push(href.zuletzt())} />
        ) : null}
        <CardGroup style={{ marginTop: recent.length >= 2 ? 12 : 0 }}>
          <ListRow
            icon="time-outline"
            danger
            label={T.clearSearchHistory}
            disabled={searches.length === 0}
            chevron={false}
            onPress={() => setDialog('search')}
          />
          <ListRow icon="trash-outline" danger label={T.deleteDeviceData} chevron={false} onPress={() => setDialog('data')} />
        </CardGroup>
      </PageScroll>
      <ConfirmDialog
        visible={dialog === 'data'}
        title={T.deleteDeviceData}
        text={T.deleteDeviceDataConfirm}
        confirmLabel={T.delete}
        cancelLabel={T.cancel}
        destructive
        onConfirm={confirmData}
        onCancel={() => setDialog(null)}
      />
      <ConfirmDialog
        visible={dialog === 'search'}
        title={T.clearSearchHistory}
        text={T.clearSearchHistoryConfirm}
        confirmLabel={T.delete}
        cancelLabel={T.cancel}
        destructive
        onConfirm={confirmSearch}
        onCancel={() => setDialog(null)}
      />
    </View>
  );
}

const st = StyleSheet.create({
  panel: { marginHorizontal: space.l, backgroundColor: colors.lilac, borderRadius: radius.xl, padding: space.l, gap: space.m, ...shadow.soft },
  tile: { flex: 1, backgroundColor: colors.card, borderRadius: radius.m, paddingVertical: space.m, paddingHorizontal: space.s, alignItems: 'center', gap: 2, minHeight: 44, ...shadow.soft },
  disc: { width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center', marginBottom: space.xs },
  num: { ...typo.title, fontSize: 22, lineHeight: 28 },
  label: { fontFamily: fonts.medium, fontSize: 12, lineHeight: 16, color: colors.muted, alignSelf: 'stretch', textAlign: 'center' },
});
