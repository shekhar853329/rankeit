/**
 * Ensures a URL has a protocol prefix and appends RankUp tracking UTMs.
 * Handles bare domains (zcoder.in -> https://zcoder.in)
 * and safely sets utm_source, utm_medium, and ref without duplicating existing params.
 */
export function resolveUrl(url: string | null | undefined, includeUtm = true): string {
  if (!url) return '';
  const trimmed = url.trim();
  const fullUrl =
    trimmed.startsWith('http://') || trimmed.startsWith('https://')
      ? trimmed
      : `https://${trimmed}`;

  if (!includeUtm) return fullUrl;

  try {
    const parsed = new URL(fullUrl);
    // Only append if creator did not supply their own custom utm_source
    if (!parsed.searchParams.has('utm_source')) {
      parsed.searchParams.set('utm_source', 'rankup.cyou');
      parsed.searchParams.set('utm_medium', 'leaderboard');
      parsed.searchParams.set('ref', 'rankup.cyou');
    }
    return parsed.toString();
  } catch {
    return fullUrl;
  }
}
