// Word-by-word search.
//
// The old search looked for the whole typed text as one piece, so
// "C2 Solo Lemon" never found "C2 Green Tea Solo Lemon". Now the text is split
// into words and a row matches when EVERY word appears somewhere in it (in any
// of the given columns, in any order). Case doesn't matter.

/** Split a search box into words, dropping characters that would break the
 *  database filter syntax (commas, brackets, quotes, wildcards). */
export function searchWords(text: string): string[] {
  return text
    .replace(/[,()"\\%_*]/g, ' ')
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 8)
}

/**
 * PostgREST filter for `.or(...)`: every word must match at least one column.
 * Returns null when there's nothing to search for.
 *
 *   .or(wordsFilter('c2 solo lemon', ['name', 'barcode']))
 *   -> and(or(name.ilike.*c2*,barcode.ilike.*c2*),or(name.ilike.*solo*,...),...)
 */
export function wordsFilter(text: string, columns: string[]): string | null {
  const words = searchWords(text)
  if (words.length === 0) return null
  const perWord = words.map(w => `or(${columns.map(c => `${c}.ilike.*${w}*`).join(',')})`)
  return `and(${perWord.join(',')})`
}
