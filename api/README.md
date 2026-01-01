# Claude Explorer API (Python/FastAPI)

REST API server for Claude Explorer, reading from `~/.claude/` directory.

## Setup

```bash
uv sync  # Install dependencies
```

## Development

```bash
uv run uvicorn src.main:app --reload --port 3001
```

## Production

```bash
uv run uvicorn src.main:app --port 3001
```

## API Documentation

When running, available at:
- Swagger UI: http://localhost:3001/api/v1/docs
- ReDoc: http://localhost:3001/api/v1/redoc
- OpenAPI JSON: http://localhost:3001/api/v1/openapi.json

## Validation

Validate generated OpenAPI spec against source of truth (`docs/api-spec.yaml`):

```bash
uv run python scripts/validate_openapi.py
```
