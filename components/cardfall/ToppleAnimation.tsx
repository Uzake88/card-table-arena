'use client';

import { useEffect, useState } from 'react';
import type { Card } from '../../lib/cards/deck';
import type { LastTopple } from '../../lib/games/cardfall/engine';

type ToppleAnimationProps = { lastTopple?: LastTopple; cards: Card[] };

export function ToppleAnimation({ lastTopple, cards }: ToppleAnimationProps) {
  const [visible, setVisible] = useState(false);
  const [sequence, setSequence] = useState(0);
  useEffect(() => {
    if (!lastTopple?.sequence || lastTopple.sequence === sequence) return;
    setSequence(lastTopple.sequence);
    setVisible(true);
    const timeout = window.setTimeout(() => setVisible(false), 1200);
    return () => window.clearTimeout(timeout);
  }, [lastTopple?.sequence, sequence]);

  const card = lastTopple ? cards.find((item) => item.id === lastTopple.cardId) : undefined;
  const label = card ? `${card.rank}${card.suit}` : 'A card';
  return (
    <>
      <div className="topple-live-region" aria-live="polite">{lastTopple?.sequence ? `${label} was toppled from the table.` : ''}</div>
      {visible && card && <div className="topple-animation-layer" data-testid="topple-animation" aria-hidden="true"><div className={`topple-flight ${card.suit === '♥' || card.suit === '♦' ? 'red' : ''}`}><small>{card.rank}</small><strong>{card.suit}</strong></div><div className="topple-impact" /></div>}
    </>
  );
}
