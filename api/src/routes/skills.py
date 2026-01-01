"""Skills routes for Claude Explorer API.

Skills are complex slash commands stored as directories containing
a SKILL.md file with YAML frontmatter defining name, description,
and allowed-tools. Invoked with /skill-name.
"""

from pathlib import Path
from urllib.parse import unquote

from fastapi import APIRouter, HTTPException
from fastapi import Path as PathParam

from ..models import Skill
from ..utils import get_claude_dir, parse_yaml_frontmatter

router = APIRouter(prefix="/skills", tags=["skills"])


async def get_skill_info(skill_path: Path, name: str) -> dict:
    """Get skill information from a skill directory."""
    skill = {"name": name}

    # Check if symlink
    if skill_path.is_symlink():
        skill["isSymlink"] = True
        try:
            skill["realPath"] = str(skill_path.resolve())
        except Exception:
            pass

    # Try to read SKILL.md for description
    actual_path = skill_path.resolve() if skill_path.is_symlink() else skill_path
    skill_md_path = actual_path / "SKILL.md"

    if skill_md_path.exists():
        try:
            content = skill_md_path.read_text()
            frontmatter = parse_yaml_frontmatter(content)
            if frontmatter.get("description"):
                skill["description"] = frontmatter["description"]
            if frontmatter.get("allowed_tools"):
                skill["allowedTools"] = frontmatter["allowed_tools"]
            skill["content"] = content
        except Exception:
            pass

    return skill


@router.get("/")
async def list_skills() -> dict[str, list[Skill]]:
    """List all skills.

    Returns skills from ~/.claude/skills/. Each skill is a directory
    containing SKILL.md with YAML frontmatter (name, description, allowed-tools).
    Skills may be symlinks to external directories.

    Skills are invoked in Claude Code with /skill-name.

    Returns:
        data: List of Skill objects (content excluded for brevity)
    """
    claude_dir = get_claude_dir()
    skills_dir = claude_dir / "skills"

    if not skills_dir.exists():
        return {"data": []}

    skills = []
    for entry in skills_dir.iterdir():
        if entry.is_dir() or entry.is_symlink():
            skill = await get_skill_info(entry, entry.name)
            # For list, don't include full content
            skill.pop("content", None)
            skills.append(skill)

    return {"data": skills}


@router.get("/{name}", response_model=Skill)
async def get_skill(
    name: str = PathParam(
        description="Skill directory name (e.g., 'dev-journal', 'frontend-design')"
    )
) -> Skill:
    """Get a specific skill with full content.

    Returns skill details including the full SKILL.md content and
    parsed YAML frontmatter (name, description, allowed-tools).

    If the skill is a symlink, includes isSymlink=true and realPath
    pointing to the resolved absolute path.

    Args:
        name: Skill directory name

    Returns:
        Skill object with name, description, allowedTools, content, and symlink info

    Raises:
        400: Invalid skill name (path traversal attempt)
        404: Skill not found
    """
    name = unquote(name)
    claude_dir = get_claude_dir()
    skill_path = claude_dir / "skills" / name

    # Security check
    if not str(skill_path).startswith(str(claude_dir / "skills")):
        raise HTTPException(status_code=400, detail="Invalid skill name")

    if not skill_path.exists():
        raise HTTPException(status_code=404, detail="Skill not found")

    return await get_skill_info(skill_path, name)
