<!-- BEGIN:nextjs-agent-rules -->

## This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

## Development and Testing Guidelines

- **Tests required for changes**: Every code added or changed MUST have tests added that test the change. (Do not strive for 100% coverage, focus on verifying functionality and edge cases).
- **Test suite must pass 100%**: By the end of model work, all tests in the test suite must pass 100% cleanly without errors.
