# Coding Memory System

## Summary

This domain describes how the operational memory kit should be used to preserve continuity for coding work.

## Core Invariants

- `AGENT.md` stays at repository root.
- Durable memory lives under `kit/memory/`.
- All durable memory artifacts are `.md` files.
- `kit/memory/state.md` reflects current operational truth after initialization.
- Session capture is useful raw material, but not durable truth until promoted.
- Hooks may capture and inject context, but they must not auto-promote into durable memory.
- Existing repos must receive a baseline repo review before being treated as initialized.

## Retrieval Contract

- Read `AGENT.md` first.
- Then read `kit/memory/index.md`, `kit/memory/state.md`, and `kit/memory/log.md`.
- Then pull only linked relevant files.

## What To Capture

- Request summary
- Prior related context
- What changed and why
- Affected areas
- Decisions made
- Risks and likely breakage
- Validation performed
- Validation still missing
- Missing work and follow-ups
- Lessons learned worth promoting

## Validation Checklist

- Confirm existing repos have a baseline artifact and state before substantial work begins
- Confirm changed tasks capture affected areas and validation notes
- Confirm domains relevant to the change contain current invariants
- Confirm sessions stay in `kit/memory/sessions/` until explicitly promoted

## Lessons Learned

- Routing matters more than volume; a compact index that points to the right pages saves more tokens than broad history reads.
- Task memory alone is not enough to fight regressions; change impact and validation notes are needed as well.
- Existing repositories need an initialization pass; otherwise the agent assumes too little and wastes tokens rediscovering project shape.
- Hooks are valuable for continuity, but they should only capture and inject context, not decide durable truth on their own.

## Known Risks

- Memory drift if state and tasks are not updated consistently
- Duplicate facts across task and domain pages if promotion discipline is weak
- Session capture can become noisy if heuristics are too loose

## Related Tasks

- None yet

## Related Decisions

- [operational-memory-model](../decisions/operational-memory-model.md)
- [hooks-capture-policy](../decisions/hooks-capture-policy.md)

## Pending Improvements

- Tune hook capture heuristics after real usage
- Add more domains as the target repo architecture becomes clearer
