import { createContext, useContext } from 'react';
import type { ProductLike } from '../store/shopStore';

/**
 * Liste seçici bağlamı ayrı modülde: ürün kartı (ui.tsx) bunu kullanır, katman (ListPicker.tsx) ise ui.tsx'in
 * ortak parçalarıyla çizilir. Bağlam burada durunca iki dosya arasında döngüsel içe aktarma oluşmaz.
 */
export type PickerApi = { open: (p: ProductLike) => void };
const NOOP: PickerApi = { open: () => {} };
export const PickerCtx = createContext<PickerApi>(NOOP);

/** Sağlayıcı yoksa no-op döner. */
export function useListPicker(): PickerApi {
  return useContext(PickerCtx);
}
