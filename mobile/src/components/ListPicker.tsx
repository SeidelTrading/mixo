import React, { useCallback, useMemo, useState } from 'react';
import { FlatList, KeyboardAvoidingView, Modal, Platform, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { LIMITS, MERKLISTE_ID, useShop, type ProductLike } from '../store/shopStore';
import { nProdukte, T } from '../strings';
import { colors, radius, shadow, space, typo } from '../theme';
import { PickerCtx, type PickerApi } from './listPickerContext';
import { BottomSheet, Btn, ChoiceRow, IconDisc, inputStyle } from './ui';

// Bağlam ayrı modülde (döngüsel içe aktarma olmasın); eski içe aktarmalar için buradan da verilir
export { useListPicker } from './listPickerContext';

/** Ad girişi: yeni liste ya da yeniden adlandırma. Boş ya da çok uzun ad kabul edilmez. Görünüm `ConfirmDialog` ile aynı. */
export function ListNameDialog({ visible, title, initial = '', exceptId, confirmLabel, onSubmit, onCancel }: {
  visible: boolean; title: string; initial?: string; /** Yeniden adlandırılan liste: kendi adı "var" sayılmaz. */ exceptId?: string; confirmLabel: string;
  onSubmit: (name: string) => void; onCancel: () => void;
}) {
  const [text, setText] = useState(initial);
  const [focused, setFocused] = useState(false);
  const [wasVisible, setWasVisible] = useState(visible);
  // Açılırken taslak başlangıç değerine döner (render sırasında durum eşitleme)
  if (visible !== wasVisible) {
    setWasVisible(visible);
    if (visible) setText(initial);
  }
  const name = text.trim();
  const { lists } = useShop();
  // Aynı ad (büyük/küçük harf farkı yok sayılır) iki listede olmaz: seçicide ayırt edilemezlerdi
  const taken = lists.some(l => l.id !== exceptId && l.name.trim().toLowerCase() === name.toLowerCase());
  const valid = name.length > 0 && name.length <= LIMITS.LIST_NAME_MAX && !taken;
  const submit = () => { if (valid) onSubmit(name); };

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onCancel} statusBarTranslucent navigationBarTranslucent>
      {/* Klavye açılınca iletişim kutusu yukarı kayar; düğmeler klavyenin altında kalmaz */}
      <KeyboardAvoidingView style={s.dialogWrap} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
        <Pressable style={StyleSheet.absoluteFill} onPress={onCancel} accessibilityRole="button" accessibilityLabel={T.close} />
        <View style={s.dialog} accessibilityViewIsModal>
          <IconDisc icon="list-outline" size={48} />
          <Text style={[typo.title, { fontSize: 21, lineHeight: 26 }]} accessibilityRole="header">{title}</Text>
          <TextInput
            value={text}
            onChangeText={setText}
            placeholder={T.listName}
            accessibilityLabel={T.listName}
            maxLength={LIMITS.LIST_NAME_MAX}
            autoFocus
            returnKeyType="done"
            onSubmitEditing={submit}
            onFocus={() => setFocused(true)}
            onBlur={() => setFocused(false)}
            style={[inputStyle, focused && { borderColor: colors.primary }]}
            placeholderTextColor={colors.muted}
          />
          {taken ? <Text style={[typo.small, { color: colors.accent }]} accessibilityLiveRegion="polite">{T.listNameTaken}</Text> : null}
          <View style={{ flexDirection: 'row', gap: space.s, marginTop: space.s }}>
            <View style={{ flex: 1 }}><Btn label={T.cancel} kind="ghost" onPress={onCancel} /></View>
            <View style={{ flex: 1 }}><Btn label={confirmLabel} onPress={submit} disabled={!valid} /></View>
          </View>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

/** Kökte bir kez bağlanır; tek katman örneği (ortak `BottomSheet`). */
export function ListPickerProvider({ children }: { children: React.ReactNode }) {
  const [product, setProduct] = useState<ProductLike | null>(null);
  const [naming, setNaming] = useState(false);
  const { lists, isInList, toggleInList, createList } = useShop();

  const open = useCallback((p: ProductLike) => { setProduct(p); setNaming(false); }, []);
  const close = useCallback(() => { setProduct(null); setNaming(false); }, []);
  const api = useMemo<PickerApi>(() => ({ open }), [open]);
  const full = lists.length >= LIMITS.MAX_LISTS;

  return (
    <PickerCtx.Provider value={api}>
      {children}
      <BottomSheet visible={product !== null} onClose={close} title={T.addToList}>
        <FlatList
          data={lists}
          keyExtractor={l => l.id}
          style={{ flexGrow: 0 }}
          renderItem={({ item }) => (
            <ChoiceRow
              kind="check"
              label={item.name}
              sub={item.items.length === 0 ? T.listEmptySub : nProdukte(item.items.length)}
              selected={product ? isInList(item.id, product.id) : false}
              leading={<IconDisc icon={item.id === MERKLISTE_ID ? 'heart-outline' : 'list-outline'} tint={item.id === MERKLISTE_ID ? 'peach' : 'lilac'} />}
              onPress={() => { if (product) toggleInList(item.id, product); }}
            />
          )}
        />
        <Pressable
          onPress={() => setNaming(true)}
          disabled={full}
          accessibilityRole="button"
          accessibilityLabel={T.newList}
          accessibilityState={{ disabled: full }}
          style={({ pressed }) => [s.newRow, pressed && { backgroundColor: colors.mist }, full && { opacity: 0.45 }]}
        >
          <IconDisc icon="add" tint="sun" />
          <View style={{ flex: 1 }}>
            <Text style={[typo.h3, { color: colors.primary }]}>{T.newList}</Text>
            {full ? <Text style={typo.rowSub}>{T.listLimitReached}</Text> : null}
          </View>
        </Pressable>
        <View style={{ marginTop: space.s }}>
          <Btn label={T.done} onPress={close} />
        </View>

        {/* İkinci Modal birincinin çocuğudur (iOS iç içe sunum) */}
        <ListNameDialog
          visible={naming}
          title={T.newList}
          confirmLabel={T.save}
          onCancel={() => setNaming(false)}
          onSubmit={name => {
            const id = createList(name);
            if (id && product) toggleInList(id, product);
            setNaming(false);
          }}
        />
      </BottomSheet>
    </PickerCtx.Provider>
  );
}

const s = StyleSheet.create({
  newRow: {
    flexDirection: 'row', alignItems: 'center', gap: space.m, minHeight: 56, paddingHorizontal: space.s,
    marginHorizontal: -space.s, borderRadius: radius.m,
  },
  dialogWrap: { flex: 1, backgroundColor: colors.overlay, alignItems: 'center', justifyContent: 'center', padding: space.xl },
  dialog: { width: '100%', maxWidth: 420, backgroundColor: colors.card, borderRadius: radius.sheet, padding: space.xl, gap: space.m, ...shadow.raised },
});
