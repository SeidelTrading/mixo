import { Ionicons } from '@expo/vector-icons';
import React from 'react';
import { Text, View } from 'react-native';
import type { CurrentPrice } from '../hooks';
import type { SavedItem } from '../store/shopStore';
import { fmt, T } from '../strings';
import { colors, eur, radius, space, typo } from '../theme';

/**
 * Merkliste / liste kartının altındaki fiyat notu. Yalnız bilgi katıyorsa çizilir: fiyat kayıttan beri değiştiyse
 * (fark + kayıt fiyatı) ya da ürün artık sunulmuyorsa. Fiyat aynıysa ya da güncel fiyat henüz gelmediyse hiçbir şey çizilmez.
 */
export function SavedPriceNote({ item, current }: { item: SavedItem | undefined; current: CurrentPrice | undefined }) {
  if (!item || current === undefined) return null;
  const saved = Math.round(item.savedPrice * 100);
  let note: { text: string; icon: 'trending-down' | 'trending-up' | 'alert-circle-outline'; bg: string; sub?: string } | null = null;
  if (current === null) {
    note = { text: T.currentlyUnavailable, icon: 'alert-circle-outline', bg: colors.peach };
  } else {
    // Sent bazında karşılaştır; kayan nokta farkı not üretmez
    const now = Math.round(current.price * 100);
    const sub = fmt(T.savedPriceWas, { x: eur(item.savedPrice) });
    if (now < saved) note = { text: fmt(T.nowCheaper, { x: eur((saved - now) / 100) }), icon: 'trending-down', bg: colors.sunSoft, sub };
    else if (now > saved) note = { text: fmt(T.nowDearer, { x: eur((now - saved) / 100) }), icon: 'trending-up', bg: colors.lilac, sub };
  }
  if (!note) return null;
  return (
    <View
      accessible
      accessibilityLabel={[note.text, note.sub].filter(Boolean).join(', ')}
      style={{ flexDirection: 'row', alignItems: 'flex-start', gap: space.s, backgroundColor: note.bg, borderRadius: radius.m, paddingHorizontal: space.s, paddingVertical: 6 }}
    >
      <Ionicons name={note.icon} size={16} color={colors.text} style={{ marginTop: 1 }} />
      <View style={{ flex: 1 }}>
        <Text style={[typo.smallStrong, { fontSize: 12, lineHeight: 16 }]}>{note.text}</Text>
        {note.sub ? <Text style={typo.caption}>{note.sub}</Text> : null}
      </View>
    </View>
  );
}
