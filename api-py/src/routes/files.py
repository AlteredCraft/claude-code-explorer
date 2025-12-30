"""Files routes for Claude Explorer API."""

from pathlib import Path

from fastapi import APIRouter, HTTPException, Query

from ..models import Error, FileContent
from ..utils import get_claude_dir

router = APIRouter(prefix="/files", tags=["files"])


@router.get(
    "/",
    response_model=FileContent,
    responses={
        400: {"model": Error, "description": "Invalid path"},
        404: {"model": Error, "description": "Path not found"},
    },
)
async def browse_files(path: str = Query("")):
    """Browse ~/.claude/ directory."""
    claude_dir = get_claude_dir()

    # Security: normalize and validate path is within ~/.claude/
    requested_path = (claude_dir / path).resolve()

    if not str(requested_path).startswith(str(claude_dir.resolve())):
        raise HTTPException(status_code=400, detail="Path must be within ~/.claude/")

    if not requested_path.exists():
        raise HTTPException(status_code=404, detail="Path not found")

    if requested_path.is_dir():
        # List directory contents
        entries = [
            {"name": e.name, "isDirectory": e.is_dir()}
            for e in requested_path.iterdir()
        ]
        return {
            "type": "directory",
            "path": str(requested_path),
            "entries": entries,
        }
    elif requested_path.is_file():
        # Return file content (limit to 100KB)
        if requested_path.stat().st_size > 100 * 1024:
            return {
                "type": "file",
                "path": str(requested_path),
                "error": "File too large (max 100KB)",
            }

        content = requested_path.read_text()
        return {
            "type": "file",
            "path": str(requested_path),
            "content": content,
        }
    else:
        raise HTTPException(status_code=400, detail="Path is not a file or directory")
