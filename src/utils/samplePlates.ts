export interface SamplePlateMeta {
  id: 'portrait' | 'workshop' | 'alpine';
  title: string;
  subtitle: string;
  cameraSpec: string;
  aspectLabel: string;
  recommendedPreset: 'natural' | 'warm-portrait' | 'soft-cinematic';
  width: number;
  height: number;
}

export const SAMPLE_PLATES: SamplePlateMeta[] = [
  {
    id: 'portrait',
    title: 'Window-Lit Studio Portrait',
    subtitle: 'Natural complexion · subtle indoor shadow cast · wire-frame glasses',
    cameraSpec: '50mm f/2.8 · ISO 400 · 1/125s · sRGB',
    aspectLabel: '3:4 Portrait',
    recommendedPreset: 'warm-portrait',
    width: 720,
    height: 900,
  },
  {
    id: 'workshop',
    title: 'Artisan Sunlit Doorway',
    subtitle: 'High dynamic range · deep timber shadows · warm afternoon highlights',
    cameraSpec: '35mm f/2.0 · ISO 200 · 1/250s · sRGB',
    aspectLabel: '4:3 Documentary',
    recommendedPreset: 'natural',
    width: 880,
    height: 660,
  },
  {
    id: 'alpine',
    title: 'Alpine Timber Refuge at Dusk',
    subtitle: 'Cool twilight white balance · atmospheric pine valley · fine architectural detail',
    cameraSpec: '28mm f/4.0 · ISO 160 · 1/60s · sRGB',
    aspectLabel: '16:9 Landscape',
    recommendedPreset: 'soft-cinematic',
    width: 960,
    height: 540,
  },
];

/**
 * Deterministic PRNG for realistic photographic film grain and skin pore micro-texture.
 */
function mulberry32(seed: number) {
  let a = seed;
  return function () {
    let t = (a += 0x6d2b79f5);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * Renders a rich, realistic, unretouched photographic plate onto an offscreen canvas
 * and returns a real JPEG data URL ready for upload or preview.
 */
export function renderSamplePlateDataUrl(
  plateId: 'portrait' | 'workshop' | 'alpine',
  scale = 1
): string {
  const plate = SAMPLE_PLATES.find((p) => p.id === plateId) || SAMPLE_PLATES[0];
  const width = Math.round(plate.width * scale);
  const height = Math.round(plate.height * scale);

  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  if (!ctx) return '';

  const rand = mulberry32(plateId === 'portrait' ? 1042 : plateId === 'workshop' ? 2089 : 3099);

  if (plateId === 'portrait') {
    // Soft window-lit studio background with slightly cool/flat raw exposure
    const bgGrad = ctx.createLinearGradient(0, 0, width, height);
    bgGrad.addColorStop(0, '#383E48');
    bgGrad.addColorStop(0.5, '#272C35');
    bgGrad.addColorStop(1, '#191C22');
    ctx.fillStyle = bgGrad;
    ctx.fillRect(0, 0, width, height);

    // Window light shaft on left backdrop
    const windowLight = ctx.createRadialGradient(
      width * 0.15,
      height * 0.25,
      width * 0.05,
      width * 0.25,
      height * 0.35,
      width * 0.65
    );
    windowLight.addColorStop(0, 'rgba(218, 224, 232, 0.22)');
    windowLight.addColorStop(1, 'rgba(30, 34, 42, 0)');
    ctx.fillStyle = windowLight;
    ctx.fillRect(0, 0, width, height);

    // Smooth anatomical neck and collarbone contour with natural chin shadow
    const neckGrad = ctx.createLinearGradient(width * 0.41, height * 0.52, width * 0.59, height * 0.74);
    neckGrad.addColorStop(0, '#8A634F');
    neckGrad.addColorStop(0.35, '#BD8F76');
    neckGrad.addColorStop(1, '#966E59');
    ctx.fillStyle = neckGrad;
    ctx.beginPath();
    ctx.moveTo(width * 0.425, height * 0.54);
    ctx.quadraticCurveTo(width * 0.43, height * 0.66, width * 0.36, height * 0.74);
    ctx.lineTo(width * 0.64, height * 0.74);
    ctx.quadraticCurveTo(width * 0.57, height * 0.66, width * 0.575, height * 0.54);
    ctx.closePath();
    ctx.fill();

    // Shoulders / charcoal linen garment with tailored v-neck collar
    const coatGrad = ctx.createLinearGradient(width * 0.15, height * 0.68, width * 0.85, height);
    coatGrad.addColorStop(0, '#2B3038');
    coatGrad.addColorStop(1, '#171A1F');
    ctx.fillStyle = coatGrad;
    ctx.beginPath();
    ctx.moveTo(width * 0.12, height);
    ctx.quadraticCurveTo(width * 0.18, height * 0.71, width * 0.39, height * 0.69);
    ctx.lineTo(width * 0.5, height * 0.79);
    ctx.lineTo(width * 0.61, height * 0.69);
    ctx.quadraticCurveTo(width * 0.82, height * 0.71, width * 0.88, height);
    ctx.closePath();
    ctx.fill();

    // Hair silhouette (layered crown and side locks)
    const hairBack = ctx.createRadialGradient(
      width * 0.48,
      height * 0.34,
      width * 0.05,
      width * 0.5,
      height * 0.39,
      width * 0.27
    );
    hairBack.addColorStop(0, '#362820');
    hairBack.addColorStop(0.6, '#221914');
    hairBack.addColorStop(1, '#120E0B');
    ctx.fillStyle = hairBack;
    ctx.beginPath();
    ctx.ellipse(width * 0.5, height * 0.39, width * 0.225, height * 0.235, 0, 0, Math.PI * 2);
    ctx.fill();

    // Soft ambient occlusion shadow beneath chin
    const chinShadow = ctx.createRadialGradient(
      width * 0.5,
      height * 0.57,
      width * 0.02,
      width * 0.5,
      height * 0.58,
      width * 0.12
    );
    chinShadow.addColorStop(0, 'rgba(42, 26, 18, 0.55)');
    chinShadow.addColorStop(1, 'rgba(42, 26, 18, 0)');
    ctx.fillStyle = chinShadow;
    ctx.beginPath();
    ctx.ellipse(width * 0.5, height * 0.58, width * 0.11, height * 0.06, 0, 0, Math.PI * 2);
    ctx.fill();

    // Sculpted face contour with natural key-to-fill directional window illumination
    const faceGrad = ctx.createRadialGradient(
      width * 0.43,
      height * 0.35,
      width * 0.02,
      width * 0.5,
      height * 0.4,
      width * 0.21
    );
    faceGrad.addColorStop(0, '#E5B9A0'); // Soft window key highlight on cheek/forehead
    faceGrad.addColorStop(0.5, '#CA9A80'); // Midtone natural complexion
    faceGrad.addColorStop(0.85, '#A77962'); // Subtle cheekbone roll-off
    faceGrad.addColorStop(1, '#8C624D'); // Natural fill side shadow
    ctx.fillStyle = faceGrad;
    ctx.beginPath();
    ctx.moveTo(width * 0.34, height * 0.36);
    ctx.quadraticCurveTo(width * 0.34, height * 0.21, width * 0.5, height * 0.21);
    ctx.quadraticCurveTo(width * 0.66, height * 0.21, width * 0.66, height * 0.36);
    ctx.quadraticCurveTo(width * 0.65, height * 0.54, width * 0.5, height * 0.585);
    ctx.quadraticCurveTo(width * 0.35, height * 0.54, width * 0.34, height * 0.36);
    ctx.closePath();
    ctx.fill();

    // Soft side-parted hair bangs framing forehead
    ctx.fillStyle = '#1E1612';
    ctx.beginPath();
    ctx.moveTo(width * 0.33, height * 0.35);
    ctx.quadraticCurveTo(width * 0.38, height * 0.2, width * 0.52, height * 0.22);
    ctx.quadraticCurveTo(width * 0.42, height * 0.26, width * 0.34, height * 0.37);
    ctx.closePath();
    ctx.fill();
    ctx.beginPath();
    ctx.moveTo(width * 0.67, height * 0.35);
    ctx.quadraticCurveTo(width * 0.63, height * 0.21, width * 0.49, height * 0.22);
    ctx.quadraticCurveTo(width * 0.59, height * 0.26, width * 0.66, height * 0.37);
    ctx.closePath();
    ctx.fill();

    // Natural eyebrows
    ctx.strokeStyle = 'rgba(46, 33, 25, 0.78)';
    ctx.lineWidth = Math.max(3, width * 0.0065);
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(width * 0.405, height * 0.348);
    ctx.quadraticCurveTo(width * 0.44, height * 0.336, width * 0.472, height * 0.346);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(width * 0.528, height * 0.346);
    ctx.quadraticCurveTo(width * 0.56, height * 0.336, width * 0.595, height * 0.348);
    ctx.stroke();

    // Subtle nose bridge highlight and soft shadow
    ctx.strokeStyle = 'rgba(245, 215, 198, 0.35)';
    ctx.lineWidth = Math.max(2, width * 0.0045);
    ctx.beginPath();
    ctx.moveTo(width * 0.496, height * 0.355);
    ctx.lineTo(width * 0.493, height * 0.435);
    ctx.stroke();

    ctx.strokeStyle = 'rgba(112, 76, 58, 0.48)';
    ctx.lineWidth = Math.max(2, width * 0.0038);
    ctx.beginPath();
    ctx.moveTo(width * 0.504, height * 0.358);
    ctx.lineTo(width * 0.508, height * 0.438);
    ctx.quadraticCurveTo(width * 0.5, height * 0.448, width * 0.486, height * 0.442);
    ctx.stroke();

    // Eyes with upper lash line and natural window catchlights
    const drawEye = (cx: number, cy: number) => {
      ctx.fillStyle = '#EAE4DE';
      ctx.beginPath();
      ctx.ellipse(cx, cy, width * 0.025, height * 0.0095, 0, 0, Math.PI * 2);
      ctx.fill();

      ctx.fillStyle = '#4E3929';
      ctx.beginPath();
      ctx.arc(cx, cy, width * 0.0105, 0, Math.PI * 2);
      ctx.fill();

      ctx.fillStyle = '#151210';
      ctx.beginPath();
      ctx.arc(cx, cy, width * 0.005, 0, Math.PI * 2);
      ctx.fill();

      // Upper eyelid crease
      ctx.strokeStyle = 'rgba(55, 38, 28, 0.75)';
      ctx.lineWidth = Math.max(1.5, width * 0.003);
      ctx.beginPath();
      ctx.arc(cx, cy + height * 0.002, width * 0.025, Math.PI * 1.12, Math.PI * 1.88);
      ctx.stroke();

      // Window catchlight
      ctx.fillStyle = 'rgba(255, 252, 245, 0.92)';
      ctx.beginPath();
      ctx.arc(cx - width * 0.0038, cy - height * 0.0025, width * 0.0026, 0, Math.PI * 2);
      ctx.fill();
    };
    drawEye(width * 0.44, height * 0.376);
    drawEye(width * 0.56, height * 0.376);

    // Thin wire-frame glasses with natural reflection
    ctx.strokeStyle = '#CBBAA6';
    ctx.lineWidth = Math.max(1.5, width * 0.0028);
    ctx.beginPath();
    ctx.arc(width * 0.44, height * 0.378, width * 0.041, 0, Math.PI * 2);
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(width * 0.56, height * 0.378, width * 0.041, 0, Math.PI * 2);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(width * 0.481, height * 0.376);
    ctx.lineTo(width * 0.519, height * 0.376);
    ctx.stroke();

    // Subtle glasses reflection diagonal
    ctx.strokeStyle = 'rgba(240, 246, 255, 0.28)';
    ctx.lineWidth = Math.max(2, width * 0.0045);
    ctx.beginPath();
    ctx.moveTo(width * 0.415, height * 0.362);
    ctx.lineTo(width * 0.433, height * 0.39);
    ctx.moveTo(width * 0.535, height * 0.362);
    ctx.lineTo(width * 0.553, height * 0.39);
    ctx.stroke();

    // Natural two-tone lips
    ctx.fillStyle = '#9E6559';
    ctx.beginPath();
    ctx.moveTo(width * 0.462, height * 0.49);
    ctx.quadraticCurveTo(width * 0.5, height * 0.476, width * 0.538, height * 0.49);
    ctx.quadraticCurveTo(width * 0.5, height * 0.495, width * 0.462, height * 0.49);
    ctx.fill();

    ctx.fillStyle = '#B37669';
    ctx.beginPath();
    ctx.moveTo(width * 0.464, height * 0.49);
    ctx.quadraticCurveTo(width * 0.5, height * 0.512, width * 0.536, height * 0.49);
    ctx.closePath();
    ctx.fill();
  } else if (plateId === 'workshop') {
    // Artisan doorway: deep warm timber shadows on left, golden afternoon light on right
    const bg = ctx.createLinearGradient(0, 0, width, height);
    bg.addColorStop(0, '#221B15');
    bg.addColorStop(0.55, '#4A3628');
    bg.addColorStop(1, '#D6A46F');
    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, width, height);

    // Sunlit garden foliage outside doorway (testing controlled green tones)
    const foliageGrad = ctx.createLinearGradient(width * 0.62, 0, width, height * 0.85);
    foliageGrad.addColorStop(0, '#5A7D46');
    foliageGrad.addColorStop(1, '#3A542C');
    ctx.fillStyle = foliageGrad;
    ctx.fillRect(width * 0.65, height * 0.08, width * 0.28, height * 0.78);

    // Subject silhouette & warm portrait face
    const subjGrad = ctx.createRadialGradient(
      width * 0.46,
      height * 0.42,
      width * 0.02,
      width * 0.44,
      height * 0.44,
      width * 0.18
    );
    subjGrad.addColorStop(0, '#E2B494');
    subjGrad.addColorStop(0.6, '#BA8769');
    subjGrad.addColorStop(1, '#75503C');
    ctx.fillStyle = subjGrad;
    ctx.beginPath();
    ctx.ellipse(width * 0.44, height * 0.44, width * 0.13, height * 0.18, 0, 0, Math.PI * 2);
    ctx.fill();

    // Work apron & shoulders
    ctx.fillStyle = '#332C27';
    ctx.beginPath();
    ctx.ellipse(width * 0.44, height * 0.88, width * 0.28, height * 0.26, 0, Math.PI, 0, false);
    ctx.fill();
  } else {
    // Alpine refuge at dusk: cool twilight sky, mountain ridge, warm cabin window
    const sky = ctx.createLinearGradient(0, 0, 0, height * 0.65);
    sky.addColorStop(0, '#24344D');
    sky.addColorStop(0.6, '#48607E');
    sky.addColorStop(1, '#8BA0B5');
    ctx.fillStyle = sky;
    ctx.fillRect(0, 0, width, height * 0.65);

    // Alpine peaks
    ctx.fillStyle = '#2B394A';
    ctx.beginPath();
    ctx.moveTo(0, height * 0.65);
    ctx.lineTo(width * 0.25, height * 0.32);
    ctx.lineTo(width * 0.52, height * 0.54);
    ctx.lineTo(width * 0.78, height * 0.26);
    ctx.lineTo(width, height * 0.58);
    ctx.lineTo(width, height);
    ctx.lineTo(0, height);
    ctx.closePath();
    ctx.fill();

    // Pine valley shadow foreground
    ctx.fillStyle = '#182421';
    ctx.fillRect(0, height * 0.64, width, height * 0.36);

    // Timber refuge structure with warm interior glow
    ctx.fillStyle = '#3D2E24';
    ctx.fillRect(width * 0.38, height * 0.52, width * 0.24, height * 0.16);
    ctx.fillStyle = '#F2B866';
    ctx.fillRect(width * 0.44, height * 0.56, width * 0.05, height * 0.06);
    ctx.fillRect(width * 0.51, height * 0.56, width * 0.05, height * 0.06);
  }

  // Add authentic sensor micro-grain and fine pore/surface texture at pixel level
  const imgData = ctx.getImageData(0, 0, width, height);
  const data = imgData.data;
  for (let i = 0; i < data.length; i += 4) {
    const grain = (rand() - 0.5) * 9;
    data[i] = Math.min(255, Math.max(0, Math.round(data[i] + grain)));
    data[i + 1] = Math.min(255, Math.max(0, Math.round(data[i + 1] + grain * 0.9)));
    data[i + 2] = Math.min(255, Math.max(0, Math.round(data[i + 2] + grain * 1.05)));
  }
  ctx.putImageData(imgData, 0, 0);

  return canvas.toDataURL('image/jpeg', 0.96);
}
