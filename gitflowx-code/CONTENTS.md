# GitFlowX source bundle

This bundle contains the GitFlowX application source and the configuration needed by the workspace artifact.

Included:
- `src/` — React/TypeScript UI, repository model, merge/diff/traversal utilities, and local persistence
- `package.json` — package scripts and dependencies
- `vite.config.ts` — Vite configuration
- `tsconfig.json` — TypeScript configuration
- `.replit-artifact/artifact.toml` — Replit artifact configuration
- `README.md` — run instructions and architecture notes

Excluded intentionally:
- `node_modules/`
- `dist/`
- generated caches and temporary files

The app is designed to run inside the original pnpm workspace because it uses workspace aliases and the shared package setup.
