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

test('real local MongoDB + DynamoDB create/get + idempotent audit replay', async () => {
  const storage = await connectStorage();
  const raw = new DynamoDBClient({ endpoint: process.env.DYNAMODB_ENDPOINT || 'http://127.0.0.1:8000', region: 'us-east-1',
    credentials: { accessKeyId: 'AUCOLOCAL', secretAccessKey: 'AUCOLOCAL' } });
  try {
    await storage.initialize();
    const id = randomUUID();
    const app = createApp(createService({ ...storage, id: () => id, enrich: async () => ({ countryCode: 'CO', source: 'integration-stub' }) }));
    await request(app).post('/validations').send({ name: 'Persona Prueba', documentNumber: '0000000' }).expect(201);
    const response = await request(app).get(`/validations/${id}`).expect(200);
    assert.equal(response.body.auditStatus, 'completed'); assert.equal(response.body._id, undefined);
    const event = auditEvent(response.body);
    await storage.audit.put(event);
    const { Item } = await DynamoDBDocumentClient.from(raw).send(new GetCommand({
      TableName: process.env.DYNAMODB_TABLE || 'auco-audit', Key: { pk: event.pk, sk: event.sk }, ConsistentRead: true }));
    assert.equal(Item.validationId, id);
    const pendingId = randomUUID();
    const pending = { id: pendingId, name: 'Persona Pendiente', documentNumber: '0000001',
      createdAt: new Date().toISOString(), enrichment: { source: 'integration-stub' }, auditStatus: 'pending' };
    await storage.repository.insert(pending);
    await promisify(execFile)(process.execPath, ['--env-file=.env', 'scripts/reconcile.js'], { cwd: process.cwd() });
    assert.equal((await storage.repository.find(pendingId)).auditStatus, 'completed');
    const pendingEvent = auditEvent(pending);
    const recovered = await DynamoDBDocumentClient.from(raw).send(new GetCommand({
      TableName: process.env.DYNAMODB_TABLE || 'auco-audit', Key: { pk: pendingEvent.pk, sk: pendingEvent.sk }, ConsistentRead: true }));
    assert.equal(recovered.Item.validationId, pendingId);
  } finally { raw.destroy(); await storage.close(); }
});
