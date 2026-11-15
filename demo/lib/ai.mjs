import Anthropic from '@anthropic-ai/sdk';

// Claude istemcisi: ilk kullanımda oluşturulur (anahtar yoksa hata ilk istekte görünür, açılışta değil).
let client = null;
export const getClient = () => (client ??= new Anthropic());
