'use client';

import { useState } from 'react';

type BetPanelProps = {
  gameId: string;
  chips: number;
  minBet?: number;
  onBet: (amount: number) => void;
  disabled?: boolean;
};

export function BetPanel({ gameId, chips, minBet = 10, onBet, disabled }: BetPanelProps) {
  const [amount, setAmount] = useState(minBet);
  const effectiveMin = Math.max(1, minBet);
  const clamped = Math.min(Math.max(amount, effectiveMin), chips);

  if (chips <= 0) return null;

  return (
    <div className="bet-panel" data-testid="bet-panel">
      <div className="bet-panel-label">
        <span className="panel-kicker">PLACE YOUR BET</span>
        <p>{gameId === 'holdem' ? `Minimum ${effectiveMin} chips to enter the hand.` : `Wager up to ${chips} chips.`}</p>
      </div>
      <div className="bet-controls">
        <input
          type="number"
          aria-label="Bet amount in chips"
          value={clamped}
          min={effectiveMin}
          max={chips}
          onChange={(event) => setAmount(Number(event.target.value))}
          disabled={disabled}
        />
        <div className="bet-quick">
          {[effectiveMin, Math.ceil(chips / 2), chips]
            .filter((value, index, array) => value >= effectiveMin && value <= chips && array.indexOf(value) === index)
            .slice(0, 3)
            .map((value) => (
              <button key={value} type="button" className="secondary small" disabled={disabled} onClick={() => setAmount(value)}>
                {value === chips ? 'All in' : `${value}`}
              </button>
            ))}
        </div>
        <button
          className="primary"
          type="button"
          disabled={disabled || clamped < effectiveMin || clamped > chips}
          onClick={() => onBet(clamped)}
        >
          Place bet
        </button>
      </div>
      <small className="bet-hint">Chips: {chips}</small>
    </div>
  );
}
