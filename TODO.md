# TODO: Project Path Handling Improvements

## Background

### Claude Code's Path Encoding Scheme

Claude Code stores project data in `~/.claude/projects/{encoded_path}/`. The encoding scheme replaces **all non-alphanumeric characters** with `-`:

```python
# Claude Code's actual encoding:
re.sub(r"[^a-zA-Z0-9]", "-", path)
```

Examples:
| Real Path | Encoded Directory Name |
|-----------|----------------------|
| `/Users/sam/Projects/foo` | `-Users-sam-Projects-foo` |
| `/Users/sam/_PRIMARY_VAULT` | `-Users-sam--PRIMARY-VAULT` |
| `/Users/sam/.claude/plans` | `-Users-sam--claude-plans` |

**Key insight**: This encoding is **lossy** - you cannot reliably decode back to the original path because:
- `/` → `-`
- `.` → `-`
- `_` → `-`
- `-` → `-`

All become the same character, so `-Users-sam--PRIMARY-VAULT` could theoretically be:
- `/Users/sam/_PRIMARY_VAULT`
- `/Users/sam/-PRIMARY-VAULT`
- `/Users/sam/.PRIMARY.VAULT`

### Source of Truth

The `~/.claude.json` config file contains a `projects` object with **real paths** as keys:

```json
{
  "projects": {
    "/Users/sam/Projects/foo": {
      "lastSessionId": "abc123",
      "lastCost": 0.42,
      ...
    }
  }
}
```

This is the authoritative source for project paths. The encoded directory names are only useful for matching to config entries.

---

## Completed Work (Phase 1)

### What was done

1. **Fixed encoding function** (`api/src/utils.py`):
   - Changed from ad-hoc replacement to regex matching Claude Code's scheme

2. **Added config lookup** (`api/src/routes/projects.py`):
   - Build reverse lookup: `encoded_name → real_path` from config
   - Projects with session directories get their real path from config
   - Fallback decode for orphan directories (directories not in config)

3. **Added "Other Projects" section**:
   - Added `hasSessionData: bool` field to `Project` model
   - Projects from directories have `hasSessionData: true`
   - Config-only projects (no session directory) have `hasSessionData: false`
   - UI shows two sections: "Projects" and "Other Projects"

4. **Fixed caching issues**:
   - Added `cache: 'no-store'` to API client fetches
   - Added `export const dynamic = 'force-dynamic'` to page.tsx
   - Fixed null handling in formatCost/formatTokens

5. **Orphan directory path resolution** (`api/src/utils.py`, `api/src/routes/projects.py`):
   - Added `extract_cwd_from_project_dir()` to extract real paths from agent file `cwd` field
   - Orphan directories (no config entry) now use cwd heuristic before fallback decode
   - Added `isOrphan: bool` field to Project model
   - UI shows "(inferred)" indicator with tooltip for orphan projects

### Current State

The UI now shows:
- **Projects**: ~30 projects with session data (clickable, full metadata)
- **Other Projects**: ~20 config-only projects (initialized but never used)
- Orphan projects display accurate paths (e.g., `~/.vibe` instead of garbled `//Users//sam//-vibe`)

---

## Completed Work (Phase 2)

### Path Prefix Filtering

**Goal**: Let users filter projects by path prefix (e.g., only show projects under `~/Projects`).

**What was implemented**:

1. **API: `pathPrefix` query parameter** (`api/src/routes/projects.py`):
   - `GET /api/v1/projects/?pathPrefix=~/Projects` filters to matching paths
   - Supports multiple prefixes via repeated params: `?pathPrefix=~/Projects&pathPrefix=~/Work`
   - Expands `~` to home directory server-side

2. **Settings UI** (`components/settings-modal.tsx`):
   - Gear icon in header opens settings modal
   - Add/remove path prefix filters
   - Settings saved to `.config/app.json`

3. **Next.js API route** (`app/api/settings/route.ts`):
   - GET/PUT for reading/writing `.config/app.json`
   - Client-side persistence (no changes to api)

4. **Home page integration** (`app/page.tsx`):
   - Reads settings server-side
   - Passes `pathPrefix` to API call
   - Shows filter indicator when active: "(filtered: ~/Projects)"

**Files added**:
- `app/api/settings/route.ts` - Next.js API route for settings
- `components/settings-modal.tsx` - Settings modal component
- `.config/app.json` - User settings (gitignored)

---

## Remaining Work

### 1. Project Folders UI (Future Enhancement)

Group projects into named folders (e.g., "Work", "Personal"). This would build on path prefix filtering with a more visual organization.

### 2. API Spec Validation

The API has evolved since the original spec. Need to:
1. Run `uv run python scripts/validate_openapi.py` to check drift
2. Update `docs/api-spec.yaml` if needed
3. Ensure `hasSessionData` and `isOrphan` fields are documented

### 3. TypeScript API Client Sync

The TypeScript API client (`lib/api-client.ts`) was updated with `hasSessionData` and `isOrphan`, but should verify all types match the Python models exactly.

---

## Files Reference

| File | Purpose |
|------|---------|
| `api/src/utils.py` | Path encoding/decoding, cwd extraction, path normalization |
| `api/src/routes/projects.py` | Project listing with config lookup, orphan handling, path filtering |
| `api/src/models.py` | Pydantic models (hasSessionData, isOrphan fields) |
| `lib/api-client.ts` | TypeScript API client types and functions |
| `app/page.tsx` | Homepage with project list, filtering, and orphan indicators |
| `app/api/settings/route.ts` | Next.js API route for app settings |
| `components/settings-modal.tsx` | Settings modal for path prefix configuration |
| `.config/app.json` | User settings (gitignored) |
| `docs/api-spec.yaml` | OpenAPI spec (source of truth) |

---

## Testing Notes

To verify encoding:
```bash
# List actual Claude Code directories
ls ~/.claude/projects/

# Check a specific encoding
python3 -c "import re; print(re.sub(r'[^a-zA-Z0-9]', '-', '/Users/sam/Projects/foo'))"
# Output: -Users-sam-Projects-foo
```

To test the API:
```bash
curl http://localhost:3001/api/v1/projects/ | jq '.data[] | {name, hasSessionData, isOrphan, displayPath}'
```
