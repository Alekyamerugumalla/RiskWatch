// 64-bit "difference hash" of an image, computed in the browser (the image never leaves the computer).
// The picture is shrunk to 9x8 greyscale and each pixel is compared with its right neighbour.
// Copies of the same image (resized, recompressed, lightly edited) give hashes that differ by only a few bits.

export async function imageHash(file) {
  const url = URL.createObjectURL(file);
  try {
    const img = await new Promise((resolve, reject) => {
      const i = new Image();
      i.onload = () => resolve(i);
      i.onerror = () => reject(new Error('That file could not be read as an image. Use a PNG, JPG or WebP.'));
      i.src = url;
    });
    const canvas = document.createElement('canvas');
    canvas.width = 9;
    canvas.height = 8;
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    ctx.fillStyle = '#fff'; // transparent logos are compared on white
    ctx.fillRect(0, 0, 9, 8);
    ctx.drawImage(img, 0, 0, 9, 8);
    const { data } = ctx.getImageData(0, 0, 9, 8);
    const grey = (x, y) => {
      const i = (y * 9 + x) * 4;
      return 0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2];
    };
    let bits = '';
    for (let y = 0; y < 8; y++) for (let x = 0; x < 8; x++) bits += grey(x, y) > grey(x + 1, y) ? '1' : '0';
    let hex = '';
    for (let i = 0; i < 64; i += 4) hex += parseInt(bits.slice(i, i + 4), 2).toString(16);
    return hex;
  } finally {
    URL.revokeObjectURL(url);
  }
}

/** The opposite image: every bit flipped, so it can never look like the original. */
export const invertHash = (hex) => [...hex].map((h) => (15 - parseInt(h, 16)).toString(16)).join('');
