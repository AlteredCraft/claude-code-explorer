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

1. **Fixed encoding function** (`api-py/src/utils.py`):
   - Changed from ad-hoc replacement to regex matching Claude Code's scheme

2. **Added config lookup** (`api-py/src/routes/projects.py`):
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

### Current State

The UI now shows:
- **Projects**: 30 projects with session data (clickable, full metadata)
- **Other Projects**: 20 config-only projects (initialized but never used)

---

## Remaining Work

### 1. Orphan Directory Handling

**Problem**: Some directories in `~/.claude/projects/` don't have a matching entry in `~/.claude.json`. These "orphan" directories use a fallback decode that may produce incorrect paths (e.g., `-Users-sam--vibe` → `~//vibe` instead of `~/.vibe`).

**Current behavior**: Fallback decode only handles leading `-` → `/`, but doesn't distinguish `.`, `_`, or `-` in the middle of paths.

**Options**:
1. **Accept imperfect decode**: Show orphans with a visual indicator that the path may be approximate
2. **Hide orphans**: Don't show directories without config entries
3. **Heuristic decode**: Try common patterns (e.g., `--` often means `/.` for hidden dirs)

**Recommendation**: Option 1 with a tooltip explaining the path may not be exact.

### 2. Phase 2: User-Configurable Project Folders (Deferred)

**Goal**: Let users group projects under custom folders (e.g., "Work", "Personal", "Open Source").

**Proposed UX**:
```
## Project Folders (user-defined groups)

### Work
  - acme-corp-api
  - acme-corp-frontend

### Personal
  - dotfiles
  - blog

### Open Source
  - my-library

## Others Found
(projects not in any folder - both config projects and orphan directories)
```

**Implementation notes**:
- Store folder config in `~/.claude/explorer-settings.json` or similar
- UI to create/edit folders and drag projects into them
- "Others Found" is the catch-all for ungrouped projects
- Orphan directories could be shown here with "path may be approximate" indicator

### 3. API Spec Validation

The API has evolved since the original spec. Need to:
1. Run `uv run python scripts/validate_openapi.py` to check drift
2. Update `docs/api-spec.yaml` if needed
3. Ensure `hasSessionData` field is documented

### 4. TypeScript API Client Sync

The TypeScript API client (`lib/api-client.ts`) was updated with `hasSessionData`, but should verify all types match the Python models exactly.

---

## Files Reference

| File | Purpose |
|------|---------|
| `api-py/src/utils.py` | Path encoding/decoding functions |
| `api-py/src/routes/projects.py` | Project listing with config lookup |
| `api-py/src/models.py` | Pydantic models (hasSessionData field) |
| `lib/api-client.ts` | TypeScript API client types |
| `app/page.tsx` | Homepage with two-section project list |
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
curl http://localhost:3001/api/v1/projects | jq '.data[] | {name, hasSessionData, displayPath}'
```
