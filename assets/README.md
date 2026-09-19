# Real planet textures (optional)

The renderer works out of the box with flat-shaded planets. To upgrade to
real, photo-realistic textures, drop square image files into this folder
using the exact filenames below. Missing files are skipped automatically
(no errors) — the corresponding planet just stays flat-shaded until you add
its file.

## Where to get free, properly licensed textures

- **solarsystemscope.com/textures** — high-quality 2K/4K/8K planet and sun
  texture maps, licensed **CC BY 4.0** (free for any use, including
  commercial and streaming — just credit "Solar System Scope" somewhere,
  e.g. in your video description).
- **images.nasa.gov** — NASA's own imagery, **public domain**, no
  attribution legally required (crediting NASA is still good practice).

Do not copy texture files out of other people's specific GitHub projects
unless their license clearly allows it — many "solar system" demo repos
use restrictive personal licenses even when the underlying textures are
public/CC.

## Required filenames

```
assets/sun.jpg
assets/planets/mercury.jpg
assets/planets/venus.jpg
assets/planets/earth.jpg
assets/planets/mars.jpg
assets/planets/jupiter.jpg
assets/planets/saturn.jpg
assets/planets/uranus.jpg
assets/planets/neptune.jpg
```

Square images work best (they get clipped to a circle and scaled). Any
reasonable resolution is fine — these render small (a few dozen pixels
across at most), so there's no need for 8K files; 512x512 or 1K is plenty
and keeps the repo/zip small.
