const COMBINING_MARKS = /\p{M}/gu;
const WORD_SEPARATORS = /[^\p{L}\p{N}]+/u;
const MIN_TOKEN_LENGTH = 3;

function tokenize(text: string): Set<string> {
  const tokens = text
    .normalize('NFD')
    .replace(COMBINING_MARKS, '')
    .toLowerCase()
    .split(WORD_SEPARATORS)
    .filter((token) => token.length >= MIN_TOKEN_LENGTH);
  return new Set(tokens);
}

export function similarity(a: string, b: string): number {
  const tokensA = tokenize(a);
  const tokensB = tokenize(b);
  const shared = [...tokensA].filter((token) => tokensB.has(token)).length;
  const total = tokensA.size + tokensB.size - shared;
  return total === 0 ? 0 : shared / total;
}
