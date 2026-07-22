# Museum Statues release playtest

- Pointer simulator: completed all three authored patrol beats and reached the terminal Museum Masterpiece scene with a persistent 5 / 5 score.
- Continuous feedback: verified searching flashlight, freeze hold ring, dance window, almost-caught recovery, gallery-star burst, and final resolution.
- Camera parity: renderer uses the same landmark-space flashlight, marble costume, HUD, progress, and finale over a full-strength cover-fit mirrored local video; no frame leaves the browser.
- Accessibility: Korean and English HUD copy, captions, keyboard-reachable controls, reduced-stimulation particle caps, and static beam/lamp behavior remain enabled.
- Automated evidence: `npm run validate`, `npm run validate:release`, and the repository `demo-games/verify-game.mjs` production E2E pass are required alongside the checked-in mid-play and completion captures.
- Reduced-motion/mobile run: a fresh 430×844, `ko-KR`, `prefers-reduced-motion: reduce` Chromium context completed 5 / 5 with no page errors or horizontal overflow.
