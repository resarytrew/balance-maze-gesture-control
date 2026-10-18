import * as THREE from 'three';

/**
 * Generates an ultra-realistic, multi-layered hardwood grain texture.
 * Simulates quartersawn oak / American black walnut with growth rings,
 * medullary rays, pores, and hand-rubbed satin lacquer.
 */
export function createWoodTexture(size = 1024, isDarkCabinet = false): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d')!;

  // Color palette: rich warm walnut / mahogany
  const baseColor = isDarkCabinet ? '#381f12' : '#6b3e20';
  const midColor = isDarkCabinet ? '#4a2a19' : '#824d29';
  const deepGrain = isDarkCabinet ? '#241309' : '#4d2812';
  const lightAmber = isDarkCabinet ? '#5c351f' : '#9e6236';

  // Base stain
  ctx.fillStyle = baseColor;
  ctx.fillRect(0, 0, size, size);

  // Gradient tonal variation across the board (lighting wash)
  const wash = ctx.createLinearGradient(0, 0, size, size);
  wash.addColorStop(0, 'rgba(255, 220, 180, 0.08)');
  wash.addColorStop(0.5, 'rgba(0, 0, 0, 0)');
  wash.addColorStop(1, 'rgba(30, 15, 5, 0.25)');
  ctx.fillStyle = wash;
  ctx.fillRect(0, 0, size, size);

  // Layer 1: Broad annual growth rings with natural waviness
  const numRings = 95;
  for (let i = 0; i < numRings; i++) {
    const y = (i / numRings) * size;
    const waveFreq1 = 0.008 + (i % 7) * 0.002;
    const waveFreq2 = 0.025 + (i % 4) * 0.005;
    const waveAmp1 = 18 + (i % 6) * 5;
    const waveAmp2 = 5 + (i % 3) * 3;

    ctx.beginPath();
    ctx.moveTo(0, y);

    for (let x = 0; x <= size; x += 6) {
      const offset =
        Math.sin(x * waveFreq1) * waveAmp1 +
        Math.cos(x * waveFreq2) * waveAmp2 +
        Math.sin(x * 0.06) * 2;
      ctx.lineTo(x, y + offset);
    }

    ctx.strokeStyle = i % 2 === 0 ? deepGrain : lightAmber;
    ctx.lineWidth = 1.6 + (i % 4) * 1.0;
    ctx.globalAlpha = 0.38 + (i % 5) * 0.12;
    ctx.stroke();
  }

  // Layer 2: Fine longitudinal wood fibers (capillary streaks)
  ctx.globalAlpha = 0.18;
  ctx.fillStyle = isDarkCabinet ? '#170c06' : '#331a0b';
  for (let j = 0; j < 2500; j++) {
    const fx = Math.random() * size;
    const fy = Math.random() * size;
    const flen = 30 + Math.random() * 120;
    const fthick = 0.8 + Math.random() * 1.2;
    ctx.fillRect(fx, fy, flen, fthick);
  }

  // Layer 3: Wood pores (open-grain micro-dots)
  ctx.globalAlpha = 0.14;
  ctx.fillStyle = '#0f0703';
  for (let k = 0; k < 3000; k++) {
    const px = Math.random() * size;
    const py = Math.random() * size;
    ctx.fillRect(px, py, 2.5, 1.0);
  }

  // Layer 3.5: medullary rays / figured shimmer for premium hardwood feel
  ctx.globalAlpha = 0.08;
  ctx.strokeStyle = isDarkCabinet ? '#b07a47' : '#d79b62';
  for (let i = 0; i < 320; i++) {
    const x = Math.random() * size;
    const y = Math.random() * size;
    const len = 10 + Math.random() * 35;
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.lineTo(x + len * 0.18, y + len);
    ctx.stroke();
  }

  // Layer 4: Subtle satin lacquer sheen & vignette
  const vignette = ctx.createRadialGradient(size / 2, size / 2, size * 0.25, size / 2, size / 2, size * 0.72);
  vignette.addColorStop(0, 'rgba(255,255,255,0.03)');
  vignette.addColorStop(0.7, 'rgba(0,0,0,0)');
  vignette.addColorStop(1, 'rgba(10,5,2,0.38)');
  ctx.globalAlpha = 1.0;
  ctx.fillStyle = vignette;
  ctx.fillRect(0, 0, size, size);

  const texture = new THREE.CanvasTexture(canvas);
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

/**
 * Generates high-detail normal / bump map for physical wood texture.
 */
export function createWoodBumpTexture(size = 512): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d')!;

  ctx.fillStyle = '#808080';
  ctx.fillRect(0, 0, size, size);

  // Grain ridges
  ctx.globalAlpha = 0.28;
  for (let i = 0; i < 75; i++) {
    const y = (i / 75) * size;
    ctx.beginPath();
    ctx.moveTo(0, y);
    for (let x = 0; x <= size; x += 8) {
      const offset = Math.sin(x * 0.015) * 14 + Math.cos(x * 0.035) * 4;
      ctx.lineTo(x, y + offset);
    }
    ctx.strokeStyle = i % 2 === 0 ? '#2b2b2b' : '#d4d4d4';
    ctx.lineWidth = 2.2;
    ctx.stroke();
  }

  // Pores for roughness variation
  ctx.globalAlpha = 0.2;
  ctx.fillStyle = '#111111';
  for (let j = 0; j < 1500; j++) {
    ctx.fillRect(Math.random() * size, Math.random() * size, 3, 1.2);
  }

  const texture = new THREE.CanvasTexture(canvas);
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  return texture;
}

/**
 * Honey-walnut playing surface with long, hand-finished planks.  The cabinet
 * intentionally uses a much darker figured timber; keeping the field lighter
 * makes routes, holes and the steel ball legible from the showcase camera.
 */
export function createPlayingFieldTexture(size = 1024): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d')!;
  const plankCount = 10;
  const plankH = size / plankCount;

  ctx.fillStyle = '#70421f';
  ctx.fillRect(0, 0, size, size);

  for (let row = 0; row < plankCount; row++) {
    const y = row * plankH;
    const warm = row % 3 === 0 ? '#875127' : row % 3 === 1 ? '#79451f' : '#693718';
    const cool = row % 2 === 0 ? '#4f2711' : '#5d3117';
    const plank = ctx.createLinearGradient(0, y, size, y + plankH);
    plank.addColorStop(0, warm);
    plank.addColorStop(0.48, '#925828');
    plank.addColorStop(1, cool);
    ctx.fillStyle = plank;
    ctx.fillRect(0, y, size, plankH);

    // Fine longitudinal fibres follow the board direction, rather than making
    // a noisy all-over texture that competes with the maze geometry.
    for (let line = 0; line < 10; line++) {
      const ly = y + 9 + ((line * 29 + row * 11) % Math.max(16, plankH - 18));
      ctx.beginPath();
      ctx.moveTo(0, ly);
      for (let x = 0; x <= size; x += 18) {
        ctx.lineTo(x, ly + Math.sin(x * 0.024 + row * 1.9 + line) * 1.7);
      }
      ctx.strokeStyle = line % 4 === 0 ? 'rgba(40,18,7,0.16)' : 'rgba(255,205,130,0.05)';
      ctx.lineWidth = line % 5 === 0 ? 1.1 : 0.5;
      ctx.stroke();
    }

    // A soft seam and a broken, hand-laid joint give scale without turning the
    // board into a high-contrast checkerboard.
    ctx.fillStyle = 'rgba(38, 18, 7, 0.25)';
    ctx.fillRect(0, y + plankH - 1.35, size, 1.35);
    ctx.fillStyle = 'rgba(255, 215, 151, 0.06)';
    ctx.fillRect(0, y + 1.1, size, 0.7);
    const jointX = ((row % 2) * 0.5 + 0.5) * size;
    ctx.fillStyle = 'rgba(52, 27, 13, 0.14)';
    ctx.fillRect(jointX - 0.8, y + 10, 1.6, plankH - 20);
  }

  const lacquer = ctx.createRadialGradient(size * 0.32, size * 0.24, size * 0.06, size * 0.5, size * 0.52, size * 0.78);
  lacquer.addColorStop(0, 'rgba(255, 213, 143, 0.1)');
  lacquer.addColorStop(0.48, 'rgba(255, 214, 145, 0.02)');
  lacquer.addColorStop(1, 'rgba(24, 9, 3, 0.34)');
  ctx.fillStyle = lacquer;
  ctx.fillRect(0, 0, size, size);

  const texture = new THREE.CanvasTexture(canvas);
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = 8;
  return texture;
}

/**
 * Generates brushed brass texture with directional lathe grooves and rivet marks.
 */
export function createBrushedBrassTexture(size = 256): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d')!;

  // Base warm brass
  ctx.fillStyle = '#bf9551';
  ctx.fillRect(0, 0, size, size);

  // Broad tone variation
  const wash = ctx.createLinearGradient(0, 0, size, size);
  wash.addColorStop(0, 'rgba(255,232,173,0.16)');
  wash.addColorStop(0.5, 'rgba(0,0,0,0)');
  wash.addColorStop(1, 'rgba(86,54,18,0.24)');
  ctx.fillStyle = wash;
  ctx.fillRect(0, 0, size, size);

  // Brushed micro-streaks and lathe lines
  for (let y = 0; y < size; y += 1.35) {
    const tone = y % 4 === 0 ? '#f8e8a7' : y % 3 === 0 ? '#98702e' : '#d0ab5b';
    ctx.globalAlpha = 0.09 + ((y % 7) / 40);
    ctx.fillStyle = tone;
    ctx.fillRect(0, y, size, 1);
  }

  // Fine scratches / wear
  ctx.globalAlpha = 0.08;
  for (let i = 0; i < 500; i++) {
    const x = Math.random() * size;
    const y = Math.random() * size;
    const len = 6 + Math.random() * 28;
    ctx.fillStyle = i % 2 === 0 ? '#fff4bf' : '#7a5920';
    ctx.fillRect(x, y, len, 0.7);
  }

  // Tarnish specks
  ctx.globalAlpha = 0.06;
  for (let i = 0; i < 450; i++) {
    const x = Math.random() * size;
    const y = Math.random() * size;
    const r = 0.4 + Math.random() * 1.2;
    ctx.fillStyle = i % 2 === 0 ? '#6b4a16' : '#2f2410';
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fill();
  }

  // Subtle circular lathe sheen
  const grad = ctx.createRadialGradient(size / 2, size / 2, 5, size / 2, size / 2, size * 0.55);
  grad.addColorStop(0, 'rgba(255, 245, 180, 0.22)');
  grad.addColorStop(0.5, 'rgba(160, 120, 45, 0.1)');
  grad.addColorStop(1, 'rgba(60, 40, 10, 0.35)');
  ctx.globalAlpha = 1.0;
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, size, size);

  const texture = new THREE.CanvasTexture(canvas);
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

/** Generates a subtle bump map for machined brass parts. */
export function createBrassBumpTexture(size = 256): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d')!;

  ctx.fillStyle = '#7f7f7f';
  ctx.fillRect(0, 0, size, size);

  for (let y = 0; y < size; y += 2) {
    const tone = y % 6 === 0 ? '#9a9a9a' : '#676767';
    ctx.globalAlpha = 0.28;
    ctx.fillStyle = tone;
    ctx.fillRect(0, y, size, 1);
  }

  ctx.globalAlpha = 0.16;
  for (let i = 0; i < 380; i++) {
    const x = Math.random() * size;
    const y = Math.random() * size;
    const len = 4 + Math.random() * 18;
    ctx.fillStyle = i % 2 === 0 ? '#b8b8b8' : '#474747';
    ctx.fillRect(x, y, len, 0.8);
  }

  const texture = new THREE.CanvasTexture(canvas);
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  return texture;
}

/**
 * Generates finish target concentric decal texture with engraved brass laurels and star.
 */
export function createTargetTexture(size = 512): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d')!;

  const center = size / 2;
  const radius = size * 0.44;

  // Outer brass bezel
  ctx.beginPath();
  ctx.arc(center, center, radius, 0, Math.PI * 2);
  ctx.fillStyle = '#1a140e';
  ctx.fill();
  ctx.lineWidth = 12;
  ctx.strokeStyle = '#d4af37';
  ctx.stroke();

  // Fine brass measurement ticks (compass rose feel)
  const ticks = 36;
  ctx.strokeStyle = '#b89430';
  ctx.lineWidth = 2.5;
  for (let t = 0; t < ticks; t++) {
    const angle = (t * Math.PI * 2) / ticks;
    const r1 = radius - 14;
    const r2 = radius - (t % 3 === 0 ? 26 : 20);
    ctx.beginPath();
    ctx.moveTo(center + Math.cos(angle) * r1, center + Math.sin(angle) * r1);
    ctx.lineTo(center + Math.cos(angle) * r2, center + Math.sin(angle) * r2);
    ctx.stroke();
  }

  // Checkered race flag inner disc
  const segs = 20;
  const innerR = radius - 30;
  for (let i = 0; i < segs; i++) {
    const a1 = (i * Math.PI * 2) / segs;
    const a2 = ((i + 1) * Math.PI * 2) / segs;
    ctx.beginPath();
    ctx.moveTo(center, center);
    ctx.arc(center, center, innerR, a1, a2);
    ctx.closePath();
    ctx.fillStyle = i % 2 === 0 ? '#d4af37' : '#14120f';
    ctx.fill();
  }

  // Inner brass medallion
  ctx.beginPath();
  ctx.arc(center, center, innerR * 0.46, 0, Math.PI * 2);
  ctx.fillStyle = '#1c150c';
  ctx.fill();
  ctx.lineWidth = 6;
  ctx.strokeStyle = '#f5e084';
  ctx.stroke();

  // Center gold star
  ctx.fillStyle = '#ffd700';
  ctx.font = 'bold 64px serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.shadowColor = '#000000';
  ctx.shadowBlur = 8;
  ctx.fillText('★', center, center + 4);

  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

/**
 * Hand-carved style floral decoration for top-facing hardwood trim.
 * A transparent decal with offset dark cuts and amber highlights creates
 * an engraving illusion without adding per-frame geometry or GPU cost.
 * The pattern is generated locally, never loaded from a remote image.
 */
export function createCarvedTrimTexture(vertical = false): THREE.CanvasTexture {
  const long = 1600;
  const short = 172;
  const canvas = document.createElement('canvas');
  canvas.width = vertical ? short : long;
  canvas.height = vertical ? long : short;
  const ctx = canvas.getContext('2d')!;
  if (vertical) {
    ctx.translate(short, 0);
    ctx.rotate(Math.PI / 2);
  }

  // Dark grooves with slightly offset warm reflection along each cut.
  const engrave = (draw: () => void, width = 6) => {
    ctx.save();
    ctx.translate(2, 3);
    ctx.strokeStyle = 'rgba(11, 5, 2, 0.95)';
    ctx.lineWidth = width + 3;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    draw();
    ctx.stroke();
    ctx.restore();
    ctx.save();
    ctx.translate(-1.5, -2);
    ctx.strokeStyle = 'rgba(185, 119, 57, 0.72)';
    ctx.lineWidth = Math.max(1.5, width * .46);
    ctx.lineCap = 'round';
    draw();
    ctx.stroke();
    ctx.restore();
  };

  // Two fine hand-tooled borders following the length of the frame.
  for (const y of [13, 159]) {
    engrave(() => {
      ctx.beginPath();
      ctx.moveTo(19, y);
      ctx.lineTo(long - 19, y);
    }, 3);
  }

  // Nine slightly different acanthus groups; no perfectly repeated texture stamps.
  for (let i = 0; i < 9; i++) {
    const ox = 96 + i * 174;
    const twist = Math.sin(i * 1.97) * 15;
    const wing = i % 2 === 0 ? 1 : -1;
    ctx.save();
    ctx.translate(ox, 86);
    ctx.scale(wing, 1);
    engrave(() => {
      ctx.beginPath();
      ctx.moveTo(-70, 20);
      ctx.bezierCurveTo(-49, -38 + twist, -12, -37, 0, 0);
      ctx.bezierCurveTo(10, 49, 62, 40 - twist, 66, 2);
      ctx.bezierCurveTo(70, -26, 30, -34, 16, -13);
    }, 7);
    engrave(() => {
      ctx.beginPath();
      ctx.moveTo(-58, 22);
      ctx.bezierCurveTo(-84, 4, -67, -46, -39, -38);
      ctx.bezierCurveTo(-10, -31, -40, 4, -49, 4);
    }, 5);
    engrave(() => {
      ctx.beginPath();
      ctx.moveTo(33, 23);
      ctx.bezierCurveTo(53, 45, 76, 20, 62, -10);
      ctx.bezierCurveTo(42, -43, 23, -6, 44, 3);
    }, 5);
    // Embossed, veined leaves branching off each stem.
    for (let j = 0; j < 4; j++) {
      const x = -44 + j * 26;
      const y = -7 + 15 * Math.sin(j * 2 + i);
      const up = j % 2 === 0 ? -1 : 1;
      ctx.beginPath();
      ctx.moveTo(x - 12, y);
      ctx.quadraticCurveTo(x + 7, y + up * 36, x + 26, y + up * 14);
      ctx.quadraticCurveTo(x + 20, y - up * 11, x - 12, y);
      ctx.fillStyle = 'rgba(31, 12, 5, 0.60)';
      ctx.fill();
      engrave(() => {
        ctx.beginPath();
        ctx.moveTo(x - 12, y);
        ctx.quadraticCurveTo(x + 7, y + up * 36, x + 26, y + up * 14);
        ctx.quadraticCurveTo(x + 20, y - up * 11, x - 12, y);
      }, 4);
      engrave(() => {
        ctx.beginPath();
        ctx.moveTo(x - 9, y);
        ctx.quadraticCurveTo(x + 8, y + up * 9, x + 23, y + up * 13);
      }, 2);
    }
    // Alternating rosettes create a distinct bespoke rhythm.
    if (i % 2 === 0) {
      for (let j = 0; j < 7; j++) {
        const angle = j * Math.PI * 2 / 7;
        engrave(() => {
          ctx.beginPath();
          ctx.ellipse(1 + Math.cos(angle) * 8, Math.sin(angle) * 8,
            8, 15, angle + Math.PI/2, 0, Math.PI * 2);
        }, 2.8);
      }
      ctx.beginPath();
      ctx.arc(1, 0, 6, 0, Math.PI * 2);
      ctx.fillStyle = '#8b5527';
      ctx.fill();
    }
    ctx.restore();
  }
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = 8;
  return texture;
}


/** Rich leather desk-mat texture for the presentation scene. */
export function createLeatherTexture(size = 512, base = '#3d2418'): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d')!;

  const grad = ctx.createLinearGradient(0, 0, size, size);
  grad.addColorStop(0, base);
  grad.addColorStop(0.55, '#2a1710');
  grad.addColorStop(1, '#4f2d1b');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, size, size);

  // soft marbling and leather pores
  for (let i = 0; i < 1700; i++) {
    const x = Math.random() * size;
    const y = Math.random() * size;
    const r = 0.5 + Math.random() * 2.0;
    ctx.fillStyle = Math.random() > 0.5 ? 'rgba(255,255,255,0.035)' : 'rgba(0,0,0,0.045)';
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fill();
  }

  // subtle pull-up / patina streaks
  ctx.globalAlpha = 0.08;
  for (let i = 0; i < 120; i++) {
    const y = Math.random() * size;
    const h = 4 + Math.random() * 18;
    ctx.fillStyle = i % 2 === 0 ? '#a66a49' : '#1d100b';
    ctx.fillRect(0, y, size, h * 0.08);
  }
  ctx.globalAlpha = 1;

  // stitched border impression
  ctx.strokeStyle = 'rgba(232,201,150,0.26)';
  ctx.lineWidth = size * 0.018;
  ctx.strokeRect(size * 0.06, size * 0.06, size * 0.88, size * 0.88);
  ctx.setLineDash([size * 0.012, size * 0.016]);
  ctx.lineWidth = size * 0.004;
  ctx.strokeStyle = 'rgba(245,225,181,0.48)';
  ctx.strokeRect(size * 0.095, size * 0.095, size * 0.81, size * 0.81);
  ctx.setLineDash([]);

  const texture = new THREE.CanvasTexture(canvas);
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

/** Engraved brass plaque texture for the cabinet front. */
export function createPlaqueTexture(width = 1024, height = 320): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d')!;

  const grad = ctx.createLinearGradient(0, 0, width, height);
  grad.addColorStop(0, '#d4b36a');
  grad.addColorStop(0.5, '#8f6428');
  grad.addColorStop(1, '#e4c57a');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, width, height);

  // brushed feel
  ctx.globalAlpha = 0.13;
  for (let y = 0; y < height; y += 2) {
    ctx.fillStyle = y % 4 === 0 ? '#fff2c0' : '#8b6227';
    ctx.fillRect(0, y, width, 1);
  }
  ctx.globalAlpha = 1;

  ctx.strokeStyle = 'rgba(60,35,12,0.55)';
  ctx.lineWidth = 14;
  ctx.strokeRect(20, 20, width - 40, height - 40);
  ctx.lineWidth = 4;
  ctx.strokeStyle = 'rgba(255,242,194,0.55)';
  ctx.strokeRect(34, 34, width - 68, height - 68);

  // center title
  ctx.fillStyle = 'rgba(73,43,10,0.95)';
  ctx.font = 'bold 90px Georgia';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText('Balance Maze', width / 2, height / 2 - 8);

  ctx.font = '28px Georgia';
  ctx.fillStyle = 'rgba(95,58,16,0.88)';
  ctx.fillText('Precision Hand-Controlled Labyrinth', width / 2, height / 2 + 52);

  // decorative lines
  ctx.strokeStyle = 'rgba(88,54,18,0.8)';
  ctx.lineWidth = 4;
  ctx.beginPath();
  ctx.moveTo(120, height / 2);
  ctx.lineTo(280, height / 2);
  ctx.moveTo(width - 120, height / 2);
  ctx.lineTo(width - 280, height / 2);
  ctx.stroke();

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}
