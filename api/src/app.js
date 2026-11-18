import express from 'express';
import { AppError } from './errors.js';

export function createApp(service, { logger = console } = {}) {
  const app = express();
  app.disable('x-powered-by');
  app.use((req, res, next) => { res.set('Cache-Control', 'no-store'); next(); });
  app.use(express.json({ limit: '8kb', strict: true }));
  app.post('/validations', async (req, res, next) => {
    try {
      if (!req.is('application/json')) throw new AppError(415, 'UNSUPPORTED_MEDIA_TYPE', 'Usa application/json.');
      const id = await service.create(req.body);
      res.location(`/validations/${id}`).status(201).json({ id });
    } catch (error) { next(error); }
  });
  app.get('/validations/:id', async (req, res, next) => {
    try { res.json(await service.get(req.params.id)); } catch (error) { next(error); }
  });
  app.use((req, res) => res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Ruta no encontrada.' } }));
  app.use((error, req, res, next) => {
    if (error.type === 'entity.parse.failed') error = new AppError(400, 'INVALID_JSON', 'JSON inválido.');
    if (error.type === 'entity.too.large') error = new AppError(413, 'PAYLOAD_TOO_LARGE', 'El cuerpo supera 8kb.');
    const known = error instanceof AppError;
    if (!known) logger.error({ code: 'INTERNAL_ERROR', errorType: error.name });
    res.status(known ? error.status : 500).json({ error: {
      code: known ? error.code : 'INTERNAL_ERROR', message: known ? error.message : 'Error interno.',
      ...(known && error.details ? { details: error.details } : {}),
    } });
  });
  return app;
}
