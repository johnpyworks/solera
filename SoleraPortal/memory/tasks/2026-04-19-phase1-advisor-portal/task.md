# Task: Phase 1 — AI-Powered Advisor Portal with MCP Integrations

## Status

Completed (commit `c49f554`, 2026-04-19)

## Scope

Full Phase 1 build of the Solera advisor portal. 86 files changed, ~15k lines added.

## What Was Built

**Backend (Django):**
- AI chat with intent classification (schedule / transcript / approvals / general)
- Approval queue: email drafts, calendar invites, reminders — all require human sign-off before sending
- Meeting scheduling via AI: extracts subject, date, duration, attendees; creates Zoom + Outlook events via MCP
- Transcript processing: Scribe agent generates LEAP-aligned notes and follow-up email drafts
- MCP bridge: Outlook events, Zoom meetings/recordings, Teams — proxied through local Node.js connector on port 4000
- Agent prompt management (editable via portal), usage/cost tracking, DB explorer
- New apps: agents, approvals, chat, meetings, clients, db_explorer, documents, questionnaires, settings_app, users

**MCP Connector (Node.js, port 4000):**
- Outlook OAuth + Graph API: calendar events, email send, meeting creation
- Zoom OAuth + API: recordings, meetings (Portal DB fallback for upcoming — avoids scope issues)
- Teams OAuth + Graph API: meetings, transcripts
- Credential management UI

**Frontend (React):**
- Calendar: unified All tab (Portal + Outlook + Zoom), color-coded sources
- Approval Queue: review/approve/reject with diff view for email drafts
- Chat panel: AI assistant with client context and approval queue awareness
- Client profiles, dashboard, agent prompts page, usage dashboard, DB explorer, settings

## Key Decisions

- Approval queue as human-in-the-loop gate: no email or calendar action executes without explicit approval
- Zoom upcoming meetings served from Portal DB (not direct Zoom API) to avoid OAuth scope issues
- Agent prompts stored in DB as `AgentPrompt` model, editable via portal

## Risks / Follow-Ups

- MCP connector requires separate startup (not managed by Django process)
- Zoom scope limitation is a known workaround — could be replaced with full Zoom OAuth in future
