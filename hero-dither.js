/*
 * Semaphora banner screen, adapted from Homonin's
 * homonin-landing/apps/web/src/components/ethics/DitherCanvas.tsx.
 * Keeps the original banner visible and places an ordered, transparent
 * ink-dot pass over its luminance. Bayer matrix and percentile stretch follow
 * the Homonin image-sampling path. See README for attribution.
 */
(() => {
  const BAYER8 = [
     0,32, 8,40, 2,34,10,42,
    48,16,56,24,50,18,58,26,
    12,44, 4,36,14,46, 6,38,
    60,28,52,20,62,30,54,22,
     3,35,11,43, 1,33, 9,41,
    51,19,59,27,49,17,57,25,
    15,47, 7,39,13,45, 5,37,
    63,31,55,23,61,29,53,21,
  ];
  function attachDither(imageId, canvasId) {
    const image = document.getElementById(imageId);
    const canvas = document.getElementById(canvasId);
    if (!image || !canvas) return;
    const ink = [0, 3, 11];
    const scale = 3.2;

  function stretch(lum, cutoff = 0.02) {
    const hist = new Uint32Array(256);
    for (let i = 0; i < lum.length; i++) hist[Math.max(0, Math.min(255, (lum[i] * 255) | 0))]++;
    const cut = Math.floor(lum.length * cutoff);
    let lo = 0, acc = 0;
    for (; lo < 255; lo++) { acc += hist[lo]; if (acc > cut) break; }
    let hi = 255; acc = 0;
    for (; hi > 0; hi--) { acc += hist[hi]; if (acc > cut) break; }
    const low = lo / 255, high = Math.max(hi / 255, low + 0.01);
    for (let i = 0; i < lum.length; i++) lum[i] = Math.max(0, Math.min(1, (lum[i] - low) / (high - low)));
  }

  function draw() {
    const rect = canvas.getBoundingClientRect();
    if (!rect.width || !rect.height || !image.naturalWidth) return;
    const width = Math.max(1, Math.floor(rect.width / scale));
    const height = Math.max(1, Math.floor(rect.height / scale));
    canvas.width = width; canvas.height = height;
    const sample = document.createElement('canvas');
    sample.width = width; sample.height = height;
    const ctx = sample.getContext('2d', { willReadFrequently: true });
    if (!ctx) return;

    // Match object-fit: cover without changing the source banner's opacity.
    const sw0 = image.naturalWidth, sh0 = image.naturalHeight;
    const srcAspect = sw0 / sh0, dstAspect = width / height;
    let sx = 0, sy = 0, sw = sw0, sh = sh0;
    if (srcAspect > dstAspect) { sw = sh0 * dstAspect; sx = (sw0 - sw) / 2; }
    else { sh = sw0 / dstAspect; sy = (sh0 - sh) / 2; }
    ctx.drawImage(image, sx, sy, sw, sh, 0, 0, width, height);
    const pixels = ctx.getImageData(0, 0, width, height);
    const data = pixels.data, lum = new Float32Array(width * height);
    for (let i = 0, p = 0; i < data.length; i += 4, p++) lum[p] = (0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2]) / 255;
    stretch(lum);

    const out = canvas.getContext('2d');
    if (!out) return;
    const frame = out.createImageData(width, height);
    const target = frame.data;
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const p = y * width + x, at = p * 4;
        const on = lum[p] > BAYER8[(y & 7) * 8 + (x & 7)] / 64;
        target[at] = ink[0]; target[at + 1] = ink[1]; target[at + 2] = ink[2];
        target[at + 3] = on ? 155 : 0;
      }
    }
    out.putImageData(frame, 0, 0);
  }

    if (image.complete && image.naturalWidth) draw();
    else image.addEventListener('load', draw, { once: true });
    const observer = new ResizeObserver(draw);
    observer.observe(canvas);
  }

  attachDither('hero-art', 'hero-dither');
  attachDither('local-hero-art', 'local-hero-dither');
})();
