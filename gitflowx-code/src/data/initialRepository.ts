import type { Commit, FileMap, RepositoryState } from '@/types/repository';

const initialFiles: FileMap = {
  'README.md': `# GitFlowX Demo\n\nAn educational repository for learning version control.\n\nOpen GitFlowX to explore the graph.`,
  'index.html': `<!doctype html>\n<html lang="en">\n  <head><title>GitFlowX Demo</title></head>\n  <body><div id="app"></div></body>\n</html>`,
  'app.js': `const app = document.querySelector('#app');\napp.textContent = 'Hello from GitFlowX';`,
  'style.css': `:root { color-scheme: dark; }\nbody { font-family: system-ui; margin: 0; }`,
};

const clone = (files: FileMap): FileMap => ({ ...files });

function commit(
  id: string,
  message: string,
  timestamp: string,
  parents: string[],
  snapshot: FileMap,
): Commit {
  return {
    id: `gitflowx-${id}-000000000000`,
    shortId: id,
    message,
    timestamp,
    author: 'Alex Rivera',
    parentCommitIds: parents.map((parent) => `gitflowx-${parent}-000000000000`),
    snapshot: clone(snapshot),
  };
}

export function createInitialRepository(): RepositoryState {
  const c1 = commit('a1b2c3d', 'Initial commit', '2026-08-17T09:12:00.000Z', [], initialFiles);
  const readme: FileMap = { ...initialFiles, 'README.md': `${initialFiles['README.md']}\n\n## Getting started\n\nRun the simulator in your browser.` };
  const c2 = commit('b2c3d4e', 'Add README', '2026-08-17T11:40:00.000Z', ['a1b2c3d'], readme);
  const dashboard: FileMap = { ...readme, 'app.js': `${readme['app.js']}\n\nconst dashboard = { commits: 2, branches: 1 };` };
  const c3 = commit('c3d4e5f', 'Add dashboard', '2026-08-18T14:05:00.000Z', ['b2c3d4e'], dashboard);
  const auth: FileMap = { ...dashboard, 'app.js': `${dashboard['app.js']}\n\nfunction authenticate(user) {\n  return Boolean(user?.email);\n}` };
  const c4 = commit('d4e5f6a', 'Create feature/auth', '2026-08-19T09:30:00.000Z', ['c3d4e5f'], auth);
  const authReady: FileMap = { ...auth, 'README.md': `${auth['README.md']}\n\nAuthentication lives on the feature branch.` };
  const c5 = commit('e5f6a7b', 'Add authentication', '2026-08-19T15:48:00.000Z', ['d4e5f6a'], authReady);
  const mainUpdate: FileMap = { ...dashboard, 'style.css': `${dashboard['style.css']}\n\nbody { background: #101827; }` };
  const c6 = commit('f6a7b8c', 'Update main', '2026-08-20T10:20:00.000Z', ['c3d4e5f'], mainUpdate);
  const merged = { ...mainUpdate, 'app.js': authReady['app.js'], 'README.md': authReady['README.md'] };
  const c7 = commit('a7b8c9d', 'Merge feature/auth into main', '2026-08-20T16:25:00.000Z', ['f6a7b8c', 'e5f6a7b'], merged);

  const commits = Object.fromEntries([c1, c2, c3, c4, c5, c6, c7].map((item) => [item.id, item]));
  const now = new Date().toISOString();
  return {
    name: 'GitFlowX-Demo',
    commits,
    branches: {
      main: { name: 'main', headCommitId: c7.id },
      'feature/auth': { name: 'feature/auth', headCommitId: c5.id },
    },
    currentBranch: 'main',
    headCommitId: c7.id,
    workingTree: clone(c7.snapshot),
    stagedChanges: [],
    activityLog: [
      { id: 'activity-init', type: 'init', message: 'Repository initialized with the demo history', timestamp: now },
      { id: 'activity-history', type: 'scenario', message: 'Loaded seven-commit feature/auth scenario', timestamp: now },
    ],
    mergeStats: { merges: 1, conflicts: 0 },
  };
}

export const scenarioNames = [
  'Simple linear history',
  'Feature branch',
  'Merge without conflict',
  'Merge conflict',
  'Long commit history',
] as const;
