import { settings } from './settings.mjs';

// Kargo ve para yardımcıları: bağımlılığı yalnız ayarlar olduğu için sipariş, vitrin ve kanal modülleri güvenle içe aktarır.
export const freeShip = () => (Number.isFinite(settings.content.freeShip) ? settings.content.freeShip : 39);
export const SHIP_FEE = 5.5;
export const money = n => Math.round(n * 100) / 100;
