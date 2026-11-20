import type { Inspection, RecentRecord } from '../types';
const KEY = 'courseaccess.metadata.v1';
export function loadHistory(): RecentRecord[] {
  try {
    const value: unknown = JSON.parse(localStorage.getItem(KEY) || '[]');
    if (!Array.isArray(value)) return [];
    return value.filter((v) => v && typeof v.id === 'string' && typeof v.name === 'string').slice(0, 20) as RecentRecord[];
  } catch { return []; }
}
export function rememberMetadata(report: Inspection): void {
  const record: RecentRecord = { id: report.id, name: report.name, createdAt: report.createdAt, pageCount: report.pageCount, findingCount: report.findings.length };
  localStorage.setItem(KEY, JSON.stringify([record, ...loadHistory()].slice(0, 20)));
}
export function clearHistory(): void { localStorage.removeItem(KEY); }
