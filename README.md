# Claude Context Explorer

A visual web app to explore `~/.claude/` session context and metadata. Session-centric exploration: given a session ID, see everything that happened - conversation, metadata, files touched, tools used, and correlated data across directories.

## Features

- **Projects List**: Browse all projects with Claude Code sessions
- **Activity Timeline**: Visual representation of session activity per project
- **Session Detail**: Full conversation view with metadata
- **Drill-down Panels**: Explore correlated data (todos, file history, debug logs, linked plans/skills)

## Navigation Flow

```
Projects List → Activity Timeline (for project) → Session Detail View
     │                    │                              │
     │                    │                              ├── Conversation
     │                    │                              ├── Tools Used
     │                    └── Click session bar          └── Correlated Data
     └── Click project                                        ├── Todos
                                                              ├── File History
                                                              ├── Debug Logs
                                                              ├── Linked Plan
                                                              └── Linked Skill
```

## Data Sources

This app reads from the `~/.claude/` directory structure. See [`docs/claude-code-data-structures.md`](docs/claude-code-data-structures.md) for comprehensive documentation.

| Source | Path | Session Correlation |
|--------|------|---------------------|
| Session transcripts | `~/.claude/projects/[encoded-path]/*.jsonl` | Primary source |
| Todos | `~/.claude/todos/[session-uuid]-agent-*.json` | UUID in filename |
| File history | `~/.claude/file-history/[session-uuid]/` | UUID as directory |
| Debug logs | `~/.claude/debug/[session-uuid].txt` | UUID in filename |

### Session UUID Correlation

```
Session UUID: 31f3f224-f440-41ac-9244-b27ff054116d
     │
     ├──► projects/{project-path}/31f3f224-...jsonl   (conversation)
     ├──► file-history/31f3f224-.../                  (file backups)
     ├──► todos/31f3f224-...-agent-*.json            (task lists)
     └──► debug/31f3f224-....txt                      (debug logs)
```

## Tech Stack

- **Python/FastAPI** - REST API server reading from `~/.claude/`
- **Next.js 16** (App Router, Server Components)
- **React 19**
- **shadcn/ui** (Radix-based components)
- **Tailwind CSS**

## Getting Started

```bash
# Install dependencies (requires uv for Python)
npm run install:all

# Run both API and client
npm run dev:all

# Or run separately:
npm run dev:api      # API at http://localhost:3001
npm run dev:client   # Client at http://localhost:3000
```

API documentation available at `http://localhost:3001/api/v1/docs`

## Project Structure

```
claude-explorer/
├── api-py/                         # Python FastAPI server
│   ├── src/
│   │   ├── main.py                 # FastAPI app entry point
│   │   ├── models.py               # Pydantic models (OpenAPI schema)
│   │   ├── utils.py                # Utility functions
│   │   └── routes/                 # Route handlers
│   │       ├── projects.py         # Projects, sessions, messages
│   │       ├── correlated.py       # Todos, file history, sub-agents
│   │       ├── stats.py            # Usage statistics
│   │       └── ...                 # Other endpoints
│   └── pyproject.toml              # Python dependencies (uv)
├── app/                            # Next.js frontend
│   ├── page.tsx                    # Projects list
│   ├── projects/[id]/
│   │   ├── page.tsx                # Activity timeline
│   │   └── sessions/[sessionId]/
│   │       └── page.tsx            # Session detail
│   └── layout.tsx
├── components/
│   ├── ui/                         # shadcn components
│   ├── activity-timeline.tsx       # Visual timeline
│   └── session-tabs.tsx            # Session detail tabs
├── lib/
│   ├── api-client.ts               # Typed API client
│   └── types.ts                    # TypeScript interfaces
└── docs/
    ├── api-spec.yaml               # OpenAPI specification (source of truth)
    └── claude-code-data-structures.md
```

## How It Works

1. **FastAPI server** reads from `~/.claude/` filesystem and exposes REST API
2. **Next.js client** consumes the API with typed fetch wrapper
3. **Path encoding** handles project paths (e.g., `/Users/sam/Projects/foo` → `-Users-sam-Projects-foo`)
4. **Session correlator** finds related data across directories by UUID
5. **Pydantic models** auto-generate OpenAPI schema for type safety

## TODOs

- [ ] Plans correlation (investigate if plan names appear in session data)
- [ ] Skills linking (detect skill invocations in sessions)
- [ ] Search/filter functionality
- [ ] Session comparison view
