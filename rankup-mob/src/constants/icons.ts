export const CATEGORY_ICONS: Record<string, string> = {
  ai: '🤖',
  'ai-tools': '🤖',
  tech: '⚡',
  technology: '💻',
  saas: '☁️',
  productivity: '⚡',
  design: '🎨',
  marketing: '📣',
  finance: '💰',
  fintech: '💳',
  crypto: '🪙',
  gaming: '🎮',
  developer: '🛠️',
  devtools: '🛠️',
  seo: '🔍',
  ecommerce: '🛍️',
  health: '🩺',
  education: '📚',
  social: '🌐',
  community: '👥',
  media: '🎬',
  audio: '🎧',
  security: '🔒',
  analytics: '📈',
  business: '💼',
  legal: '⚖️',
  realestate: '🏠',
  lifestyle: '✨',
  travel: '✈️',
  food: '🍔',
};

const DEFAULT_ICONS = ['🤖', '🔍', '📣', '🏠', '💼', '🎮', '🛠️', '💰', '📈', '🎨', '🚀', '🔥', '⚡'];

export function getCategoryIcon(slug?: string | null): string {
  if (!slug) return '📦';
  const clean = slug.toLowerCase().trim();
  if (CATEGORY_ICONS[clean]) return CATEGORY_ICONS[clean];

  for (const [key, icon] of Object.entries(CATEGORY_ICONS)) {
    if (clean.includes(key)) return icon;
  }

  // Deterministic fallback based on hash of string
  let hash = 0;
  for (let i = 0; i < clean.length; i++) {
    hash = (hash << 5) - hash + clean.charCodeAt(i);
    hash |= 0;
  }
  return DEFAULT_ICONS[Math.abs(hash) % DEFAULT_ICONS.length];
}
