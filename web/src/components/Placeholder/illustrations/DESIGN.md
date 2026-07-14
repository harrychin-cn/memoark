# MemoArk empty-state illustration system

The empty-state birds are production SVG assets, not raster sprites. Each asset uses a `96 96` view box so it remains crisp in the compact timeline placeholder and on the About page.

## Shared visual language

- Deep navy: `#07192B`
- Ocean teal: `#0D5660`
- Sea-glass mint: `#5EEAD4`
- Paper white: `#F7FFFE`
- Warm coral accent: `#F28C72`
- Rounded curves, restrained gradients, balanced negative space, and one soft ground shadow.
- A faint circular halo gives the family a consistent optical footprint without becoming a badge.

## Character roles

- `OwlNote`: thoughtful, front-facing, with a folded note on its chest.
- `EagleLetter`: calm rather than aggressive, with a paper-fold wing.
- `ToucanBookmark`: compact silhouette, curved mint-to-coral beak, and a bookmark detail.

## Rendering and motion

- Render the original SVG directly; never scale a captured bitmap.
- Keep the illustration decorative in empty states because the adjacent text communicates status.
- Apply only the shared, low-amplitude float motion from `index.css`.
- `prefers-reduced-motion: reduce` disables motion completely.
- New characters must use the same view box, palette, halo radius, shadow weight, and minimum-feature size.
