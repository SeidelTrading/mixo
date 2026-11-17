import { Fraunces_500Medium } from '@expo-google-fonts/fraunces/500Medium';
import { Inter_400Regular } from '@expo-google-fonts/inter/400Regular';
import { Inter_500Medium } from '@expo-google-fonts/inter/500Medium';
import { Inter_600SemiBold } from '@expo-google-fonts/inter/600SemiBold';
import { Inter_700Bold } from '@expo-google-fonts/inter/700Bold';
import { Inter_800ExtraBold } from '@expo-google-fonts/inter/800ExtraBold';
import { useFonts } from 'expo-font';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import React from 'react';
import { ListPickerProvider } from '../components/ListPicker';
import { navHeader, ToastProvider } from '../components/ui';
import { T } from '../strings';
import { ShopProvider } from '../store/shopStore';
import { colors } from '../theme';

// Derin bağlantıyla doğrudan açılan ekranın altında sekmeler olur: geri tuşu uygulamadan çıkmaz, Start'a döner
export const unstable_settings = { anchor: '(tabs)' };

// Durum çubuğu her ekranda açık renkli: tüm ekran başlıkları mavi marka geçişidir (ana sayfa dahil).
export default function RootLayout() {
  // Yazı tipleri bir kez burada yüklenir; anahtarlar theme.ts içindeki fonts adlarıyla aynıdır
  const [fontsReady, fontError] = useFonts({
    Inter_400Regular,
    Inter_500Medium,
    Inter_600SemiBold,
    Inter_700Bold,
    Inter_800ExtraBold,
    Fraunces_500Medium,
  });
  // Hazır olmadan uygulama çizilmez (yazı sıçraması olmaz); yükleme hatasında sistem yazı tipiyle açılır
  if (!fontsReady && !fontError) return null;
  return (
    <ShopProvider>
      <ToastProvider>
        <ListPickerProvider>
          <StatusBar style="light" />
          <Stack
            screenOptions={{
              // Tüm yığın ekranları ortak marka başlığını kullanır: mavi geçiş, beyaz Fraunces başlık, solda beyaz geri oku
              header: ({ options, back, navigation }) => navHeader({ options, fallback: '', onBack: back ? navigation.goBack : undefined }),
              contentStyle: { backgroundColor: colors.bg },
            }}
          >
            <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
            <Stack.Screen name="suche" options={{ headerShown: false, animation: 'fade' }} />
            <Stack.Screen name="kategorie/[key]" options={{ title: T.category }} />
            <Stack.Screen name="produkt/[id]" options={{ title: '' }} />
            <Stack.Screen name="kasse" options={{ title: T.checkoutTitle }} />
            <Stack.Screen name="listen" options={{ title: T.myLists }} />
            <Stack.Screen name="liste/[id]" options={{ title: T.myLists }} />
            <Stack.Screen name="ueber" options={{ title: T.aboutDemo }} />
            <Stack.Screen name="zuletzt" options={{ title: T.recentlyViewed }} />
          </Stack>
        </ListPickerProvider>
      </ToastProvider>
    </ShopProvider>
  );
}
