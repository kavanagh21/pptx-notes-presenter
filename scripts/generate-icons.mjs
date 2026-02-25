import sharp from 'sharp';
import { readFileSync, mkdirSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, '..');
const publicDir = join(root, 'public');

const svg = readFileSync(join(publicDir, 'icon.svg'));

const sizes = [192, 512];

for (const size of sizes) {
  await sharp(svg)
    .resize(size, size)
    .png()
    .toFile(join(publicDir, `pwa-${size}x${size}.png`));
  console.log(`Generated pwa-${size}x${size}.png`);
}

// Apple touch icon (180x180)
await sharp(svg)
  .resize(180, 180)
  .png()
  .toFile(join(publicDir, 'apple-touch-icon-180x180.png'));
console.log('Generated apple-touch-icon-180x180.png');

// Maskable icon with padding (512, with 20% safe zone padding)
const maskSize = 512;
const padding = Math.round(maskSize * 0.1);
const inner = maskSize - padding * 2;
const resized = await sharp(svg).resize(inner, inner).png().toBuffer();
await sharp({
  create: { width: maskSize, height: maskSize, channels: 4, background: { r: 37, g: 99, b: 235, alpha: 1 } }
})
  .composite([{ input: resized, left: padding, top: padding }])
  .png()
  .toFile(join(publicDir, `maskable-icon-512x512.png`));
console.log('Generated maskable-icon-512x512.png');

console.log('Done!');
