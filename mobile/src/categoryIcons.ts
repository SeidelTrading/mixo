import type { Ionicons } from '@expo/vector-icons';
import type { ComponentProps } from 'react';

export type IconName = ComponentProps<typeof Ionicons>['name'];

/** İkon rengini her zaman çağıran belirler (colors.primary); bu dosya renk vermez. */
export const CATEGORY_ICONS: Readonly<Record<string, IconName>> = {
  uhren: 'watch-outline',
  parfum: 'flask-outline',
  technik: 'hardware-chip-outline',
  drucker: 'print-outline',
  wohnen: 'home-outline',
  schmuck: 'diamond-outline',
  mode: 'shirt-outline',
  pflege: 'sparkles-outline',
  freizeit: 'game-controller-outline',
  genuss: 'cafe-outline',
};

export const categoryIcon = (k: string): IconName => CATEGORY_ICONS[k] ?? 'pricetag-outline';
