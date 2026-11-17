import { Ionicons } from '@expo/vector-icons';
import { Stack, useRouter } from 'expo-router';
import React, { useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { ListNameDialog } from '../components/ListPicker';
import { CardGroup, IconDisc, ListRow, Loading, PageScroll, ProductImage } from '../components/ui';
import { href } from '../routes';
import type { SavedList } from '../store/shopStore';
import { LIMITS, MERKLISTE_ID, useShop } from '../store/shopStore';
import { nProdukte, T } from '../strings';
import { colors, fonts, radius, space } from '../theme';

/** Her satırın baş öğesi aynı genişlikte yuvada durur: başlıklar aynı çizgiden başlar. */
const SLOT = 64;
const TILE = 56;

/**
 * Liste önizlemesi: 56 dp sis karoda en son eklenen ürünün görseli (bütün hâlinde, kırpılmadan); birden çok üründe sağ altta
 * "+n" rozeti, Merkliste'de sağ üstte küçük mercan kalp. Boş listede 40 dp ikon diski aynı yuvanın ortasında.
 */
function ListTile({ list }: { list: SavedList }) {
  const base = list.id === MERKLISTE_ID;
  const first = list.items[0];
  const more = list.items.length - 1;
  return (
    <View style={{ width: SLOT, alignItems: 'center', justifyContent: 'center' }} accessible={false}>
      {first ? (
        <View style={st.tile}>
          <ProductImage img={first.p.img} size={160} blend style={{ width: '100%', height: '100%' }} />
        </View>
      ) : (
        <IconDisc icon={base ? 'heart-outline' : 'list-outline'} tint={base ? 'peach' : 'lilac'} />
      )}
      {first && base ? (
        <View style={st.heart}><Ionicons name="heart" size={10} color={colors.onPrimary} /></View>
      ) : null}
      {more > 0 ? (
        <View style={st.more}><Text style={st.moreText}>+{more > 99 ? 99 : more}</Text></View>
      ) : null}
    </View>
  );
}

const st = StyleSheet.create({
  tile: { width: TILE, height: TILE, borderRadius: radius.m, backgroundColor: colors.mist, padding: 6 },
  heart: {
    position: 'absolute', right: 0, top: -2, width: 20, height: 20, borderRadius: 10, backgroundColor: colors.accent,
    borderWidth: 2, borderColor: colors.card, alignItems: 'center', justifyContent: 'center',
  },
  more: {
    position: 'absolute', right: 0, bottom: -2, minWidth: 24, height: 20, paddingHorizontal: 5, borderRadius: 10,
    backgroundColor: colors.navy, borderWidth: 2, borderColor: colors.card, alignItems: 'center', justifyContent: 'center',
  },
  moreText: { fontFamily: fonts.bold, fontSize: 10, lineHeight: 13, color: colors.onPrimary },
});

/** Meine Listen: tüm listeler tek kartta, her satırda ok (yeniden adlandırma ve silme liste ekranının başlığında). */
export default function Listen() {
  const { lists, ready, createList } = useShop();
  const router = useRouter();
  const [naming, setNaming] = useState(false);

  if (!ready) return <Loading />;
  const full = lists.length >= LIMITS.MAX_LISTS;

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      <Stack.Screen options={{ title: T.myLists }} />
      <PageScroll>
        <CardGroup divider={space.l + SLOT + space.m}>
          {lists.map(item => (
            <ListRow
              key={item.id}
              label={item.name}
              sub={item.items.length === 0 ? T.listEmptySub : nProdukte(item.items.length)}
              leading={<ListTile list={item} />}
              height={76}
              onPress={() => (item.id === MERKLISTE_ID ? router.navigate(href.merkliste()) : router.push(href.liste(item.id)))}
            />
          ))}
        </CardGroup>
        <CardGroup divider={space.l + SLOT + space.m}>
          <ListRow
            leading={<View style={{ width: SLOT, alignItems: 'center' }}><IconDisc icon="add" tint="sun" /></View>}
            label={T.newList}
            sub={full ? T.listLimitReached : T.listNewSub}
            chevron={false}
            disabled={full}
            onPress={() => setNaming(true)}
          />
        </CardGroup>
      </PageScroll>

      <ListNameDialog
        visible={naming}
        title={T.newList}
        confirmLabel={T.save}
        onSubmit={name => { createList(name); setNaming(false); }}
        onCancel={() => setNaming(false)}
      />
    </View>
  );
}
