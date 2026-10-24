import type { Note, NoteCommitment, NoteCommitmentUpdate } from '@noteleaf/shared-types';

/**
 * Attach an owner and a deadline to an existing note.
 * A note the user already edited is left alone.
 * Returns the same array when nothing changes.
 */
export function applyNoteCommitments(notes: Note[], updates: NoteCommitmentUpdate[]): Note[] {
  if (updates.length === 0) return notes;

  const byId = new Map(updates.map((update) => [update.id, update]));
  let changed = false;

  const next = notes.map((note) => {
    if (note.isUserEdited) return note;
    const update = byId.get(note.id);
    if (!update) return note;
    const commitment: NoteCommitment = { owner: update.owner, deadline: update.deadline };
    if (note.commitment?.owner === commitment.owner && note.commitment?.deadline === commitment.deadline) {
      return note;
    }
    changed = true;
    return { ...note, commitment };
  });

  return changed ? next : notes;
}
