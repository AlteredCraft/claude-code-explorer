"""Commands routes for Claude Explorer API."""

from urllib.parse import unquote

from fastapi import APIRouter, HTTPException

from ..models import Command
from ..utils import get_claude_dir, parse_yaml_frontmatter

router = APIRouter(prefix="/commands", tags=["commands"])


async def get_command_info(file_path, name: str) -> dict:
    """Get command information from a markdown file."""
    command = {"name": name}

    try:
        content = file_path.read_text()
        frontmatter = parse_yaml_frontmatter(content)
        if frontmatter.get("description"):
            command["description"] = frontmatter["description"]
        command["content"] = content
    except Exception:
        pass

    return command


@router.get("/")
async def list_commands() -> dict[str, list[Command]]:
    """List all commands."""
    claude_dir = get_claude_dir()
    commands_dir = claude_dir / "commands"

    if not commands_dir.exists():
        return {"data": []}

    commands = []
    for entry in commands_dir.iterdir():
        if entry.suffix == ".md":
            name = entry.stem  # Remove .md extension
            command = await get_command_info(entry, name)
            # For list, don't include full content
            command.pop("content", None)
            commands.append(command)

    return {"data": commands}


@router.get("/{name}", response_model=Command)
async def get_command(name: str):
    """Get command details."""
    name = unquote(name)
    claude_dir = get_claude_dir()

    # Try with and without .md extension
    command_path = claude_dir / "commands" / f"{name}.md"
    if not command_path.exists():
        command_path = claude_dir / "commands" / name

    # Security check
    if not str(command_path).startswith(str(claude_dir / "commands")):
        raise HTTPException(status_code=400, detail="Invalid command name")

    if not command_path.exists():
        raise HTTPException(status_code=404, detail="Command not found")

    return await get_command_info(command_path, name)
