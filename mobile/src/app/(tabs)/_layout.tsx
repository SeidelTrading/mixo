import { Ionicons } from '@expo/vector-icons';
import { Tabs } from 'expo-router';
import React from 'react';
import { Text, View, type ColorValue } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { navHeader } from '../../components/ui';
import { useShop } from '../../store/shopStore';
import { T } from '../../strings';
import { colors, fonts, radius, shadow } from '../../theme';

type Name = React.ComponentProps<typeof Ionicons>['name'];
/** Aktif sekmede dolu ikon lila bir kapsülün içinde (marka vurgusu), diğerlerinde çizgi ikon. */
const icon = (on: Name, off: Name) => {
  const Icon = ({ color, focused }: { color: ColorValue; focused: boolean }) => (
    <View style={{ width: 56, height: 30, borderRadius: radius.pill, alignItems: 'center', justifyContent: 'center', backgroundColor: focused ? colors.lilac : 'transparent' }}>
      <Ionicons name={focused ? on : off} size={22} color={color as string} />
    </View>
  );
  Icon.displayName = `TabIcon(${on})`;
  return Icon;
};
/** Etiket: aktif sekmede yarı kalın (Android'de kalınlık aile adıyla seçilir). */
const label = (text: string) => {
  const Label = ({ color, focused }: { color: ColorValue; focused: boolean }) => (
    // Dar ekranda uzun etiket ("Mein Bereich") kesilmez: tek satırda kalır, gerekirse küçülür
    <Text
      numberOfLines={1}
      adjustsFontSizeToFit
      minimumFontScale={0.8}
      maxFontSizeMultiplier={1.2}
      style={{ color, fontFamily: focused ? fonts.semibold : fonts.medium, fontSize: 11, lineHeight: 14, textAlign: 'center', alignSelf: 'stretch' }}
    >
      {text}
    </Text>
  );
  Label.displayName = `TabLabel(${text})`;
  return Label;
};

/** Sekme çubuğunun güvenli alan hariç yüksekliği. */
const BAR_H = 58;

export default function TabsLayout() {
  const { cartCount, favs } = useShop();
  const insets = useSafeAreaInsets();
  return (
    <Tabs
      screenOptions={{
        tabBarActiveTintColor: colors.primary,
        tabBarInactiveTintColor: colors.muted,
        tabBarStyle: {
          backgroundColor: colors.card,
          borderTopWidth: 0,
          height: BAR_H + insets.bottom,
          paddingTop: 6,
          paddingBottom: insets.bottom + 4,
          elevation: 0,
          // ince çizgi yerine yukarı doğru yumuşak lacivert gölge (alt çubuklarla aynı dil)
          ...shadow.bar,
        },
        tabBarItemStyle: { paddingHorizontal: 2 },
        tabBarBadgeStyle: { backgroundColor: colors.accent, color: colors.onPrimary, fontFamily: fonts.bold, fontSize: 10, lineHeight: 15 },
        // Ana sayfa dışındaki sekmeler ortak marka başlığını kullanır: mavi geçiş, beyaz Fraunces başlık
        header: ({ options, route }) => navHeader({ options, fallback: route.name }),
        sceneStyle: { backgroundColor: colors.bg },
      }}
    >
      <Tabs.Screen name="index" options={{ title: T.tabStart, tabBarLabel: label(T.tabStart), tabBarAccessibilityLabel: T.tabStart, headerShown: false, tabBarIcon: icon('home', 'home-outline') }} />
      <Tabs.Screen
        name="favoriten"
        options={{ title: T.tabMerkliste, tabBarLabel: label(T.tabMerkliste), tabBarAccessibilityLabel: T.tabMerkliste, tabBarIcon: icon('heart', 'heart-outline'), tabBarBadge: favs.length || undefined }}
      />
      <Tabs.Screen
        name="warenkorb"
        options={{ title: T.tabWarenkorb, tabBarLabel: label(T.tabWarenkorb), tabBarAccessibilityLabel: T.tabWarenkorb, tabBarIcon: icon('cart', 'cart-outline'), tabBarBadge: cartCount || undefined }}
      />
      <Tabs.Screen name="bereich" options={{ title: T.tabBereich, tabBarLabel: label(T.tabBereich), tabBarAccessibilityLabel: T.tabBereich, tabBarIcon: icon('person-circle', 'person-circle-outline') }} />
      <Tabs.Screen name="kategorien" options={{ title: T.tabKategorien, tabBarLabel: label(T.tabKategorien), tabBarAccessibilityLabel: T.tabKategorien, tabBarIcon: icon('grid', 'grid-outline') }} />
    </Tabs>
  );
}
