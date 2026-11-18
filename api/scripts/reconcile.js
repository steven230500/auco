import { connectStorage } from '../src/storage.js';
import { auditEvent } from '../src/service.js';
const storage = await connectStorage();
try {
  for await (const record of storage.repository.pending()) {
    await storage.audit.put(auditEvent(record));
    await storage.repository.markAudited(record.id);
  }
  console.info('Conciliación terminada.');
} finally { await storage.close(); }
