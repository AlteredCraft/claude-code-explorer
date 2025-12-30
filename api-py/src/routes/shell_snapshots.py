"""Shell snapshots routes for Claude Explorer API."""

from urllib.parse import unquote

from fastapi import APIRouter, HTTPException

from ..utils import get_claude_dir, parse_shell_snapshot_filename

router = APIRouter(prefix="/shell-snapshots", tags=["shell-snapshots"])


@router.get("/")
async def list_shell_snapshots():
    """List all shell snapshots."""
    claude_dir = get_claude_dir()
    snapshots_dir = claude_dir / "shell-snapshots"

    if not snapshots_dir.exists():
        return {"data": []}

    snapshots = []
    for f in snapshots_dir.iterdir():
        if f.suffix == ".sh":
            snapshot = parse_shell_snapshot_filename(f.name)
            snapshots.append(snapshot)

    # Sort by timestamp descending
    snapshots.sort(key=lambda x: x.get("timestamp", 0), reverse=True)
    return {"data": snapshots}


@router.get("/{filename}")
async def get_shell_snapshot(filename: str):
    """Get a specific shell snapshot."""
    filename = unquote(filename)
    claude_dir = get_claude_dir()
    snapshot_path = claude_dir / "shell-snapshots" / filename

    # Security check
    if not str(snapshot_path).startswith(str(claude_dir / "shell-snapshots")):
        raise HTTPException(status_code=400, detail="Invalid filename")

    if not snapshot_path.exists():
        raise HTTPException(status_code=404, detail="Shell snapshot not found")

    content = snapshot_path.read_text()
    return {"filename": filename, "content": content}
