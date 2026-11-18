import test from 'node:test';
import assert from 'node:assert/strict';
import request from 'supertest';
import { createApp } from '../src/app.js';
import { createService, auditEvent } from '../src/service.js';
import { createEnricher } from '../src/enrichment.js';

const id = 'c1fa302d-afbb-4f00-a1f3-5c9d9ff90b01';
function setup({ auditFails = false, mongoFails = false, enrich = async () => ({ source: 'agify', estimatedAge: 44, sampleCount: 10 }) } = {}) {
  const records = new Map(); const events = [];
  const repository = {
    async insert(record) { if (mongoFails) throw new Error('secret database credentials'); records.set(record.id, { ...record }); },
    async find(key) { return records.get(key) || null; },
    async markAudited(key) { records.get(key).auditStatus = 'completed'; },
  };
  const service = createService({ repository, enrich, id: () => id, clock: () => new Date('2026-11-18T12:00:00.000Z'),
    audit: { async put(event) { if (auditFails) throw new Error('offline'); events.push(event); } } });
  return { app: createApp(service, { logger: { error() {} } }), records, events };
}
const input = { name: '  Ana María  ', documentNumber: '0012345' };

test('POST enriches, persists, audits and GET returns the record', async () => {
  const { app, records, events } = setup();
  const post = await request(app).post('/validations').send(input).expect(201);
  assert.deepEqual(post.body, { id }); assert.equal(post.headers.location, `/validations/${id}`);
  const get = await request(app).get(`/validations/${id}`).expect(200);
  assert.equal(get.body.name, 'Ana María'); assert.equal(get.body.documentNumber, '0012345');
  assert.equal(get.body.auditStatus, 'completed'); assert.equal(get.body.enrichment.estimatedAge, 44);
  assert.deepEqual(events[0], auditEvent(records.get(id)));
  assert.equal(events[0].pk, 'DOCUMENT#0012345');
  assert.equal(events[0].sk, `2026-11-18T12:00:00.000Z#${id}`);
});

test('invalid inputs never persist or audit', async () => {
  const { app, records, events } = setup();
  for (const body of [{}, { ...input, documentNumber: 12345 }, { ...input, name: '$bad' },
    { ...input, documentNumber: '1' }, { ...input, unexpected: true }, []]) {
    await request(app).post('/validations').send(body).expect(400);
  }
  assert.equal(records.size, 0); assert.equal(events.length, 0);
});

test('invalid JSON, large bodies and content type have controlled errors', async () => {
  const { app } = setup();
  await request(app).post('/validations').set('Content-Type', 'application/json').send('{').expect(400);
  await request(app).post('/validations').send({ ...input, name: 'a'.repeat(9000) }).expect(413);
  await request(app).post('/validations').type('text').send('hello').expect(415);
});

test('invalid id is 400 and missing record is 404', async () => {
  const { app } = setup();
  await request(app).get('/validations/bad-id').expect(400);
  await request(app).get(`/validations/${id}`).expect(404);
});

test('upstream HTTP, network, malformed response and timeout do not write', async () => {
  const cases = [
    [async () => ({ ok: false }), 502],
    [async () => { throw new Error('network'); }, 502],
    [async () => ({ ok: true, json: async () => ({ cca2: 'CO' }) }), 502],
    [async () => { throw new DOMException('timeout', 'TimeoutError'); }, 504],
    [async () => ({ ok: true, json: async () => { throw new SyntaxError(); } }), 502],
  ];
  for (const [fetchImpl, status] of cases) {
    const { app, records, events } = setup({ enrich: createEnricher({ fetchImpl }) });
    await request(app).post('/validations').send(input).expect(status);
    assert.equal(records.size, 0); assert.equal(events.length, 0);
  }
});

test('enrichment validates response and sends only the first name', async () => {
  const enrich = createEnricher({ fetchImpl: async (url, options) => {
    assert.equal(new URL(url).hostname, 'api.agify.io'); assert.ok(options.signal);
    assert.equal(new URL(url).searchParams.get('name'), 'Ana');
    assert.ok(!url.includes('0012345')); assert.ok(!url.includes('María'));
    return { ok: true, json: async () => ({ name: 'Ana', age: 44, count: 10, ignored: true }) };
  } });
  assert.deepEqual(await enrich({ name: 'Ana María' }), { source: 'agify', estimatedAge: 44, sampleCount: 10 });
});

test('no age prediction is a valid enrichment response', async () => {
  const enrich = createEnricher({ fetchImpl: async () => ({ ok: true, json: async () => ({ name: 'Ana', age: null, count: 0 }) }) });
  assert.equal((await enrich({ name: 'Ana' })).estimatedAge, null);
});

test('audit failure leaves pending record and returns recoverable id without 201', async () => {
  const { app, records } = setup({ auditFails: true });
  const response = await request(app).post('/validations').send(input).expect(503);
  assert.equal(response.body.error.code, 'AUDIT_PENDING');
  assert.equal(response.body.error.details.id, id); assert.equal(records.get(id).auditStatus, 'pending');
  await request(app).get(`/validations/${id}`).expect(200);
});

test('Mongo failure does not audit or disclose internals', async () => {
  const { app, events } = setup({ mongoFails: true });
  const response = await request(app).post('/validations').send(input).expect(500);
  assert.equal(events.length, 0); assert.ok(!JSON.stringify(response.body).includes('secret'));
});

test('same document and timestamp still produce distinct audit keys', () => {
  const base = { documentNumber: '0012345', createdAt: '2026-11-18T12:00:00.000Z', id };
  assert.notEqual(auditEvent(base).sk, auditEvent({ ...base, id: 'another-id' }).sk);
});
