# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Claude Explorer is a web application for exploring `~/.claude/` session context and metadata. It provides session-centric exploration: given a session ID, see the conversation, metadata, files touched, tools used, and correlated data across directories.

The application uses a **client-API architecture**:
- **API Server** (Express.js) - Standalone REST API that reads from `~/.claude/`
- **Web Client** (Next.js) - Frontend that consumes the API

## Development Commands

```bash
# Install all dependencies (root + api)
npm run install:all

# Run both API and client together
npm run dev:all

# Run API only (http://localhost:3001)
npm run dev:api

# Run client only (http://localhost:3000)
npm run dev:client

# Build both
npm run build:all

# Production
npm run start:all
```

### API-only Development

The API can run independently without the client:

```bash
cd api
npm install
npm run dev    # Development with hot reload
npm run build  # Build for production
npm run start  # Run production build
```

API runs on `http://localhost:3001/api/v1`

## Architecture

### Data Flow

```
~/.claude/ filesystem → API Server (Express) → REST API → Next.js Client → UI
```

### API Server (`/api`)

The standalone Express.js API server:

- `api/src/index.ts` - Server entry point
- `api/src/routes/` - Route handlers for each resource:
  - `projects.ts` - Projects, sessions, messages, activity
  - `correlated.ts` - Todos, file history, debug logs
  - `plans.ts` - Plan documents
  - `skills.ts` - Skills
  - `stats.ts` - Usage statistics
  - `history.ts` - Prompt history
  - `files.ts` - Browse ~/.claude/ filesystem
  - `config.ts` - Configuration (read-only)

API specification: `docs/api-spec.yaml` (OpenAPI 3.0)

### Client Libraries

- `lib/api-client.ts` - Typed fetch wrapper for consuming the REST API
- `lib/types.ts` - Shared TypeScript type definitions

### Route Structure

```
/                                    # Projects list (app/page.tsx)
/projects/[id]                       # Activity timeline for project
/projects/[id]/sessions/[sessionId]  # Session detail view
```

Route params use URL-encoded project paths (the `-Users-sam-...` format from `~/.claude/projects/`).

### Session UUID

**Session UUID** is the universal key that correlates data across directories:
- `projects/{project-path}/{sessionId}.jsonl` - conversation transcript
- `file-history/{sessionId}/` - file backups
- `todos/{sessionId}-agent-*.json` - task lists
- `debug/{sessionId}.txt` - debug logs

### JSONL Parsing

Session files are JSON Lines format. Each line can be:
- `type: "user"` - User message with `message.content`
- `type: "assistant"` - Assistant response with `message.content`, `toolUseMessages`
- `type: "file-history-snapshot"` - File backup references (skip for message counts)

### UI Components

Uses shadcn/ui (new-york style) with Radix primitives. Components are in `components/ui/`. Custom components:
- `activity-timeline.tsx` - Visual timeline of sessions
- `session-tabs.tsx` - Client component for session detail tabs

## Configuration

The client uses `NEXT_PUBLIC_API_URL` environment variable to configure the API endpoint:

```bash
# Default: http://localhost:3001/api/v1
NEXT_PUBLIC_API_URL=http://your-api-server:3001/api/v1
```

## Data Structure Reference

See `docs/claude-code-data-structures.md` for comprehensive documentation of the `~/.claude/` directory format.

See `docs/api-spec.yaml` for the complete REST API specification.
