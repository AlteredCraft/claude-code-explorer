Recommended API Enhancements

  1. Cross-Project Activity Endpoint

  GET /api/v1/activity/
    ?startDate=2025-12-28
    &endDate=2025-12-31
    &type=regular|agent|all
  Currently I had to query each project individually. A global activity endpoint would return all sessions across projects for a date range in one call.

  ---
  2. Date Range Filtering on Sessions

  GET /api/v1/projects/{id}/sessions/
    ?startDate=2025-12-28
    &endDate=2025-12-31
  Instead of fetching 100 sessions and filtering client-side with jq, the API should support date bounds.

  ---
  3. Session Summary Field

  Add a summary or firstPrompt field to Session responses:
  {
    "id": "499c44ca-...",
    "startTime": "2025-12-30T15:49:17",
    "messageCount": 418,
    "firstUserPrompt": "is this anything of concern in our context...",
    "topics": ["API debugging", "FastAPI", "endpoint routing"]
  }
  This avoids needing to fetch all messages just to understand what a session was about.

  ---
  4. Flattened User Message Content

  GET /api/v1/projects/{id}/sessions/{id}/messages/
    ?type=user
    &flatten=true
  Return content as plain text string instead of nested {role, content} objects. The current structure requires complex jq gymnastics to extract actual user text.

  ---
  5. Activity Summary Endpoint

  GET /api/v1/activity/summary/
    ?startDate=2025-12-28
    &endDate=2025-12-31
  Returns aggregated stats:
  {
    "dateRange": {"start": "2025-12-28", "end": "2025-12-31"},
    "totalSessions": 12,
    "totalMessages": 2400,
    "projectBreakdown": [
      {"project": "claude-explorer", "sessions": 3, "messages": 1636},
      {"project": "ai-first-todo", "sessions": 2, "messages": 662}
    ],
    "dailyBreakdown": [
      {"date": "2025-12-31", "sessions": 1, "messages": 386},
      {"date": "2025-12-30", "sessions": 2, "messages": 426}
    ]
  }

  ---
  6. Fix the Activity Endpoint

  The existing /api/v1/projects/{id}/activity/ endpoint returns Internal Server Error. Once fixed, it would provide daily aggregation per project.