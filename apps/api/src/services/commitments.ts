export interface NoteCommitmentUpdate {
  id: string;
  owner: string | null;
  deadline: string | null;
}

function named(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  if (!trimmed || trimmed.length > 80) return null;
  if (/^(null|none|n\/a|unknown|not mentioned|not specified)$/i.test(trimmed)) return null;
  return trimmed;
}

/** Read task owners and deadlines from a recap. Unknown ids are ignored. */
export function parseCommitments(value: unknown): NoteCommitmentUpdate[] {
  if (typeof value !== 'object' || value === null) return [];
  const raw = (value as { commitments?: unknown }).commitments;
  if (!Array.isArray(raw)) return [];

  const seen = new Set<string>();
  const commitments: NoteCommitmentUpdate[] = [];

  for (const item of raw) {
    if (typeof item !== 'object' || item === null) continue;
    const id = (item as { id?: unknown }).id;
    if (typeof id !== 'string' || id.length === 0 || seen.has(id)) continue;
    seen.add(id);
    const record = item as { owner?: unknown; deadline?: unknown };
    commitments.push({
      id,
      owner: named(record.owner),
      deadline: named(record.deadline),
    });
  }

  return commitments;
}
