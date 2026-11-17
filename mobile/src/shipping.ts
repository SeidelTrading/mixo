import { SHIP_FEE } from './config';

/** Ücretsiz kargo eşiği parametredir; tek kaynağı useFreeShip() (home.freeShip). */
export const shippingFor = (subtotal: number, freeShip: number) => (subtotal === 0 || subtotal >= freeShip ? 0 : SHIP_FEE);
export const missingForFree = (subtotal: number, freeShip: number) => Math.max(0, freeShip - subtotal);
export const freeShipProgress = (subtotal: number, freeShip: number) => (freeShip <= 0 ? 1 : Math.min(1, Math.max(0, subtotal / freeShip)));
