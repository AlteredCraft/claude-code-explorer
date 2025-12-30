"""Plans routes for Claude Explorer API."""

from urllib.parse import unquote

from fastapi import APIRouter, HTTPException

from ..utils import get_claude_dir

router = APIRouter(prefix="/plans", tags=["plans"])


@router.get("/")
async def list_plans():
    """List all plans."""
    claude_dir = get_claude_dir()
    plans_dir = claude_dir / "plans"

    if not plans_dir.exists():
        return {"data": []}

    plans = [f.name for f in plans_dir.iterdir() if f.suffix == ".md"]
    return {"data": plans}


@router.get("/{plan_name}")
async def get_plan(plan_name: str):
    """Get a specific plan."""
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
