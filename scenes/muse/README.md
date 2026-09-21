# Muse · 互动换装

Open `/scenes/muse/` in the local server, or choose **Scene → Muse · 互动换装** in Cove.

Click the person or **转身换装** for the next outfit. The four color buttons select an outfit directly. Keyboard users can focus the character and press Enter or Space. Pause freezes an active turn; system Reduce Motion makes outfit changes immediate in the browser. A stopped, covered or sleeping native wallpaper accepts no changes. Idle scenes schedule no animation frames.

The four looks are Everyday, Shanghai, London and Tokyo. Each PNG has eight photographic views in a 4 × 2 atlas; playback uses only the front and right-side views through to the back (poses 0–4). A 0.82-second transition turns right to the back, then blends directly into the next outfit's front view. Left-side poses 5–7 are never sampled. A WebGL2 shader continuously interpolates silhouette profiles and neighboring photographs at display cadence. Premultiplied color interpolation keeps the portrait opaque, while shared silhouettes reduce contour jumps. Atlas row gaps are detected at load so generated margins cannot crop shoes. This is a photographic sprite animation, not a freely rotatable or rigged 3D character. The cities are generated travel illustrations in a photographic style, not geographic map data.

`assets/*.png` were created with the built-in image_gen tool, using the four user-supplied screenshots as character and clothing references. The active character atlases are `casual-face-v2.png`, `shanghai-face-v2.png`, `london-face-v2.png`, and `tokyo-face-v2.png`; their faces were regenerated from the later user-supplied portrait while retaining the four outfits. Original generated alpha channels are preserved. The initial prompt set is in `assets/prompts.json`; the face replacement prompts are in `assets/face-v2-prompts.json`. The original character atlases remain available for comparison. Asset files are bundled locally; there are no remote image requests or runtime generation.

`src/turntable.js` owns transition and hit-area behavior. `src/portrait-renderer.js` uploads the atlases and computes silhouette profiles once at load; `src/main.js` draws only when changing outfits, resizing, or receiving display-policy updates. Browser and native saved state use the key `cove.muse` and `petState.muse`, respectively.

Run `node scenes/muse/tests/turntable.mjs` for the right half-turn, direct front reveal, exclusion of left-side views, outfit cycle, rapid-click rejection, reduced-motion transition, paused time, and responsive hit regions. `npm test` also runs the existing scenes' checks.

Backgrounds and the ground shadow are separate compositor layers. DOM controls update only when their state changes. Canvas diagnostic data attributes report the most recent turn: `data-turn-frames`, `data-turn-frame-ms` (95th-percentile frame interval) and `data-render-ms` (mean CPU submission time, not GPU duration).
