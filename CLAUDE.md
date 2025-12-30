# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Claude Explorer is a web application for exploring `~/.claude/` session context and metadata. It provides session-centric exploration: given a session ID, see the conversation, metadata, files touched, tools used, and correlated data across directories.

The application uses a **client-API architecture**:
- **API Server** (Python/FastAPI) - Standalone REST API that reads from `~/.claude/`
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
cd api-py
uv sync                                    # Install dependencies
uv run uvicorn src.main:app --reload       # Development with hot reload
uv run uvicorn src.main:app                # Production
```

API runs on `http://localhost:3001/api/v1`

Interactive API documentation available at:
- Swagger UI: `http://localhost:3001/api/v1/docs`
- ReDoc: `http://localhost:3001/api/v1/redoc`
- OpenAPI JSON: `http://localhost:3001/api/v1/openapi.json`

## Architecture

### Data Flow

```
~/.claude/ filesystem → API Server (FastAPI) → REST API → Next.js Client → UI
```

### API Server (`/api-py`)

The standalone Python FastAPI server:

- `api-py/src/main.py` - FastAPI application entry point
- `api-py/src/models.py` - Pydantic models (auto-generates OpenAPI schema)
- `api-py/src/utils.py` - Utility functions
- `api-py/src/routes/` - Route handlers for each resource:
  - `projects.py` - Projects, sessions, messages, activity
  - `correlated.py` - Todos, file history, debug logs, sub-agents, environment
  - `plans.py` - Plan documents
  - `skills.py` - Skills with YAML frontmatter parsing
  - `commands.py` - Slash commands
  - `plugins.py` - Installed plugins
  - `shell_snapshots.py` - Shell snapshots
  - `stats.py` - Usage statistics
  - `history.py` - Prompt history
  - `files.py` - Browse ~/.claude/ filesystem
  - `config.py` - Configuration (read-only, sensitive data redacted)

OpenAPI specification is auto-generated from Pydantic models at `/api/v1/openapi.json`

### Legacy TypeScript API (`/api`)

The original Express.js API is still available for reference:
- Run with `npm run dev:api:ts` or `npm run start:api:ts`

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
- `file-history/{sessionId}/` - file backups (versioned: `{hash}@v{version}`)
- `todos/{sessionId}-agent-*.json` - task lists
- `session-env/{sessionId}/` - environment variables
- `debug/{sessionId}.txt` - debug logs

### JSONL Parsing

Session files are JSON Lines format. Each line can be:
- `type: "user"` - User message with `message.content`
- `type: "assistant"` - Assistant response with `message.content`, `toolUseMessages`
- `type: "file-history-snapshot"` - File backup references linking to `file-history/` backups

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

The API schema is auto-generated and available at the `/api/v1/openapi.json` endpoint.

## API Validation

Validate the FastAPI-generated OpenAPI spec against `docs/api-spec.yaml` (source of truth):

```bash
cd api-py
uv run python scripts/validate_openapi.py
```

The script compares paths, methods, and schemas between the specs.
