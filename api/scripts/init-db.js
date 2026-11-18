import { connectStorage } from '../src/storage.js';
const storage = await connectStorage();
try { await storage.initialize(); console.info('Bases listas.'); } finally { await storage.close(); }
