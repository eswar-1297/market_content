import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import analyzeRouter from './routes/analyze.js';
import analyzeAIRouter from './routes/analyzeAI.js';
import faqRouter from './routes/faq.js';
import threadFinderRouter from './routes/threadFinder.js';
import fanoutRouter from './routes/fanout.js';
import articlesRouter from './routes/articles.js';
import emailRouter from './routes/email.js';
import { initializeDatabase } from './db/database.js';
import { initSendGrid } from './services/emailService.js';

const app = express();
const PORT = process.env.PORT || 3001;

// Middleware
app.use(cors());
app.use(express.json({ limit: '5mb' }));

// Routes
app.use('/api/analyze', analyzeRouter);
app.use('/api/analyze-ai', analyzeAIRouter);
app.use('/api/faq', faqRouter);
app.use('/api/threads', threadFinderRouter);
app.use('/api', fanoutRouter);
app.use('/api', articlesRouter);
app.use('/api', emailRouter);

// Health check
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// Serve static files (client build) if present
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { existsSync } from 'fs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const clientDist = join(__dirname, '..', 'client', 'dist');
if (existsSync(clientDist)) {
  app.use(express.static(clientDist));
  app.get('*', (req, res, next) => {
    if (req.path.startsWith('/api/')) return next();
    res.sendFile(join(clientDist, 'index.html'));
  });
}

// 404 handler for unknown API routes
app.use('/api/*', (req, res) => {
  res.status(404).json({ error: `API route not found: ${req.method} ${req.originalUrl}` });
});

// Global error handler
app.use((err, req, res, _next) => {
  console.error('Unhandled error:', err);
  res.status(err.status || 500).json({
    error: 'Internal server error',
    ...(process.env.NODE_ENV !== 'production' && { details: err.message })
  });
});

initializeDatabase().catch(err => console.warn('Bookmark DB init:', err.message));
initSendGrid();

const server = app.listen(PORT, () => {
  console.log(`Content Guidelines API server running on http://localhost:${PORT}`);

  // Preload articles cache in background
  import('./services/articlesService.js').then(({ preloadArticles }) => {
    preloadArticles();
  });

  // Preload YouTube video cache in background so first analysis is fast
  const ytKey = process.env.YOUTUBE_API_KEY;
  if (ytKey && ytKey !== 'your-youtube-api-key-here') {
    import('./services/youtubeService.js').then(({ getCloudFuzeVideos }) => {
      getCloudFuzeVideos(ytKey)
        .then(videos => console.log(`YouTube: preloaded ${videos.length} videos into cache`))
        .catch(err => console.warn('YouTube preload skipped:', err.message));
    });
  }
});

// Graceful shutdown
function shutdown(signal) {
  console.log(`\n${signal} received. Shutting down gracefully...`);
  server.close(() => {
    console.log('Server closed.');
    process.exit(0);
  });
  setTimeout(() => {
    console.error('Forced shutdown after timeout.');
    process.exit(1);
  }, 5000);
}

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));
process.on('uncaughtException', (err) => {
  console.error('Uncaught exception:', err);
});
process.on('unhandledRejection', (reason) => {
  console.error('Unhandled rejection:', reason);
});
