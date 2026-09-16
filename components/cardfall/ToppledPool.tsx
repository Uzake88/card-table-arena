'use client';

import { useEffect, useRef } from 'react';
import type { Card } from '../../lib/cards/deck';

function cardLabel(card: Card) {
  return card.id === 'hidden' ? 'Hidden card' : `${card.rank}${card.suit}`;
}

type ToppledPoolProps = { cards: Card[] };

export function ToppledPool({ cards }: ToppledPoolProps) {
  const dialogRef = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    const close = () => { if (dialog.open) dialog.close(); };
    dialog.addEventListener('cancel', close);
    return () => dialog.removeEventListener('cancel', close);
  }, []);

  return (
    <div className="toppled-pool-wrap">
      <button
        className="toppled-pool-button"
        type="button"
        aria-label="Open toppled cards"
        onClick={() => dialogRef.current?.showModal()}
      >
        <span className="toppled-pool-mark" aria-hidden="true">✦</span>
        <span><strong>TOPPLED PILE</strong><small>{cards.length} {cards.length === 1 ? 'card' : 'cards'} resolved</small></span>
      </button>
      <dialog ref={dialogRef} className="toppled-dialog" aria-labelledby="toppled-dialog-title">
        <div className="toppled-dialog-head">
          <div><span className="panel-kicker">PUBLIC TABLE HISTORY</span><h2 id="toppled-dialog-title">Toppled cards</h2></div>
          <button className="dialog-close" type="button" aria-label="Close toppled cards" onClick={() => dialogRef.current?.close()}>×</button>
        </div>
        <p className="toppled-dialog-copy">These cards were correctly guessed and are now public.</p>
        <div className="toppled-dialog-grid">
          {cards.length ? cards.map((card) => <div className={`toppled-card ${card.suit === '♥' || card.suit === '♦' ? 'red' : ''}`} key={card.id} aria-label={cardLabel(card)}><small>{card.rank}</small><strong>{card.suit}</strong></div>) : <p className="toppled-empty">No cards have toppled yet.</p>}
        </div>
      </dialog>
    </div>
  );
}
