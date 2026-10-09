export type FileMap = Record<string, string>;

export type FileStatus = 'unmodified' | 'modified' | 'staged' | 'deleted' | 'added';

export interface FileEntry {
  path: string;
  content: string;
  status: FileStatus;
}

export interface Commit {
  id: string;
  shortId: string;
  message: string;
  timestamp: string;
  author: string;
  parentCommitIds: string[];
  snapshot: FileMap;
}

export interface Branch {
  name: string;
  headCommitId: string;
}

export type ActivityType =
  | 'init'
  | 'edit'
  | 'stage'
  | 'unstage'
  | 'commit'
  | 'branch'
  | 'checkout'
  | 'merge'
  | 'conflict'
  | 'resolve'
  | 'compare'
  | 'reset'
  | 'import'
  | 'scenario';

export interface ActivityEntry {
  id: string;
  type: ActivityType;
  message: string;
  timestamp: string;
  metadata?: Record<string, string>;
}

export interface MergeConflict {
  path: string;
  current: string;
  incoming: string;
  ancestor: string;
  resolution?: 'current' | 'incoming' | 'manual';
  resolvedContent?: string;
}

export interface RepositoryState {
  name: string;
  commits: Record<string, Commit>;
  branches: Record<string, Branch>;
  currentBranch: string;
  headCommitId: string;
  workingTree: FileMap;
  stagedChanges: string[];
  activityLog: ActivityEntry[];
  mergeStats: { merges: number; conflicts: number };
  pendingMerge?: {
    sourceBranch: string;
    targetBranch: string;
    sourceHeadId: string;
    targetHeadId: string;
    ancestorId: string | null;
    conflicts: MergeConflict[];
    mergedSnapshot: FileMap;
  };
}

export interface DiffLine {
  type: 'added' | 'removed' | 'unchanged';
  text: string;
  lineA?: number;
  lineB?: number;
}

export interface FileDiff {
  path: string;
  status: 'added' | 'removed' | 'modified' | 'unchanged';
  lines: DiffLine[];
}
