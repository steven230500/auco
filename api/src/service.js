import { randomUUID } from 'node:crypto';
import { AppError } from './errors.js';

export function validateInput(input) {
  if (!input || typeof input !== 'object' || Array.isArray(input) ||
      Object.keys(input).some(key => !['name', 'documentNumber'].includes(key)) ||
      typeof input.name !== 'string' || typeof input.documentNumber !== 'string') {
    throw new AppError(400, 'INVALID_INPUT', 'Envía únicamente name y documentNumber como cadenas.');
  }
  const name = input.name.trim().replace(/\s+/gu, ' ');
  const documentNumber = input.documentNumber.trim();
  if (name.length < 2 || name.length > 120 || !/^[\p{L}\p{M}][\p{L}\p{M} .’'\-]*$/u.test(name) ||
      !/^\d{5,20}$/.test(documentNumber)) {
    throw new AppError(400, 'INVALID_INPUT', 'name: 2–120 caracteres; documentNumber: 5–20 dígitos.');
  }
  return { name, documentNumber };
}

export function auditEvent(record) {
  return { pk: `DOCUMENT#${record.documentNumber}`, sk: `${record.createdAt}#${record.id}`,
    validationId: record.id, eventType: 'VALIDATION_CREATED', createdAt: record.createdAt };
}

export function createService({ repository, audit, enrich, clock = () => new Date(), id = randomUUID }) {
  return {
    async create(input) {
      const normalized = validateInput(input);
      const enrichment = await enrich();
      const record = { id: id(), ...normalized, enrichment, createdAt: clock().toISOString(), auditStatus: 'pending' };
      await repository.insert(record);
      try {
        await audit.put(auditEvent(record));
        await repository.markAudited(record.id);
      } catch {
        throw new AppError(503, 'AUDIT_PENDING', 'Registro guardado; auditoría pendiente de conciliación.', { id: record.id });
      }
      return record.id;
    },
    async get(id) {
      if (!/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(id))
        throw new AppError(400, 'INVALID_ID', 'El id debe ser un UUID v4.');
      const record = await repository.find(id);
      if (!record) throw new AppError(404, 'NOT_FOUND', 'Validación no encontrada.');
      return record;
    },
  };
}
