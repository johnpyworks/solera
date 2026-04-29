# Memory Index

This is the routing entrypoint into the operational memory system.

## Start Here

1. Read `../AGENT.md`
2. Read [Project State](state.md)
3. Read [Memory Log](log.md)
4. Follow the routing rules below

## Route By Request Type

### First Review / Uninitialized Repo

- If the repo already has code/data and the baseline has not been created yet, run `python kit\scripts\initialize_memory.py --write`
- Read the generated baseline artifact and initialization task before substantial work

### Planning

- Read [Project State](state.md)
- Read [Coding Memory System](domains/coding-memory-system.md)
- Read the most relevant recent task

### Bug Fix

- Read [Project State](state.md)
- Read the most relevant recent task
- Read the impacted domain under `Critical Invariants`
- Read linked session notes if the issue appears to trace to recent exploration

### Code Review

- Read the impacted domain under `Critical Invariants`
- Read the most relevant recent task
- Read the related decision if the area has a durable constraint

### New Feature

- Read [Project State](state.md)
- Read the active plan and open risks
- Read the impacted domain under `Critical Invariants`
- Read recent adjacent changes before implementation

### Research / Memory Maintenance

- Read [Coding Memory System](domains/coding-memory-system.md)
- Read [Session Index](sessions/index.md)
- Read relevant artifacts and decisions

## Current Project State

- [Project State](state.md)
- Current mode: active development — Phase 1 and Phase 2 complete, Phase 3 TBD

## Active Plan

- Define Phase 3 scope
- Merge `feature/phase2-improvements` to main
- Continue populating memory as work progresses

## Open Risks

- If baseline initialization is skipped on an existing repo, later work will waste tokens rediscovering project state
- Memory drift will occur if state and tasks are not updated after substantial work

## Critical Invariants

- [coding-memory-system](domains/coding-memory-system.md)

## Recent High-Impact Changes

- [2026-04-29-fix-memory-hooks](tasks/2026-04-29-fix-memory-hooks/task.md)
- [2026-04-22-phase2-improvements](tasks/2026-04-22-phase2-improvements/task.md)
- [2026-04-19-phase1-advisor-portal](tasks/2026-04-19-phase1-advisor-portal/task.md)
- [2026-04-20-initialize-existing-repository-memory](tasks/2026-04-20-initialize-existing-repository-memory/task.md)

## Recent Sessions

- [Session Index](sessions/index.md)

## Recent Decisions

- [operational-memory-model](decisions/operational-memory-model.md)
- [hooks-capture-policy](decisions/hooks-capture-policy.md)

## Reusable Artifacts

- [operational-memory-contract](artifacts/operational-memory-contract.md)
- [memory-system-schema](artifacts/memory-system-schema.md)

- [2026-04-29-initialize-existing-repository-memory](tasks/2026-04-29-initialize-existing-repository-memory/task.md)
