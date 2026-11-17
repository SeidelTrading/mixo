import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import React, { useCallback, useMemo, useState } from 'react';
import { View } from 'react-native';
import { ListNameDialog } from '../../components/ListPicker';
import { ConfirmDialog, EmptyState, IconButton, Loading, ProductGrid } from '../../components/ui';
import { useCurrentPrices } from '../../hooks';
import { href } from '../../routes';
import { useShop } from '../../store/shopStore';
import { fmt, listDeleteText, T } from '../../strings';
import { colors } from '../../theme';
import { ListIntro } from '../../components/ListIntro';
import { SavedPriceNote } from '../../components/SavedPriceNote';

type Dlg = 'rename' | 'delete' | null;

/** Eigene Liste: ızgara; kartta kalp yerine "×" (listeden çıkar). Yeniden adlandırma ve silme başlıkta. */
export default function ListeDetail() {
  const { id: raw } = useLocalSearchParams<{ id: string }>();
  const id = Array.isArray(raw) ? raw[0] : raw;
  const { lists, ready, toggleInList, renameList, deleteList } = useShop();
  const router = useRouter();
  const [dlg, setDlg] = useState<Dlg>(null);

  const list = lists.find(l => l.id === id);
  const items = list?.items;
  const byId = useMemo(() => new Map((items ?? []).map(i => [i.p.id, i])), [items]);
  const data = useMemo(() => (items ?? []).map(i => i.p), [items]);
  const ids = useMemo(() => data.map(p => p.id), [data]);
  const { prices } = useCurrentPrices(ids);

  const renderFooter = useCallback(
    (p: { id: string }) => <SavedPriceNote item={byId.get(p.id)} current={prices[p.id]} />,
    [byId, prices],
  );
  const removeAction = useMemo(
    () => ({ label: T.removeFromList, onPress: (p: { id: string }) => { const it = byId.get(p.id); if (it) toggleInList(id, it.p); } }),
    [byId, toggleInList, id],
  );

  if (!ready) return <Loading />;
  if (!list) {
    return (
      <View style={{ flex: 1, backgroundColor: colors.bg }}>
        <Stack.Screen options={{ title: T.myLists }} />
        <EmptyState
          title={T.listNotFound}
          icon="list-outline"
          action={{ label: T.myLists, icon: 'albums-outline', onPress: () => (router.canGoBack() ? router.back() : router.replace(href.listen())) }}
        />
      </View>
    );
  }
  return (
    <>
      <Stack.Screen
        options={{
          title: list.name,
          // Başlıktaki ikonlar beyaz (mavi başlıkta renkli ikon yok); yıkıcı anlam onay penceresinde mercan
          headerRight: () => (
            <View style={{ flexDirection: 'row', marginRight: 4 }}>
              <IconButton icon="create-outline" label={`${T.rename}: ${list.name}`} onPress={() => setDlg('rename')} />
              <IconButton icon="trash-outline" label={`${T.delete}: ${list.name}`} onPress={() => setDlg('delete')} />
            </View>
          ),
        }}
      />
      <ProductGrid
        data={data}
        live
        renderFooter={renderFooter}
        removeAction={removeAction}
        header={data.length > 0 ? <ListIntro count={data.length} /> : null}
        empty={
          <EmptyState
            title={T.listEmpty}
            text={T.listEmptyHint}
            icon="list-outline"
            action={{ label: T.discoverProducts, icon: 'compass-outline', onPress: () => router.navigate(href.start()) }}
          />
        }
      />
      <ListNameDialog
        visible={dlg === 'rename'}
        title={T.rename}
        initial={list.name}
        exceptId={list.id}
        confirmLabel={T.save}
        onSubmit={name => { renameList(list.id, name); setDlg(null); }}
        onCancel={() => setDlg(null)}
      />
      <ConfirmDialog
        visible={dlg === 'delete'}
        title={fmt(T.listDeleteConfirm, { name: list.name })}
        text={listDeleteText(list.items.length)}
        confirmLabel={T.delete}
        destructive
        onConfirm={() => {
          setDlg(null);
          deleteList(list.id);
          if (router.canGoBack()) router.back();
          else router.replace(href.listen());
        }}
        onCancel={() => setDlg(null)}
      />
    </>
  );
}
