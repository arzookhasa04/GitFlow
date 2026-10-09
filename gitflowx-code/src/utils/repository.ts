import type { ActivityEntry, Branch, Commit, FileMap, RepositoryState } from '@/types/repository';
import { createInitialRepository } from '@/data/initialRepository';

export const makeId = (prefix = 'id') =>
  `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 9)}`;

export const cloneFiles = (files: FileMap): FileMap => ({ ...files });

export function getHeadCommit(state: RepositoryState): Commit {
  return state.commits[state.headCommitId] ?? Object.values(state.commits)[0];
}

export function getBranchCommit(state: RepositoryState, branchName: string): Commit | undefined {
  const branch = state.branches[branchName];
  return branch ? state.commits[branch.headCommitId] : undefined;
}

export function fileStatus(path: string, workingTree: FileMap, headSnapshot: FileMap): 'unmodified' | 'modified' | 'added' | 'deleted' {
  if (!(path in workingTree)) return 'deleted';
  if (!(path in headSnapshot)) return 'added';
  return workingTree[path] === headSnapshot[path] ? 'unmodified' : 'modified';
}

export function changedFiles(workingTree: FileMap, headSnapshot: FileMap): string[] {
  return [...new Set([...Object.keys(workingTree), ...Object.keys(headSnapshot)])]
    .filter((path) => fileStatus(path, workingTree, headSnapshot) !== 'unmodified');
}

export function isDirty(state: RepositoryState): boolean {
  return changedFiles(state.workingTree, getHeadCommit(state).snapshot).length > 0;
}

export function addActivity(
  state: RepositoryState,
  type: ActivityEntry['type'],
  message: string,
  metadata?: Record<string, string>,
): ActivityEntry {
  const entry = { id: makeId('activity'), type, message, timestamp: new Date().toISOString(), metadata };
  state.activityLog = [entry, ...state.activityLog];
  return entry;
}

export function createCommit(
  state: RepositoryState,
  message: string,
  stagedPaths: string[],
  author = 'Alex Rivera',
): Commit {
  const parent = state.headCommitId;
  const id = makeId('gitflowx');
  const snapshot = cloneFiles(getHeadCommit(state).snapshot);
  for (const path of Object.keys(state.workingTree)) {
    if (stagedPaths.includes(path)) snapshot[path] = state.workingTree[path];
  }
  for (const path of Object.keys(snapshot)) {
    if (stagedPaths.includes(path) && !(path in state.workingTree)) delete snapshot[path];
  }
  const commit: Commit = {
    id,
    shortId: id.replace('gitflowx-', '').slice(0, 7),
    message,
    timestamp: new Date().toISOString(),
    author,
    parentCommitIds: parent ? [parent] : [],
    snapshot,
  };
  state.commits[id] = commit;
  state.branches[state.currentBranch].headCommitId = id;
  state.headCommitId = id;
  state.stagedChanges = [];
  return commit;
}

export function createBranch(state: RepositoryState, name: string): Branch {
  const branch = { name, headCommitId: state.headCommitId };
  state.branches[name] = branch;
  return branch;
}

export function checkoutBranch(state: RepositoryState, name: string): void {
  const branch = state.branches[name];
  if (!branch) throw new Error('That branch does not exist.');
  const commit = state.commits[branch.headCommitId];
  if (!commit) throw new Error('The branch points to an unavailable commit.');
  state.currentBranch = name;
  state.headCommitId = commit.id;
  state.workingTree = cloneFiles(commit.snapshot);
  state.stagedChanges = [];
}

export function resetRepository(): RepositoryState {
  return structuredClone(createInitialRepository());
}
