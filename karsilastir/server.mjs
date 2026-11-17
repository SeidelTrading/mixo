import { createApp } from './app.mjs';
import { loadConfig } from './lib/config.mjs';

const config = loadConfig();
const app = createApp(config);
const port = await app.start();
console.log(`listening http://${config.host}:${port}`);
if (!config.adminPassword) console.log('ADMIN_PASSWORD not set: /admin disabled');
for (const sig of ['SIGINT', 'SIGTERM']) process.on(sig, () => app.stop().then(() => process.exit(0)));
