# Añejo Hero Video Edit Plan

## Clip Order

Hero loop:

1. Pressure at desk.
2. Hunger/time glance.
3. Bowl assembly.
4. Personalization/packout.
5. Delivery bag leaves.
6. Office arrival.
7. Reveal and first bite.
8. Brand close.

Expanded version adds more breathing room but preserves the same order.

## Exact Target Duration

- Homepage hero loop: 10.5 seconds.
- Acceptable loop range: 8-12 seconds.
- Expanded version: 26 seconds.
- Acceptable expanded range: 20-30 seconds.

## Recommended Cuts

- Cut from phone/time glance to overhead food assembly.
- Cut from sauce/label placement to lid close.
- Use a motion cut from bag pickup to office arrival.
- Use a soft dissolve or clean cut from first bite to brand close.
- Keep cuts legible; do not use chaotic montage pacing.

## Speed Adjustments

- Keep human action at natural speed.
- Food assembly can be slightly tightened but not sped up enough to feel unnatural.
- Avoid excessive slow motion; use only subtle food/reveal emphasis.

## Seamless-Loop Method

- End on a steady desk/food frame with the customer refocused.
- Begin with the same general desk direction and late-morning light.
- Use a short 4-6 frame crossfade from brand close back into pressure shot if needed.
- Keep audio silent; no loop audio seam.

## Text Timing

Hero loop text should be minimal:

- 0.0-10.5s: Page headline and CTA remain outside the video in HTML.
- 3.0-4.5s optional: "Cooked fresh today" over kitchen prep.
- 5.0-6.0s optional: "Delivered daily" over delivery bag.
- Final 1.0s: approved logo/positioning in edit overlay.

Do not place long captions inside the moving video.

## Logo Timing

- Final 0.9-1.5 seconds only.
- Use approved repository logo/lockup as an editor overlay whenever possible.
- If Sora-generated logo is imperfect, do not use it.

## Mobile Crop Instructions

- Keep customer face, phone/laptop, bowl, delivery bag, and handoff centered in the middle 55% of the 16:9 frame.
- Export a dedicated 9:16 mobile crop if possible: `anejo-hero-loop-mobile.mp4`.
- Mobile crop should prioritize the food and customer action over wide environmental context.
- Avoid placing essential text at the extreme left/right.

## Desktop Crop Instructions

- Desktop source: 16:9 or wider crop, `anejo-hero-loop-desktop.mp4`.
- Preserve negative space where homepage copy overlays or sits adjacent.
- Food reveal and brand close should remain readable behind dark gradient treatment.

## Compression Recommendations

- Format: MP4 H.264 baseline/main profile for widest browser support.
- Optional additional WebM VP9/AV1 if desired later.
- Desktop target: 1920x1080, 24 or 30 fps, 4-8 Mbps draft, 2.5-4 Mbps web-optimized.
- Mobile target: 1080x1920, 24 or 30 fps, 3-6 Mbps draft, 1.8-3 Mbps web-optimized.
- Keep loop under roughly 4 MB for production if possible; prototype draft can be larger.
- Strip audio track if unused.

## Poster Frame Recommendation

Use the FUEGO bowl food close-up as the poster frame, either from the final video reveal shot or existing repository image:

- Current prototype poster: `/assets/img/bowl_fuego.jpg`

## Reduced-Motion Fallback

- Do not autoplay video when `prefers-reduced-motion: reduce`.
- Show one still frame with the same headline/CTA.
- Preserve all information in HTML text outside the video.

## Still-Image Fallback

- If video does not load or source files are absent, the prototype shows the existing timed still-frame animatic.
- If JavaScript fails, the poster/food images still communicate the product.

## Accessibility Treatment

- Video is decorative/supportive and muted.
- Do not rely on audio or captions to explain the offer.
- Keep the main message in page text: headline, supporting statement, CTA, and trust strip.
- Avoid flashing, rapid strobe, or high-frequency cuts.
- Maintain contrast over all frames with a stable dark overlay/gradient.
