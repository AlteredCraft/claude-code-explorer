"""Plans routes for Claude Explorer API.

Plans are markdown documents created during plan mode with
auto-generated whimsical names.
"""

from urllib.parse import unquote

from fastapi import APIRouter, HTTPException, Path

from ..models import Plan
from ..utils import get_claude_dir

router = APIRouter(prefix="/plans", tags=["plans"])


@router.get("/")
async def list_plans() -> dict[str, list[str]]:
    """List all plan documents.

    Returns filenames of all plan markdown files
    Plan names are auto-generated whimsical names (e.g., cosmic-plotting-bunny.md).

    Returns:
        data: List of plan filenames
    """
    claude_dir = get_claude_dir()
    plans_dir = claude_dir / "plans"

    if not plans_dir.exists():
        return {"data": []}

    plans = [f.name for f in plans_dir.iterdir() if f.suffix == ".md"]
    return {"data": plans}


@router.get("/{plan_name}", response_model=Plan)
async def get_plan(
    plan_name: str = Path(
        description="Plan filename (e.g., 'cosmic-plotting-bunny.md'). URL-encoded if contains special characters"
    )
) -> Plan:
    """Get a specific plan document.

    Returns the full markdown content of a plan file. Plans are created
    during Claude Code plan mode and may reference session IDs.

    Args:
        plan_name: Plan filename including .md extension

    Returns:
        Plan object with name and full markdown content

    Raises:
        400: Invalid plan name (path traversal attempt)
        404: Plan not found
    """
    plan_name = unquote(plan_name)
    claude_dir = get_claude_dir()
    plan_path = claude_dir / "plans" / plan_name

    # Security check
    if not str(plan_path).startswith(str(claude_dir / "plans")):
        raise HTTPException(status_code=400, detail="Invalid plan name")

    if not plan_path.exists():
        raise HTTPException(status_code=404, detail="Plan not found")

    content = plan_path.read_text()
    return {"name": plan_name, "content": content}
