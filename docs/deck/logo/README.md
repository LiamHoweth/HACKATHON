# Still Here — logo

**Concept.** A speech bubble (a circle with one square corner) holding a single raised-eyebrow arc over a dot: the brow is how the user answers, and the dot says "I'm still here" — present, with something to say. Everything is geometric (one circle, one arc, one dot; 40-unit stroke on a 512 grid), flat, and holds up at 32 px.

Tagline: *Your words. Your choice.*

## Files
| File | Use |
|---|---|
| `mark.svg` / `mark-512.png` | Icon only, deep green, transparent (brow and dot are true knockouts) |
| `mark-white.svg` / `mark-white-512.png` | Icon for dark slides |
| `lockup-horizontal.svg` / `.png` | Mark + wordmark, 1600x400, transparent, for light backgrounds |
| `lockup-horizontal-white.svg` / `.png` | All-white lockup for dark backgrounds |
| `app-icon.svg` / `app-icon-1024.png` | White mark on #0b5d46 rounded square (iPad home-screen style), transparent corners |
| `preview.png` | All variants on white, soft green and ink, at large and small sizes |

The wordmark is Atkinson Hyperlegible Bold, embedded in the lockup SVGs as a base64 WOFF2 subset (latin) with a `system-ui` fallback, so the SVGs render correctly standalone. For iOS asset catalogs, Xcode applies its own corner mask; use the full-bleed square if a non-rounded source is needed (re-render `app-icon.svg` without the `rx`).

## Colors
| Name | Hex |
|---|---|
| Ink | `#121417` |
| Deep green (primary) | `#0b5d46` |
| Soft green | `#e2f2ec` |
| White | `#ffffff` |

Clear space: keep at least the dot's diameter (about 19% of the mark's height) around the mark and lockup. Minimum mark size: 16 px.
