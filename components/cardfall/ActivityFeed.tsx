'use client';

import { useEffect, useRef, useState } from 'react';
import type { CardfallEvent } from '../../lib/games/cardfall/events';

type ActivityFeedProps = { events: CardfallEvent[] };

export function ActivityFeed({ events }: ActivityFeedProps) {
  const feedRef = useRef<HTMLDivElement>(null);
  const wasAtBottom = useRef(true);
  const [newActivity, setNewActivity] = useState(false);
  const visibleEvents = events.slice(-200);

  useEffect(() => {
    const feed = feedRef.current;
    if (!feed) return;
    if (wasAtBottom.current && feed.scrollTop > 0) {
      feed.scrollTop = feed.scrollHeight;
    } else if (visibleEvents.length && (!wasAtBottom.current || feed.scrollTop === 0)) {
      setNewActivity(true);
    }
  }, [visibleEvents.length]);

  const onScroll = () => {
    const feed = feedRef.current;
    if (!feed) return;
    const atBottom = feed.scrollHeight - feed.scrollTop - feed.clientHeight < 24;
    wasAtBottom.current = atBottom;
    if (atBottom) setNewActivity(false);
  };

  const jumpToLatest = () => {
    const feed = feedRef.current;
    if (!feed) return;
    feed.scrollTo({ top: feed.scrollHeight, behavior: 'smooth' });
    wasAtBottom.current = true;
    setNewActivity(false);
  };

  return (
    <div className="activity-feed-wrap">
      <div ref={feedRef} className="activity-feed" role="log" aria-live="off" aria-label="Table activity" onScroll={onScroll}>
        {visibleEvents.map((event) => <div className={`activity-line ${event.tone || ''}`} key={event.id}><span className="activity-dot" /><span>{event.text}</span></div>)}
        {!visibleEvents.length && <p className="activity-empty">Questions, answers, guesses, and messages will appear here for everyone.</p>}
      </div>
      {newActivity && <button className="jump-latest" type="button" onClick={jumpToLatest}>Jump to latest</button>}
    </div>
  );
}
