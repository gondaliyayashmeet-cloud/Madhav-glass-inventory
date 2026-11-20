function tokenize(s: string): string[] {
  return s
    .toLowerCase()
    .replace(/x/g, ' ')
    .split(/[^a-z0-9.]+/)
    .filter(Boolean)
    .flatMap((t) => t.split(/(\d+(?:\.\d+)?)/).filter(Boolean));
}

export interface SearchableItem {
  brand?: string | null;
  size?: string | null;
  color?: string | null;
  glass_type?: string | null;
  category_name?: string | null;
  thickness_mm?: number | string | null;
  sku?: string | null;
  supplier?: string | null;
}

function scoreToken(qt: string, hTokens: string[], hJoined: string): number {
  let best = 0;
  for (const ht of hTokens) {
    if (ht === qt) {
      best = Math.max(best, 100);
    } else if (ht.startsWith(qt)) {
      const lenDiff = ht.length - qt.length;
      const bonus = lenDiff <= 2 ? 95 - lenDiff * 2 : 70;
      best = Math.max(best, bonus);
    } else if (ht.includes(qt)) {
      best = Math.max(best, 60);
    }
  }
  if (best === 0 && hJoined.includes(qt)) best = 30;
  return best;
}

const FIELD_WEIGHTS: { key: keyof SearchableItem; weight: number }[] = [
  { key: 'sku', weight: 1.5 },
  { key: 'size', weight: 1.3 },
  { key: 'color', weight: 1.2 },
  { key: 'thickness_mm', weight: 1.2 },
  { key: 'brand', weight: 1.1 },
  { key: 'glass_type', weight: 1.0 },
  { key: 'category_name', weight: 0.8 },
  { key: 'supplier', weight: 0.7 },
];

export function inventorySearchRank(item: SearchableItem, query: string): number {
  const qTokens = tokenize(query);
  if (qTokens.length === 0) return 1;

  let totalScore = 0;
  for (const qt of qTokens) {
    let bestFieldScore = 0;
    for (const { key, weight } of FIELD_WEIGHTS) {
      const raw = item[key];
      if (raw == null || raw === '') continue;
      const fieldStr = String(raw).trim();
      const hTokens = tokenize(fieldStr);
      const hJoined = hTokens.join(' ');
      const base = scoreToken(qt, hTokens, hJoined);
      if (base > 0) {
        const fieldStr_lower = fieldStr.toLowerCase();
        let score = base * weight;
        if (fieldStr_lower === qt) score += 20;
        else if (fieldStr_lower.startsWith(qt)) score += 10;
        bestFieldScore = Math.max(bestFieldScore, score);
      }
    }
    if (bestFieldScore === 0) return 0;
    totalScore += bestFieldScore;
  }
  return totalScore;
}

export function searchRank(haystack: string, query: string): number {
  const qTokens = tokenize(query);
  if (qTokens.length === 0) return 1;
  const hTokens = tokenize(haystack);
  const hJoined = hTokens.join(' ');
  let score = 0;
  for (const qt of qTokens) {
    const s = scoreToken(qt, hTokens, hJoined);
    if (s === 0) return 0;
    score += s;
  }
  return score;
}

export function fuzzyMatch(haystack: string, query: string): boolean {
  return searchRank(haystack, query) > 0;
}

export function sizeSortKey(size: string | null | undefined): number {
  if (!size) return Infinity;
  const m = String(size).match(/(\d+(?:\.\d+)?)/);
  return m ? parseFloat(m[1]) : Infinity;
}

export function colorSortKey(color: string | null | undefined): number {
  if (!color) return 1;
  const c = color.toLowerCase().trim();
  if (c === 'clear' || c === 'transparent' || c === 'extra clear') return 0;
  return 2;
}

export function thicknessSortKey(mm: number | string | null | undefined): number {
  if (mm == null || mm === '') return Infinity;
  const n = typeof mm === 'string' ? parseFloat(mm) : mm;
  return isNaN(n) ? Infinity : n;
}

export interface InventorySortable {
  thickness_mm?: number | string | null;
  color?: string | null;
  size?: string | null;
}

export function inventorySort(a: InventorySortable, b: InventorySortable): number {
  const tDiff = thicknessSortKey(a.thickness_mm) - thicknessSortKey(b.thickness_mm);
  if (tDiff !== 0) return tDiff;
  const cDiff = colorSortKey(a.color) - colorSortKey(b.color);
  if (cDiff !== 0) return cDiff;
  const ca = (a.color ?? '').trim().toLowerCase();
  const cb = (b.color ?? '').trim().toLowerCase();
  if (ca !== cb) return ca.localeCompare(cb);
  return sizeSortKey(a.size) - sizeSortKey(b.size);
}
