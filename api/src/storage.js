import { MongoClient } from 'mongodb';
import { DynamoDBClient, CreateTableCommand, waitUntilTableExists } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, PutCommand } from '@aws-sdk/lib-dynamodb';

export async function connectStorage(env = process.env) {
  const endpoint = env.DYNAMODB_ENDPOINT || 'http://127.0.0.1:8000';
  const url = new URL(endpoint);
  if (!['localhost', '127.0.0.1', 'dynamodb'].includes(url.hostname) || url.protocol !== 'http:')
    throw new Error('Only the local DynamoDB endpoint is supported');
  const mongo = new MongoClient(env.MONGODB_URI || 'mongodb://127.0.0.1:27017', { serverSelectionTimeoutMS: 5000 });
  const raw = new DynamoDBClient({ endpoint, region: 'us-east-1', credentials: {
    accessKeyId: 'AUCOLOCAL', secretAccessKey: 'AUCOLOCAL' }, maxAttempts: 2,
    requestHandler: { connectionTimeout: 2000, requestTimeout: 4000 } });
  const dynamo = DynamoDBDocumentClient.from(raw);
  const table = env.DYNAMODB_TABLE || 'auco-audit';
  try { await mongo.connect(); } catch (error) { raw.destroy(); await mongo.close(); throw error; }
  const collection = mongo.db(env.MONGODB_DATABASE || 'auco').collection('validations');
  return {
    repository: {
      async insert(record) { await collection.insertOne({ ...record }); },
      async find(id) { return collection.findOne({ id }, { projection: { _id: 0 } }); },
      async markAudited(id) { await collection.updateOne({ id }, { $set: { auditStatus: 'completed' } }); },
      pending() { return collection.find({ auditStatus: 'pending' }, { projection: { _id: 0 } }); },
    },
    audit: { async put(event) { await dynamo.send(new PutCommand({ TableName: table, Item: event })); } },
    async initialize() {
      await collection.createIndex({ id: 1 }, { unique: true });
      await collection.createIndex({ auditStatus: 1 });
      try {
        await raw.send(new CreateTableCommand({ TableName: table, BillingMode: 'PAY_PER_REQUEST',
          AttributeDefinitions: [{ AttributeName: 'pk', AttributeType: 'S' }, { AttributeName: 'sk', AttributeType: 'S' }],
          KeySchema: [{ AttributeName: 'pk', KeyType: 'HASH' }, { AttributeName: 'sk', KeyType: 'RANGE' }] }));
      } catch (error) { if (error.name !== 'ResourceInUseException') throw error; }
      await waitUntilTableExists({ client: raw, maxWaitTime: 30 }, { TableName: table });
    },
    async close() { raw.destroy(); await mongo.close(); },
  };
}
