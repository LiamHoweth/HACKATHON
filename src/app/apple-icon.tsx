// Home Screen / install icons, generated with next/og (no external assets). Same mark as
// icon.svg: "SH" wordmark on the dark surface with the accent bar underneath.
//
// One file serves every PNG size via generateImageMetadata:
//   /apple-icon/180      apple-touch-icon (iPad/iPhone Home Screen)
//   /apple-icon/192      manifest icon, purpose "any"
//   /apple-icon/512      manifest icon, purpose "any"
//   /apple-icon/maskable manifest icon, purpose "maskable" (mark kept inside the 80% safe zone)
// manifest.ts references these URLs. iOS picks the apple-touch-icon whose `sizes` fits best.
// All variants are full-bleed squares: iOS and Android apply their own corner masks.
import { ImageResponse } from 'next/og';

const BG = '#14171a';
const FG = '#f5f4f0';
const ACCENT = '#2fbf8a';

type Variant = { id: string; px: number; maskable: boolean };

const VARIANTS: readonly Variant[] = [
  { id: '180', px: 180, maskable: false },
  { id: '192', px: 192, maskable: false },
  { id: '512', px: 512, maskable: false },
  { id: 'maskable', px: 512, maskable: true },
];

export function generateImageMetadata() {
  return VARIANTS.map((v) => ({
    id: v.id,
    contentType: 'image/png',
    size: { width: v.px, height: v.px },
    alt: 'Still Here',
  }));
}

export default async function AppleIcon({ id }: { id: Promise<string | number> }) {
  const key = String(await id);
  const v = VARIANTS.find((x) => x.id === key) ?? VARIANTS[0];
  // Maskable icons may be cropped to a circle of 40% radius, so shrink the mark.
  const scale = v.maskable ? 0.72 : 1;
  const font = Math.round(v.px * 0.42 * scale);
  const barW = Math.round(v.px * 0.5 * scale);
  const barH = Math.max(4, Math.round(v.px * 0.0625 * scale));

  return new ImageResponse(
    (
      <div
        style={{
          width: '100%',
          height: '100%',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          background: BG,
        }}
      >
        <div
          style={{
            display: 'flex',
            color: FG,
            fontSize: font,
            fontWeight: 800,
            letterSpacing: Math.round(font * 0.04),
            lineHeight: 1,
          }}
        >
          SH
        </div>
        <div
          style={{
            display: 'flex',
            marginTop: Math.round(font * 0.22),
            width: barW,
            height: barH,
            borderRadius: barH,
            background: ACCENT,
          }}
        />
      </div>
    ),
    { width: v.px, height: v.px },
  );
}
