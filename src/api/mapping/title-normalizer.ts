/**
 * TAZE API — Title Normalizer & Fuzzy Matching Algorithm
 * Provides clean title normalization, synonym generation, and confidence scoring.
 */

export class TitleNormalizer {
  /**
   * Normalizes an anime title for comparison:
   * - Lowercase and trim
   * - Strip bracketed tags: [1080p], (Dub), (TV), [Batch]
   * - Normalize season tags: "2nd Season" -> "season 2", "S2" -> "season 2"
   * - Remove punctuation and special symbols
   * - Collapse multiple whitespaces
   */
  public static normalize(title: string): string {
    if (!title) return '';

    let clean = title.toLowerCase();

    // Remove noise in brackets like [TV], (Dub), (Sub), [Uncensored], (BD)
    clean = clean.replace(/\[(?:tv|bd|dvd|dub|sub|batch|uncensored|dual audio)\]/gi, ' ');
    clean = clean.replace(/\((?:tv|bd|dvd|dub|sub|batch|uncensored|dual audio)\)/gi, ' ');
    clean = clean.replace(/\[[^\]]{1,10}\]/g, ' '); // Short square brackets

    // Standardize season and part notations
    clean = clean.replace(/\b(\d+)(?:st|nd|rd|th)\s+season\b/gi, 'season $1');
    clean = clean.replace(/\bseason\s*(\d+)\b/gi, 'season $1');
    clean = clean.replace(/\bs(\d+)\b/gi, 'season $1');
    clean = clean.replace(/\bpart\s*(\d+)\b/gi, 'part $1');
    clean = clean.replace(/\bcour\s*(\d+)\b/gi, 'cour $1');

    // Roman numeral conversion for seasons (e.g. "ii" -> "2", "iii" -> "3", "iv" -> "4")
    clean = clean.replace(/\bii\b/g, '2');
    clean = clean.replace(/\biii\b/g, '3');
    clean = clean.replace(/\biv\b/g, '4');
    clean = clean.replace(/\bv\b/g, '5');

    // Strip apostrophes without spaces (e.g. journey's -> journeys)
    clean = clean.replace(/['’`]/g, '');

    // Strip remaining punctuation except letters, digits, and spaces
    clean = clean.replace(/[:\-–—_!?,."/\\|#$@%^&*()+~]/g, ' ');

    // Normalize spacing
    clean = clean.replace(/\s+/g, ' ').trim();

    return clean;
  }

  /**
   * Calculate Sorensen-Dice coefficient between two strings (0.0 to 1.0)
   * Bigram similarity is well-suited for anime title matching.
   */
  public static diceCoefficient(str1: string, str2: string): number {
    const s1 = this.normalize(str1);
    const s2 = this.normalize(str2);

    if (s1 === s2) return 1.0;
    if (s1.length < 2 || s2.length < 2) return 0.0;

    const getBigrams = (str: string): Map<string, number> => {
      const bigrams = new Map<string, number>();
      for (let i = 0; i < str.length - 1; i++) {
        const bigram = str.substring(i, i + 2);
        bigrams.set(bigram, (bigrams.get(bigram) || 0) + 1);
      }
      return bigrams;
    };

    const bigrams1 = getBigrams(s1);
    const bigrams2 = getBigrams(s2);

    let intersectionSize = 0;
    for (const [bigram, count1] of bigrams1.entries()) {
      const count2 = bigrams2.get(bigram);
      if (count2) {
        intersectionSize += Math.min(count1, count2);
      }
    }

    const totalBigrams = (s1.length - 1) + (s2.length - 1);
    return parseFloat(((2.0 * intersectionSize) / totalBigrams).toFixed(4));
  }

  /**
   * Levenshtein Distance
   */
  public static levenshteinDistance(a: string, b: string): number {
    const an = a.length;
    const bn = b.length;
    if (an === 0) return bn;
    if (bn === 0) return an;

    const matrix: number[][] = [];
    for (let i = 0; i <= bn; i++) {
      matrix[i] = [i];
    }
    for (let j = 0; j <= an; j++) {
      matrix[0][j] = j;
    }

    for (let i = 1; i <= bn; i++) {
      for (let j = 1; j <= an; j++) {
        if (b.charAt(i - 1) === a.charAt(j - 1)) {
          matrix[i][j] = matrix[i - 1][j - 1];
        } else {
          matrix[i][j] = Math.min(
            matrix[i - 1][j - 1] + 1, // substitution
            matrix[i][j - 1] + 1,     // insertion
            matrix[i - 1][j] + 1      // deletion
          );
        }
      }
    }

    return matrix[bn][an];
  }

  /**
   * Hybrid confidence score combining Dice coefficient, prefix matching, and season verification
   */
  public static computeConfidence(sourceTitle: string, candidateTitle: string): number {
    const normSource = this.normalize(sourceTitle);
    const normCand = this.normalize(candidateTitle);

    if (normSource === normCand) return 1.0;

    // Check if one starts with the other
    const startsWith = normCand.startsWith(normSource) || normSource.startsWith(normCand);
    const dice = this.diceCoefficient(normSource, normCand);

    // Check season mismatch (e.g. "season 2" vs "season 1")
    const seasonSource = normSource.match(/\bseason\s*(\d+)\b/);
    const seasonCand = normCand.match(/\bseason\s*(\d+)\b/);

    if (seasonSource && seasonCand && seasonSource[1] !== seasonCand[1]) {
      // Different seasons -> heavily penalize confidence to avoid wrong episode playback
      return 0.1;
    }

    let score = dice;
    if (startsWith) {
      score = Math.max(score, 0.85);
    }

    return parseFloat(Math.min(1.0, score).toFixed(4));
  }
}
