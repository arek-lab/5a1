const fs = require('fs');
const path = require('path');

// Budżet mierzy to, co App Router REALNIE wstrzykuje na trasę gościa. Poprzedni config
// globował framework-*/main-* — baseline'y Pages Routera, które webpack emituje, ale których
// App Router nie ładuje (0 wystąpień w <script src>) — i pomijał realny vendor chunk oraz
// react-chunk (nazwy hashowane, nie łapały się na globy). Dlatego stare "195.85 kB" mierzyło
// w połowie pliki, których gość nigdy nie pobiera.

const NEXT = path.join(__dirname, '.next');
const manifestPath = path.join(NEXT, 'build-manifest.json');
if (!fs.existsSync(manifestPath)) {
  throw new Error('Brak .next/build-manifest.json — odpal `npm run build` przed `npm run size`.');
}
const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));

// Shared runtime wstrzykiwany na KAŻDĄ trasę App Routera (webpack + react + vendor + main-app).
// Hashowane nazwy zmieniają się między buildami, więc bierzemy je z manifestu zamiast zgadywać.
const shared = manifest.rootMainFiles.map((f) => `.next/${f}`);

// globby (silnik size-limit) traktuje [] i () jako metaznaki — katalogi tras App Routera mają
// je w nazwach ([locale], (guest)), więc escapujemy do literalnego dopasowania.
const esc = (p) => p.replace(/[[\]()]/g, '\\$&');

// Chunki własne trasy gościa (layouty + strona). Ścieżki stabilne, hash — nie; czytamy katalog.
const chunkDir = (dir, prefix) => {
  const abs = path.join(NEXT, 'static/chunks', dir);
  if (!fs.existsSync(abs)) return [];
  return fs
    .readdirSync(abs)
    .filter((f) => f.startsWith(prefix) && f.endsWith('.js'))
    .map((f) => esc(`.next/static/chunks/${dir}/${f}`));
};

const routeFiles = [
  ...chunkDir('app', 'layout-'),
  ...chunkDir('app/[locale]', 'layout-'),
  ...chunkDir('app/[locale]/(guest)', 'layout-'),
  ...chunkDir('app/[locale]/(guest)', 'page-'),
];

// Legacy polyfills (manifest.polyfillFiles) świadomie pominięte: ładują się wyłącznie przez
// atrybut nomodule, którego nowoczesne przeglądarki nie pobierają. Budżet odzwierciedla
// realny koszt współczesnego gościa.
module.exports = [
  {
    name: 'Guest home — realny initial JS (App Router shared + trasa gościa, modern, bez legacy polyfills)',
    path: [...shared, ...routeFiles],
    limit: '150 KB',
    gzip: true,
  },
];
