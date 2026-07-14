export type TagData = { id: string; name: string; color: string };

// Full class strings so Tailwind's JIT picks them up
export const TAG_COLORS: Record<string, string> = {
  blue: 'bg-blue-100 text-blue-700 border-blue-200',
  green: 'bg-green-100 text-green-700 border-green-200',
  purple: 'bg-purple-100 text-purple-700 border-purple-200',
  amber: 'bg-amber-100 text-amber-700 border-amber-200',
  pink: 'bg-pink-100 text-pink-700 border-pink-200',
  teal: 'bg-teal-100 text-teal-700 border-teal-200',
  red: 'bg-red-100 text-red-700 border-red-200',
  indigo: 'bg-indigo-100 text-indigo-700 border-indigo-200',
  gray: 'bg-gray-100 text-gray-600 border-gray-200',
};

const PICKABLE = Object.keys(TAG_COLORS).filter(k => k !== 'gray');

// Deterministic color from tag name, so the same tag always looks the same
export function pickTagColor(name: string): string {
  let h = 0;
  for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) >>> 0;
  return PICKABLE[h % PICKABLE.length];
}

export function tagColorClasses(color: string): string {
  return TAG_COLORS[color] ?? TAG_COLORS.gray;
}
