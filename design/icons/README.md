# Brain app icon: Pocket (option C, picked 2026-09-27)

Masters (100x100 viewBox, square, no rounded corners):
- pocket-light.svg, pocket-dark.svg, pocket-tinted.svg

iPhone (ios/), 1024x1024, RGB, no alpha, square (iOS rounds the corners):
- AppIcon-light-1024.png  -> AppIcon "Any Appearance"
- AppIcon-dark-1024.png   -> AppIcon "Dark"
- AppIcon-tinted-1024.png -> AppIcon "Tinted"
Use one 1024 "single size" entry per appearance in Assets.xcassets/AppIcon.appiconset.

Web (web/):
- favicon.svg          rounded, swaps to the dark version when the device is in dark mode
- favicon.ico          16 + 32
- favicon-16.png, favicon-32.png, favicon-dark-32.png  (rounded, transparent corners)
- apple-touch-icon.png 180x180 (iPhone "Add to Home Screen")
- icon-192.png, icon-512.png, icon-dark-512.png  (web manifest)

Colors: light field #e7ecef, pocket #1f4d3a, stitch #8fc2a8; dark field #101613, pocket #2c6a50;
cards white/#ff6b4a/#9cc9ff.
