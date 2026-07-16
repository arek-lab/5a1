import Image from 'next/image';

const HERO_IMAGE_URL =
  'https://images.unsplash.com/photo-1445019980597-93fa8acb246c?w=700&auto=format&fit=crop&q=60&ixlib=rb-4.1.0&ixid=M3wxMjA3fDB8MHxzZWFyY2h8Nnx8aG90ZWx8ZW58MHx8MHx8fDA%3D';

export function HeroImage() {
  return (
    <div className="relative h-[30vh] w-full">
      <Image src={HERO_IMAGE_URL} alt="" fill priority sizes="100vw" className="object-cover" />
    </div>
  );
}
