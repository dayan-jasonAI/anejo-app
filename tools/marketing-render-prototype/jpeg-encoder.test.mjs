import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import jpeg from 'jpeg-js';
import { encode } from './jpeg-encoder.mjs';

const require = createRequire(import.meta.url);

function fixture(width, height, pattern) {
  const data = new Uint8Array(width * height * 4);
  let seed = 0x9e3779b9;
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const offset = (y * width + x) * 4;
      for (let channel = 0; channel < 3; channel++) {
        seed ^= seed << 13;
        seed ^= seed >>> 17;
        seed ^= seed << 5;
        data[offset + channel] = pattern === 'noise' ? seed & 255
          : pattern === 'checker' ? ((x + y + channel) & 1) * 255
          : pattern === 'gradient' ? (x * 17 + y * 29 + channel * 83) & 255
          : pattern === 'white' ? 255 : 0;
      }
      data[offset + 3] = (x * 31 + y * 47) & 255;
    }
  }
  return { width, height, data };
}

function assertEquivalent(image, quality) {
  const before = image.data.slice();
  const expected = jpeg.encode(image, quality);
  const actual = encode(image, quality);
  assert.equal(actual.width, expected.width);
  assert.equal(actual.height, expected.height);
  assert.ok(actual.data instanceof Uint8Array);
  assert.deepEqual(Buffer.from(actual.data), expected.data);
  assert.deepEqual(image.data, before, 'encoding must preserve input pixels');
  return actual;
}

test('byte-equivalence reference is the pinned jpeg-js 0.4.4 package', () => {
  assert.equal(require('jpeg-js/package.json').version, '0.4.4');
});

const cases = [
  [1, 1, 'black'],
  [1, 17, 'white'],
  [19, 1, 'gradient'],
  [7, 9, 'noise'],
  [8, 8, 'checker'],
  [16, 16, 'gradient'],
  [17, 23, 'checker'],
  [63, 65, 'noise'],
];
const qualities = [undefined, 0, -10, 1, 2, 25, 49, 50, 51, 75, 99, 100, 120];

for (const [width, height, pattern] of cases) {
  test(`byte-equivalence for ${width}x${height} ${pattern} RGBA across quality boundaries`, () => {
    const image = fixture(width, height, pattern);
    for (const quality of qualities) {
      assertEquivalent(image, quality);
    }
  });
}

test('comments and EXIF preserve byte-equivalence', () => {
  const image = {
    ...fixture(13, 11, 'noise'),
    comments: ['deterministic fixture', 'second comment'],
    exifBuffer: Uint8Array.from([0x45, 0x78, 0x69, 0x66, 0, 0, 0x49, 0x49, 0x2a, 0]),
  };
  assertEquivalent(image, 93);
});

test('repeated encodes across sizes and qualities preserve independent output', () => {
  const imageA = fixture(25, 18, 'noise');
  const imageB = fixture(9, 31, 'checker');
  const first = assertEquivalent(imageA, 100);
  const firstBytes = first.data.slice();
  for (let i = 0; i < 12; i++) {
    assertEquivalent(i % 2 ? imageA : imageB, [1, 50, 100][i % 3]);
  }
  const last = assertEquivalent(imageA, 100);
  assert.deepEqual(first.data, firstBytes, 'later calls must not mutate earlier output');
  assert.deepEqual(last.data, first.data);
  assert.notEqual(last.data.buffer, first.data.buffer);
});

test('alpha channel values do not change encoded RGB bytes', () => {
  const image = fixture(11, 13, 'gradient');
  const opaque = { ...image, data: image.data.slice() };
  for (let i = 3; i < opaque.data.length; i += 4) opaque.data[i] = 255;
  assert.deepEqual(assertEquivalent(image, 80).data, assertEquivalent(opaque, 80).data);
});

test('many-block DCT scratch reuse preserves bytes at integer and fractional qualities', () => {
  // Exercise repeated in-place transforms, signed coefficients, padding and
  // quantization thresholds. Fractional quality affects scaling before rounding.
  for (const pattern of ['noise', 'checker', 'gradient']) {
    const image = fixture(127, 129, pattern);
    for (const quality of [1, 49.5, 50.5, 99.5, 100]) {
      assertEquivalent(image, quality);
    }
  }
});
