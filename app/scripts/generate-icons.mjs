import sharp from 'sharp';
import { writeFileSync } from 'fs';

// Tönjes triangle mark + CRM — exact polygons from logo.svg
function createIconSvg(size) {
  // Original logo triangle mark polygons (from logo.svg viewBox 0 0 259.77 89.72):
  //   dark:  points="42.89 69.1 0 36.11 12.72 89.5"
  //   light: points="66.18 89.5 123.64 0 123.64 0 12.72 89.5"
  //
  // Bounding box of triangles: x 0–123.64, y 0–89.5
  // Scale to fit upper portion of 512x512 icon (target height ~250px)
  const scale = 2.8;
  const ox = (512 - 123.64 * scale) / 2; // center horizontally
  const oy = 55; // top padding

  function tr(x, y) {
    return `${(x * scale + ox).toFixed(1)},${(y * scale + oy).toFixed(1)}`;
  }

  // Dark triangle (#033333): 42.89,69.1  0,36.11  12.72,89.5
  const darkTri = `${tr(42.89, 69.1)} ${tr(0, 36.11)} ${tr(12.72, 89.5)}`;
  // Light teal triangle (#76bdd3): 66.18,89.5  123.64,0  12.72,89.5
  const lightTri = `${tr(66.18, 89.5)} ${tr(123.64, 0)} ${tr(12.72, 89.5)}`;

  const rx = Math.round(96 * (size < 300 ? 0.7 : 1));

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 512 512">
  <rect width="512" height="512" rx="${rx}" fill="#062727"/>

  <!-- Exact Tönjes triangle mark from logo.svg -->
  <polygon points="${lightTri}" fill="#76BDD3"/>
  <polygon points="${darkTri}" fill="#033333"/>

  <!-- Accent line -->
  <line x1="110" y1="320" x2="402" y2="320" stroke="#76BDD3" stroke-width="4" stroke-linecap="round"/>

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
