import type { Note, NoteType, NoteTypeCorrection } from '@noteleaf/shared-types';

/**
 * Apply a recap's category fixes to existing notes.
 * A note the user already edited keeps their category.
 * Returns the same array when nothing changes.
 */
export function applyNoteCorrections(notes: Note[], corrections: NoteTypeCorrection[]): Note[] {
  if (corrections.length === 0) return notes;

  const byId = new Map(corrections.map((correction) => [correction.id, correction.type]));
  let changed = false;

  const next = notes.map((note) => {
    if (note.isUserEdited) return note;
    const type: NoteType | undefined = byId.get(note.id);
    if (!type || type === note.type) return note;
    changed = true;
    return { ...note, type };
  });

  return changed ? next : notes;
}
