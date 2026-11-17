import { Ionicons } from '@expo/vector-icons';
import React from 'react';
import { Text, View } from 'react-native';
import { CardGroup, IconDisc, PageScroll } from '../components/ui';
import { T } from '../strings';
import { colors, radius, shadow, space, typo } from '../theme';

type Block = { title: string; icon: 'checkmark' | 'information'; tint: 'lilac' | 'sun'; lines: string[] };

const BLOCKS: Block[] = [
  { title: T.aboutRealTitle, icon: 'checkmark', tint: 'lilac', lines: [T.aboutReal1, T.aboutReal2] },
  { title: T.aboutDemoTitle, icon: 'information', tint: 'sun', lines: [T.aboutDemo1, T.aboutDemo2, T.aboutDemo3] },
];

/** Madde satırı: pastel ikon diski + çok satırlı gövde metni (ListRow tek/iki satır içindir). */
function Point({ icon, tint, text }: { icon: Block['icon']; tint: Block['tint']; text: string }) {
  return (
    <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: space.m, paddingHorizontal: space.l, paddingVertical: space.m }}>
      <IconDisc icon={icon} tint={tint} size={32} />
      <Text style={[typo.body, { flex: 1, fontSize: 14, lineHeight: 21, paddingTop: 4 }]}>{text}</Text>
    </View>
  );
}

export default function UeberScreen() {
  return (
    <PageScroll>
      {/* Giriş paneli: lila zemin, Fraunces başlık, tek paragraf */}
      <View style={{ marginHorizontal: space.l, backgroundColor: colors.lilac, borderRadius: radius.l, padding: space.l, gap: space.s, ...shadow.soft }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.s }}>
          <Ionicons name="storefront-outline" size={22} color={colors.primary} />
          <Text style={typo.eyebrow}>Mixo Outlet</Text>
        </View>
        <Text style={typo.title} accessibilityRole="header">{T.aboutIntroTitle}</Text>
        <Text style={[typo.body, { color: colors.text }]}>{T.aboutIntro}</Text>
      </View>
      {BLOCKS.map(b => (
        <CardGroup key={b.title} title={b.title} divider={space.l + 32 + space.m}>
          {b.lines.map(l => <Point key={l} icon={b.icon} tint={b.tint} text={l} />)}
        </CardGroup>
      ))}
    </PageScroll>
  );
}
