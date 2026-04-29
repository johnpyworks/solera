# Memory Scripts

Manual-first support scripts for the operational memory workflow.

## Scripts

- `initialize_memory.py`
  - Review an existing repository, detect current code/data shape, and generate a baseline memory artifact and initial task files
- `capture_session.py`
  - Create a compact session note in `kit/memory/sessions/`
- `query_memory.py`
  - Route a question to likely relevant memory files using simple keyword matching
- `promote_session.py`
  - Create a promotion checklist from a captured session note
- `lint_memory.py`
  - Run lightweight structural checks for the operational memory layer

## Runtime State

- Runtime-only bookkeeping lives under `kit/scripts/runtime/`
- These files are gitignored and are not durable memory

## Hook Path

These scripts are manual-first. Future session-start/session-end/pre-compact hooks should call into the same capture and promotion model rather than bypassing it.

## Current Hook Support

- `kit/.claude/settings.json` wires `SessionStart`, `SessionEnd`, and `PreCompact`
- `kit/hooks/session-start.py` injects routed memory context into new sessions
- `kit/hooks/session-end.py` and `kit/hooks/pre-compact.py` capture compact session notes into `kit/memory/sessions/`
- Hooks do not write directly into durable state, domains, or decisions

## Existing Repo Bootstrap

If a repository already contains code or data but memory has not been initialized yet:

```powershell
python kit\scripts\initialize_memory.py --write
```

This creates a baseline repo review artifact plus an initial state/task bundle so future agents do not assume the project is greenfield.
