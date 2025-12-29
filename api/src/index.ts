import express from 'express';
import cors from 'cors';
import { projectsRouter } from './routes/projects';
import { sessionsRouter } from './routes/sessions';
import { correlatedRouter } from './routes/correlated';
import { plansRouter } from './routes/plans';
import { skillsRouter } from './routes/skills';
import { statsRouter } from './routes/stats';
import { historyRouter } from './routes/history';
import { filesRouter } from './routes/files';
import { configRouter } from './routes/config';

const app = express();
const PORT = process.env.PORT || 3001;

// Middleware
app.use(cors());
app.use(express.json());

// API v1 routes
const v1Router = express.Router();

v1Router.use('/projects', projectsRouter);
v1Router.use('/sessions', sessionsRouter);
v1Router.use('/plans', plansRouter);
v1Router.use('/skills', skillsRouter);
v1Router.use('/stats', statsRouter);
v1Router.use('/history', historyRouter);
v1Router.use('/files', filesRouter);
v1Router.use('/config', configRouter);

// Mount correlated routes under /sessions
v1Router.use('/sessions', correlatedRouter);

app.use('/api/v1', v1Router);

// Health check
app.get('/health', (_req, res) => {
  res.json({ status: 'ok', version: '1.0.0' });
});

// Error handler
app.use((err: Error, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  console.error('Error:', err);
  res.status(500).json({
    code: 'INTERNAL_ERROR',
    message: err.message || 'Internal server error'
  });
});

app.listen(PORT, () => {
  console.log(`Claude Explorer API running on http://localhost:${PORT}`);
  console.log(`API endpoints available at http://localhost:${PORT}/api/v1`);
});
