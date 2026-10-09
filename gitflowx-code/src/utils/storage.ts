import type { RepositoryState } from '@/types/repository';

const STORAGE_KEY = 'gitflowx-repository-v1';

export function loadRepository(): RepositoryState | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) as RepositoryState : null;
  } catch {
    return null;
  }
}

export function saveRepository(state: RepositoryState): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
}

export function exportRepository(state: RepositoryState): string {
  return JSON.stringify(state, null, 2);
}

export function parseRepositoryImport(raw: string): RepositoryState {
  const parsed = JSON.parse(raw) as Partial<RepositoryState>;
  if (
    !parsed ||
    typeof parsed !== 'object' ||
    !parsed.commits ||
    !parsed.branches ||
    typeof parsed.currentBranch !== 'string' ||
    typeof parsed.headCommitId !== 'string' ||
    !parsed.workingTree
  ) {
    throw new Error('This file does not contain a valid GitFlowX repository.');
  }
  return parsed as RepositoryState;
}
