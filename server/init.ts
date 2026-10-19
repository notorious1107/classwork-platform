import { Store, initialize } from './database.js';
import { config } from './config.js';
const store = new Store(config.databasePath);
try {
  await initialize(store, config.init);
  console.log(`数据库已就绪：${config.databasePath}`);
} finally {
  store.close();
}
