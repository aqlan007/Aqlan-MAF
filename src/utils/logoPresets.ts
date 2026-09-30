/**
 * Preset Logos and Image Processing Utilities for KasirKu POS
 * Designed for modern UI application branding and crisp thermal printer receipts (58mm & 80mm).
 */

export interface LogoPreset {
  id: string;
  name: string;
  category: string;
  dataUrl: string;
}

// Default CHORD #Kopi_kebun App Branding SVG Logo
export const APP_DEFAULT_LOGO = `data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 320 180" width="320" height="180">
  <defs>
    <clipPath id="rbc">
      <path d="M 3,-38 C 16,-35 31,-21 32,0 C 33,21 16,35 3,38 Z" />
    </clipPath>
  </defs>
  <rect width="320" height="180" fill="%23000000"/>
  <g transform="translate(160, 85)">
    <text x="-44" y="18" text-anchor="end" fill="%23ffffff" font-family="'Playfair Display', 'Bodoni MT', 'Times New Roman', serif" font-weight="900" font-size="56" letter-spacing="1">CH</text>
    <g transform="translate(0, -6)">
      <path d="M -3,-36 C -16,-34 -30,-21 -31,0 C -32,21 -16,34 -3,36 C -7,23 -10,11 -8,-3 C -6,-16 -4,-26 -3,-36 Z" fill="%23ffffff" />
      <g clip-path="url(%23rbc)">
        <rect x="3" y="-40" width="35" height="80" fill="%23ffffff" />
        <rect x="3" y="-25" width="35" height="2.5" fill="%23000000" />
        <rect x="3" y="-13" width="35" height="2.5" fill="%23000000" />
        <rect x="3" y="-1" width="35" height="2.5" fill="%23000000" />
        <rect x="3" y="11" width="35" height="2.5" fill="%23000000" />
        <rect x="3" y="23" width="35" height="2.5" fill="%23000000" />
        <rect x="3" y="-27" width="13" height="6" fill="%23000000" />
        <rect x="3" y="-15" width="13" height="6" fill="%23000000" />
        <rect x="3" y="-3" width="13" height="6" fill="%23000000" />
        <rect x="3" y="9" width="13" height="6" fill="%23000000" />
      </g>
      <line x1="0" y1="-38" x2="0" y2="38" stroke="%23000000" stroke-width="2" />
    </g>
    <text x="44" y="18" text-anchor="start" fill="%23ffffff" font-family="'Playfair Display', 'Bodoni MT', 'Times New Roman', serif" font-weight="900" font-size="56" letter-spacing="1">RD</text>
    <text x="0" y="58" text-anchor="middle" fill="%23ffffff" font-family="'Caveat', 'Comic Sans MS', 'Plus Jakarta Sans', cursive, sans-serif" font-weight="700" font-size="19" letter-spacing="0.5">%23Kopi_kebun.</text>
  </g>
</svg>`;

// Crisp, high-contrast monochrome & branded SVG logos optimized for app UI and 58mm & 80mm thermal receipts
export const PRESET_LOGOS: LogoPreset[] = [
  {
    id: 'chord-kopi-kebun',
    name: '🎹 CHORD #Kopi_kebun. (Official)',
    category: 'Cafe & Live Music',
    dataUrl: APP_DEFAULT_LOGO,
  },
  {
    id: 'kasirku-official',
    name: '⚡ KasirKu POS Official',
    category: 'Sistem POS Modern',
    dataUrl: `data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 240 120" width="240" height="120"><defs><linearGradient id="kg" x1="0%" y1="0%" x2="100%" y2="100%"><stop offset="0%" stop-color="%2310b981"/><stop offset="100%" stop-color="%23047857"/></linearGradient></defs><rect x="8" y="8" width="224" height="104" rx="24" fill="url(%23kg)"/><g transform="translate(22, 22)"><rect x="0" y="38" width="76" height="34" rx="7" fill="%23ffffff" fill-opacity="0.25"/><path d="M10 38 L20 12 L56 12 L66 38 Z" fill="%23ffffff"/><rect x="22" y="16" width="32" height="16" rx="3" fill="%23047857"/><line x1="26" y1="24" x2="50" y2="24" stroke="%23ffffff" stroke-width="2.5" stroke-linecap="round"/><circle cx="38" cy="55" r="4" fill="%23ffffff"/><line x1="22" y1="48" x2="54" y2="48" stroke="%23ffffff" stroke-width="2"/><circle cx="68" cy="10" r="4" fill="%23fef08a"/><text x="88" y="38" font-family="'Plus Jakarta Sans', system-ui, sans-serif" font-weight="900" font-size="24" fill="%23ffffff" letter-spacing="-0.5">KASIRKU</text><text x="88" y="56" font-family="'Plus Jakarta Sans', system-ui, sans-serif" font-weight="700" font-size="11" fill="%23a7f3d0" letter-spacing="1">POINT OF SALE</text><text x="88" y="70" font-family="'JetBrains Mono', monospace" font-size="8.5" fill="%23ecfdf5" letter-spacing="0.5">OFFLINE-FIRST</text></g></svg>`,
  },
  {
    id: 'coffee-cup',
    name: '☕ Cafe & Senja Coffee',
    category: 'Cafe & Coffee',
    dataUrl: `data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 220 120" width="220" height="120" fill="black"><g transform="translate(10, 8)"><path d="M45,22 Q45,8 50,0 Q55,8 55,22" stroke="black" stroke-width="4" fill="none" stroke-linecap="round"/><path d="M65,18 Q65,6 70,0 Q75,6 75,18" stroke="black" stroke-width="4" fill="none" stroke-linecap="round"/><path d="M85,22 Q85,8 90,0 Q95,8 90,22" stroke="black" stroke-width="4" fill="none" stroke-linecap="round"/><rect x="25" y="28" width="80" height="52" rx="14" fill="black"/><path d="M105,38 C125,38 125,64 105,64" stroke="black" stroke-width="8" fill="none" stroke-linecap="round"/><rect x="15" y="84" width="100" height="8" rx="4" fill="black"/><text x="135" y="48" font-family="Arial, sans-serif" font-weight="900" font-size="18" fill="black">SENJA</text><text x="135" y="66" font-family="Arial, sans-serif" font-weight="700" font-size="12" fill="black">COFFEE</text><text x="135" y="80" font-family="Arial, sans-serif" font-size="9" fill="black">&amp; ROASTERY</text></g></svg>`,
  },
  {
    id: 'bakery-chef',
    name: '🥐 Bakery & Pastry House',
    category: 'Bakery & Dessert',
    dataUrl: `data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 220 120" width="220" height="120" fill="black"><g transform="translate(15, 10)"><path d="M40,28 C30,8 60,0 70,18 C80,0 110,8 100,28 C120,38 110,68 90,68 L50,68 C30,68 20,38 40,28 Z" fill="black"/><rect x="42" y="62" width="56" height="10" rx="3" fill="black"/><circle cx="55" cy="42" r="4" fill="white"/><circle cx="85" cy="42" r="4" fill="white"/><text x="70" y="92" text-anchor="middle" font-family="Arial, sans-serif" font-weight="900" font-size="16" fill="black">ARTISAN BAKERY</text><text x="70" y="106" text-anchor="middle" font-family="Arial, sans-serif" font-weight="700" font-size="10" fill="black">&amp; CAKE BOUTIQUE</text></g></svg>`,
  },
  {
    id: 'resto-dining',
    name: '🍽️ Resto & Bistro Dining',
    category: 'Food & Bistro',
    dataUrl: `data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 220 120" width="220" height="120" fill="black"><g transform="translate(15, 8)"><circle cx="65" cy="45" r="34" stroke="black" stroke-width="6" fill="none"/><circle cx="65" cy="45" r="23" stroke="black" stroke-width="2.5" fill="none"/><path d="M18,15 L18,75 M12,15 L12,35 Q12,42 18,42 Q24,42 24,35 L24,15" stroke="black" stroke-width="3.5" fill="none" stroke-linecap="round"/><path d="M112,15 L112,75 M112,15 Q122,25 122,40 L112,45" stroke="black" stroke-width="3.5" fill="black" stroke-linecap="round"/><text x="65" y="96" text-anchor="middle" font-family="Arial, sans-serif" font-weight="900" font-size="16" fill="black">BISTRO &amp; RESTO</text><text x="65" y="108" text-anchor="middle" font-family="Arial, sans-serif" font-weight="bold" font-size="9" fill="black">AUTHENTIC FLAVOR</text></g></svg>`,
  },
  {
    id: 'retail-bag',
    name: '🏬 Mart & Retail Store',
    category: 'Retail',
    dataUrl: `data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 220 120" width="220" height="120" fill="black"><g transform="translate(20, 10)"><path d="M45,35 L45,18 C45,8 75,8 75,18 L75,35" stroke="black" stroke-width="5" fill="none" stroke-linecap="round"/><rect x="30" y="32" width="60" height="56" rx="8" fill="black"/><polygon points="60,42 66,54 78,54 68,62 72,74 60,66 48,74 52,62 42,54 54,54" fill="white"/><text x="105" y="52" font-family="Arial, sans-serif" font-weight="900" font-size="18" fill="black">MART</text><text x="105" y="70" font-family="Arial, sans-serif" font-weight="700" font-size="11" fill="black">EXPRESS</text><text x="60" y="104" text-anchor="middle" font-family="Arial, sans-serif" font-weight="bold" font-size="9" fill="black">SERBA ADA &amp; LENGKAP</text></g></svg>`,
  },
  {
    id: 'boba-drink',
    name: '🧋 Boba & Drink Station',
    category: 'Beverage & Bar',
    dataUrl: `data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 220 120" width="220" height="120" fill="black"><g transform="translate(20, 8)"><line x1="68" y1="2" x2="52" y2="40" stroke="black" stroke-width="5" stroke-linecap="round"/><path d="M30,30 L74,30 L66,88 L38,88 Z" fill="black"/><rect x="25" y="26" width="54" height="6" rx="2" fill="black"/><circle cx="46" cy="74" r="4" fill="white"/><circle cx="58" cy="76" r="4" fill="white"/><circle cx="52" cy="64" r="4" fill="white"/><circle cx="42" cy="58" r="3" fill="white"/><text x="100" y="50" font-family="Arial, sans-serif" font-weight="900" font-size="18" fill="black">BOBA</text><text x="100" y="68" font-family="Arial, sans-serif" font-weight="700" font-size="12" fill="black">STATION</text><text x="52" y="104" text-anchor="middle" font-family="Arial, sans-serif" font-size="9" font-weight="bold" fill="black">FRESH &amp; SWEET</text></g></svg>`,
  },
];

/**
 * Resizes and converts any uploaded image into a high-contrast receipt-ready data URL
 */
export async function processLogoImage(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = reject;
    reader.onload = () => {
      const img = new Image();
      img.onerror = reject;
      img.onload = () => {
        const canvas = document.createElement('canvas');
        const MAX_DIM = 360;
        let width = img.width;
        let height = img.height;

        if (width > height && width > MAX_DIM) {
          height = Math.round((height * MAX_DIM) / width);
          width = MAX_DIM;
        } else if (height > MAX_DIM) {
          width = Math.round((width * MAX_DIM) / height);
          height = MAX_DIM;
        }

        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');
        if (!ctx) {
          resolve(reader.result as string);
          return;
        }

        // Draw image
        ctx.fillStyle = '#FFFFFF';
        ctx.fillRect(0, 0, width, height);
        ctx.drawImage(img, 0, 0, width, height);

        // Convert to high-contrast monochrome for thermal printer
        const imgData = ctx.getImageData(0, 0, width, height);
        const data = imgData.data;
        for (let i = 0; i < data.length; i += 4) {
          const r = data[i];
          const g = data[i + 1];
          const b = data[i + 2];
          const a = data[i + 3];

          if (a < 50) {
            data[i] = 255;
            data[i + 1] = 255;
            data[i + 2] = 255;
            data[i + 3] = 255;
          } else {
            const lum = 0.299 * r + 0.587 * g + 0.114 * b;
            const mono = lum < 155 ? 0 : 255;
            data[i] = mono;
            data[i + 1] = mono;
            data[i + 2] = mono;
            data[i + 3] = 255;
          }
        }
        ctx.putImageData(imgData, 0, 0);

        resolve(canvas.toDataURL('image/png'));
      };
      img.src = reader.result as string;
    };
    reader.readAsDataURL(file);
  });
}
