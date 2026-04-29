# SoleraPortal - Project State

## Current Objective

Build an AI-powered financial advisor portal (Solera) for Yancey Works. The portal manages client workflows: scheduling, meeting transcripts, approvals, and AI-assisted follow-ups — integrated with Outlook, Zoom, and Teams via MCP.

## Active Plan

- Phase 1 (complete): Django backend + React frontend, AI chat, approval queue, MCP integrations
- Phase 2 (complete): Approval edit history, Zoom join URL, scheduled tasks UI, agent/scribe improvements
- Phase 3 (pending): TBD — next feature phase
- Memory system: Fully operational. Hooks firing. Folder renamed to SoleraPortal/.

## Recent Progress

- Phase 1 built: full advisor workflow with MCP integrations (Outlook, Zoom, Teams), approval queue, AI chat, calendar
- Phase 2 built: approval edit history, Zoom join URL on meetings, scheduled tasks UI, orchestrator/scribe tuning
- Memory system fixed: hooks moved to project-root .claude/settings.json; kit/ renamed to SoleraPortal/; setup script created with -Name and agent auto-detection

## Areas In Flux

- Phase 3 scope not yet defined
- Branch feature/phase2-improvements has uncommitted changes in meeting_prep.py, clients views/urls, settings base, and frontend files

## Active Risks

- Uncommitted changes on feature/phase2-improvements not yet merged to main
- MCP connector (Node.js) requires separate startup — not managed by Django process
- Zoom upcoming meetings uses Portal DB fallback to avoid OAuth scope issues

## Open Blockers

- None critical. Phase 3 scope needs definition.

## Critical Invariants

- Approval queue items always require human sign-off before any email or calendar action is taken
- MCP bridge proxies all Outlook/Zoom/Teams calls through the local Node.js connector on port 4000
- Agent prompts are stored in DB (AgentPrompt model) and editable via the portal — not hardcoded

## Next Recommended Actions

- Define Phase 3 scope
- Merge feature/phase2-improvements to main after review
- Run python SoleraPortal/scripts/lint_memory.py to verify memory structure
