/**
 * TAZE API — Application Server Entry Point
 * Full-stack Express server integrating TAZE API endpoints, CORS handling,
 * and Vite middleware for the developer and tester dashboard.
 */

import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
import { apiRouter } from './src/api/routes/api-routes.ts';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function startServer() {
  const app = express();
  const PORT = parseInt(process.env.PORT || '3000', 10);
  const isProduction = process.env.NODE_ENV === 'production';

  // Enable CORS for Android client, Web clients, and cross-origin tools
  app.use(cors({
    origin: '*',
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'x-taze-admin-key', 'X-Requested-With'],
  }));

  app.use(express.json());

  // Mount TAZE API routes at root and /api alias
  app.use('/', apiRouter);
  app.use('/api', apiRouter);

  // Mount Vite or static assets for Frontend Developer / Tester Dashboard
  if (!isProduction) {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.resolve(__dirname, 'dist');
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      res.sendFile(path.resolve(distPath, 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`🚀 TAZE API server running at http://0.0.0.0:${PORT}`);
    console.log(`📋 Health check: http://localhost:${PORT}/health`);
    console.log(`🔍 Anime search: http://localhost:${PORT}/search?query=frieren`);
    console.log(`🎬 Playback test: http://localhost:${PORT}/watch/authorized-demo/sintel-ep-1`);
  });
}

startServer().catch((err) => {
  console.error('Fatal server startup error:', err);
  process.exit(1);
});
