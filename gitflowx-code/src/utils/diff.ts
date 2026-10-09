import type { DiffLine, FileDiff, FileMap } from '@/types/repository';

function lineDiff(a: string, b: string): DiffLine[] {
  const left = a.split('\n');
  const right = b.split('\n');
  const lines: DiffLine[] = [];
  const max = Math.max(left.length, right.length);
  for (let index = 0; index < max; index += 1) {
    const oldLine = left[index];
    const newLine = right[index];
    if (oldLine === newLine) lines.push({ type: 'unchanged', text: oldLine ?? '', lineA: index + 1, lineB: index + 1 });
    else {
      if (oldLine !== undefined) lines.push({ type: 'removed', text: oldLine, lineA: index + 1 });
      if (newLine !== undefined) lines.push({ type: 'added', text: newLine, lineB: index + 1 });
    }
  }
  return lines;
}

export function compareSnapshots(first: FileMap, second: FileMap): FileDiff[] {
  return [...new Set([...Object.keys(first), ...Object.keys(second)])].sort().map((path) => {
    const inFirst = path in first;
    const inSecond = path in second;
    if (!inFirst) return { path, status: 'added', lines: lineDiff('', second[path]) };
    if (!inSecond) return { path, status: 'removed', lines: lineDiff(first[path], '') };
    const lines = lineDiff(first[path], second[path]);
    return { path, status: lines.some((line) => line.type !== 'unchanged') ? 'modified' : 'unchanged', lines };
  });
}
