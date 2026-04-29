# Setup

This repo is a reusable kit, not an app. The final layout should always be:

- `AGENT.md`
- `CLAUDE.md` (for Claude) and/or `AGENTS.md` (for Codex)
- `kit/`

Everything except the root instruction files stays inside `kit/`.

## Quick Start (one command)

Copy `kit/`, `AGENT.md`, `CLAUDE.md` (and/or `AGENTS.md`), and `.claude/settings.json` to the project root, then run:

```batch
kit\scripts\setup.bat -Name "YourProjectName"
```

That's it. No need to type `powershell -ExecutionPolicy Bypass` — the `.bat` wrapper handles that.

The script will:
1. Auto-detect which AI agent to configure (Claude, Codex, or Both) based on which instruction files are present
2. Rename `kit/` to your project name and update all config/instruction file references
3. Create `.claude/settings.json` at the project root with session hooks wired up (Claude)
4. Create `.claude/settings.local.json` with kit script permissions (Claude)
5. Run `initialize_memory.py --write` to baseline the existing repo
6. Tag `state.md`, `README.md`, and `.project-name` with your project name

After running, open Claude Code — memory context will be injected automatically at the start of every session.

---

## Options

| Flag | Effect |
|------|--------|
| `-Name "MyProject"` | Rename kit/ to MyProject/, update all references, tag memory files |
| `-Agent Claude/Codex/Both` | Override agent detection (default: auto-detect from CLAUDE.md / AGENTS.md) |
| `-NewRepo` | Skip the memory initializer; fill in state.md manually for brand-new projects |
| `-Force` | Overwrite `.claude/settings.json` even if it already exists |

Examples:

```batch
# Existing repo, Claude only:
kit\scripts\setup.bat -Name "SoleraPortal"

# New repo, both agents:
kit\scripts\setup.bat -Name "MyNewApp" -NewRepo -Agent Both

# Re-run after already set up (force overwrite hooks):
MyNewApp\scripts\setup.bat -Name "MyNewApp" -Force
```

---

## What The Script Does (detail)

### Agent auto-detection

- `CLAUDE.md` present → configures `.claude/settings.json` hooks for Claude Code
- `AGENTS.md` present → confirms Codex instructions file is in place (no hook config needed)
- Both present → configures Claude hooks and confirms Codex

### `.claude/settings.json` — hooks (Claude only)

Claude Code reads hooks **only from the project root** `.claude/settings.json`.

- `SessionStart` → `{name}/hooks/session-start.py` — injects index, state, and log into Claude's context
- `Stop` → `{name}/hooks/session-end.py` — captures a session note after each response
- `PreCompact` → `{name}/hooks/pre-compact.py` — captures a safety-net note before compaction

> `kit/.claude/settings.json` exists in the template but is NOT read by Claude Code. The project-root copy (written by setup) is what matters. The source template also includes `.claude/settings.json` at the root so it copies with the template automatically.

### Memory baseline

`initialize_memory.py --write` scans the repo, detects the stack, and writes:
- `{name}/memory/state.md`
- `{name}/memory/artifacts/baseline-repo-review.md`
- A task record under `{name}/memory/tasks/`

**After running, review `{name}/memory/state.md` and refine it** to match actual project goals before substantial work begins.

---

## Useful Commands

Replace `kit` with your project name if you used `-Name`.

```batch
# Re-initialize memory baseline
python kit\scripts\initialize_memory.py --write

# Manually capture a session note
python kit\scripts\capture_session.py "debugging auth redirect" --context "Investigated redirect regression"

# Query memory for a topic
python kit\scripts\query_memory.py "what should I read before changing auth behavior?"

# Promote a session note into durable memory
python kit\scripts\promote_session.py kit\memory\sessions\YYYY-MM-DD-HHMM-some-session.md

# Validate memory structure
python kit\scripts\lint_memory.py --strict
```
