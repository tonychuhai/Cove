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
