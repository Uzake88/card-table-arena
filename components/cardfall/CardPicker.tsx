'use client';

import { useEffect, useMemo, useState } from 'react';
import { allCardOptions, type Rank, type Suit } from '../../lib/cards/card-picker';
import { RANKS, SUITS } from '../../lib/cards/deck';

export type CardPickerTarget = {
  id: string;
  name: string;
  handCount?: number;
};

type CardPickerProps = {
  targets: CardPickerTarget[];
  targetId: string;
  onTargetChange: (targetId: string) => void;
  onConfirm: (targetId: string, cardId: string) => void;
  resetKey?: number;
  disabled?: boolean;
};

const SUIT_NAMES: Record<Suit, string> = {
  '♠': 'spades',
  '♥': 'hearts',
  '♦': 'diamonds',
  '♣': 'clubs',
};

function suitName(suit: Suit) {
  return SUIT_NAMES[suit];
}

export function CardPicker({
  targets,
  targetId,
  onTargetChange,
  onConfirm,
  resetKey = 0,
  disabled = false,
}: CardPickerProps) {
  const cards = useMemo(() => allCardOptions(), []);
  const [selectedCardId, setSelectedCardId] = useState('');
  const [selectedSuit, setSelectedSuit] = useState<Suit | null>(null);
  const [selectedRank, setSelectedRank] = useState<Rank | null>(null);
  const selectedCard = cards.find((card) => card.id === selectedCardId);
  const selectedTarget = targets.find((target) => target.id === targetId);

  useEffect(() => {
    setSelectedCardId('');
    setSelectedSuit(null);
    setSelectedRank(null);
  }, [resetKey]);

  const chooseSuit = (suit: Suit) => {
    setSelectedSuit(suit);
  };

  const chooseRank = (rank: Rank) => {
    setSelectedRank(rank);
  };

  const chooseCard = (cardId: string, suit: Suit, rank: Rank) => {
    setSelectedCardId(cardId);
    setSelectedSuit(suit);
    setSelectedRank(rank);
  };

  return (
    <div className="card-picker" aria-label="Card guess picker">
      <div className="picker-section">
        <span className="picker-label">GUESS IN</span>
        <div className="player-chips" role="group" aria-label="Choose a player to guess from">
          {targets.map((target) => (
            <button
              className={`player-chip ${target.id === targetId ? 'selected' : ''}`}
              key={target.id}
              type="button"
              aria-label={`Select ${target.name} as guess target`}
              aria-pressed={target.id === targetId}
              disabled={disabled}
              onClick={() => onTargetChange(target.id)}
            >
              <span>{target.name}</span>
              {target.handCount !== undefined && <small>{target.handCount} cards</small>}
            </button>
          ))}
        </div>
      </div>

      <div className="picker-section">
        <span className="picker-label">SUIT</span>
        <div className="suit-picker" role="group" aria-label="Choose a suit">
          {SUITS.map((suit) => (
            <button
              className={`suit-button ${suit === '♥' || suit === '♦' ? 'red' : ''} ${selectedSuit === suit ? 'selected' : ''}`}
              key={suit}
              type="button"
              aria-label={`Select ${suitName(suit)}`}
              aria-pressed={selectedSuit === suit}
              disabled={disabled}
              onClick={() => chooseSuit(suit)}
            >
              <span aria-hidden="true">{suit}</span>
              <small>{suitName(suit)}</small>
            </button>
          ))}
        </div>
      </div>

      <div className="picker-section">
        <span className="picker-label">RANK</span>
        <div className="rank-picker" role="group" aria-label="Choose a rank">
          {RANKS.map((rank) => (
            <button
              className={`rank-button ${selectedRank === rank ? 'selected' : ''}`}
              key={rank}
              type="button"
              aria-label={`Select rank ${rank}`}
              aria-pressed={selectedRank === rank}
              disabled={disabled}
              onClick={() => chooseRank(rank)}
            >
              {rank}
            </button>
          ))}
        </div>
      </div>

      <div className="picker-section">
        <div className="picker-label-row">
          <span className="picker-label">CHOOSE A CARD</span>
          <span className="picker-count">52 cards</span>
        </div>
        <div className="card-picker-grid" role="group" aria-label="Choose a card">
          {cards.map((card) => (
            <button
              className={`picker-card ${card.suit === '♥' || card.suit === '♦' ? 'red' : ''} ${selectedSuit === card.suit ? 'suit-match' : ''} ${selectedCardId === card.id ? 'selected' : ''}`}
              key={card.id}
              type="button"
              aria-label={`${card.rank} of ${suitName(card.suit)}`}
              aria-pressed={selectedCardId === card.id}
              disabled={disabled}
              onClick={() => chooseCard(card.id, card.suit, card.rank)}
            >
              <span>{card.rank}</span>
              <strong aria-hidden="true">{card.suit}</strong>
            </button>
          ))}
        </div>
      </div>

      <div className="picker-footer">
        <p className="guess-preview" aria-live="polite">
          {selectedCard
            ? `Guessing: ${selectedCard.id} in ${selectedTarget?.name ?? 'selected player'}’s hand`
            : 'Choose a suit and card to preview your guess.'}
        </p>
        <button
          className="primary card-picker-confirm"
          type="button"
          aria-label="Confirm guess"
          disabled={disabled || !selectedCardId || !targetId}
          onClick={() => onConfirm(targetId, selectedCardId)}
        >
          Confirm guess <span>↗</span>
        </button>
      </div>
    </div>
  );
}
