import React from 'react';
import { Text, View } from 'react-native';
import { nProdukte } from '../strings';
import { colors, space, typo } from '../theme';

/** Merkliste / liste ızgarasının üstündeki kısa özet: ürün sayısı (Fraunces) ve isteğe bağlı tek satır ipucu. */
export function ListIntro({ count, hint }: { count: number; hint?: string }) {
  return (
    <View style={{ paddingHorizontal: space.l + space.xs, paddingTop: space.l, paddingBottom: space.xs, gap: 2 }}>
      <Text style={[typo.title, { color: colors.text }]} accessibilityRole="header">{nProdukte(count)}</Text>
      {hint ? <Text style={typo.rowSub}>{hint}</Text> : null}
    </View>
  );
}
