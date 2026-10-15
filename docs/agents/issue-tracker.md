# Issue tracker: GitHub

Issues and specs for this repo live in GitHub Issues for `deveydtj/WWF`. Use the `gh` CLI for all operations. Run it inside this clone so it infers the repository from the Git remote.

## Conventions

- **Create an issue**: `gh issue create --title "..." --body-file <body-file>`.
- **Read an issue**: `gh issue view <number> --comments`; use `--json number,title,body,labels,comments` for structured output.
- **List issues**: `gh issue list --state open --json number,title,body,labels,comments` with appropriate `--label` and `--state` filters.
- **Comment on an issue**: `gh issue comment <number> --body-file <body-file>`.
- **Apply / remove labels**: `gh issue edit <number> --add-label "..."` / `--remove-label "..."`.
- **Close**: `gh issue close <number>`.

For multiline bodies and comments, write the exact text to a temporary file and pass it with `--body-file`.

## Pull requests as a triage surface

**PRs as a request surface: no.** Set to `yes` if this repo treats external PRs as feature requests; `/triage` reads this flag.

When enabled, use `gh pr` equivalents to read, comment, label, and close PRs. Read the diff with `gh pr diff <number>`. List candidates with `gh pr list --state open --json number,title,body,labels,author,authorAssociation,comments` and keep only `authorAssociation` values `CONTRIBUTOR`, `FIRST_TIME_CONTRIBUTOR`, or `NONE`.

GitHub shares one number space across issues and PRs. Resolve an ambiguous `#42` with `gh pr view 42`, falling back to `gh issue view 42`.

## Skill operations

- **Publish to the issue tracker**: create a GitHub issue.
- **Fetch the relevant ticket**: run `gh issue view <number> --comments`.

## Wayfinding operations

Used by `/wayfinder`. The map is a single issue with child issues as tickets.

- **Map**: an issue labelled `wayfinder:map`, holding the Notes / Decisions-so-far / Fog body.
- **Child ticket**: an issue linked to the map as a GitHub sub-issue using `gh api`. Where sub-issues are unavailable, add the child to a task list in the map body and put `Part of #<map>` at the top of the child body. Use `wayfinder:<type>` labels (`research`, `prototype`, `grilling`, `task`).
- **Blocking**: use native issue dependencies. Add an edge with `gh api --method POST repos/<owner>/<repo>/issues/<child>/dependencies/blocked_by -F issue_id=<blocker-db-id>`. Obtain the numeric database ID with `gh api repos/<owner>/<repo>/issues/<n> --jq .id`. The live gate is `issue_dependencies_summary.blocked_by`, which counts open blockers. Where dependencies are unavailable, put `Blocked by: #<n>, #<n>` at the top of the child body. A ticket is unblocked when every blocker is closed.
- **Frontier query**: list the map's open children, scoped to its sub-issues or task list. Drop tickets with open blockers or an assignee; first in map order wins.
- **Claim**: `gh issue edit <n> --add-assignee @me`, the session's first write.
- **Resolve**: comment with the answer using `--body-file`, close the ticket, then append a context pointer (gist + link) to the map's Decisions-so-far.
