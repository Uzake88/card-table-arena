'use client';

import { useEffect, useRef } from 'react';
import type { Player } from '../../lib/games/cardfall/engine';
import type { NotebookNote } from '../../lib/games/cardfall/notebook';

type NotebookPanelProps = {
  open: boolean;
  notes: NotebookNote[];
  players: Player[];
  onClose: () => void;
  onToggle: (noteId: string) => void;
  onAnnotationChange: (noteId: string, annotation: string) => void;
  onClear: () => void;
};

function playerName(players: Player[], targetId: string) {
  return players.find((player) => player.id === targetId)?.name ?? targetId;
}

export function NotebookPanel({
  open,
  notes,
  players,
  onClose,
  onToggle,
  onAnnotationChange,
  onClear,
}: NotebookPanelProps) {
  const dialogRef = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    if (open && !dialog.open) dialog.showModal();
    if (!open && dialog.open) dialog.close();
  }, [open]);

  return (
    <dialog ref={dialogRef} className="notebook-dialog" aria-labelledby="notebook-title" onClose={onClose}>
      <div className="notebook-head">
        <div><span className="panel-kicker">PRIVATE · ONLY YOU CAN SEE THIS</span><h2 id="notebook-title">Deduction notebook</h2></div>
        <button className="dialog-close" type="button" aria-label="Close deduction notebook" onClick={onClose}>×</button>
      </div>
      <p className="notebook-copy">Questions you asked, answers you received, and your own annotations.</p>
      <div className="notebook-list">
        {notes.length ? notes.map((note) => (
          <div className={`notebook-note ${note.crossedOut ? 'crossed-out' : ''}`} key={note.id} data-note-id={note.id}>
            <div className="notebook-note-head">
              <span className="notebook-target">{playerName(players, note.targetId)}</span>
              <span className={`notebook-answer ${note.answer === undefined ? 'pending' : note.answer ? 'yes' : 'no'}`}>
                {note.answer === undefined ? 'PENDING' : note.answer ? 'YES' : 'NO'}
              </span>
            </div>
            <p className="notebook-question">{note.question}</p>
            <div className="notebook-controls">
              <label className="notebook-cross">
                <input type="checkbox" checked={note.crossedOut} onChange={() => onToggle(note.id)} />
                Cross out
              </label>
              <input
                className="notebook-annotation"
                value={note.annotation}
                onChange={(event) => onAnnotationChange(note.id, event.target.value)}
                placeholder="Add a private note"
                maxLength={200}
              />
            </div>
          </div>
        )) : <p className="notebook-empty">No questions yet. Ask a player about their hidden cards and your notebook will keep track.</p>}
      </div>
      <div className="notebook-actions">
        <button className="secondary" type="button" onClick={onClear} disabled={!notes.length}>Clear notebook</button>
      </div>
    </dialog>
  );
}
