# Validation

- `npm run check`: passed.
- `npm test`: passed, including existing Riverscape and Bunny behavior checks and Muse transitions.
- Swift compiled for arm64 / macOS 13 with Cocoa, WebKit and IOKit.
- Signed app bundle passed `codesign --verify --deep --strict`.
- Browser (1440 × 900): clicking the character changed Shanghai to London; the change button advanced to Tokyo; no console warnings or errors.
- Browser: Pause disabled outfit changes; clicking the character while paused retained Tokyo; Resume re-enabled controls.
- Browser (390 × 844): character, destination text and all four outfit buttons fit without clipping.
- Installed native Cove: custom `cove://` scheme loaded all assets, loading cover hidden, full desktop render captured in `docs/muse-preview.png`.
- Native occlusion policy: outfit controls disabled while covered and re-enabled when other windows were hidden. Other applications were shown again after the check.
- Native desktop tap sampling is implemented but the final physical desktop-click test was unavailable: the UI automation backend cannot click a desktop-level window (`noWindowsAvailable`). Browser character clicking was verified; native click-through behavior should additionally be checked by a person on the desktop.

Previous installed bundle is backed up at `/private/tmp/cove-before-muse.zip`.

## Face v2 and shortened turn

- Four `*-face-v2.png` atlases generated with the built-in image_gen tool from the user-supplied portrait. Original atlases retained.
- Playback now takes 0.82 seconds: front → right side → back → next outfit front. Tests assert that poses 5–7 never render, including during the reveal.
- GPU interpolation, premultiplied blending and separate background layers retained. Variable atlas row margins are detected at load to preserve the full shoes.
- `npm run check`, the Muse transition test and the full current `npm test` suite passed.
- Browser at 1440 × 900: the new Tokyo face and outfit render with complete shoes; clicking the person advances to the new casual front. Mid-transition Pause disables changes and freezes the pose; Resume continues playback.
- Updated only the installed Muse resources, then signed and verified the existing app bundle. Its existing selected scene was retained.
- Backup of the installed app before this update: `/private/tmp/cove-before-muse-face-v2.zip`.
