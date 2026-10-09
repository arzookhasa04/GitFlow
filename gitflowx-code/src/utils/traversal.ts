import type { Commit, RepositoryState } from '@/types/repository';

export function traverseHistory(state: RepositoryState, startId: string, mode: 'dfs' | 'bfs' = 'dfs'): Commit[] {
  const visited = new Set<string>();
  const queue = [startId];
  const result: Commit[] = [];
  while (queue.length) {
    const id = mode === 'dfs' ? queue.pop()! : queue.shift()!;
    if (visited.has(id) || !state.commits[id]) continue;
    visited.add(id);
    const current = state.commits[id];
    result.push(current);
    queue.push(...current.parentCommitIds);
  }
  return result;
}

export function findCommonAncestor(state: RepositoryState, firstId: string, secondId: string): string | null {
  const first = new Set(traverseHistory(state, firstId, 'bfs').map((commit) => commit.id));
  return traverseHistory(state, secondId, 'bfs').find((commit) => first.has(commit.id))?.id ?? null;
}
