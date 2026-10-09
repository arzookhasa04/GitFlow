# GitFlowX

GitFlowX is an interactive, browser-only simulator for learning version-control concepts inspired by Git. It is intentionally not a replacement for Git and never runs Git commands or connects to a remote repository.

## Run

From the workspace root:

```bash
pnpm --filter @workspace/gitflowx run dev
```

The managed preview supplies `PORT` and `BASE_PATH`. For a local production build outside the workflow:

```bash
PORT=18996 BASE_PATH=/ pnpm --filter @workspace/gitflowx run build
```

## Implemented features

- Demo repository with seven realistic commits, `main`, and `feature/auth`
- Repository state model for commits, parent links, branches, HEAD, snapshots, working tree, staging, activity, and merge statistics
- Browser persistence through localStorage
- File editing, new files, staging, commit messages, and commit creation
- Branch creation with name validation and checkout confirmation for dirty work
- Interactive commit history and commit inspection
- Snapshot diff comparison with added, removed, modified, and unchanged lines
- Common-ancestor merge analysis with two-parent merge commits
- Explicit merge conflict detection and current/incoming resolution choices
- Activity log and calculated repository statistics
- History traversal and DSA explanations for graphs, pointers, snapshots, searching, hashing, DFS/BFS, diff, and merge
- Guided Learn Mode
- Light/dark theme, reset starter scenario, JSON export, and JSON import
- Responsive desktop, tablet, and mobile navigation

## Architecture

- `src/data/initialRepository.ts` defines the starter repository and realistic history.
- `src/types/repository.ts` defines the simulator's repository data structures.
- `src/utils/` contains reusable repository, traversal, diff, merge, and storage algorithms.
- `src/App.tsx` owns the browser-local state and renders the dashboard pages and operations.
- `src/index.css` contains the visual system and responsive layout.

The UI keeps the state transitions visible: a commit snapshots the staged files and advances both the current branch pointer and HEAD; checkout replaces the working tree with the selected branch snapshot; merge finds a common ancestor before deciding whether changes can be combined.
