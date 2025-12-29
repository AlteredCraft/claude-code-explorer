import { Router } from 'express';

// Sessions are handled via /projects/:encodedPath/sessions
// This router is for any session-level endpoints not tied to a project

const router = Router();

export { router as sessionsRouter };
