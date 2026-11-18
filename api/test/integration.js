import test from 'node:test';
import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { randomUUID } from 'node:crypto';
import request from 'supertest';
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, GetCommand } from '@aws-sdk/lib-dynamodb';
import { connectStorage } from '../src/storage.js';
import { createService, auditEvent } from '../src/service.js';
import { createApp } from '../src/app.js';
import { createEnricher } from '../src/enrichment.js';

test('real local MongoDB + DynamoDB create/get + idempotent audit replay', async () => {
  const storage = await connectStorage();
  const raw = new DynamoDBClient({ endpoint: process.env.DYNAMODB_ENDPOINT || 'http://127.0.0.1:8000', region: 'us-east-1',
    credentials: { accessKeyId: 'AUCOLOCAL', secretAccessKey: 'AUCOLOCAL' } });
  try {
    await storage.initialize();
    const id = randomUUID();
    const rate = { base: 'USD', quote: 'COP', rate: 3311.44, date: '2026-11-18' };
    const enrich = createEnricher({ fetchImpl: async () => ({ ok: true, json: async () => rate }) });
    const app = createApp(createService({ ...storage, id: () => id, enrich }));
    await request(app).post('/validations').send({ name: 'Persona Prueba', documentNumber: '0000000' }).expect(201);
    const response = await request(app).get(`/validations/${id}`).expect(200);
    assert.equal(response.body.auditStatus, 'completed'); assert.equal(response.body._id, undefined);
    assert.deepEqual(response.body.enrichment, { source: 'frankfurter', ...rate });
    const event = auditEvent(response.body);
    await storage.audit.put(event);
    const { Item } = await DynamoDBDocumentClient.from(raw).send(new GetCommand({
      TableName: process.env.DYNAMODB_TABLE || 'auco-audit', Key: { pk: event.pk, sk: event.sk }, ConsistentRead: true }));
    assert.equal(Item.validationId, id);
    const pendingId = randomUUID();
    const previousEnrichment = { source: 'agify', estimatedAge: 44, sampleCount: 10 };
    const pending = { id: pendingId, name: 'Persona Pendiente', documentNumber: '0000001',
      createdAt: new Date().toISOString(), enrichment: previousEnrichment, auditStatus: 'pending' };
    await storage.repository.insert(pending);
    await promisify(execFile)(process.execPath, ['--env-file=.env', 'scripts/reconcile.js'], { cwd: process.cwd() });
    const recoveredRecord = await request(app).get(`/validations/${pendingId}`).expect(200);
    assert.equal(recoveredRecord.body.auditStatus, 'completed');
    assert.deepEqual(recoveredRecord.body.enrichment, previousEnrichment);
    const pendingEvent = auditEvent(pending);
    const recovered = await DynamoDBDocumentClient.from(raw).send(new GetCommand({
      TableName: process.env.DYNAMODB_TABLE || 'auco-audit', Key: { pk: pendingEvent.pk, sk: pendingEvent.sk }, ConsistentRead: true }));
    assert.equal(recovered.Item.validationId, pendingId);
  } finally { raw.destroy(); await storage.close(); }
});
