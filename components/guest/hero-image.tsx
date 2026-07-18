import Image from 'next/image';
// Served from public/ (instead of Unsplash) so the file lands in the SW precache manifest
// (additionalPrecacheEntries globs public/**) and the hero renders offline too.
import heroImage from '@/public/images/hero.jpg';

export function HeroImage() {
  return (
    <div className="relative h-[30vh] w-full">
      <Image
        src={heroImage}
        alt=""
        fill
        priority
        placeholder="blur"
        sizes="100vw"
        className="object-cover"
      />
    </div>
  );
}
