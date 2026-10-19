import { resolve } from 'node:path';
import { Store, initialize } from './database.js';
import { createApp } from './app.js';
import { config } from './config.js';

const store = new Store(config.databasePath);
await initialize(store, config.init);
const app = createApp({
  store,
  secureCookies: config.secureCookies,
  allowedOrigins: config.allowedOrigins,
  clientDir: resolve('dist/client'),
});
const server = app.listen(config.port, config.host, () => {
  console.log(`方格数学 API：http://localhost:${config.port}`);
  console.log(`数据库：${config.databasePath}`);
});
server.on('error', (error) => {
  console.error('启动失败：', error.message);
  store.close();
  process.exit(1);
});
let shuttingDown = false;
function shutdown() {
  if (shuttingDown) return;
  shuttingDown = true;
  server.close(() => {
    store.close();
    process.exit(0);
  });
  setTimeout(() => process.exit(1), 5000).unref();
}
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
