/**
 * Extract predicted answers from model responses to spatial reasoning tasks
 */

export function extractSpatialAnswer(
  response: string,
  taskFormat: 'free_text' | 'direction' | 'entity' | 'description'
): string {
  const cleaned = response.trim();

  if (taskFormat === 'direction') {
    const found = extractDirectionSequence(cleaned);
    if (found.length > 0) {
      return found.join(', ');
    }
  }

  if (taskFormat === 'entity') {
    const lower = cleaned.toLowerCase();
    if (/\byes\b/.test(lower)) return 'yes';
    if (/\bno\b/.test(lower)) return 'no';

    // For entity answers, extract noun phrases or color names
    const colors = ['red', 'blue', 'green', 'yellow', 'white', 'black', 'pink', 'orange', 'purple'];
    const colorMatch = colors.find(c => lower.includes(c));
    if (colorMatch) return colorMatch;

    // Extract capitalized words (likely proper nouns)
    const nounMatch = cleaned.match(/\b[A-Z][a-z]+\b/g);
    if (nounMatch && nounMatch.length > 0) return nounMatch[0].toLowerCase();
  }

  if (taskFormat === 'description') {
    // For descriptions, return last complete sentence
    const sentences = cleaned.split(/[.!?]+/).filter(s => s.trim().length > 0);
    if (sentences.length > 0) {
      return sentences[sentences.length - 1].trim().toLowerCase();
    }
  }

  // Default: return last 20 words
  const words = cleaned.split(/\s+/);
  return words.slice(Math.max(0, words.length - 20)).join(' ').toLowerCase();
}

export function extractCardinals(text: string): string[] {
  return extractDirectionSequence(text).filter((direction) =>
    ['northeast', 'northwest', 'southeast', 'southwest', 'north', 'south', 'east', 'west', 'n', 's', 'e', 'w'].includes(direction)
  );
}

export function extractDirectionSequence(text: string): string[] {
  const normalized = text
    .toLowerCase()
    .replace(/\bnorth[\s-]+east\b/g, 'northeast')
    .replace(/\bnorth[\s-]+west\b/g, 'northwest')
    .replace(/\bsouth[\s-]+east\b/g, 'southeast')
    .replace(/\bsouth[\s-]+west\b/g, 'southwest');
  const pattern = /\b(northeast|northwest|southeast|southwest|north|south|east|west|left|right|up|down|forward|backward|n|s|e|w)\b/g;
  return Array.from(normalized.matchAll(pattern), (match) => match[1]);
}

export function extractKeywords(text: string): string[] {
  // Extract multi-word phrases and longer words
  const words = text.toLowerCase().split(/\s+/).filter(w => w.length > 3);
  const phrases = text.match(/\b[a-z]+\s+[a-z]+\b/gi) || [];
  return [...new Set([...words, ...(phrases.map(p => p.toLowerCase()) || [])])];
}
