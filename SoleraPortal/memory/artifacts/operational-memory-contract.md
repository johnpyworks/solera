# Operational Memory Contract

## Purpose

Summarize the reusable memory model for coding continuity.

## Memory Layers

- `AGENT.md` - operating contract
- `kit/memory/index.md` - routing layer
- `kit/memory/state.md` - current project truth
- `kit/memory/log.md` - chronological ledger
- `kit/memory/tasks/` - task and change memory
- `kit/memory/domains/` - invariants, validation checklists, lessons learned
- `kit/memory/decisions/` - durable decisions
- `kit/memory/artifacts/` - reusable outputs
- `kit/memory/sessions/` - raw session capture for later promotion

## Operational Rules

- Read `AGENT.md`, `kit/memory/index.md`, `kit/memory/state.md`, and `kit/memory/log.md` first
- Route to the smallest relevant context set based on request type
- Record what changed, affected areas, validation performed, and validation still missing
- Promote durable lessons from tasks or sessions into domains
- Keep durable memory in Markdown only

## Initialization Rule

- Existing repos must be initialized from observed repository state before substantial work begins
