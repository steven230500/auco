import { createApp } from './app.js';
import { createService } from './service.js';
import { createEnricher } from './enrichment.js';
import { connectStorage } from './storage.js';

let storage;
try {
  storage = await connectStorage();
  await storage.initialize();
  const app = createApp(createService({ ...storage, enrich: createEnricher() }));
  const server = app.listen(Number(process.env.PORT || 3000), '127.0.0.1', () => console.info('AUCO escuchando en loopback'));
  server.on('error', async () => { await storage.close(); process.exitCode = 1; });
  let stopping = false;
  const stop = () => {
    if (stopping) return; stopping = true;
    const timer = setTimeout(() => process.exit(1), 10000).unref();
    server.close(async () => { await storage.close(); clearTimeout(timer); });
  };
  process.on('SIGINT', stop); process.on('SIGTERM', stop);
} catch {
  console.error('No fue posible iniciar AUCO. Comprueba MongoDB y DynamoDB Local.');
  await storage?.close(); process.exitCode = 1;
}
