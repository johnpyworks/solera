# Hooks Capture Policy

## Status

Approved

## Decision

Hooks may inject routed memory context and capture raw session notes, but they must not directly mutate durable state, domain, decision, or artifact memory.

## Context

Automatic capture improves continuity, but direct auto-promotion makes durable memory noisy and less trustworthy.

## Consequences

- `SessionStart` may inject context
- `SessionEnd` and `PreCompact` may write into `kit/memory/sessions/`
- promotion remains explicit and reviewable
