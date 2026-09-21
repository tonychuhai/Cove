# Muse · 互动换装

Open `/scenes/muse/` in the local server, or choose **Scene → Muse · 互动换装** in Cove.

Click the person or **转身换装** for the next outfit. The four color buttons select an outfit directly. Keyboard users can focus the character and press Enter or Space. Pause freezes an active turn; system Reduce Motion makes outfit changes immediate in the browser. A stopped, covered or sleeping native wallpaper accepts no changes. Idle scenes schedule no animation frames.

The four looks are Everyday, Shanghai, London and Tokyo. Each PNG has eight photographic views in a 4 × 2 atlas. A WebGL2 shader continuously interpolates silhouette profiles and the two neighboring photographs at display cadence. The outfit blends while back-facing, then returns to the front. Premultiplied color interpolation keeps the portrait opaque, while shared silhouettes reduce contour jumps. Generated photos remain unchanged. This is a photographic sprite animation, not a freely rotatable or rigged 3D character. The cities are generated travel illustrations in a photographic style, not geographic map data.

`assets/*.png` were created with the built-in image_gen tool, using the four user-supplied screenshots as character and clothing references. Original generated alpha channels are preserved. The exact prompt set is in `assets/prompts.json`. Asset files are bundled locally; there are no remote image requests or runtime generation.

`src/turntable.js` owns transition and hit-area behavior. `src/portrait-renderer.js` uploads the atlases and computes silhouette profiles once at load; `src/main.js` draws only when changing outfits, resizing, or receiving display-policy updates. Browser and native saved state use the key `cove.muse` and `petState.muse`, respectively.

Run `node scenes/muse/tests/turntable.mjs` for the outfit cycle, midpoint change, rapid-click rejection, reduced-motion transition, paused time, and responsive hit regions. `npm test` also runs the existing scenes' checks.

Backgrounds and the ground shadow are separate compositor layers. DOM controls update only when their state changes. Canvas diagnostic data attributes report the most recent turn: `data-turn-frames`, `data-turn-frame-ms` (95th-percentile frame interval) and `data-render-ms` (mean CPU submission time, not GPU duration).
