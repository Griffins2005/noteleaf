const NOTE_TYPES = new Set(['action', 'decision', 'insight', 'summary']);

export interface NoteTypeCorrection {
  id: string;
  type: 'action' | 'decision' | 'insight' | 'summary';
}

/** Read category fixes from a recap JSON object. Unknown ids and types are ignored. */
export function parseNoteCorrections(value: unknown): NoteTypeCorrection[] {
  if (typeof value !== 'object' || value === null) return [];
  const raw = (value as { noteTypes?: unknown }).noteTypes;
  if (!Array.isArray(raw)) return [];

  const seen = new Set<string>();
  const corrections: NoteTypeCorrection[] = [];

  for (const item of raw) {
    if (typeof item !== 'object' || item === null) continue;
    const id = (item as { id?: unknown }).id;
    const type = (item as { type?: unknown }).type;
    if (typeof id !== 'string' || id.length === 0 || seen.has(id)) continue;
    if (typeof type !== 'string' || !NOTE_TYPES.has(type)) continue;
    seen.add(id);
    corrections.push({ id, type: type as NoteTypeCorrection['type'] });
  }

  return corrections;
}
