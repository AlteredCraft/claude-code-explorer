# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Claude Explorer is a Next.js web app for exploring `~/.claude/` session context and metadata. It provides session-centric exploration: given a session ID, see the conversation, metadata, files touched, tools used, and correlated data across directories.

## Development Commands

```bash
npm run dev      # Start development server (http://localhost:3000)
npm run build    # Production build
npm run lint     # Run ESLint
```

## Architecture

### Data Flow

```
~/.claude/ filesystem → lib/claude-data.ts → Server Components → UI
```

1. **Server Components** read directly from `~/.claude/` - no API layer needed
2. **Session UUID** is the universal key that correlates data across directories:
   - `projects/{project-path}/{sessionId}.jsonl` - conversation transcript
   - `file-history/{sessionId}/` - file backups
   - `todos/{sessionId}-agent-*.json` - task lists
   - `debug/{sessionId}.txt` - debug logs

### Key Libraries

- `lib/claude-data.ts` - Reads session transcripts and project metadata from `~/.claude/`
- `lib/session-correlator.ts` - Finds related data (todos, file-history, debug) by session UUID
- `lib/path-utils.ts` - Encodes/decodes project paths (e.g., `/Users/sam/foo` → `-Users-sam-foo`)

### Route Structure

```
/                                    # Projects list (app/page.tsx)
/projects/[id]                       # Activity timeline for project
/projects/[id]/sessions/[sessionId]  # Session detail view
```

Route params use URL-encoded project paths (the `-Users-sam-...` format from `~/.claude/projects/`).

### JSONL Parsing

Session files are JSON Lines format. Each line can be:
- `type: "user"` - User message with `message.content`
- `type: "assistant"` - Assistant response with `message.content`, `toolUseMessages`
- `type: "file-history-snapshot"` - File backup references (skip for message counts)

### UI Components

Uses shadcn/ui (new-york style) with Radix primitives. Components are in `components/ui/`. Custom components:
- `activity-timeline.tsx` - Visual timeline of sessions
- `session-tabs.tsx` - Client component for session detail tabs

## Data Structure Reference

See `docs/claude-code-data-structures.md` for comprehensive documentation of the `~/.claude/` directory format.
