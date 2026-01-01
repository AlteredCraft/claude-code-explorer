"""Shell snapshots routes for Claude Explorer API.

Shell snapshots capture shell environment state with filename format
snapshot-{shell}-{timestamp}-{random}.sh
"""

from urllib.parse import unquote

from fastapi import APIRouter, HTTPException, Path

from ..models import ShellSnapshot
from ..utils import get_claude_dir, parse_shell_snapshot_filename

router = APIRouter(prefix="/shell-snapshots", tags=["shell-snapshots"])


@router.get("/")
async def list_shell_snapshots() -> dict[str, list[ShellSnapshot]]:
    """List all shell snapshots.

    Returns shell snapshots from ~/.claude/shell-snapshots/. Each snapshot
    filename contains the shell type, timestamp, and a random suffix
    (e.g., snapshot-zsh-1752622750085-qza877.sh).

    Results are sorted by timestamp descending (most recent first).

    Returns:
        data: List of ShellSnapshot objects with parsed filename metadata
    """
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
async def get_shell_snapshot(
    filename: str = Path(
        description="Snapshot filename (e.g., 'snapshot-zsh-1752622750085-qza877.sh')"
    )
) -> dict[str, str]:
    """Get a specific shell snapshot with content.

    Returns the full shell script content of a snapshot file.
    Snapshot files contain shell environment variables and configuration.

    Args:
        filename: Full snapshot filename including .sh extension

    Returns:
        Object with filename and full shell script content

    Raises:
        400: Invalid filename (path traversal attempt)
        404: Shell snapshot not found
    """
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
