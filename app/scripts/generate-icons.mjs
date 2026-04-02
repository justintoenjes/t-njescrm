import sharp from 'sharp';
import { writeFileSync } from 'fs';

// Tönjes triangle mark + CRM — all paths, no <text>
function createIconSvg(size) {
  // Scale factor relative to 512 base
  const s = size / 512;

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 512 512">
  <rect width="512" height="512" rx="${Math.round(96 * (size < 300 ? 0.7 : 1))}" fill="#062727"/>

  <!-- Tönjes triangle mark -->
  <polygon points="240,80 140,280 190,280" fill="#76BDD3" opacity="0.6"/>
  <polygon points="260,110 180,280 220,280" fill="#ffffff" opacity="0.2"/>
  <polygon points="220,60 100,300 160,300" fill="#76BDD3" opacity="0.35"/>

  <!-- Accent line -->
  <line x1="120" y1="310" x2="392" y2="310" stroke="#76BDD3" stroke-width="4" stroke-linecap="round"/>

  <!-- C -->
  <path d="M140,395 Q140,340 185,340 L198,340 L198,358 L185,358 Q160,358 160,395 Q160,432 185,432 L198,432 L198,450 L185,450 Q140,450 140,395 Z" fill="white"/>

  <!-- R -->
  <path d="M215,340 L215,450 L235,450 L235,405 L252,405 L270,450 L292,450 L272,403 Q286,396 286,378 Q286,340 258,340 Z M235,358 L255,358 Q268,358 268,376 Q268,390 255,390 L235,390 Z" fill="white"/>

  <!-- M -->
  <path d="M308,340 L330,412 L352,340 L378,340 L378,450 L360,450 L360,372 L339,445 L321,445 L300,372 L300,450 L282,450 L282,340 Z" fill="white"/>
</svg>`;
}

const sizes = [
  { name: 'icon-512.png', size: 512 },
  { name: 'apple-touch-icon.png', size: 180 },
];

for (const { name, size } of sizes) {
  const svg = createIconSvg(size);
  const png = await sharp(Buffer.from(svg)).png().toBuffer();
  writeFileSync(new URL(`../public/${name}`, import.meta.url), png);
  console.log(`Generated ${name} (${size}x${size})`);
}
