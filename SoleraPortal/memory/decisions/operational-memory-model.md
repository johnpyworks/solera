# Operational Memory Model

## Status

Approved

## Decision

Use a Markdown-first operational memory model with a routed index, current project state, change/task memory, domain invariants, reusable artifacts, and session capture as a promotion source.

## Context

AI coding quality degrades when project state, rationale, and regression knowledge are lost between sessions. This model keeps continuity in compact Markdown rather than broad transcripts or RAG infrastructure.

## Consequences

- `kit/memory/index.md` acts as a router
- `kit/memory/state.md` becomes the operational anchor
- tasks record change causality and validation
- domains hold invariants and lessons learned
- sessions are captured but promoted explicitly
