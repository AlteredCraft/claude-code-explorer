"""Claude Explorer REST API - FastAPI Application."""

import os

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from .routes.activity import router as global_activity_router
from .routes.commands import router as commands_router
from .routes.config import router as config_router
from .routes.correlated import router as correlated_router
from .routes.files import router as files_router
from .routes.history import router as history_router
from .routes.plans import router as plans_router
from .routes.plugins import router as plugins_router
from .routes.projects import (
    activity_router,
    messages_router,
    router as projects_router,
    sessions_router,
    sub_agents_router,
)
from .routes.shell_snapshots import router as shell_snapshots_router
from .routes.skills import router as skills_router
from .routes.stats import router as stats_router

app = FastAPI(
    title="Claude Explorer API",
    description="REST API for exploring ~/.claude/ session data and metadata",
    version="1.0.0",
    docs_url="/api/v1/docs",
    redoc_url="/api/v1/redoc",
    openapi_url="/api/v1/openapi.json",
)

# CORS middleware
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# API v1 prefix
API_PREFIX = "/api/v1"

# Register all routers
app.include_router(projects_router, prefix=API_PREFIX)
app.include_router(sessions_router, prefix=API_PREFIX)
app.include_router(messages_router, prefix=API_PREFIX)
app.include_router(sub_agents_router, prefix=API_PREFIX)
app.include_router(activity_router, prefix=API_PREFIX)
app.include_router(global_activity_router, prefix=API_PREFIX)
app.include_router(correlated_router, prefix=API_PREFIX)
app.include_router(plans_router, prefix=API_PREFIX)
app.include_router(skills_router, prefix=API_PREFIX)
app.include_router(commands_router, prefix=API_PREFIX)
app.include_router(plugins_router, prefix=API_PREFIX)
app.include_router(shell_snapshots_router, prefix=API_PREFIX)
app.include_router(stats_router, prefix=API_PREFIX)
app.include_router(history_router, prefix=API_PREFIX)
app.include_router(files_router, prefix=API_PREFIX)
app.include_router(config_router, prefix=API_PREFIX)


@app.get("/health")
async def health_check():
    """Health check endpoint."""
    return {"status": "ok", "version": "1.0.0"}


def main():
    """Run the application."""
    import uvicorn

    port = int(os.environ.get("PORT", 3001))
    uvicorn.run(
        "src.main:app",
        host="0.0.0.0",
        port=port,
        reload=True,
    )


if __name__ == "__main__":
    main()
