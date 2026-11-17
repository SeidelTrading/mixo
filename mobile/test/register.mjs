// Test yükleyicisi: Node'un yerleşik TypeScript soyma özelliği uzantısız içe aktarmaları (./config) çözmez; .ts ekler.
import { register } from 'node:module';
register('./resolve-ts.mjs', import.meta.url);
