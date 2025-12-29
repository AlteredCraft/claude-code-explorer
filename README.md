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

- **Next.js 16** (App Router, Server Components)
- **React 19** (Server Actions)
- **shadcn/ui** (Radix-based components)
- **Tailwind CSS**

## Getting Started

```bash
# Install dependencies
npm install

# Run development server
npm run dev

# Open in browser
open http://localhost:3000
```

## Project Structure

```
claude-explorer/
├── app/
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
│   ├── types.ts                    # TypeScript interfaces
│   ├── claude-data.ts              # Read ~/.claude/ data
│   ├── session-correlator.ts       # Correlate session across sources
│   └── path-utils.ts               # Encode/decode project paths
└── docs/
    └── claude-code-data-structures.md  # Data format documentation
```

## How It Works

1. **Server Components** read directly from `~/.claude/` filesystem
2. **Path encoding** handles project paths (e.g., `/Users/sam/Projects/foo` → `-Users-sam-Projects-foo`)
3. **JSONL parsing** extracts messages from session transcripts
4. **Session correlator** finds related data across directories by UUID

## TODOs

- [ ] Plans correlation (investigate if plan names appear in session data)
- [ ] Skills linking (detect skill invocations in sessions)
- [ ] Search/filter functionality
- [ ] Session comparison view
