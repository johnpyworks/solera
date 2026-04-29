# Memory System Schema

## Layout

- `AGENT.md`
- `kit/memory/index.md`
- `kit/memory/state.md`
- `kit/memory/log.md`
- `kit/memory/tasks/`
- `kit/memory/domains/`
- `kit/memory/decisions/`
- `kit/memory/artifacts/`
- `kit/memory/sessions/`
- `kit/memory/templates/`

## Rules

- All durable artifacts are Markdown files
- `AGENT.md` is the first required read for substantial work
- `kit/memory/index.md`, `kit/memory/state.md`, and `kit/memory/log.md` are mandatory next reads
- Sessions are promotion sources, not durable truth by default
- Existing repos must be initialized from observed code/data state

## Standard Task Outputs

- `task.md`
- `raw-intake.md`
- `sources.md`
- optional `change-impact.md`
- optional `plan.md`
- optional `review.md`
- optional `implementation.md`
- optional `qa.md`

## Promotion Rules

- invariants and lessons learned go to `kit/memory/domains/`
- durable decisions go to `kit/memory/decisions/`
- reusable reports and analyses go to `kit/memory/artifacts/`
