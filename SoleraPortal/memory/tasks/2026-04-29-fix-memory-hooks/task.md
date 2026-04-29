# Task: Fix Memory System — Hooks Wired to Wrong Location

## Status

Completed (2026-04-29)

## Problem

The kit memory system was not being updated across sessions. Session files were never created, session-start context was never injected, and state.md/log.md had not been updated since April 20.

## Root Cause

The hooks (`session-start.py`, `session-end.py`, `pre-compact.py`) were configured in `kit/.claude/settings.json`. Claude Code only reads hook configuration from the **project root**: `.claude/settings.json` or `.claude/settings.local.json`. The `kit/` subdirectory settings file is never read.

## Changes Made

| File | Action |
|------|--------|
| `.claude/settings.json` | Created — hooks for SessionStart, Stop (was SessionEnd), PreCompact |
| `.claude/settings.local.json` | Updated — added permissions for all hook and kit scripts |
| `kit/memory/state.md` | Updated — reflects Phase 1/2 completion and real project state |
| `kit/memory/index.md` | Updated — removed "pending baseline" mode, added Phase 1/2/fix task links |
| `kit/memory/log.md` | Updated — added entries for Phase 1, Phase 2, and this fix |
| `kit/memory/tasks/2026-04-19-phase1-advisor-portal/` | Created — catch-up task record |
| `kit/memory/tasks/2026-04-22-phase2-improvements/` | Created — catch-up task record |

## Secondary Note

The original hook config used `SessionEnd` event. Claude Code's correct event name for "after Claude finishes responding" is `Stop`. Updated to `Stop` in the new root-level settings.

## Verification

- Start a new Claude Code session and confirm the session-start hook injects memory context
- Check `kit/memory/sessions/` for new session files after the session ends
- Run `python kit/scripts/lint_memory.py` to validate structure
