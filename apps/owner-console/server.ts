import 'dotenv/config';
import express, { type Request, type Response, type NextFunction } from 'express';
import fs from 'node:fs';
import path from 'node:path';
import { createServer as createViteServer } from 'vite';
import { ownerRouter } from './src/server/routes/ownerRoutes';
import { isEncryptionKeyConfigured } from './src/server/security/crypto';
import { platformPing, platformStatus } from './src/server/services/platformDataService';

export async function createAppServer() {
  // Production must never encrypt credentials with an ephemeral key.
  if (process.env.NODE_ENV === 'production' && !isEncryptionKeyConfigured()) {
    throw new Error('OWNER CONSOLE: CREDENTIAL_ENCRYPTION_KEY is required in production.');
  }

  const app = express();
  app.set('trust proxy', true);
  app.disable('x-powered-by');
  app.use(express.json({ limit: '1mb' }));

  // Security headers compatible with iframe preview
  app.use((_req: Request, res: Response, next: NextFunction) => {
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
    next();
  });

  // Health probe (non-sensitive)
  app.get('/api/health', async (_req: Request, res: Response) => {
    try {
      await platformPing();
      await platformStatus();
      res.json({ status: 'ok', service: 'kayan-owner-console', platformDatabase: 'connected', platformDataQueries: 'ok', timestamp: new Date().toISOString() });
    } catch (err) {
      const failure = err as { code?: string; message?: string };
      console.error('owner_console_platform_db_health_failed', { code: failure.code || 'unknown', message: failure.message || 'database connection failed' });
      res.status(503).json({ status: 'degraded', service: 'kayan-owner-console', platformDatabase: 'unavailable', timestamp: new Date().toISOString() });
    }
  });

  // Owner Console API
  app.use('/api/owner', ownerRouter);

  // Unknown API routes return clean JSON 404
  app.use('/api', (_req: Request, res: Response) => {
    res.status(404).json({ error: 'not_found', message: 'المسار المطلوب غير موجود.' });
  });

  // Global error handler (never leaks raw secrets or stack traces)
  app.use((err: Error, _req: Request, res: Response, _next: NextFunction) => {
    console.error('owner_console_unhandled_error', err.message || 'Unhandled server error');
    res.status(500).json({ error: 'internal_error', message: 'حدث خطأ داخلي في الخادم وتم تسجيله في سجل الأخطاء.' });
  });

  const isProd = process.env.NODE_ENV === 'production';
  if (!isProd) {
    const vite = await createViteServer({
      base: '/admin/',
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distDir = path.resolve(process.cwd(), 'dist');
    const sendAdminApp = (_req: Request, res: Response) => {
      const indexFile = path.join(distDir, 'index.html');
      if (fs.existsSync(indexFile)) res.sendFile(indexFile);
      else res.status(404).send('Build output not found.');
    };
    app.get(['/admin', '/admin/'], sendAdminApp);
    app.use('/admin', express.static(distDir, { index: false }));
    app.get('/admin/*', sendAdminApp);
  }

  return app;
}

const PORT = Number(process.env.OWNER_CONSOLE_PORT || process.env.PORT) || 8090;
createAppServer().then((app) => {
  app.listen(PORT, '0.0.0.0', () => {
    console.log(`Kayan AI Owner Console listening on http://0.0.0.0:${PORT}`);
  });
});
