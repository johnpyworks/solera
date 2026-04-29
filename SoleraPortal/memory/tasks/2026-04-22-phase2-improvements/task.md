# Task: Phase 2 — Approval Edit History, Zoom Join URL, Scheduled Tasks UI

## Status

Completed (commit `e7f8cfc`, 2026-04-22)

## Scope

Phase 2 improvements to the Solera portal. 19 files changed, +707/-121 lines.

## What Was Built

- **Approval edit history**: Added `edit_history` field to `ApprovalItem` model. Tracks diffs when advisor edits an email draft before approving.
- **Zoom join URL**: Added `zoom_join_url` field to `Meeting` model. New migration `0003_meeting_zoom_join_url.py`. Meeting views updated to capture and surface join URL.
- **Scheduled tasks UI**: New `ScheduledTasks.jsx` page in frontend showing upcoming scheduled tasks/jobs managed by the agent scheduler.
- **Agent/scribe improvements**: Tuning to `orchestrator.py`, `scribe.py`, `prompt_store.py`, `prompts.py`, `scheduler.py`. Improved chat views with better intent routing.
- **MCP connector fix**: Minor fix in `mcp-connector/server.js`.

## Key Files Changed

- `backend/apps/approvals/migrations/0005_approvalitem_edit_history.py`
- `backend/apps/approvals/models.py` + `views.py`
- `backend/apps/meetings/migrations/0003_meeting_zoom_join_url.py`
- `backend/apps/meetings/models.py` + `views.py` + `urls.py`
- `backend/apps/agents/orchestrator.py`, `scheduler.py`, `scribe.py`
- `backend/apps/chat/views.py`
- `vlad-portal/src/pages/ScheduledTasks.jsx`
- `vlad-portal/src/pages/ApprovalQueue.jsx`

## Risks / Follow-Ups

- Branch `feature/phase2-improvements` has further uncommitted changes (meeting_prep.py, clients views/urls, settings base, index.css, ClientProfile.jsx) that are not yet in any commit
