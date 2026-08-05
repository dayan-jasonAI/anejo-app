# Hero Video Drop-In Assets

Place generated draft assets here when the Sora/video workflow exists:

- `anejo-hero-loop-desktop.mp4`
- `anejo-hero-loop-mobile.mp4`

The prototype hero checks for those files with a `HEAD` request. If they exist, it loads the appropriate muted autoplay loop. If they do not exist, the current still-frame animatic remains visible.
