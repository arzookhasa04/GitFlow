import { useEffect, useMemo, useRef, useState } from 'react';
import {
  Activity,
  AlertTriangle,
  ArrowRight,
  BookOpen,
  Check,
  CheckCircle2,
  ChevronRight,
  CircleDot,
  Clock3,
  Download,
  FileCode2,
  Files,
  GitBranch,
  GitCommitHorizontal,
  GitCompareArrows,
  GitMerge,
  Info,
  LayoutDashboard,
  Lightbulb,
  Menu,
  Moon,
  Network,
  Plus,
  RotateCcw,
  Search,
  Settings2,
  Sun,
  Terminal,
  Upload,
  UserRound,
  X,
} from 'lucide-react';
import { Route, Router as WouterRouter, useLocation } from 'wouter';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ErrorBoundary } from '@/components/error-boundary';
import { Toaster } from '@/components/ui/toaster';
import { TooltipProvider } from '@/components/ui/tooltip';
import { createInitialRepository } from '@/data/initialRepository';
import type { RepositoryState as ModelRepositoryState } from '@/types/repository';

type View =
  | 'dashboard'
  | 'repository'
  | 'branches'
  | 'history'
  | 'diff'
  | 'merge'
  | 'files'
  | 'activity'
  | 'dsa'
  | 'learn'
  | 'settings';
type FileStatus = 'clean' | 'modified' | 'staged' | 'untracked';
type FileEntry = { path: string; content: string; status: FileStatus };
type Commit = {
  id: string;
  shortId: string;
  message: string;
  timestamp: string;
  author: string;
  parentCommitIds: string[];
  snapshot: Record<string, string>;
};
type Branch = { name: string; headCommitId: string };
type ActivityEntry = {
  id: string;
  type: string;
  message: string;
  timestamp: string;
  metadata?: Record<string, string>;
};
type RepositoryState = {
  commits: Commit[];
  branches: Branch[];
  currentBranch: string;
  headCommitId: string;
  workingTree: FileEntry[];
  stagedChanges: string[];
  activityLog: ActivityEntry[];
  mergeStats: { merges: number; conflictsResolved: number };
};

function fromModel(model: ModelRepositoryState): RepositoryState {
  const commits = Object.values(model.commits)
    .sort((a, b) => b.timestamp.localeCompare(a.timestamp))
    .map((commit) => ({
      id: commit.id,
      shortId: commit.shortId,
      message: commit.message,
      timestamp: commit.timestamp,
      author: commit.author,
      parentCommitIds: commit.parentCommitIds,
      snapshot: commit.snapshot,
    }));
  const head = model.commits[model.headCommitId];
  return {
    commits,
    branches: Object.values(model.branches),
    currentBranch: model.currentBranch,
    headCommitId: model.headCommitId,
    workingTree: Object.entries(model.workingTree).map(([path, content]) => ({
      path,
      content,
      status: 'clean',
    })),
    stagedChanges: model.stagedChanges,
    activityLog: model.activityLog,
    mergeStats: { merges: model.mergeStats.merges, conflictsResolved: model.mergeStats.conflicts },
  };
}

const now = () => new Date().toISOString();
const id = () => Math.random().toString(36).slice(2, 10);
const ago = (minutes: number) => new Date(Date.now() - minutes * 60000).toISOString();

const initialState: RepositoryState = fromModel(createInitialRepository());

const navItems: { id: View; label: string; icon: typeof LayoutDashboard; group: string }[] = [
  { id: 'dashboard', label: 'Dashboard', icon: LayoutDashboard, group: 'Workspace' },
  { id: 'repository', label: 'Repository', icon: Network, group: 'Workspace' },
  { id: 'branches', label: 'Branches', icon: GitBranch, group: 'Workspace' },
  { id: 'history', label: 'Commit history', icon: GitCommitHorizontal, group: 'Workspace' },
  { id: 'diff', label: 'Diff & compare', icon: GitCompareArrows, group: 'Workspace' },
  { id: 'merge', label: 'Merge lab', icon: GitMerge, group: 'Workspace' },
  { id: 'files', label: 'Files / working tree', icon: Files, group: 'Workspace' },
  { id: 'activity', label: 'Activity log', icon: Activity, group: 'Observe' },
  { id: 'dsa', label: 'DSA concepts', icon: Terminal, group: 'Learn' },
  { id: 'learn', label: 'Learn mode', icon: BookOpen, group: 'Learn' },
  { id: 'settings', label: 'Settings / export', icon: Settings2, group: 'System' },
];

function getViewFromPath(path: string): View {
  const key = path.replace('/', '') as View;
  return navItems.some((item) => item.id === key) ? key : 'dashboard';
}

function formatTime(value: string) {
  const minutes = Math.max(1, Math.round((Date.now() - new Date(value).getTime()) / 60000));
  if (minutes < 60) return `${minutes}m ago`;
  if (minutes < 1440) return `${Math.round(minutes / 60)}h ago`;
  return `${Math.round(minutes / 1440)}d ago`;
}

function snapshotOf(files: FileEntry[]) {
  return Object.fromEntries(files.map((file) => [file.path, file.content]));
}

function commonAncestor(commits: Commit[], firstId: string, secondId: string) {
  const byId = new Map(commits.map((commit) => [commit.id, commit]));
  const walk = (start: string) => {
    const seen = new Set<string>();
    const queue = [start];
    while (queue.length) {
      const current = queue.shift()!;
      if (seen.has(current) || !byId.has(current)) continue;
      seen.add(current);
      queue.push(...(byId.get(current)?.parentCommitIds ?? []));
    }
    return seen;
  };
  const first = walk(firstId);
  const queue = [secondId];
  const seen = new Set<string>();
  while (queue.length) {
    const current = queue.shift()!;
    if (seen.has(current) || !byId.has(current)) continue;
    seen.add(current);
    if (first.has(current)) return byId.get(current);
    queue.push(...(byId.get(current)?.parentCommitIds ?? []));
  }
  return undefined;
}

function mergeSnapshot(state: RepositoryState, sourceCommit: Commit, targetCommit: Commit) {
  const ancestor = commonAncestor(state.commits, targetCommit.id, sourceCommit.id);
  const base = ancestor?.snapshot ?? {};
  const paths = Array.from(new Set([...Object.keys(base), ...Object.keys(targetCommit.snapshot), ...Object.keys(sourceCommit.snapshot)]));
  const merged = { ...targetCommit.snapshot };
  const conflicts: { path: string; current: string; incoming: string; ancestor: string }[] = [];
  paths.forEach((path) => {
    const ours = targetCommit.snapshot[path] ?? '';
    const theirs = sourceCommit.snapshot[path] ?? '';
    const original = base[path] ?? '';
    if (ours === theirs) {
      if (ours) merged[path] = ours; else delete merged[path];
    } else if (ours === original) {
      if (theirs) merged[path] = theirs; else delete merged[path];
    } else if (theirs === original) {
      if (ours) merged[path] = ours; else delete merged[path];
    } else {
      conflicts.push({ path, current: ours, incoming: theirs, ancestor: original });
    }
  });
  return { merged, conflicts };
}

function AppShell() {
  const [location, setLocation] = useLocation();
  const [state, setState] = useState<RepositoryState>(() => {
    try {
      const saved = localStorage.getItem('gitflowx-state');
      return saved ? JSON.parse(saved) as RepositoryState : initialState;
    } catch {
      return initialState;
    }
  });
  const [dark, setDark] = useState(() => localStorage.getItem('gitflowx-theme') === 'dark');
  const [mobileNav, setMobileNav] = useState(false);
  const [toast, setToast] = useState('');
  const fileImportRef = useRef<HTMLInputElement>(null);
  const view = getViewFromPath(location);
  const head = state.commits.find((commit) => commit.id === state.headCommitId) ?? state.commits[0];
  const branch = state.branches.find((item) => item.name === state.currentBranch);
  const dirtyFiles = state.workingTree.filter((file) => file.status !== 'clean');

  useEffect(() => {
    localStorage.setItem('gitflowx-state', JSON.stringify(state));
  }, [state]);
  useEffect(() => {
    document.documentElement.classList.toggle('dark', dark);
    localStorage.setItem('gitflowx-theme', dark ? 'dark' : 'light');
  }, [dark]);

  const notify = (message: string) => {
    setToast(message);
    window.setTimeout(() => setToast(''), 2600);
  };
  const go = (next: View) => {
    setLocation(next === 'dashboard' ? '/' : `/${next}`);
    setMobileNav(false);
  };
  const log = (type: string, message: string) => ({
    id: id(), type, message, timestamp: now(),
  });

  const checkout = (name: string) => {
    const nextBranch = state.branches.find((item) => item.name === name);
    if (!nextBranch) return;
    if (name === state.currentBranch) return notify(`Already on ${name}`);
    if (dirtyFiles.length > 0 && !window.confirm(`Discard ${dirtyFiles.length} uncommitted file${dirtyFiles.length === 1 ? '' : 's'}?`)) {
      return notify('Checkout cancelled; your working tree is unchanged.');
    }
    const nextCommit = state.commits.find((commit) => commit.id === nextBranch.headCommitId);
    if (!nextCommit) return;
    setState((current) => ({
      ...current, currentBranch: name, headCommitId: nextBranch.headCommitId,
      workingTree: Object.entries(nextCommit.snapshot).map(([path, content]) => ({ path, content, status: 'clean' })),
      stagedChanges: [], activityLog: [log('checkout', `Checked out ${name} at ${nextCommit.shortId}`), ...current.activityLog],
    }));
    notify(`Switched to ${name}`);
  };
  const createBranch = (name: string) => {
    const clean = name.trim().replace(/\s+/g, '-');
    if (!clean || !/^[A-Za-z0-9._/-]+$/.test(clean) || clean.startsWith('/') || clean.endsWith('/') || clean.includes('..') || state.branches.some((item) => item.name === clean)) {
      notify('Use a unique branch name with letters, numbers, /, -, _, or .');
      return;
    }
    setState((current) => ({
      ...current, branches: [...current.branches, { name: clean, headCommitId: current.headCommitId }],
      activityLog: [log('branch', `Created branch ${clean} from ${current.headCommitId.slice(0, 7)}`), ...current.activityLog],
    }));
    notify(`Branch ${clean} created`);
  };
  const updateFile = (path: string, content: string) => {
    setState((current) => ({
      ...current,
      workingTree: current.workingTree.map((file) => file.path === path
        ? { ...file, content, status: current.stagedChanges.includes(path) ? 'staged' : 'modified' }
        : file),
    }));
  };
  const addFile = (path: string) => {
    const clean = path.trim();
    if (!clean || state.workingTree.some((file) => file.path === clean)) return notify('That path already exists.');
    setState((current) => ({ ...current, workingTree: [...current.workingTree, { path: clean, content: '', status: 'untracked' }] }));
    notify('New file added to the working tree');
  };
  const toggleStage = (path: string) => {
    setState((current) => {
      const staged = current.stagedChanges.includes(path);
      return {
        ...current,
        stagedChanges: staged ? current.stagedChanges.filter((item) => item !== path) : [...current.stagedChanges, path],
        workingTree: current.workingTree.map((file) => file.path === path ? { ...file, status: staged ? 'modified' : 'staged' } : file),
      };
    });
  };
  const commitChanges = (message: string) => {
    const filesToCommit = state.workingTree.filter((file) => state.stagedChanges.includes(file.path));
    if (!message.trim() || filesToCommit.length === 0) return notify('Stage at least one file and add a message.');
    const commitId = id() + id().slice(0, 2);
    const parent = state.commits.find((item) => item.id === state.headCommitId);
    const snapshot = { ...(parent?.snapshot ?? {}) };
    filesToCommit.forEach((file) => { snapshot[file.path] = file.content; });
    const commit: Commit = {
      id: commitId, shortId: commitId.slice(0, 7), message: message.trim(), timestamp: now(), author: 'You',
      parentCommitIds: [state.headCommitId], snapshot,
    };
    setState((current) => ({
      ...current, commits: [commit, ...current.commits], headCommitId: commitId,
      branches: current.branches.map((item) => item.name === current.currentBranch ? { ...item, headCommitId: commitId } : item),
      workingTree: current.workingTree.map((file) => ({ ...file, status: 'clean' })), stagedChanges: [],
      activityLog: [log('commit', `Created commit ${commit.shortId} — ${commit.message}`), ...current.activityLog],
    }));
    notify(`Committed as ${commit.shortId}`);
  };
  const reset = () => {
    setState(fromModel(createInitialRepository()));
    notify('Repository reset to the starter scenario');
  };
  const exportState = () => {
    const blob = new Blob([JSON.stringify(state, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url; anchor.download = 'gitflowx-repository.json'; anchor.click(); URL.revokeObjectURL(url);
    notify('Repository JSON exported');
  };
  const importState = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const parsed = JSON.parse(String(reader.result)) as RepositoryState;
        if (!parsed.commits || !parsed.branches || !parsed.workingTree) throw new Error('invalid');
        setState(parsed); notify('Repository JSON imported');
      } catch { notify('That file is not a GitFlowX repository export.'); }
    };
    reader.readAsText(file);
    event.target.value = '';
  };

  const content = (
    <div className="app-shell">
      <aside className={`sidebar ${mobileNav ? 'mobile-open' : ''}`}>
        <div style={{ padding: '21px 20px 6px', display: 'flex', alignItems: 'center', gap: 11 }}>
          <div className="brand-mark"><GitBranch size={17} strokeWidth={2.5} /></div>
          <div><div style={{ fontSize: 15, fontWeight: 800, letterSpacing: '-.04em' }}>GitFlowX</div><div className="mono" style={{ color: 'hsl(var(--sidebar-foreground) / .45)', fontSize: 9, marginTop: 3 }}>VISUAL VERSION CONTROL</div></div>
        </div>
        <div className="sidebar-scroll">
          {['Workspace', 'Observe', 'Learn', 'System'].map((group) => <div key={group}>
            <div className="nav-label">{group}</div>
            {navItems.filter((item) => item.group === group).map((item) => {
              const Icon = item.icon;
              return <button key={item.id} className={`nav-item ${view === item.id ? 'active' : ''}`} onClick={() => go(item.id)} data-testid={`nav-${item.id}`}><Icon className="nav-icon" /><span>{item.label}</span>{item.id === 'files' && dirtyFiles.length > 0 && <span style={{ marginLeft: 'auto', fontSize: 10, color: 'hsl(var(--accent))' }}>{dirtyFiles.length}</span>}</button>;
            })}
          </div>)}
        </div>
        <div style={{ padding: '14px', borderTop: '1px solid hsl(var(--sidebar-border))' }}>
          <div style={{ padding: '11px', borderRadius: 8, background: 'hsl(var(--sidebar-accent))', border: '1px solid hsl(var(--sidebar-border))' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 7, fontSize: 11, fontWeight: 700 }}><CircleDot size={13} color="hsl(var(--sidebar-primary))" /> Simulator active</div>
            <div style={{ fontSize: 10, lineHeight: 1.5, color: 'hsl(var(--sidebar-foreground) / .54)', marginTop: 7 }}>Everything stays in this browser. No remote repository is connected.</div>
          </div>
        </div>
      </aside>
      <main className="main-area">
        <header className="topbar">
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <button className="icon-btn mobile-only" onClick={() => setMobileNav(!mobileNav)} aria-label="Toggle navigation" data-testid="button-toggle-navigation"><Menu size={16} /></button>
            <div className="mono" style={{ fontSize: 11, color: 'hsl(var(--muted-foreground))' }}><span style={{ color: 'hsl(var(--primary))' }}>~/lab</span> / gitflowx</div>
            <span className="badge badge-teal"><CircleDot size={10} /> local</span>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 9 }}>
            <span className="mono muted" style={{ fontSize: 10 }}>{state.currentBranch}</span>
            <button className="icon-btn" onClick={() => setDark(!dark)} aria-label="Toggle theme" data-testid="button-toggle-theme">{dark ? <Sun size={15} /> : <Moon size={15} />}</button>
            <button className="btn btn-primary" onClick={() => go('files')} data-testid="button-open-working-tree"><GitCommitHorizontal size={14} /> <span className="hide-mobile">Commit changes</span></button>
          </div>
        </header>
        <div className="workspace">
          {view === 'dashboard' && <Dashboard state={state} head={head} dirtyFiles={dirtyFiles} go={go} />}
          {view === 'repository' && <Repository state={state} head={head} branch={branch} go={go} />}
          {view === 'branches' && <Branches state={state} checkout={checkout} createBranch={createBranch} />}
          {view === 'history' && <History state={state} />}
          {view === 'diff' && <Diff state={state} />}
          {view === 'merge' && <Merge state={state} checkout={checkout} notify={notify} setState={setState} />}
          {view === 'files' && <FilesView state={state} updateFile={updateFile} addFile={addFile} toggleStage={toggleStage} commitChanges={commitChanges} />}
          {view === 'activity' && <ActivityView state={state} />}
          {view === 'dsa' && <DSA />}
          {view === 'learn' && <Learn state={state} setState={setState} notify={notify} />}
          {view === 'settings' && <Settings dark={dark} setDark={setDark} reset={reset} exportState={exportState} importState={importState} fileImportRef={fileImportRef} />}
        </div>
      </main>
      {toast && <div className="toast-note" role="status" data-testid="status-toast">{toast}</div>}
    </div>
  );
  return content;
}

function Header({ eyebrow, title, subtitle, action }: { eyebrow: string; title: string; subtitle: string; action?: React.ReactNode }) {
  return <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', gap: 18, marginBottom: 27 }}><div><div className="eyebrow">{eyebrow}</div><h1 className="page-title">{title}</h1><p className="page-subtitle">{subtitle}</p></div>{action}</div>;
}

function Dashboard({ state, head, dirtyFiles, go }: { state: RepositoryState; head: Commit; dirtyFiles: FileEntry[]; go: (view: View) => void }) {
  return <><Header eyebrow="Repository overview" title="A clear view of your repository." subtitle="See where HEAD points, what changed locally, and how your history is taking shape." action={<button className="btn btn-quiet" onClick={() => go('learn')} data-testid="button-dashboard-learn"><BookOpen size={14} /> Start a lesson</button>} />
    <div className="callout"><Info size={16} /><div><strong>This is a simulator, not real Git.</strong> GitFlowX models the ideas behind version control in your browser so you can experiment without fear.</div></div>
    <div className="stat-grid section-gap">
      <div className="panel stat-card"><div className="panel-kicker">Commits</div><div className="stat-value" data-testid="text-stat-commits">{state.commits.length}</div><div className="stat-label">snapshots in history</div></div>
      <div className="panel stat-card"><div className="panel-kicker">Branches</div><div className="stat-value" data-testid="text-stat-branches">{state.branches.length}</div><div className="stat-label">named lines of work</div></div>
      <div className="panel stat-card"><div className="panel-kicker">Working tree</div><div className="stat-value" data-testid="text-stat-dirty">{dirtyFiles.length}</div><div className="stat-label">{dirtyFiles.length ? 'files need attention' : 'clean files'}</div></div>
      <div className="panel stat-card"><div className="panel-kicker">Merge rate</div><div className="stat-value" data-testid="text-stat-merges">{state.mergeStats.merges}</div><div className="stat-label">merges completed</div></div>
    </div>
    <div className="two-col section-gap">
      <div className="panel panel-pad"><div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}><div><div className="panel-kicker">Current position</div><div className="panel-title" style={{ marginTop: 7 }}>HEAD is attached to <span className="mono" style={{ color: 'hsl(var(--primary))' }}>{state.currentBranch}</span></div></div><span className="badge badge-amber"><CircleDot size={10} /> HEAD</span></div><div className="branch-line" /><div style={{ display: 'flex', justifyContent: 'space-between', gap: 15 }}><div><div className="mono" style={{ fontSize: 12, fontWeight: 500 }}>{head.shortId}</div><div style={{ fontSize: 12, marginTop: 5 }}>{head.message}</div></div><button className="btn btn-quiet" onClick={() => go('history')} data-testid="button-view-history">View history <ArrowRight size={13} /></button></div></div>
      <div className="panel panel-pad"><div className="panel-kicker">Next useful move</div><div className="panel-title" style={{ marginTop: 7 }}>Make a small change</div><p className="muted" style={{ fontSize: 12, lineHeight: 1.6, margin: '9px 0 17px' }}>Edit a file, stage it, and create a snapshot. That three-step loop is the center of Git.</p><button className="btn btn-primary" onClick={() => go('files')} data-testid="button-edit-files"><Files size={14} /> Open working tree</button></div>
    </div>
    <div className="panel panel-pad section-gap"><div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 11 }}><div><div className="panel-kicker">Recent activity</div><div className="panel-title" style={{ marginTop: 6 }}>Your repository, in motion</div></div><button className="btn btn-quiet" onClick={() => go('activity')} data-testid="button-view-activity">All activity <ChevronRight size={13} /></button></div>{state.activityLog.slice(0, 3).map((entry) => <div className="table-row" key={entry.id}><div style={{ display: 'flex', alignItems: 'center', gap: 9 }}><span className="badge badge-teal">{entry.type}</span><span style={{ fontSize: 12 }}>{entry.message}</span></div><span className="muted mono" style={{ fontSize: 10 }}>{formatTime(entry.timestamp)}</span><span /><span /></div>)}</div>
  </>;
}

function Repository({ state, head, branch, go }: { state: RepositoryState; head: Commit; branch?: Branch; go: (view: View) => void }) {
  return <><Header eyebrow="Repository state" title="What exists right now." subtitle="A repository is history plus the working tree around it. This view keeps those two layers visible together." action={<button className="btn btn-primary" onClick={() => go('files')} data-testid="button-repository-files"><Files size={14} /> Working tree</button>} />
    <div className="two-col"><div className="panel panel-pad"><div className="panel-kicker">HEAD reference</div><div style={{ display: 'flex', alignItems: 'center', gap: 12, marginTop: 14 }}><div className="brand-mark" style={{ background: 'hsl(var(--primary) / .1)' }}><CircleDot size={16} /></div><div><div style={{ fontWeight: 800, fontSize: 16 }}>{state.currentBranch}</div><div className="muted mono" style={{ fontSize: 11, marginTop: 4 }}>{branch?.headCommitId.slice(0, 7)} · {head.message}</div></div></div><div className="callout" style={{ marginTop: 22 }}><Lightbulb size={16} /><div>HEAD is a movable pointer. Checkout changes which branch it follows; a commit moves both the branch and HEAD forward.</div></div></div>
      <div className="panel panel-pad"><div className="panel-kicker">Repository health</div><div style={{ display: 'flex', alignItems: 'center', gap: 9, marginTop: 14, fontWeight: 700, fontSize: 13 }}><CheckCircle2 size={17} color="hsl(var(--primary))" /> {state.stagedChanges.length ? 'Ready to commit' : 'No staged changes'}</div><div className="muted" style={{ fontSize: 11, lineHeight: 1.6, marginTop: 10 }}>{state.workingTree.length} files tracked · {state.commits.length} snapshots · {state.branches.length} branches</div></div></div>
    <div className="panel panel-pad section-gap"><div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}><div><div className="panel-kicker">Tracked files</div><div className="panel-title" style={{ marginTop: 6 }}>The latest snapshot</div></div><button className="btn btn-quiet" onClick={() => go('diff')} data-testid="button-repository-diff"><GitCompareArrows size={14} /> Compare</button></div>{state.workingTree.map((file) => <div className="table-row" key={file.path}><div style={{ display: 'flex', alignItems: 'center', gap: 9 }}><FileCode2 size={15} color="hsl(var(--primary))" /><span className="mono" style={{ fontSize: 11 }}>{file.path}</span></div><span className={`badge ${file.status === 'clean' ? 'badge-teal' : file.status === 'staged' ? 'badge-amber' : 'badge-red'}`}>{file.status}</span><span className="muted" style={{ fontSize: 11 }}>{file.content.split('\n').length} lines</span><button className="icon-btn" onClick={() => go('files')} aria-label={`Edit ${file.path}`} data-testid={`button-edit-${file.path.replaceAll('/', '-')}`}><ChevronRight size={14} /></button></div>)}</div>
  </>;
}

function Branches({ state, checkout, createBranch }: { state: RepositoryState; checkout: (name: string) => void; createBranch: (name: string) => void }) {
  const [name, setName] = useState('');
  return <><Header eyebrow="Pointers & parallel work" title="Branches make room to explore." subtitle="A branch is just a friendly name pointing at a commit. Create one, switch to it, and watch the pointer move." action={<div className="badge badge-teal"><GitBranch size={12} /> {state.branches.length} branches</div>} />
    <div className="two-col"><div className="panel panel-pad"><div className="panel-kicker">Create a branch</div><div className="panel-title" style={{ marginTop: 7 }}>Give an experiment a name</div><div style={{ display: 'flex', gap: 8, marginTop: 16 }}><input className="input" value={name} onChange={(event) => setName(event.target.value)} placeholder="e.g. refactor-header" data-testid="input-branch-name" /><button className="btn btn-primary" onClick={() => { createBranch(name); setName(''); }} data-testid="button-create-branch"><Plus size={14} /> Create</button></div><p className="muted" style={{ fontSize: 11, marginTop: 12 }}>New branches start at your current HEAD: <span className="mono">{state.headCommitId.slice(0, 7)}</span></p></div><div className="panel panel-pad"><div className="panel-kicker">Branch idea</div><div className="panel-title" style={{ marginTop: 7 }}>Pointers, not copies</div><p className="muted" style={{ fontSize: 12, lineHeight: 1.6, marginTop: 11 }}>Creating a branch is cheap because it does not duplicate your files. It records another name for the same commit.</p></div></div>
    <div className="panel panel-pad section-gap"><div className="panel-kicker">All branches</div>{state.branches.map((item) => <div className="table-row" key={item.name}><div style={{ display: 'flex', alignItems: 'center', gap: 10 }}><GitBranch size={15} color={item.name === state.currentBranch ? 'hsl(var(--primary))' : 'hsl(var(--muted-foreground))'} /><span style={{ fontSize: 13, fontWeight: 700 }}>{item.name}</span>{item.name === state.currentBranch && <span className="badge badge-teal">current</span>}</div><span className="mono muted" style={{ fontSize: 11 }}>{item.headCommitId.slice(0, 7)}</span><span className="muted" style={{ fontSize: 11 }}>{state.commits.find((commit) => commit.id === item.headCommitId)?.message}</span>{item.name === state.currentBranch ? <span className="badge badge-slate">HEAD</span> : <button className="btn btn-quiet" onClick={() => checkout(item.name)} data-testid={`button-checkout-${item.name}`}>Checkout <ArrowRight size={13} /></button>}</div>)}</div>
  </>;
}

function History({ state }: { state: RepositoryState }) {
  const [selected, setSelected] = useState(state.headCommitId);
  const commit = state.commits.find((item) => item.id === selected) ?? state.commits[0];
  return <><Header eyebrow="Immutable snapshots" title="Read the story of change." subtitle="Every commit preserves a complete snapshot and points backward to its parent. Select one to inspect the context." action={<span className="badge badge-amber"><GitCommitHorizontal size={12} /> {state.commits.length} snapshots</span>} />
    <div className="two-col"><div className="panel panel-pad"><div className="panel-kicker" style={{ marginBottom: 19 }}>Commit graph</div><div className="graph"><div className="graph-line" /> <div>{state.commits.map((item) => <div className="graph-node" key={item.id} style={{ marginBottom: 43 }} />)}</div><div>{state.commits.map((item) => <button className="commit-row" key={item.id} onClick={() => setSelected(item.id)} style={{ width: '100%', textAlign: 'left', background: selected === item.id ? 'hsl(var(--primary) / .07)' : 'transparent', borderRadius: 7, padding: '5px 8px 20px', border: selected === item.id ? '1px solid hsl(var(--primary) / .2)' : '1px solid transparent' }} data-testid={`button-select-commit-${item.shortId}`}><div><div className="commit-message">{item.message}</div><div className="commit-meta"><span className="mono">{item.shortId}</span> · {item.author} · {formatTime(item.timestamp)}</div></div><span className={`badge ${item.id === state.headCommitId ? 'badge-teal' : 'badge-slate'}`}>{item.id === state.headCommitId ? 'HEAD' : 'snapshot'}</span></button>)}</div></div></div>
      <div className="panel panel-pad"><div className="panel-kicker">Selected commit</div><div style={{ display: 'flex', gap: 9, alignItems: 'center', marginTop: 14 }}><span className="badge badge-teal mono">{commit.shortId}</span><span className="muted mono" style={{ fontSize: 10 }}>{new Date(commit.timestamp).toLocaleString()}</span></div><h2 style={{ fontSize: 19, lineHeight: 1.2, letterSpacing: '-.04em', margin: '14px 0 8px' }}>{commit.message}</h2><div className="muted" style={{ fontSize: 12, display: 'flex', alignItems: 'center', gap: 6 }}><UserRound size={13} /> {commit.author}</div><div style={{ borderTop: '1px solid hsl(var(--border))', marginTop: 24, paddingTop: 17 }}><div className="panel-kicker">Snapshot contents</div>{Object.keys(commit.snapshot).map((path) => <div key={path} style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 12, fontSize: 11 }}><FileCode2 size={14} color="hsl(var(--primary))" /><span className="mono">{path}</span></div>)}</div></div></div>
  </>;
}

function Diff({ state }: { state: RepositoryState }) {
  const [baseId, setBaseId] = useState(state.commits[1]?.id ?? state.commits[0].id);
  const [compareId, setCompareId] = useState(state.headCommitId);
  const base = state.commits.find((commit) => commit.id === baseId) ?? state.commits[0];
  const compare = state.commits.find((commit) => commit.id === compareId) ?? state.commits[0];
  const paths = Array.from(new Set([...Object.keys(base.snapshot), ...Object.keys(compare.snapshot)]));
  return <><Header eyebrow="Snapshots side by side" title="See exactly what changed." subtitle="Diff is a comparison, not a mystery. Pick two snapshots and read additions, removals, and unchanged context line by line." action={<span className="badge badge-teal"><GitCompareArrows size={12} /> live comparison</span>} />
    <div className="panel panel-pad"><div style={{ display: 'grid', gridTemplateColumns: '1fr 34px 1fr', gap: 10, alignItems: 'end' }}><div className="field"><label>Base snapshot</label><select className="select" value={baseId} onChange={(event) => setBaseId(event.target.value)} data-testid="select-diff-base">{state.commits.map((commit) => <option key={commit.id} value={commit.id}>{commit.shortId} · {commit.message}</option>)}</select></div><ArrowRight size={16} className="muted" style={{ marginBottom: 11 }} /><div className="field"><label>Compare snapshot</label><select className="select" value={compareId} onChange={(event) => setCompareId(event.target.value)} data-testid="select-diff-compare">{state.commits.map((commit) => <option key={commit.id} value={commit.id}>{commit.shortId} · {commit.message}</option>)}</select></div></div></div>
    <div className="panel section-gap" style={{ overflow: 'hidden' }}><div style={{ padding: '15px 18px', borderBottom: '1px solid hsl(var(--border))', display: 'flex', justifyContent: 'space-between' }}><div className="panel-kicker">Unified diff</div><span className="mono muted" style={{ fontSize: 10 }}>{base.shortId} → {compare.shortId}</span></div>{paths.map((path) => { const before = base.snapshot[path] ?? ''; const after = compare.snapshot[path] ?? ''; const changed = before !== after; return <div key={path} style={{ borderBottom: '1px solid hsl(var(--border))', padding: '14px 18px' }}><div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 9 }}><FileCode2 size={14} color="hsl(var(--primary))" /><span className="mono" style={{ fontSize: 11 }}>{path}</span>{changed ? <span className="badge badge-amber">changed</span> : <span className="badge badge-slate">unchanged</span>}</div>{changed ? <div>{before && before.split('\n').map((line, index) => <div className="code-row code-del" key={`old-${index}`}><span className="code-num">−</span><span>{line || ' '}</span></div>)}{after && after.split('\n').map((line, index) => <div className="code-row code-add" key={`new-${index}`}><span className="code-num">+</span><span>{line || ' '}</span></div>)}</div> : <div className="muted mono" style={{ fontSize: 10 }}>No content changes in this file.</div>}</div>; })}</div>
  </>;
}

function Merge({ state, notify, setState }: { state: RepositoryState; checkout: (name: string) => void; notify: (message: string) => void; setState: React.Dispatch<React.SetStateAction<RepositoryState>> }) {
  const [source, setSource] = useState(state.branches.find((item) => item.name !== state.currentBranch)?.name ?? '');
  const [resolutions, setResolutions] = useState<Record<string, 'current' | 'incoming'>>({});
  const sourceBranch = state.branches.find((item) => item.name === source);
  const sourceCommit = state.commits.find((commit) => commit.id === sourceBranch?.headCommitId);
  const targetCommit = state.commits.find((commit) => commit.id === state.headCommitId);
  const analysis = sourceCommit && targetCommit ? mergeSnapshot(state, sourceCommit, targetCommit) : { merged: {}, conflicts: [] };
  const merge = () => {
    if (!sourceBranch || !sourceCommit || !targetCommit || source === state.currentBranch) return notify('Choose another available branch to merge.');
    if (analysis.conflicts.some((conflict) => !resolutions[conflict.path])) return notify('Resolve every conflict before creating the merge commit.');
    const mergedSnapshot = { ...analysis.merged };
    analysis.conflicts.forEach((conflict) => {
      mergedSnapshot[conflict.path] = resolutions[conflict.path] === 'incoming' ? conflict.incoming : conflict.current;
    });
    const mergeId = id() + id().slice(0, 2);
    const commit: Commit = { id: mergeId, shortId: mergeId.slice(0, 7), message: `Merge ${source} into ${state.currentBranch}`, timestamp: now(), author: 'You', parentCommitIds: [state.headCommitId, sourceBranch.headCommitId], snapshot: mergedSnapshot };
    setState((current) => ({ ...current, commits: [commit, ...current.commits], headCommitId: mergeId, branches: current.branches.map((item) => item.name === current.currentBranch ? { ...item, headCommitId: mergeId } : item), workingTree: Object.entries(mergedSnapshot).map(([path, content]) => ({ path, content, status: 'clean' })), mergeStats: { merges: current.mergeStats.merges + 1, conflictsResolved: current.mergeStats.conflictsResolved + analysis.conflicts.length, activityLog: [{ id: id(), type: 'merge', message: `Merged ${source} into ${current.currentBranch}`, timestamp: now() }, ...current.activityLog] } }));
    setResolutions({});
    notify(`Merged ${source} into ${state.currentBranch}`);
  };
  return <><Header eyebrow="Reconcile two histories" title="Merge lab." subtitle="Practice bringing one branch into another. When lines diverge, resolve the conflict deliberately before creating a merge commit." action={<span className="badge badge-amber"><GitMerge size={12} /> {state.mergeStats.merges} merges</span>} />
    <div className="two-col"><div className="panel panel-pad"><div className="panel-kicker">Merge into current branch</div><div className="panel-title" style={{ marginTop: 8 }}>{state.currentBranch}</div><div className="field" style={{ marginTop: 17 }}><label>Source branch</label><select className="select" value={source} onChange={(event) => { setSource(event.target.value); setResolutions({}); }} data-testid="select-merge-source">{state.branches.filter((item) => item.name !== state.currentBranch).map((item) => <option key={item.name} value={item.name}>{item.name} · {item.headCommitId.slice(0, 7)}</option>)}</select></div><div className="branch-line" /><div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11 }}><span className="mono">{sourceBranch?.headCommitId.slice(0, 7)}</span><ArrowRight size={14} className="muted" /><span className="mono">{state.headCommitId.slice(0, 7)}</span></div><button className="btn btn-primary" style={{ width: '100%', marginTop: 19 }} onClick={merge} data-testid="button-merge-branches"><GitMerge size={14} /> Create merge commit</button></div>
      <div className="panel panel-pad">{analysis.conflicts.length ? <><div className="callout" style={{ borderColor: 'hsl(var(--destructive) / .3)', background: 'hsl(var(--destructive) / .07)' }}><AlertTriangle size={16} color="hsl(var(--destructive))" /><div><strong>Merge conflict.</strong> Both branches changed the same file since their common ancestor. GitFlowX will not overwrite it silently.</div></div><div style={{ marginTop: 19 }}><div className="panel-kicker">{analysis.conflicts.length} file{analysis.conflicts.length === 1 ? '' : 's'} need a decision</div>{analysis.conflicts.map((conflict) => <div className="step-card" style={{ marginTop: 10 }} key={conflict.path}><div className="mono" style={{ fontSize: 11, color: 'hsl(var(--destructive))' }}>{conflict.path}</div><pre className="merge-code">− {conflict.current || '(deleted)'}{'\n'}+ {conflict.incoming || '(deleted)'}</pre><div style={{ display: 'flex', gap: 7 }}><button className={`btn ${resolutions[conflict.path] === 'current' ? 'btn-primary' : 'btn-quiet'}`} onClick={() => setResolutions((current) => ({ ...current, [conflict.path]: 'current' }))}>Use current</button><button className={`btn ${resolutions[conflict.path] === 'incoming' ? 'btn-primary' : 'btn-quiet'}`} onClick={() => setResolutions((current) => ({ ...current, [conflict.path]: 'incoming' }))}>Use incoming</button></div></div>)}</div></> : <><div className="panel-kicker">No conflicts detected</div><div className="panel-title" style={{ marginTop: 8 }}>The snapshots can be reconciled.</div><p className="muted" style={{ fontSize: 12, lineHeight: 1.6, marginTop: 12 }}>The merge analyzer compared both branches to their common ancestor and found compatible changes.</p></>}</div></div>
  </>;
}

function FilesView({ state, updateFile, addFile, toggleStage, commitChanges }: { state: RepositoryState; updateFile: (path: string, content: string) => void; addFile: (path: string) => void; toggleStage: (path: string) => void; commitChanges: (message: string) => void }) {
  const [selected, setSelected] = useState(state.workingTree[0]?.path ?? '');
  const [newPath, setNewPath] = useState('');
  const [message, setMessage] = useState('');
  const active = state.workingTree.find((file) => file.path === selected) ?? state.workingTree[0];
  return <><Header eyebrow="Working tree" title="Make the next change." subtitle="Edit locally, stage intentionally, then commit a snapshot. This is where the abstract model becomes tactile." action={<span className={`badge ${state.stagedChanges.length ? 'badge-amber' : 'badge-slate'}`}><CircleDot size={10} /> {state.stagedChanges.length} staged</span>} />
    <div className="two-col"><div className="panel" style={{ overflow: 'hidden' }}><div style={{ padding: '16px 18px', borderBottom: '1px solid hsl(var(--border))', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}><div className="panel-kicker">Files</div><button className="icon-btn" onClick={() => { const path = newPath.trim(); if (path) { addFile(path); setSelected(path); setNewPath(''); } }} aria-label="Add file" data-testid="button-add-file"><Plus size={15} /></button></div>{state.workingTree.map((file) => <button key={file.path} onClick={() => setSelected(file.path)} style={{ width: '100%', padding: '12px 17px', display: 'flex', alignItems: 'center', gap: 9, textAlign: 'left', background: selected === file.path ? 'hsl(var(--primary) / .08)' : 'transparent', border: 0, borderBottom: '1px solid hsl(var(--border))', color: 'hsl(var(--foreground))' }} data-testid={`button-select-file-${file.path.replaceAll('/', '-')}`}><FileCode2 size={14} color="hsl(var(--primary))" /><span className="mono" style={{ fontSize: 11, flex: 1 }}>{file.path}</span><span className={`badge ${file.status === 'clean' ? 'badge-slate' : file.status === 'staged' ? 'badge-amber' : 'badge-red'}`}>{file.status}</span></button>)}<div style={{ padding: 13, display: 'flex', gap: 7 }}><input className="input" value={newPath} onChange={(event) => setNewPath(event.target.value)} placeholder="new/path.txt" data-testid="input-new-file-path" /></div></div>
      <div className="panel panel-pad"><div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 13 }}><div><div className="panel-kicker">Editor</div><div className="panel-title" style={{ marginTop: 6 }}>{active?.path ?? 'No file selected'}</div></div>{active && <button className={`btn ${state.stagedChanges.includes(active.path) ? 'btn-quiet' : 'btn-primary'}`} onClick={() => toggleStage(active.path)} data-testid="button-stage-file">{state.stagedChanges.includes(active.path) ? <><Check size={14} /> Staged</> : <><Plus size={14} /> Stage file</>}</button>}</div>{active ? <textarea className="textarea" value={active.content} onChange={(event) => updateFile(active.path, event.target.value)} data-testid="textarea-file-editor" /> : <div className="empty-state"><Files size={24} /><div>Select a file to begin.</div></div>}<div style={{ borderTop: '1px solid hsl(var(--border))', marginTop: 16, paddingTop: 16 }}><div className="field"><label>Commit message</label><div style={{ display: 'flex', gap: 8 }}><input className="input" value={message} onChange={(event) => setMessage(event.target.value)} placeholder="Describe the snapshot" data-testid="input-commit-message" /><button className="btn btn-primary" onClick={() => { commitChanges(message); setMessage(''); }} data-testid="button-commit"><GitCommitHorizontal size={14} /> Commit</button></div></div></div></div></div>
    <div className="callout section-gap"><Info size={16} /><div><strong>The three states:</strong> working tree is your local draft, staging is your selection for the next snapshot, and a commit freezes that selection into history.</div></div>
  </>;
}

function ActivityView({ state }: { state: RepositoryState }) {
  const [filter, setFilter] = useState('');
  const entries = state.activityLog.filter((entry) => `${entry.type} ${entry.message}`.toLowerCase().includes(filter.toLowerCase()));
  return <><Header eyebrow="Observable operations" title="Every move leaves a trace." subtitle="Use the activity log to connect an interface action to the repository state it changed." action={<div className="badge badge-teal"><Activity size={12} /> {state.activityLog.length} events</div>} />
    <div className="panel panel-pad"><div style={{ display: 'flex', alignItems: 'center', gap: 9, marginBottom: 13 }}><Search size={15} className="muted" /><input className="input" style={{ maxWidth: 300 }} value={filter} onChange={(event) => setFilter(event.target.value)} placeholder="Filter operations" data-testid="input-filter-activity" /></div>{entries.length ? entries.map((entry) => <div className="table-row" key={entry.id}><div style={{ display: 'flex', alignItems: 'center', gap: 10 }}><span className="badge badge-teal">{entry.type}</span><span style={{ fontSize: 12 }}>{entry.message}</span></div><span className="muted mono" style={{ fontSize: 10 }}>{formatTime(entry.timestamp)}</span><span /><span /></div>) : <div className="empty-state"><Activity size={23} /><div>No matching operations.</div></div>}</div></>;
}

function DSA() {
  const concepts = [
    ['Commit graph', 'Directed acyclic graph', 'Each commit is a node. Parent links point backward, making history traversable without cycles.', 'O(V + E) to walk history'],
    ['Branch', 'Pointer / reference', 'A branch is a movable label attached to a commit, not a duplicate folder of files.', 'O(1) to create or move'],
    ['Snapshot', 'Persistent map', 'A commit maps file paths to content. Previous versions remain available for comparison.', 'O(F) to materialize'],
    ['Diff', 'Sequence comparison', 'Compare two snapshots to find added, removed, and changed lines.', 'O(n + m) with LCS'],
    ['Merge', 'Graph reconciliation', 'Find a common ancestor, then combine two descendant snapshots into one history.', 'O(V + E + F)'],
    ['HEAD', 'Indirection', 'HEAD points to the current branch, which points to the current commit.', 'O(1) lookup'],
  ];
  return <><Header eyebrow="The ideas underneath" title="DSA concepts, made visible." subtitle="Git is a practical composition of familiar data structures and algorithms. Click any card to connect the model to the operation." action={<span className="badge badge-amber"><Terminal size={12} /> under the hood</span>} /><div className="three-col">{concepts.map(([title, kind, description, complexity], index) => <div className="panel panel-pad" key={title}><div style={{ display: 'flex', justifyContent: 'space-between' }}><span className="step-num">{String(index + 1).padStart(2, '0')}</span><span className="badge badge-slate">{kind}</span></div><h2 style={{ fontSize: 16, margin: '17px 0 8px', letterSpacing: '-.035em' }}>{title}</h2><p className="muted" style={{ fontSize: 12, lineHeight: 1.65, minHeight: 61 }}>{description}</p><div style={{ borderTop: '1px solid hsl(var(--border))', paddingTop: 12, marginTop: 15 }}><span className="panel-kicker">Complexity</span><div className="mono" style={{ color: 'hsl(var(--primary))', fontSize: 11, marginTop: 5 }}>{complexity}</div></div></div>)}</div><div className="callout section-gap"><Lightbulb size={16} /><div><strong>Why this matters:</strong> understanding the pointers and snapshots turns Git commands from incantations into predictable state transitions.</div></div></>;
}

function Learn({ state, setState, notify }: { state: RepositoryState; setState: React.Dispatch<React.SetStateAction<RepositoryState>>; notify: (message: string) => void }) {
  const lessons = [
    { title: 'Read a repository', body: 'Identify the current branch, HEAD commit, and working tree before changing anything.', icon: Network },
    { title: 'Make a snapshot', body: 'Edit a file, stage the precise change, and commit it with a message that explains why.', icon: GitCommitHorizontal },
    { title: 'Branch with intent', body: 'Create a pointer for a safe experiment, then checkout to move your working context.', icon: GitBranch },
    { title: 'Compare and merge', body: 'Inspect two snapshots, resolve a disagreement, and record the combined history.', icon: GitMerge },
  ];
  const [step, setStep] = useState(0);
  const complete = () => { setState((current) => ({ ...current, activityLog: [ { id: id(), type: 'learn', message: `Completed “${lessons[step].title}”`, timestamp: now() }, ...current.activityLog ] })); notify('Lesson step completed'); setStep(Math.min(step + 1, lessons.length - 1)); };
  const LessonIcon = lessons[step].icon;
  return <><Header eyebrow="Guided practice" title="Learn by operating the model." subtitle="A short path through the core loop. You can leave the lesson at any time and explore the full workspace." action={<span className="badge badge-teal"><BookOpen size={12} /> step {step + 1} of {lessons.length}</span>} />
    <div className="two-col"><div className="panel panel-pad"><div style={{ display: 'flex', gap: 14, alignItems: 'flex-start' }}><div className="brand-mark" style={{ background: 'hsl(var(--primary) / .1)' }}><LessonIcon size={17} /></div><div><div className="panel-kicker">Current lesson</div><h2 style={{ margin: '8px 0 7px', fontSize: 22, letterSpacing: '-.045em' }}>{lessons[step].title}</h2><p className="muted" style={{ fontSize: 13, lineHeight: 1.7 }}>{lessons[step].body}</p></div></div><button className="btn btn-primary" style={{ marginTop: 25 }} onClick={complete} data-testid="button-complete-lesson">{step === lessons.length - 1 ? <CheckCircle2 size={14} /> : <Check size={14} />} {step === lessons.length - 1 ? 'Complete path' : 'Mark step complete'} <ArrowRight size={13} /></button></div><div className="panel panel-pad"><div className="panel-kicker">Learning path</div>{lessons.map((lesson, index) => <button key={lesson.title} onClick={() => setStep(index)} style={{ width: '100%', display: 'flex', alignItems: 'center', gap: 11, padding: '13px 0', border: 0, borderBottom: index < lessons.length - 1 ? '1px solid hsl(var(--border))' : 0, background: 'transparent', textAlign: 'left', color: 'hsl(var(--foreground))' }} data-testid={`button-learn-step-${index + 1}`}><span className={`step-num ${index < step ? '' : ''}`} style={{ background: index < step ? 'hsl(var(--primary) / .16)' : index === step ? 'hsl(var(--primary))' : 'hsl(var(--muted))', color: index < step ? 'hsl(var(--primary))' : index === step ? 'hsl(var(--primary-foreground))' : 'hsl(var(--muted-foreground))' }}>{index < step ? <Check size={13} /> : index + 1}</span><span style={{ flex: 1, fontSize: 12, fontWeight: 700 }}>{lesson.title}</span>{index === step && <ChevronRight size={14} color="hsl(var(--primary))" />}</button>)}</div></div><div className="callout section-gap"><Lightbulb size={16} /><div>You have {state.commits.length} snapshots available to inspect while learning. The best lesson is a reversible experiment.</div></div></>;
}

function Settings({ dark, setDark, reset, exportState, importState, fileImportRef }: { dark: boolean; setDark: (value: boolean) => void; reset: () => void; exportState: () => void; importState: (event: React.ChangeEvent<HTMLInputElement>) => void; fileImportRef: React.RefObject<HTMLInputElement | null> }) {
  return <><Header eyebrow="Control the lab" title="Settings & export." subtitle="Keep the simulator local, choose your reading environment, or take a repository scenario with you as JSON." /><div className="two-col"><div className="panel panel-pad"><div className="panel-kicker">Appearance</div><div className="table-row" style={{ marginTop: 9 }}><div style={{ display: 'flex', alignItems: 'center', gap: 10 }}><span className="brand-mark" style={{ width: 29, height: 29, background: 'hsl(var(--primary) / .1)' }}>{dark ? <Moon size={14} /> : <Sun size={14} />}</span><div><div style={{ fontWeight: 700, fontSize: 12 }}>Reading theme</div><div className="muted" style={{ fontSize: 10, marginTop: 3 }}>{dark ? 'Deep workspace' : 'Warm paper'}</div></div></div><button className="btn btn-quiet" onClick={() => setDark(!dark)} data-testid="button-settings-theme">{dark ? 'Use light' : 'Use dark'}</button><span /><span /></div></div><div className="panel panel-pad"><div className="panel-kicker">About this simulator</div><div className="panel-title" style={{ marginTop: 8 }}>A safe place to be wrong.</div><p className="muted" style={{ fontSize: 12, lineHeight: 1.65, marginTop: 10 }}>GitFlowX is browser-only and educational. It never connects to a remote Git server or changes files on your device.</p></div></div><div className="panel panel-pad section-gap"><div className="panel-kicker">Repository data</div><div style={{ display: 'flex', flexWrap: 'wrap', gap: 9, marginTop: 16 }}><button className="btn btn-primary" onClick={exportState} data-testid="button-export-json"><Download size={14} /> Export JSON</button><button className="btn btn-quiet" onClick={() => fileImportRef.current?.click()} data-testid="button-import-json"><Upload size={14} /> Import JSON</button><input ref={fileImportRef} type="file" accept="application/json" onChange={importState} style={{ display: 'none' }} data-testid="input-import-json" /><button className="btn btn-danger" onClick={() => { if (window.confirm('Reset this repository to the starter scenario?')) reset(); }} data-testid="button-reset-repository"><RotateCcw size={14} /> Reset starter scenario</button></div><div className="callout" style={{ marginTop: 18 }}><Info size={16} /><div>Exports include commits, branches, working files, and activity. It is a complete local snapshot you can re-import later.</div></div></div></>;
}

function App() {
  return <QueryClientProvider client={new QueryClient()}><TooltipProvider><WouterRouter base={import.meta.env.BASE_URL.replace(/\/$/, '')}><ErrorBoundary resetKey="gitflowx"><Route path="/:rest*"><AppShell /></Route><Route path="/"><AppShell /></Route></ErrorBoundary></WouterRouter><Toaster /></TooltipProvider></QueryClientProvider>;
}

export default App;