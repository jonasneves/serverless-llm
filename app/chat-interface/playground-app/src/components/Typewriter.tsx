import { useState, useEffect, useRef } from 'react';

const Typewriter = ({ text, speed = 5 }: { text: string; speed?: number }) => {
  const [displayed, setDisplayed] = useState('');
  const indexRef = useRef(0);

  useEffect(() => {
    // If text is totally new (not an extension), reset
    if (!text.startsWith(displayed) && displayed !== '') {
      setDisplayed('');
      indexRef.current = 0;
    }
  }, [text]);

  useEffect(() => {
    const total = text.length;
    if (indexRef.current >= total) return;

    const tick = () => {
      if (indexRef.current < total) {
        setDisplayed((prev) => text.slice(0, prev.length + 1));
        indexRef.current++;
        // If we are far behind (streaming fast), speed up
        const lag = total - indexRef.current;
        const dynamicSpeed = lag > 5 ? 0 : speed;
        setTimeout(tick, dynamicSpeed);
      }
    };

    const timer = setTimeout(tick, speed);
    return () => clearTimeout(timer);
  }, [text, speed]);

  return <span>{displayed}</span>;
};

export default Typewriter;
