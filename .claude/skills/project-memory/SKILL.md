---
name: project-memory
description: Continuous learning skill that updates a project's MEMORY.md file with key insights, decisions, and patterns learned from the current session. Use this skill when you are working inside a project and want to record learnings for future sessions.
---

# Project Memory — Continuous Learning

This skill manages the `MEMORY.md` file inside the current project's working directory. It is the source of truth for accumulated project knowledge and should be kept up to date after every meaningful session.

## When to use

- At the end of a session where important decisions, patterns, or facts were established
- When the user asks you to "remember this" or "update the project memory"
- When you discover architectural constraints, coding conventions, or preferences that will be relevant in future sessions
- Automatically triggered by Aiden at the end of each project session

## MEMORY.md structure

Maintain the following sections in `MEMORY.md`. Only include sections with actual content.

```markdown
# Project Memory: <project name>

## Overview
Brief description of what this project does and its main goals.

## Architecture & Technical Decisions
- Key technical choices and the reasoning behind them
- Important constraints discovered
- Technology stack notes

## Conventions & Patterns
- Coding style and naming conventions in use
- File organisation patterns
- Preferred approaches for recurring tasks

## User Preferences
- How the user prefers to work
- Communication style preferences
- Things to avoid or always do

## Important Context
- Environment-specific notes (paths, configs, secrets locations)
- External dependencies and integration details
- Known issues or gotchas

## Session Log
Dated entries of the most important things learned (keep last 10).
```

## Instructions

1. **Read existing MEMORY.md** from the project's working directory if it exists.
2. **Analyse the current session** — identify new learnings: decisions, patterns, preferences, corrections, discoveries.
3. **Merge and update** — add new information to the appropriate sections. Do NOT duplicate existing entries. Remove outdated information when it conflicts with newer facts.
4. **Keep it concise** — bullet points, max 1-2 lines each. The file should be scannable in under a minute.
5. **Append to Session Log** — add a dated entry (e.g. `- 2026-06-09: Decided to use SQLite over Postgres for simplicity`) and trim entries older than the last 10.
6. **Write back** the updated file using the `write` tool.

## Example invocation

When triggered at the end of a session:

```
Read existing MEMORY.md (if any), then update it with the key learnings from this session. Focus on decisions, patterns, and preferences that will be useful in future sessions. Keep entries concise.
```

## Notes

- The MEMORY.md is injected automatically as context at the start of each new session in this project.
- Do not include sensitive information (API keys, passwords, personal data).
- If MEMORY.md does not exist yet, create it from scratch.
