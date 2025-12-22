import { useState, useEffect, useRef } from 'react';

const Typewriter = ({ text, speed = 5 }: { text: string; speed?: number }) => {
  const [displayed, setDisplayed] = useState('');
  const indexRef = useRef(0);
  const timerRef = useRef<number | null>(null);

  useEffect(() => {
    // If text is totally new (not an extension), reset
    if (!text.startsWith(displayed) && displayed !== '') {
      setDisplayed('');
      indexRef.current = 0;
    }
  }, [text]);

  useEffect(() => {
    if (timerRef.current != null) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }

    const total = text.length;
    if (indexRef.current >= total) return;

    const tick = () => {
      const current = indexRef.current;
      const remaining = total - current;
      if (remaining <= 0) return;

      // Jump in larger steps if we're far behind (streaming fast).
      const step = remaining > 120 ? 12 : remaining > 40 ? 4 : remaining > 10 ? 2 : 1;
      const nextIndex = Math.min(total, current + step);
      indexRef.current = nextIndex;
      setDisplayed(text.slice(0, nextIndex));

      const nextRemaining = total - nextIndex;
      const delay = nextRemaining > 5 ? 0 : speed;
      timerRef.current = window.setTimeout(tick, delay);
    };

    timerRef.current = window.setTimeout(tick, speed);

    return () => {
      if (timerRef.current != null) {
        clearTimeout(timerRef.current);
        timerRef.current = null;
      }
    };
  }, [text, speed]);

  return <span>{displayed}</span>;
};

export default Typewriter;
