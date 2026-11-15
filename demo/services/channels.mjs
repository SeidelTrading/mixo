import { initInstagram } from '../instagram.mjs';
import { initMarketing } from '../marketing.mjs';
import { MODEL } from '../lib/config.mjs';
import { store } from '../lib/store.mjs';
import { limited } from '../lib/auth.mjs';
import { CATS, P, norm } from './catalog.mjs';
import { hooks, logChange, saveSettings, settings } from './settings.mjs';
import { orders } from './orders.mjs';
import { SHIP_FEE, freeShip } from './pricing.mjs';
import { effP } from './overrides.mjs';
import { actions } from './actions.mjs';
import { isPending, searchProducts } from './visibility.mjs';
import { shopOk } from './storefront.mjs';
import { events } from './analytics.mjs';
import { getClient } from '../lib/ai.mjs';

/* ───────── Instagram (taslak/simülasyon; token varsa gerçek) ───────── */
export const ig = initInstagram({
  P,
  settings,
  effP,
  isPending,
  shopOk,
  logChange,
  searchProducts,
  norm,
  getClient,
  model: MODEL,
  freeShip,
  shipFee: SHIP_FEE,
  limited,
  doc: store.doc,
  saveDoc: store.saveDoc,
});
hooks.igRefresh = ig.refresh;
export const mk = initMarketing({
  P,
  CATS,
  settings,
  saveSettings,
  effP,
  shopOk,
  getEvents: () => events,
  getOrders: () => orders,
  actions,
  logChange,
  searchProducts,
  norm,
  ig,
  doc: store.doc,
  saveDoc: store.saveDoc,
});
hooks.orderPlaced = mk.orderPlaced;
hooks.optIn = mk.optIn;
console.log('Instagram modu:', ig.live ? 'CANLI (token tanımlı)' : 'simülasyon (token yok)');
