import type { FileMap, MergeConflict, RepositoryState } from '@/types/repository';
import { findCommonAncestor } from './traversal';

export function analyzeMerge(state: RepositoryState, sourceBranch: string): {
  ancestorId: string | null;
  conflicts: MergeConflict[];
  mergedSnapshot: FileMap;
} {
  const current = state.commits[state.headCommitId];
  const incoming = state.branches[sourceBranch] && state.commits[state.branches[sourceBranch].headCommitId];
  if (!incoming) throw new Error('Select an available source branch.');
  const ancestorId = findCommonAncestor(state, current.id, incoming.id);
  const ancestor = ancestorId ? state.commits[ancestorId].snapshot : {};
  const paths = [...new Set([...Object.keys(ancestor), ...Object.keys(current.snapshot), ...Object.keys(incoming.snapshot)])];
  const mergedSnapshot: FileMap = { ...current.snapshot };
  const conflicts: MergeConflict[] = [];
  for (const path of paths) {
    const base = ancestor[path] ?? '';
    const ours = current.snapshot[path] ?? '';
    const theirs = incoming.snapshot[path] ?? '';
    if (ours === theirs) {
      if (ours) mergedSnapshot[path] = ours; else delete mergedSnapshot[path];
    } else if (ours === base) {
      if (theirs) mergedSnapshot[path] = theirs; else delete mergedSnapshot[path];
    } else if (theirs === base) {
      if (ours) mergedSnapshot[path] = ours; else delete mergedSnapshot[path];
    } else {
      conflicts.push({ path, ancestor: base, current: ours, incoming: theirs });
    }
  }
  return { ancestorId, conflicts, mergedSnapshot };
}
