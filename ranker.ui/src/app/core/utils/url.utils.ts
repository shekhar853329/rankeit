/**
 * Ensures a URL has a protocol prefix.
 * Handles bare domains (zcoder.in -> https://zcoder.in)
 * and already-prefixed URLs (passes through unchanged).
 */
export function resolveUrl(url: string | null | undefined): string {
  if (!url) return '';
  const trimmed = url.trim();
  if (trimmed.startsWith('http://') || trimmed.startsWith('https://')) {
    return trimmed;
  }
  return `https://${trimmed}`;
}
