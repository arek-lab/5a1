import sharp from 'sharp';
import path from 'node:path';

const root = path.resolve(process.cwd(), 'public/icons');

const jobs = [
  { src: 'icon.svg', out: 'icon-192.png', size: 192 },
  { src: 'icon.svg', out: 'icon-512.png', size: 512 },
  { src: 'icon-maskable.svg', out: 'icon-maskable-192.png', size: 192 },
  { src: 'icon-maskable.svg', out: 'icon-maskable-512.png', size: 512 },
  { src: 'icon.svg', out: 'apple-touch-icon.png', size: 180 },
];

for (const job of jobs) {
  await sharp(path.join(root, job.src))
    .resize(job.size, job.size)
    .png()
    .toFile(path.join(root, job.out));
  console.log('wrote', job.out);
}
