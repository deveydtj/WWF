# Domain Docs

This repo uses a single-context layout: `GLOSSARY.md` at the repo root and `docs/adr/` for architectural decisions.

## Before exploring

- Read the root `GLOSSARY.md`.
- Read ADRs in `docs/adr/` that touch the area you are about to work in.

If these files or directories do not exist, proceed silently. The `domain-modeling` skill creates them lazily when terms or decisions get resolved.

## Use the glossary's vocabulary

When naming a domain concept in an issue title, refactor proposal, hypothesis, or test name, use the term defined in `GLOSSARY.md`.

If a concept is missing, reconsider whether it belongs to the project's vocabulary or note the gap for `domain-modeling`.

## Flag ADR conflicts

If a proposal contradicts an existing ADR, name the ADR and explain why its decision should be reconsidered.
