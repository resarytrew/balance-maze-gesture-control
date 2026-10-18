import React, { useEffect, useRef } from 'react';
import * as THREE from 'three';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import darkWalnutTabletopUrl from '../assets/dark-walnut-tabletop.png';
import honeyWalnutParquetUrl from '../assets/honey-walnut-parquet.png';
import type { BallState, GameStatus, LevelConfig, TiltState } from '../game/types.ts';
import {
  createBrushedBrassTexture,
  createBrassBumpTexture,
  createCarvedTrimTexture,
  createPlaqueTexture,
  createTargetTexture,
  createWoodBumpTexture,
  createWoodTexture,
} from '../game/textures.ts';
import { soundEngine } from '../game/audio.ts';
import { clampBoardTilt, BOARD_SIZE, CABINET_HEIGHT, TABLE_Y } from '../game/mechanics.ts';

interface ThreeLabyrinthProps {
  level: LevelConfig;
  tilt: TiltState;
  ball: BallState;
  liveTiltRef: React.RefObject<TiltState>;
  liveBallRef: React.RefObject<BallState>;
  gameStatus: GameStatus;
  collectedGems: Set<string>;
  impactSparks?: { x: number; z: number; intensity: number; key: number } | null;
  onMouseTilt?: (pitch: number, roll: number) => void;
  trackingMode: 'camera' | 'mouse' | 'keyboard';
}

export const ThreeLabyrinth: React.FC<ThreeLabyrinthProps> = ({
  level,
  tilt,
  ball,
  liveTiltRef,
  liveBallRef,
  gameStatus,
  collectedGems,
  impactSparks,
  onMouseTilt,
  trackingMode,
}) => {
  const mountRef = useRef<HTMLDivElement>(null);

  // Store latest props in refs for 60fps render loop
  const tiltRef = useRef<TiltState>(tilt);
  const ballRef = useRef<BallState>(ball);
  const levelRef = useRef<LevelConfig>(level);
  const statusRef = useRef<GameStatus>(gameStatus);
  const collectedGemsRef = useRef<Set<string>>(collectedGems);
  const impactSparksRef = useRef(impactSparks);
  const onMouseTiltRef = useRef(onMouseTilt);
  const trackingModeRef = useRef(trackingMode);

  tiltRef.current = tilt;
  ballRef.current = ball;
  levelRef.current = level;
  statusRef.current = gameStatus;
  collectedGemsRef.current = collectedGems;
  impactSparksRef.current = impactSparks;
  statusRef.current = gameStatus;
  collectedGemsRef.current = collectedGems;
  onMouseTiltRef.current = onMouseTilt;
  trackingModeRef.current = trackingMode;

  // Gimbal and scene references
  const midGimbalRef = useRef<THREE.Group | null>(null);
  const innerBoardRef = useRef<THREE.Group | null>(null);
  const ballMeshRef = useRef<THREE.Mesh | null>(null);
  const ballShadowRef = useRef<THREE.Mesh | null>(null);
  const sideKnobPitchRef = useRef<THREE.Group | null>(null);
  const frontKnobRollRef = useRef<THREE.Group | null>(null);
  const gemsMapRef = useRef<Map<string, THREE.Group>>(new Map());
  const particlesRef = useRef<THREE.Points | null>(null);

  // Dragging state for mouse mode
  const isDraggingRef = useRef(false);
  const dragStartRef = useRef({ x: 0, y: 0, initialRoll: 0, initialPitch: 0 });

  useEffect(() => {
    const container = mountRef.current;
    if (!container) return;

    const width = container.clientWidth || window.innerWidth;
    const height = container.clientHeight || window.innerHeight;

    const isHeadless =
      typeof navigator !== 'undefined' &&
      (navigator.webdriver || /HeadlessChrome/i.test(navigator.userAgent));

    // 1. Scene & Camera Setup
    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0x120b07);
    scene.fog = new THREE.FogExp2(0x120b07, 0.012);

    const camera = new THREE.PerspectiveCamera(35.5, width / height, 0.5, 120);
    // High, close-to-orthographic product framing: the field stays legible,
    // while the front apron and the two mechanical axes remain in view.
    const cameraOffsetX = width >= 1180 ? 2.8 : 0.25;
    camera.position.set(cameraOffsetX, 32.5, 23.5);
    camera.lookAt(cameraOffsetX - 0.85, -1.25, 0.2);

    // 2. Renderer with PBR ACES Filmic tone mapping
    const renderer = new THREE.WebGLRenderer({
      antialias: !isHeadless,
      powerPreference: 'high-performance',
    });
    renderer.setSize(width, height);
    renderer.setPixelRatio(isHeadless ? 1 : Math.min(window.devicePixelRatio, 2));
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 0.94;
    renderer.shadowMap.enabled = !isHeadless;
    renderer.shadowMap.type = THREE.PCFShadowMap;

    container.appendChild(renderer.domElement);

    // 3. Studio Environment Map (PMREM) for chrome ball reflections
    const pmremGenerator = new THREE.PMREMGenerator(renderer);
    pmremGenerator.compileEquirectangularShader();
    const envTexture = pmremGenerator.fromScene(new RoomEnvironment(), 0.04).texture;
    scene.environment = envTexture;
    pmremGenerator.dispose();

    // 4. Studio Lighting Rig
    const hemiLight = new THREE.HemisphereLight(0xf2b76d, 0x160a05, 0.48);
    scene.add(hemiLight);

    const keyLight = new THREE.DirectionalLight(0xffd29a, 1.7);
    keyLight.position.set(-15, 31, 19);
    keyLight.castShadow = !isHeadless;
    keyLight.shadow.mapSize.width = 1024;
    keyLight.shadow.mapSize.height = 1024;
    keyLight.shadow.camera.near = 6;
    keyLight.shadow.camera.far = 70;
    const d = 18;
    keyLight.shadow.camera.left = -d;
    keyLight.shadow.camera.right = d;
    keyLight.shadow.camera.top = d;
    keyLight.shadow.camera.bottom = -d;
    keyLight.shadow.bias = -0.0005;
    keyLight.shadow.normalBias = 0.02;
    scene.add(keyLight);

    const fillLight = new THREE.DirectionalLight(0x9c5c35, 0.28);
    fillLight.position.set(16, 12, -19);
    scene.add(fillLight);

    const rimLight = new THREE.DirectionalLight(0xffb24b, 0.82);
    rimLight.position.set(-13, 13, 17);
    scene.add(rimLight);

    // Warm table lamp glow
    const tableSpot = new THREE.PointLight(0xff9c36, 0.85, 38);
    tableSpot.position.set(-7, 13, 5);
    scene.add(tableSpot);

    // Low front fill: preserves detail in the cabinet apron that would
    // otherwise collapse to neutral grey when the top key light casts it in
    // shadow. It is deliberately dimmer than the key so the board stays warm
    // and dimensional, rather than flatly lit.
    const frontFill = new THREE.PointLight(0xa94f20, 0.52, 34);
    frontFill.position.set(1.5, 8.5, 19);
    scene.add(frontFill);

    // Workbench Table Surface
    const tableGeo = new THREE.PlaneGeometry(90, 90);
    const tabletopTex = new THREE.TextureLoader().load(darkWalnutTabletopUrl);
    tabletopTex.colorSpace = THREE.SRGBColorSpace;
    tabletopTex.wrapS = THREE.RepeatWrapping;
    tabletopTex.wrapT = THREE.RepeatWrapping;
    tabletopTex.repeat.set(4.5, 4.5);
    tabletopTex.anisotropy = renderer.capabilities.getMaxAnisotropy();
    const tableMat = new THREE.MeshPhysicalMaterial({
      map: tabletopTex,
      bumpMap: createWoodBumpTexture(512),
      bumpScale: 0.014,
      color: 0x6d4028,
      roughness: 0.68,
      metalness: 0.02,
      clearcoat: 0.16,
      clearcoatRoughness: 0.62,
    });
    const tableMesh = new THREE.Mesh(tableGeo, tableMat);
    tableMesh.rotation.x = -Math.PI / 2;
    tableMesh.position.y = TABLE_Y;
    tableMesh.receiveShadow = !isHeadless;
    scene.add(tableMesh);

    // Soft reflected pool of lamp light: intentionally material-driven rather
    // than a photographic background, so the board remains the focal object.
    const glowCanvas = document.createElement('canvas');
    glowCanvas.width = 256;
    glowCanvas.height = 256;
    const glowCtx = glowCanvas.getContext('2d')!;
    const glow = glowCtx.createRadialGradient(128, 128, 10, 128, 128, 126);
    glow.addColorStop(0, 'rgba(255, 173, 69, 0.34)');
    glow.addColorStop(0.42, 'rgba(194, 92, 25, 0.12)');
    glow.addColorStop(1, 'rgba(80, 25, 5, 0)');
    glowCtx.fillStyle = glow;
    glowCtx.fillRect(0, 0, 256, 256);
    const glowMesh = new THREE.Mesh(
      new THREE.PlaneGeometry(23, 23),
      new THREE.MeshBasicMaterial({
        map: new THREE.CanvasTexture(glowCanvas), transparent: true, depthWrite: false, opacity: 0.72,
      })
    );
    glowMesh.rotation.x = -Math.PI / 2;
    glowMesh.position.set(-11.5, TABLE_Y + 0.018, -5.5);
    scene.add(glowMesh);

    // Cabinet Ground Contact Shadow
    const shadowGeo = new THREE.PlaneGeometry(32, 32);
    const shadowCanvas = document.createElement('canvas');
    shadowCanvas.width = 256;
    shadowCanvas.height = 256;
    const sCtx = shadowCanvas.getContext('2d')!;
    const grad = sCtx.createRadialGradient(128, 128, 40, 128, 128, 126);
    grad.addColorStop(0, 'rgba(0,0,0,0.7)');
    grad.addColorStop(1, 'rgba(0,0,0,0)');
    sCtx.fillStyle = grad;
    sCtx.fillRect(0, 0, 256, 256);
    const shadowTex = new THREE.CanvasTexture(shadowCanvas);
    const shadowMat = new THREE.MeshBasicMaterial({
      map: shadowTex,
      transparent: true,
      depthWrite: false,
      opacity: 0.75,
    });
    const shadowMesh = new THREE.Mesh(shadowGeo, shadowMat);
    shadowMesh.rotation.x = -Math.PI / 2;
    shadowMesh.position.y = TABLE_Y + 0.02;
    scene.add(shadowMesh);

    // Peripheral studio props to frame the object like a premium tabletop render.
    const makeBookStack = (x: number, z: number, w: number, d: number, h: number, color: number) => {
      const g = new THREE.Group();
      const base = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), new THREE.MeshPhysicalMaterial({ color, roughness: 0.9, clearcoat: 0.05 }));
      base.castShadow = !isHeadless;
      base.receiveShadow = !isHeadless;
      g.add(base);
      const pages = new THREE.Mesh(new THREE.BoxGeometry(w * 0.93, h * 0.86, d * 0.9), new THREE.MeshStandardMaterial({ color: 0xe9ddc4, roughness: 0.88 }));
      pages.position.y = -0.02;
      g.add(pages);
      g.position.set(x, TABLE_Y + 0.09 + h * 0.5, z);
      g.rotation.y = 0.2;
      scene.add(g);
    };
    makeBookStack(15, -13, 7, 5.5, 1.2, 0x4b2a18);
    makeBookStack(-17, 12, 6.3, 4.8, 0.95, 0x352013);

    // A small living accent at the edge of the desk breaks the computer-render
    // silhouette without intruding into the maze or the controls.
    const makePottedPlant = (x: number, z: number) => {
      const plant = new THREE.Group();
      const terracotta = new THREE.MeshPhysicalMaterial({
        color: 0x6f2616, roughness: 0.68, metalness: 0.02, clearcoat: 0.12,
      });
      const soilMat = new THREE.MeshStandardMaterial({ color: 0x18100a, roughness: 1 });
      const leafMat = new THREE.MeshPhysicalMaterial({
        color: 0x1c4c28, roughness: 0.72, metalness: 0.0, clearcoat: 0.08, side: THREE.DoubleSide,
      });
      const pot = new THREE.Mesh(new THREE.CylinderGeometry(1.18, 0.84, 1.42, 24), terracotta);
      pot.position.y = 0.71;
      pot.castShadow = !isHeadless;
      plant.add(pot);
      const rim = new THREE.Mesh(new THREE.TorusGeometry(1.14, 0.13, 10, 26), terracotta);
      rim.rotation.x = Math.PI / 2;
      rim.position.y = 1.41;
      plant.add(rim);
      const soil = new THREE.Mesh(new THREE.CylinderGeometry(0.98, 0.98, 0.045, 24), soilMat);
      soil.position.y = 1.42;
      plant.add(soil);

      for (let i = 0; i < 9; i += 1) {
        const angle = (i / 9) * Math.PI * 2 + 0.14;
        const length = 1.25 + (i % 3) * 0.18;
        const stem = new THREE.Mesh(new THREE.CylinderGeometry(0.045, 0.065, length, 8), leafMat);
        stem.position.set(Math.cos(angle) * 0.22, 1.5 + length * 0.35, Math.sin(angle) * 0.22);
        stem.rotation.z = Math.sin(angle) * 0.65;
        stem.rotation.x = -Math.cos(angle) * 0.65;
        plant.add(stem);

        const leaf = new THREE.Mesh(new THREE.SphereGeometry(0.48, 12, 8), leafMat);
        leaf.scale.set(0.72, 0.12, 1.45);
        leaf.position.set(Math.cos(angle) * (0.54 + length * 0.32), 1.74 + length * 0.6, Math.sin(angle) * (0.54 + length * 0.32));
        leaf.rotation.y = -angle;
        leaf.rotation.z = -0.22 + (i % 2) * 0.44;
        leaf.castShadow = !isHeadless;
        plant.add(leaf);
      }
      plant.position.set(x, TABLE_Y + 0.04, z);
      plant.rotation.y = -0.42;
      scene.add(plant);
    };
    makePottedPlant(-18, -10.8);

    // Procedural Textures & Materials
    // Generated specifically for this field: square parquet tiles, restrained
    // routed seams and no baked lighting, so the scene lights stay authoritative.
    const woodFloorTex = new THREE.TextureLoader().load(honeyWalnutParquetUrl);
    woodFloorTex.colorSpace = THREE.SRGBColorSpace;
    woodFloorTex.wrapS = THREE.RepeatWrapping;
    woodFloorTex.wrapT = THREE.RepeatWrapping;
    woodFloorTex.repeat.set(1.08, 1.08);
    const woodCabinetTex = createWoodTexture(1024, true);
    const woodBumpTex = createWoodBumpTexture(512);
    const brassTex = createBrushedBrassTexture(256);
    const brassBumpTex = createBrassBumpTexture(256);
    const plaqueTex = createPlaqueTexture(1024, 320);
    woodFloorTex.anisotropy = renderer.capabilities.getMaxAnisotropy();
    woodCabinetTex.anisotropy = renderer.capabilities.getMaxAnisotropy();
    woodBumpTex.anisotropy = renderer.capabilities.getMaxAnisotropy();

    // Wood Cabinet Material (French-polished walnut / mahogany feel)
    const cabinetMat = new THREE.MeshPhysicalMaterial({
      // The procedural grain is intentionally dark; this warm tint restores
      // the hand-polished mahogany body instead of letting it turn charcoal
      // under the surrounding cinematic shadows.
      color: 0xc77b45,
      map: woodCabinetTex,
      bumpMap: woodBumpTex,
      bumpScale: 0.045,
      roughness: 0.4,
      metalness: 0.05,
      clearcoat: 0.42,
      clearcoatRoughness: 0.26,
      reflectivity: 0.42,
      envMapIntensity: 0.72,
      sheen: 0.12,
      sheenRoughness: 0.68,
      sheenColor: new THREE.Color(0x54250f),
    });

    // Maze Board Floor Material: slightly smoother polished playing surface
    const floorMat = new THREE.MeshPhysicalMaterial({
      // Keep the generated albedo intact; tinting it again made the honey
      // walnut drift toward red under ACES tone mapping.
      color: 0xffffff,
      map: woodFloorTex,
      bumpMap: woodBumpTex,
      bumpScale: 0.018,
      roughness: 0.34,
      metalness: 0.04,
      clearcoat: 0.78,
      clearcoatRoughness: 0.16,
      reflectivity: 0.56,
      envMapIntensity: 0.7,
      sheen: 0.1,
      sheenRoughness: 0.72,
      sheenColor: new THREE.Color(0xb9763c),
    });

    // Polished brushed brass material with machining relief
    const brassMat = new THREE.MeshPhysicalMaterial({
      color: 0xd9b45a,
      map: brassTex,
      bumpMap: brassBumpTex,
      bumpScale: 0.02,
      roughness: 0.18,
      metalness: 1.0,
      clearcoat: 0.18,
      clearcoatRoughness: 0.22,
      envMapIntensity: 1.35,
    });
    const plaqueMat = new THREE.MeshPhysicalMaterial({
      map: plaqueTex,
      roughness: 0.26,
      metalness: 0.96,
      clearcoat: 0.12,
      envMapIntensity: 1.2,
    });

    const carvingHorizontalTex = createCarvedTrimTexture(false);
    const carvingVerticalTex = createCarvedTrimTexture(true);
    const carvingMatH = new THREE.MeshStandardMaterial({
      map: carvingHorizontalTex, transparent: true, depthWrite: false, roughness: 0.83,
      polygonOffset: true, polygonOffsetFactor: -1, side: THREE.DoubleSide,
    });
    const carvingMatV = new THREE.MeshStandardMaterial({
      map: carvingVerticalTex, transparent: true, depthWrite: false, roughness: 0.83,
      polygonOffset: true, polygonOffsetFactor: -1, side: THREE.DoubleSide,
    });
    const carvedWalnutMat = new THREE.MeshPhysicalMaterial({
      color: 0x341007,
      roughness: 0.57,
      clearcoat: 0.18,
      clearcoatRoughness: 0.42,
      envMapIntensity: 0.24,
    });

    // 5. Stationary Outer Wooden Cabinet (Brio-style mechanical chassis)
    const cabinetGroup = new THREE.Group();
    scene.add(cabinetGroup);

    const createBrassScrew = (radius = 0.13, thickness = 0.08) => {
      const screw = new THREE.Group();
      const head = new THREE.Mesh(
        new THREE.CylinderGeometry(radius, radius * 1.04, thickness, 20),
        brassMat
      );
      head.rotation.x = Math.PI / 2;
      screw.add(head);
      const slot = new THREE.Mesh(
        new THREE.BoxGeometry(radius * 1.4, 0.03, thickness * 0.65),
        new THREE.MeshBasicMaterial({ color: 0x3f2a10 })
      );
      slot.position.z = thickness * 0.16;
      screw.add(slot);
      return screw;
    };

    // Helper for creating a knurled rotary brass knob with flange and wall bushing,
    // so the control appears mechanically attached to the cabinet rather than floating.
    const createKnurledKnob = (radius = 0.78, length = 0.92) => {
      const knobGroup = new THREE.Group();

      const flange = new THREE.Mesh(
        new THREE.CylinderGeometry(radius * 1.15, radius * 1.15, 0.26, 32),
        brassMat
      );
      flange.rotation.x = Math.PI / 2;
      flange.position.z = -length / 2 - 0.14;
      knobGroup.add(flange);

      const collar = new THREE.Mesh(
        new THREE.CylinderGeometry(radius * 0.52, radius * 0.58, 0.48, 24),
        brassMat
      );
      collar.rotation.x = Math.PI / 2;
      collar.position.z = -length / 2 - 0.38;
      knobGroup.add(collar);

      const knobCyl = new THREE.Mesh(
        new THREE.CylinderGeometry(radius, radius, length, 32),
        brassMat
      );
      knobCyl.rotation.x = Math.PI / 2;
      knobCyl.castShadow = !isHeadless;
      // Only the spindle and grip rotate; flange and bearing collar stay fixed.
      const rotor = new THREE.Group();
      rotor.add(knobCyl);

      const shaftMesh = new THREE.Mesh(
        new THREE.CylinderGeometry(0.24, 0.24, 1.0, 16),
        brassMat
      );
      shaftMesh.rotation.x = Math.PI / 2;
      shaftMesh.position.z = -length / 2 - 0.74;
      rotor.add(shaftMesh);

      // Pointer mark on knob face
      const pointerGeo = new THREE.BoxGeometry(0.12, radius * 1.42, 0.18);
      const pointerMat = new THREE.MeshBasicMaterial({ color: 0x111111 });
      const pointer = new THREE.Mesh(pointerGeo, pointerMat);
      pointer.position.z = length / 2 + 0.04;
      rotor.add(pointer);
      knobGroup.add(rotor);
      knobGroup.userData.rotor = rotor;

      return knobGroup;
    };

    // Right Side Rotary Knob (controls pitch axis visually and is aligned with the outer pitch trunnion)
    const sideKnob = createKnurledKnob();
    sideKnob.position.set(11.82, 0.0, 0);
    sideKnob.rotation.y = Math.PI / 2;
    cabinetGroup.add(sideKnob);
    sideKnobPitchRef.current = sideKnob;

    // Front Rotary Knob (controls roll axis visually and is aligned with the inner tray trunnion)
    const frontKnob = createKnurledKnob();
    frontKnob.position.set(0, 0.0, 11.82);
    cabinetGroup.add(frontKnob);
    frontKnobRollRef.current = frontKnob;

    // 6. Dual-Gimbal Mechanical Suspension:
    // Middle Gimbal Ring (Tilts on Pitch around X-axis)
    const midGimbal = new THREE.Group();
    midGimbalRef.current = midGimbal;
    scene.add(midGimbal);

    // Brass Axle Pins for middle ring (X-axis)
    const midPinGeo = new THREE.CylinderGeometry(0.35, 0.35, 1.2, 16);
    const midPin1 = new THREE.Mesh(midPinGeo, brassMat);
    midPin1.rotation.z = Math.PI / 2;
    midPin1.position.set(-10.2, 0, 0);
    midGimbal.add(midPin1);
    const midPin2 = new THREE.Mesh(midPinGeo, brassMat);
    midPin2.rotation.z = Math.PI / 2;
    midPin2.position.set(10.2, 0, 0);
    midGimbal.add(midPin2);

    // Inner Maze Board (Attached to midGimbal, Tilts on Roll around Z-axis)
    const innerBoard = new THREE.Group();
    innerBoardRef.current = innerBoard;
    midGimbal.add(innerBoard);

    // Brass Axle Pins for inner board (Z-axis)
    const innerPinGeo = new THREE.CylinderGeometry(0.35, 0.35, 1.2, 16);
    const inPin1 = new THREE.Mesh(innerPinGeo, brassMat);
    inPin1.rotation.x = Math.PI / 2;
    inPin1.position.set(0, 0, -9.2);
    innerBoard.add(inPin1);
    const inPin2 = new THREE.Mesh(innerPinGeo, brassMat);
    inPin2.rotation.x = Math.PI / 2;
    inPin2.position.set(0, 0, 9.2);
    innerBoard.add(inPin2);

    // 7. Polished Chrome Steel Bearing Ball (with engraved equator lathe lines)
    const ballCanvas = document.createElement('canvas');
    ballCanvas.width = 256;
    ballCanvas.height = 128;
    const bctx = ballCanvas.getContext('2d')!;
    bctx.fillStyle = '#f0f0f5';
    bctx.fillRect(0, 0, 256, 128);
    // Dark equator line and brass rim
    bctx.fillStyle = '#22222a';
    bctx.fillRect(0, 61, 256, 6);
    bctx.fillStyle = '#d4af37';
    bctx.fillRect(0, 63, 256, 2);
    // Engraved serial numbers
    bctx.font = 'bold 15px monospace';
    bctx.fillStyle = '#16161c';
    bctx.fillText('• 1984 • CHROME •', 24, 46);
    bctx.fillText('• 1984 • CHROME •', 24, 96);
    const ballTex = new THREE.CanvasTexture(ballCanvas);
    ballTex.colorSpace = THREE.SRGBColorSpace;

    const ballGeo = new THREE.SphereGeometry(ballRef.current.radius, 36, 36);
    const ballMat = new THREE.MeshStandardMaterial({
      color: 0xffffff,
      map: ballTex,
      metalness: 0.96,
      roughness: 0.12,
    });
    const ballMesh = new THREE.Mesh(ballGeo, ballMat);
    ballMesh.castShadow = !isHeadless;
    ballMesh.position.set(ballRef.current.x, ballRef.current.radius, ballRef.current.z);
    innerBoard.add(ballMesh);
    ballMeshRef.current = ballMesh;

    // Contact shadow beneath the steel ball
    const ballShadowCanvas = document.createElement('canvas');
    ballShadowCanvas.width = 128;
    ballShadowCanvas.height = 128;
    const bsCtx = ballShadowCanvas.getContext('2d')!;
    const bGrad = bsCtx.createRadialGradient(64, 64, 5, 64, 64, 60);
    bGrad.addColorStop(0, 'rgba(0,0,0,0.65)');
    bGrad.addColorStop(1, 'rgba(0,0,0,0)');
    bsCtx.fillStyle = bGrad;
    bsCtx.fillRect(0, 0, 128, 128);
    const ballShadowTex = new THREE.CanvasTexture(ballShadowCanvas);
    const ballShadowMat = new THREE.MeshBasicMaterial({
      map: ballShadowTex,
      transparent: true,
      depthWrite: false,
      opacity: 0.72,
      polygonOffset: true,
      polygonOffsetFactor: -1,
      polygonOffsetUnits: -1,
    });
    const ballShadow = new THREE.Mesh(new THREE.PlaneGeometry(1.4, 1.4), ballShadowMat);
    ballShadow.rotation.x = -Math.PI / 2;
    ballShadow.position.y = 0.012;
    innerBoard.add(ballShadow);
    ballShadowRef.current = ballShadow;

    // 8. Particle System (Impact sparks & wood dust)
    const particleCount = 140;
    const particleGeo = new THREE.BufferGeometry();
    const particlePositions = new Float32Array(particleCount * 3);
    const particleVelocities = new Float32Array(particleCount * 3);
    const particleLifes = new Float32Array(particleCount);

    for (let i = 0; i < particleCount; i++) {
      particlePositions[i * 3 + 1] = -100;
      particleLifes[i] = 0;
    }
    particleGeo.setAttribute('position', new THREE.BufferAttribute(particlePositions, 3));
    const particleMat = new THREE.PointsMaterial({
      color: 0xffd54f,
      size: 0.38,
      transparent: true,
      opacity: 0.9,
      blending: THREE.AdditiveBlending,
    });
    const particleSystem = new THREE.Points(particleGeo, particleMat);
    innerBoard.add(particleSystem);
    particlesRef.current = particleSystem;

    // Helper to spawn impact particles
    const triggerImpactSparks = (x: number, z: number, intensity: number) => {
      const count = Math.min(22, Math.floor(intensity * 14));
      let spawned = 0;
      for (let i = 0; i < particleCount && spawned < count; i++) {
        if (particleLifes[i] <= 0) {
          particlePositions[i * 3] = x;
          particlePositions[i * 3 + 1] = 0.3;
          particlePositions[i * 3 + 2] = z;

          const angle = Math.random() * Math.PI * 2;
          const spd = (0.6 + Math.random() * 2.0) * intensity;
          particleVelocities[i * 3] = Math.cos(angle) * spd;
          particleVelocities[i * 3 + 1] = 1.2 + Math.random() * 2.4;
          particleVelocities[i * 3 + 2] = Math.sin(angle) * spd;
          particleLifes[i] = 0.5 + Math.random() * 0.4;
          spawned++;
        }
      }
      particleGeo.attributes.position.needsUpdate = true;
    };

    // Dispose procedural assets when levels change; retain globally shared materials.
    const sharedMaterials = new Set<THREE.Material>([cabinetMat, floorMat, brassMat, carvingMatH, carvingMatV, carvedWalnutMat]);
    const disposeRemoved = (object: THREE.Object3D) => {
      const geometries = new Set<THREE.BufferGeometry>();
      const materials = new Set<THREE.Material>();
      object.traverse(child => {
        const mesh = child as THREE.Mesh;
        if (mesh.geometry) geometries.add(mesh.geometry);
        if (mesh.material) {
          const mats = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
          mats.forEach(m => { if (!sharedMaterials.has(m)) materials.add(m); });
        }
      });
      geometries.forEach(geo => geo.dispose());
      materials.forEach(mat => {
        Object.values(mat).forEach(value => {
          if (value instanceof THREE.Texture) value.dispose();
        });
        mat.dispose();
      });
    };

    // Helper to build cabinet and labyrinth geometry
    const buildLevelScene = (curLevel: LevelConfig) => {
      // Clear previous level items from innerBoard (except ball, shadow, particles)
      const toRemove: THREE.Object3D[] = [];
      innerBoard.children.forEach((child) => {
        if (child !== ballMesh && child !== ballShadow && child !== particleSystem && child !== inPin1 && child !== inPin2) {
          toRemove.push(child);
        }
      });
      toRemove.forEach((child) => { innerBoard.remove(child); disposeRemoved(child); });
      gemsMapRef.current.clear();

      // Clear cabinet and middle gimbal frames
      while (cabinetGroup.children.length > 2) {
        const child = cabinetGroup.children[2];
        cabinetGroup.remove(child);
        disposeRemoved(child);
      }
      while (midGimbal.children.length > 3) {
        const child = midGimbal.children[3];
        midGimbal.remove(child);
        disposeRemoved(child);
      }

      const bSize = BOARD_SIZE;
      const cabOuterSize = bSize + 4.2;
      const cabWallThickness = 1.1;
      const cabHeight = CABINET_HEIGHT;

      // 1. Stationary Cabinet Outer Frame Walls
      const cabNorth = new THREE.Mesh(
        new THREE.BoxGeometry(cabOuterSize, cabHeight, cabWallThickness),
        cabinetMat
      );
      cabNorth.position.set(0, -cabHeight / 2 + 0.4, -cabOuterSize / 2 + cabWallThickness / 2);
      cabNorth.castShadow = !isHeadless;
      cabNorth.receiveShadow = !isHeadless;
      cabinetGroup.add(cabNorth);

      const cabSouth = new THREE.Mesh(
        new THREE.BoxGeometry(cabOuterSize, cabHeight, cabWallThickness),
        cabinetMat
      );
      cabSouth.position.set(0, -cabHeight / 2 + 0.4, cabOuterSize / 2 - cabWallThickness / 2);
      cabSouth.castShadow = !isHeadless;
      cabSouth.receiveShadow = !isHeadless;
      cabinetGroup.add(cabSouth);

      const cabWest = new THREE.Mesh(
        new THREE.BoxGeometry(cabWallThickness, cabHeight, cabOuterSize),
        cabinetMat
      );
      cabWest.position.set(-cabOuterSize / 2 + cabWallThickness / 2, -cabHeight / 2 + 0.4, 0);
      cabWest.castShadow = !isHeadless;
      cabWest.receiveShadow = !isHeadless;
      cabinetGroup.add(cabWest);

      const cabEast = new THREE.Mesh(
        new THREE.BoxGeometry(cabWallThickness, cabHeight, cabOuterSize),
        cabinetMat
      );
      cabEast.position.set(cabOuterSize / 2 - cabWallThickness / 2, -cabHeight / 2 + 0.4, 0);
      cabEast.castShadow = !isHeadless;
      cabEast.receiveShadow = !isHeadless;
      cabinetGroup.add(cabEast);

      // Woodcut decoration follows the real top faces of the frame in 3D.
      // A shallow physical inlay beneath the engraved decal catches grazing
      // light, so the trim reads as routed wood rather than a flat print.
      const addCarvedTrim = (group: THREE.Group, width: number, depth: number,
        x: number, y: number, z: number, vertical: boolean) => {
        const reliefBed = new THREE.Mesh(
          new THREE.BoxGeometry(width + 0.11, 0.052, depth + 0.11),
          cabinetMat
        );
        reliefBed.position.set(x, y + 0.011, z);
        reliefBed.castShadow = !isHeadless;
        reliefBed.receiveShadow = !isHeadless;
        group.add(reliefBed);
        const decal = new THREE.Mesh(
          new THREE.PlaneGeometry(width, depth),
          vertical ? carvingMatV : carvingMatH
        );
        decal.rotation.x = -Math.PI / 2;
        decal.position.set(x, y + 0.039, z);
        decal.renderOrder = 1;
        group.add(decal);
      };
      // Top face of the stationary outer cabinet, with decorative cutwork on all four sides.
      const outerTopY = -cabHeight / 2 + 0.4 + cabHeight / 2 + 0.009;
      const outerEdge = cabOuterSize / 2 - cabWallThickness / 2;
      addCarvedTrim(cabinetGroup, cabOuterSize - 2.2, cabWallThickness * 0.84, 0, outerTopY, -outerEdge, false);
      addCarvedTrim(cabinetGroup, cabOuterSize - 2.2, cabWallThickness * 0.84, 0, outerTopY, outerEdge, false);
      addCarvedTrim(cabinetGroup, cabWallThickness * 0.84, cabOuterSize - 2.2, -outerEdge, outerTopY, 0, true);
      addCarvedTrim(cabinetGroup, cabWallThickness * 0.84, cabOuterSize - 2.2, outerEdge, outerTopY, 0, true);

      // Raised rosettes bring genuine silhouette and grazing-light detail to
      // the frame. They are deliberately walnut with tiny brass hearts, rather
      // than ornamental gold decals, matching a hand-carved game cabinet.
      const addRosette = (x: number, z: number, scale = 1) => {
        const rosette = new THREE.Group();
        for (let petalIndex = 0; petalIndex < 8; petalIndex++) {
          const angle = petalIndex * Math.PI / 4;
          const petal = new THREE.Mesh(new THREE.SphereGeometry(0.16 * scale, 12, 8), carvedWalnutMat);
          petal.scale.set(1.32, 0.26, 0.62);
          petal.rotation.y = angle;
          petal.position.set(Math.cos(angle) * 0.24 * scale, 0.058, Math.sin(angle) * 0.24 * scale);
          petal.castShadow = !isHeadless;
          rosette.add(petal);
        }
        const hub = new THREE.Mesh(new THREE.CylinderGeometry(0.115 * scale, 0.14 * scale, 0.07, 18), brassMat);
        hub.position.y = 0.075;
        rosette.add(hub);
        rosette.position.set(x, outerTopY + 0.043, z);
        cabinetGroup.add(rosette);
      };
      [-4.2, 0, 4.2].forEach(x => {
        addRosette(x, -outerEdge, 0.86);
        addRosette(x, outerEdge, 0.86);
      });
      [-4.4, 4.4].forEach(z => {
        addRosette(-outerEdge, z, 0.72);
        addRosette(outerEdge, z, 0.72);
      });

      // Brass Corner Brackets on Cabinet
      const cornerBracketGeo = new THREE.BoxGeometry(1.62, 0.18, 1.62);
      const cornerCoords = [
        [-cabOuterSize / 2 + 0.8, -cabOuterSize / 2 + 0.8],
        [cabOuterSize / 2 - 0.8, -cabOuterSize / 2 + 0.8],
        [-cabOuterSize / 2 + 0.8, cabOuterSize / 2 - 0.8],
        [cabOuterSize / 2 - 0.8, cabOuterSize / 2 - 0.8],
      ];
      cornerCoords.forEach(([cx, cz]) => {
        const bracketGroup = new THREE.Group();
        const bracket = new THREE.Mesh(cornerBracketGeo, brassMat);
        bracket.castShadow = !isHeadless;
        bracketGroup.add(bracket);
        // Four domed rivets make the corner hardware read as a fitted brass
        // plate rather than a gold-painted timber block.
        const screwOffsets = [
          [-0.42, -0.42], [0.42, -0.42], [-0.42, 0.42], [0.42, 0.42],
        ];
        screwOffsets.forEach(([sx, sz]) => {
          const rivet = new THREE.Mesh(new THREE.SphereGeometry(0.115, 16, 10), brassMat);
          rivet.scale.y = 0.52;
          rivet.position.set(sx, 0.135, sz);
          bracketGroup.add(rivet);
        });
        bracketGroup.position.set(cx, outerTopY + 0.095, cz);
        cabinetGroup.add(bracketGroup);
      });

      // Felt feet and front brass nameplate for a more luxurious cabinet presentation.
      [[-8.8, -8.8], [8.8, -8.8], [-8.8, 8.8], [8.8, 8.8]].forEach(([fx, fz]) => {
        const foot = new THREE.Mesh(new THREE.CylinderGeometry(0.6, 0.7, 0.35, 20), new THREE.MeshStandardMaterial({ color: 0x2e231d, roughness: 0.96 }));
        foot.position.set(fx, 0.4 - cabHeight - 0.18, fz);
        foot.castShadow = !isHeadless;
        cabinetGroup.add(foot);
      });

      const plaque = new THREE.Mesh(new THREE.PlaneGeometry(6.4, 1.95), plaqueMat);
      plaque.position.set(0, 0.4 - cabHeight / 2, cabOuterSize / 2 + 0.03);
      cabinetGroup.add(plaque);
      [[-2.6, 0.63], [2.6, 0.63], [-2.6, -0.63], [2.6, -0.63]].forEach(([sx, sy]) => {
        const screw = createBrassScrew(0.11, 0.07);
        screw.position.set(sx, 0.4 - cabHeight / 2 + sy, cabOuterSize / 2 + 0.05);
        cabinetGroup.add(screw);
      });

      // Realistic outer support hardware for the pitch axis.
      // These pieces are fixed to the cabinet and the tilting pitch trunnions pass through them.
      const pitchBearingOffsetX = cabOuterSize / 2 - cabWallThickness * 0.5;
      const pitchBearingY = 0.0;
      const makeOuterPitchBearing = (side: 1 | -1) => {
        const support = new THREE.Group();
        const plate = new THREE.Mesh(new THREE.BoxGeometry(0.44, 1.55, 1.95), brassMat);
        plate.position.x = side * 0.16;
        support.add(plate);

        const backPad = new THREE.Mesh(new THREE.BoxGeometry(0.18, 1.8, 2.2), cabinetMat);
        backPad.position.x = side * 0.02;
        backPad.position.y = -0.02;
        support.add(backPad);

        const ring = new THREE.Mesh(new THREE.TorusGeometry(0.42, 0.1, 12, 24), brassMat);
        ring.rotation.y = Math.PI / 2;
        ring.position.x = side * 0.4;
        support.add(ring);

        const cap = new THREE.Mesh(new THREE.CylinderGeometry(0.18, 0.18, 0.28, 18), brassMat);
        cap.rotation.z = Math.PI / 2;
        cap.position.x = side * 0.4;
        support.add(cap);

        const brace = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.42, 1.5), brassMat);
        brace.position.set(side * 0.2, -0.48, 0);
        brace.rotation.z = side * 0.2;
        support.add(brace);

        [[-0.55, -0.65], [0.55, -0.65], [-0.55, 0.65], [0.55, 0.65]].forEach(([sy, sz]) => {
          const screw = createBrassScrew();
          screw.rotation.y = Math.PI / 2;
          screw.position.set(side * 0.39, sy, sz);
          support.add(screw);
        });

        support.position.set(side * pitchBearingOffsetX, pitchBearingY, 0);
        cabinetGroup.add(support);
      };
      makeOuterPitchBearing(-1);
      makeOuterPitchBearing(1);

      // A visible roll-axis support on the front cabinet wall so the external handle feels mounted,
      // not detached from the wood body.
      const frontHandleBase = new THREE.Group();
      const frontPlate = new THREE.Mesh(new THREE.BoxGeometry(1.9, 1.15, 0.38), brassMat);
      frontPlate.position.z = cabOuterSize / 2 - 0.1;
      frontPlate.position.y = 0.0;
      frontHandleBase.add(frontPlate);
      const frontWoodPad = new THREE.Mesh(new THREE.BoxGeometry(2.15, 1.35, 0.2), cabinetMat);
      frontWoodPad.position.z = cabOuterSize / 2 - 0.28;
      frontHandleBase.add(frontWoodPad);
      const frontRing = new THREE.Mesh(new THREE.TorusGeometry(0.46, 0.1, 12, 28), brassMat);
      frontRing.rotation.x = Math.PI / 2;
      frontRing.position.set(0, 0.0, cabOuterSize / 2 + 0.08);
      frontHandleBase.add(frontRing);
      [[-0.65, -0.32], [0.65, -0.32], [-0.65, 0.32], [0.65, 0.32]].forEach(([sx, sy]) => {
        const screw = createBrassScrew();
        screw.position.set(sx, sy, cabOuterSize / 2 + 0.095);
        frontHandleBase.add(screw);
      });
      cabinetGroup.add(frontHandleBase);

      // 2. Middle Gimbal Wooden Ring (Pitch Gimbal)
      const ringOuterSize = bSize + 1.8;
      const ringWallThick = 0.85;
      const ringHeight = 1.1;

      const ringNorth = new THREE.Mesh(
        new THREE.BoxGeometry(ringOuterSize, ringHeight, ringWallThick),
        cabinetMat
      );
      ringNorth.position.set(0, 0, -ringOuterSize / 2 + ringWallThick / 2);
      ringNorth.castShadow = !isHeadless;
      midGimbal.add(ringNorth);

      const ringSouth = new THREE.Mesh(
        new THREE.BoxGeometry(ringOuterSize, ringHeight, ringWallThick),
        cabinetMat
      );
      ringSouth.position.set(0, 0, ringOuterSize / 2 - ringWallThick / 2);
      ringSouth.castShadow = !isHeadless;
      midGimbal.add(ringSouth);

      const ringWest = new THREE.Mesh(
        new THREE.BoxGeometry(ringWallThick, ringHeight, ringOuterSize),
        cabinetMat
      );
      ringWest.position.set(-ringOuterSize / 2 + ringWallThick / 2, 0, 0);
      ringWest.castShadow = !isHeadless;
      midGimbal.add(ringWest);

      const ringEast = new THREE.Mesh(
        new THREE.BoxGeometry(ringWallThick, ringHeight, ringOuterSize),
        cabinetMat
      );
      ringEast.position.set(ringOuterSize / 2 - ringWallThick / 2, 0, 0);
      ringEast.castShadow = !isHeadless;
      midGimbal.add(ringEast);

      // Outer pitch trunnions and control shafts: these rotate with the same X-axis as the middle gimbal,
      // making the visible mounting hardware follow the real movement of the suspended frame.
      const pitchTrunnionLength = Math.max(0.9, (cabOuterSize - ringOuterSize) * 0.5 + 0.55);
      const pitchTrunnionGeo = new THREE.CylinderGeometry(0.24, 0.24, pitchTrunnionLength, 18);
      const pitchCollarGeo = new THREE.CylinderGeometry(0.34, 0.34, 0.3, 18);
      [-1, 1].forEach((side) => {
        const trunnion = new THREE.Group();
        const axle = new THREE.Mesh(pitchTrunnionGeo, brassMat);
        axle.rotation.z = Math.PI / 2;
        axle.position.x = side * (ringOuterSize / 2 + pitchTrunnionLength / 2 - ringWallThick * 0.5);
        trunnion.add(axle);

        const collar = new THREE.Mesh(pitchCollarGeo, brassMat);
        collar.rotation.z = Math.PI / 2;
        collar.position.x = side * (ringOuterSize / 2 + 0.18);
        trunnion.add(collar);

        const endCap = new THREE.Mesh(new THREE.CylinderGeometry(0.18, 0.18, 0.18, 16), brassMat);
        endCap.rotation.z = Math.PI / 2;
        endCap.position.x = side * (ringOuterSize / 2 + pitchTrunnionLength - ringWallThick * 0.5);
        trunnion.add(endCap);
        midGimbal.add(trunnion);
      });

      // Bearing saddles on the pitch gimbal that hold the roll axis of the tray.
      const rollBearingSpan = bSize / 2 + 0.72;
      const createRollBearingSaddle = (sign: 1 | -1) => {
        const saddle = new THREE.Group();
        const post = new THREE.Mesh(new THREE.BoxGeometry(1.1, 0.92, 0.44), brassMat);
        post.position.set(0, 0.05, sign * rollBearingSpan);
        saddle.add(post);
        const ring = new THREE.Mesh(new THREE.TorusGeometry(0.4, 0.08, 12, 24), brassMat);
        ring.rotation.x = Math.PI / 2;
        ring.position.set(0, 0.13, sign * rollBearingSpan);
        saddle.add(ring);
        [[-0.28, -0.22], [0.28, -0.22], [-0.28, 0.22], [0.28, 0.22]].forEach(([sx, sy]) => {
          const screw = createBrassScrew(0.08, 0.06);
          screw.rotation.x = -Math.PI / 2;
          screw.position.set(sx, 0.52, sign * rollBearingSpan + sy);
          saddle.add(screw);
        });
        midGimbal.add(saddle);
      };
      createRollBearingSaddle(-1);
      createRollBearingSaddle(1);

      // 3. Inner Labyrinth Tray (Attached to innerBoard)
      // Truly open holes in the hardwood floor (not black decals over a solid box).
      // XY Shape -> XZ plane with +90deg X rotation; extrusion extends below y=0.
      const floorShape = new THREE.Shape();
      const half = bSize / 2;
      floorShape.moveTo(-half, -half);
      floorShape.lineTo(half, -half);
      floorShape.lineTo(half, half);
      floorShape.lineTo(-half, half);
      floorShape.closePath();
      curLevel.holes.forEach(hole => {
        const opening = new THREE.Path();
        opening.absarc(hole.x, hole.z, hole.radius * 0.76, 0, Math.PI * 2, true);
        floorShape.holes.push(opening);
      });
      const floorGeo = new THREE.ExtrudeGeometry(floorShape, {
        depth: 0.45, bevelEnabled: false, curveSegments: 32,
      });
      const floorMesh = new THREE.Mesh(floorGeo, floorMat);
      floorMesh.rotation.x = Math.PI / 2;
      floorMesh.receiveShadow = !isHeadless;
      innerBoard.add(floorMesh);

      // Routed parquet seams are real scene geometry. Segmenting them around
      // openings avoids the old visual defect where a painted grid crossed an
      // apparently open hole.
      const tileInset = 0.45;
      const tileHalf = bSize / 2 - tileInset;
      const tileCount = 9;
      const seamPositions: number[] = [];
      const addSeam = (vertical: boolean, fixed: number) => {
        const cuts = curLevel.holes
          .map(hole => {
            const delta = vertical ? fixed - hole.x : fixed - hole.z;
            const radius = hole.radius * 0.77;
            if (Math.abs(delta) >= radius) return null;
            const span = Math.sqrt(radius * radius - delta * delta) + 0.035;
            const centre = vertical ? hole.z : hole.x;
            return [centre - span, centre + span] as const;
          })
          .filter((cut): cut is readonly [number, number] => cut !== null)
          .sort((a, b) => a[0] - b[0]);
        let cursor = -tileHalf;
        const addSegment = (from: number, to: number) => {
          if (to - from < 0.055) return;
          if (vertical) seamPositions.push(fixed, 0.031, from, fixed, 0.031, to);
          else seamPositions.push(from, 0.031, fixed, to, 0.031, fixed);
        };
        cuts.forEach(([start, end]) => {
          const clippedStart = Math.max(-tileHalf, start);
          const clippedEnd = Math.min(tileHalf, end);
          addSegment(cursor, clippedStart);
          cursor = Math.max(cursor, clippedEnd);
        });
        addSegment(cursor, tileHalf);
      };
      for (let line = 1; line < tileCount; line++) {
        const coordinate = -tileHalf + (tileHalf * 2 * line) / tileCount;
        addSeam(true, coordinate);
        addSeam(false, coordinate);
      }
      const seamGeo = new THREE.BufferGeometry();
      seamGeo.setAttribute('position', new THREE.Float32BufferAttribute(seamPositions, 3));
      const seamLines = new THREE.LineSegments(
        seamGeo,
        new THREE.LineBasicMaterial({ color: 0x3a1f10, transparent: true, opacity: 0.2 })
      );
      innerBoard.add(seamLines);

      // Fine brass inlay defines the playing field without closing off the
      // routes. It echoes the fittings on the outer case and adds a deliberate
      // product-detail highlight around the honey-walnut surface.
      const inlayInset = bSize / 2 - 0.28;
      const inlayY = 0.026;
      const inlayLong = bSize - 0.56;
      const inlayBars = [
        { w: inlayLong, d: 0.045, x: 0, z: -inlayInset },
        { w: inlayLong, d: 0.045, x: 0, z: inlayInset },
        { w: 0.045, d: inlayLong, x: -inlayInset, z: 0 },
        { w: 0.045, d: inlayLong, x: inlayInset, z: 0 },
      ];
      inlayBars.forEach(({ w, d, x, z }) => {
        const strip = new THREE.Mesh(new THREE.BoxGeometry(w, 0.028, d), brassMat);
        strip.position.set(x, inlayY, z);
        innerBoard.add(strip);
      });

      // Inner Tray Border Walls
      const trayBorderThick = 0.65;
      const trayBorderHeight = 0.95;

      const borderGeoX = new THREE.BoxGeometry(bSize + trayBorderThick * 2, trayBorderHeight, trayBorderThick);
      const borderGeoZ = new THREE.BoxGeometry(trayBorderThick, trayBorderHeight, bSize);

      const bNorth = new THREE.Mesh(borderGeoX, cabinetMat);
      bNorth.position.set(0, trayBorderHeight / 2 - 0.1, -bSize / 2 - trayBorderThick / 2);
      bNorth.castShadow = !isHeadless;
      bNorth.receiveShadow = !isHeadless;
      innerBoard.add(bNorth);

      const bSouth = new THREE.Mesh(borderGeoX, cabinetMat);
      bSouth.position.set(0, trayBorderHeight / 2 - 0.1, bSize / 2 + trayBorderThick / 2);
      bSouth.castShadow = !isHeadless;
      bSouth.receiveShadow = !isHeadless;
      innerBoard.add(bSouth);

      const bWest = new THREE.Mesh(borderGeoZ, cabinetMat);
      bWest.position.set(-bSize / 2 - trayBorderThick / 2, trayBorderHeight / 2 - 0.1, 0);
      bWest.castShadow = !isHeadless;
      bWest.receiveShadow = !isHeadless;
      innerBoard.add(bWest);

      const bEast = new THREE.Mesh(borderGeoZ, cabinetMat);
      bEast.position.set(bSize / 2 + trayBorderThick / 2, trayBorderHeight / 2 - 0.1, 0);
      bEast.castShadow = !isHeadless;
      bEast.receiveShadow = !isHeadless;
      innerBoard.add(bEast);

      // Inner tray roll-axis shafts: these are the visible крепления of the moving tray.
      // Because they are children of innerBoard, they always follow the true roll motion.
      const rollAxleLength = 1.45;
      const rollAxisZ = bSize / 2 + trayBorderThick * 0.5;
      [-1, 1].forEach((sign) => {
        const rollAxle = new THREE.Group();
        const shaft = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.2, rollAxleLength, 18), brassMat);
        shaft.rotation.x = Math.PI / 2;
        shaft.position.set(0, 0.14, sign * (rollAxisZ + rollAxleLength * 0.5 - 0.08));
        rollAxle.add(shaft);

        const collar = new THREE.Mesh(new THREE.CylinderGeometry(0.34, 0.34, 0.26, 18), brassMat);
        collar.rotation.x = Math.PI / 2;
        collar.position.set(0, 0.14, sign * (rollAxisZ - 0.08));
        rollAxle.add(collar);
        const endWasher = new THREE.Mesh(new THREE.CylinderGeometry(0.25, 0.25, 0.08, 18), brassMat);
        endWasher.rotation.x = Math.PI / 2;
        endWasher.position.set(0, 0.14, sign * (rollAxisZ + rollAxleLength - 0.1));
        rollAxle.add(endWasher);
        innerBoard.add(rollAxle);
      });

      // A narrower matching hand-carved edge on the tilting inner tray.
      const innerTopY = trayBorderHeight - 0.1 + 0.009;
      addCarvedTrim(innerBoard, bSize - 1.0, trayBorderThick * 0.88, 0, innerTopY, bNorth.position.z, false);
      addCarvedTrim(innerBoard, bSize - 1.0, trayBorderThick * 0.88, 0, innerTopY, bSouth.position.z, false);
      addCarvedTrim(innerBoard, trayBorderThick * 0.88, bSize - 1.0, bWest.position.x, innerTopY, 0, true);
      addCarvedTrim(innerBoard, trayBorderThick * 0.88, bSize - 1.0, bEast.position.x, innerTopY, 0, true);

      // 4. Carved Internal Wooden Walls with Beveled Brass Rails
      curLevel.walls.forEach((wall) => {
        const dx = wall.x2 - wall.x1;
        const dz = wall.z2 - wall.z1;
        const length = Math.sqrt(dx * dx + dz * dz);
        const angle = Math.atan2(dx, dz);

        const wallGroup = new THREE.Group();

        // The reference uses solid polished-brass barriers. A capsule profile
        // gives every endpoint a true rounded termination in plan view instead
        // of a wooden block with a thin metallic stripe.
        const railWidth = wall.thickness + 0.13;
        const railHeight = 0.54;
        const straightLength = Math.max(0.16, length - railWidth);
        const railBody = new THREE.Mesh(
          new THREE.BoxGeometry(railWidth, railHeight, straightLength), brassMat
        );
        railBody.position.y = railHeight / 2;
        railBody.castShadow = !isHeadless;
        railBody.receiveShadow = !isHeadless;
        wallGroup.add(railBody);
        [-1, 1].forEach(sign => {
          const cap = new THREE.Mesh(
            new THREE.CylinderGeometry(railWidth / 2, railWidth / 2, railHeight, 24), brassMat
          );
          cap.position.set(0, railHeight / 2, sign * straightLength / 2);
          cap.castShadow = !isHeadless;
          wallGroup.add(cap);
        });
        const railGlint = new THREE.Mesh(
          new THREE.BoxGeometry(railWidth * 0.47, 0.018, straightLength),
          new THREE.MeshBasicMaterial({ color: 0xffdc81 })
        );
        railGlint.position.y = railHeight + 0.012;
        wallGroup.add(railGlint);

        wallGroup.position.set((wall.x1 + wall.x2) / 2, 0, (wall.z1 + wall.z2) / 2);
        wallGroup.rotation.y = angle;
        innerBoard.add(wallGroup);
      });

      // 5. Deep Recessed Holes with Countersunk Brass Collars
      const holeMat = new THREE.MeshBasicMaterial({ color: 0x050403 });
      curLevel.holes.forEach((hole) => {
        const holeGroup = new THREE.Group();

        // Dark cylinder drop shaft
        const shaftGeo = new THREE.CylinderGeometry(hole.radius * 0.75, hole.radius * 0.65, 0.9, 32, 1, true);
        const shaftMesh = new THREE.Mesh(shaftGeo, holeMat);
        shaftMesh.position.y = -0.45;
        holeGroup.add(shaftMesh);
        const bottom = new THREE.Mesh(new THREE.CircleGeometry(hole.radius * 0.65, 32), holeMat);
        bottom.rotation.x = -Math.PI / 2;
        bottom.position.y = -0.9;
        holeGroup.add(bottom);

        // Countersunk Brass Bezel (Torus)
        const bezelGeo = new THREE.TorusGeometry(hole.radius * 0.78, 0.095, 14, 32);
        const bezelMesh = new THREE.Mesh(bezelGeo, brassMat);
        bezelMesh.rotation.x = Math.PI / 2;
        bezelMesh.position.y = 0.022;
        bezelMesh.castShadow = !isHeadless;
        holeGroup.add(bezelMesh);

        holeGroup.position.set(hole.x, 0, hole.z);
        innerBoard.add(holeGroup);
      });

      // 6. Finish Goal Medallion
      const targetTex = createTargetTexture(512);
      const targetGeo = new THREE.PlaneGeometry(curLevel.goal.radius * 2.3, curLevel.goal.radius * 2.3);
      const targetMat = new THREE.MeshBasicMaterial({
        map: targetTex,
        transparent: true,
        polygonOffset: true,
        polygonOffsetFactor: -1,
        polygonOffsetUnits: -1,
      });
      const targetMesh = new THREE.Mesh(targetGeo, targetMat);
      targetMesh.rotation.x = -Math.PI / 2;
      targetMesh.position.set(curLevel.goal.x, 0.016, curLevel.goal.z);
      innerBoard.add(targetMesh);

      const goalBezel = new THREE.Mesh(
        new THREE.TorusGeometry(curLevel.goal.radius * 1.15, 0.09, 14, 32),
        brassMat
      );
      goalBezel.rotation.x = Math.PI / 2;
      goalBezel.position.set(curLevel.goal.x, 0.025, curLevel.goal.z);
      innerBoard.add(goalBezel);

      // 7. Collectible Crystals on Brass Pedestals
      const gemGeo = new THREE.OctahedronGeometry(0.38, 0);
      curLevel.gems.forEach((gem) => {
        const gemGroup = new THREE.Group();

        // Brass pedestal ring
        const pedestal = new THREE.Mesh(new THREE.CylinderGeometry(0.28, 0.35, 0.15, 16), brassMat);
        pedestal.position.y = 0.075;
        gemGroup.add(pedestal);

        // Emerald crystal
        const gemMat = new THREE.MeshPhysicalMaterial({
          color: 0x00e676,
          metalness: 0.1,
          roughness: 0.12,
          transmission: 0.85,
          thickness: 0.7,
          emissive: 0x00b050,
          emissiveIntensity: 0.5,
        });

        const gemMesh = new THREE.Mesh(gemGeo, gemMat);
        gemMesh.position.y = 0.52;
        gemMesh.castShadow = !isHeadless;
        gemGroup.add(gemMesh);

        gemGroup.position.set(gem.x, 0, gem.z);
        innerBoard.add(gemGroup);
        gemsMapRef.current.set(gem.id, gemGroup);
      });
    };

    buildLevelScene(levelRef.current);
    let currentBuiltLevelId = levelRef.current.id;
    let currentBuiltLevelVersion = levelRef.current.version;
    let lastHandledSparkKey = -1;

    // 9. Mouse drag interaction handler
    const handlePointerDown = (e: PointerEvent) => {
      if (trackingModeRef.current !== 'mouse') return;
      isDraggingRef.current = true;
      dragStartRef.current = {
        x: e.clientX,
        y: e.clientY,
        initialRoll: liveTiltRef.current.roll,
        initialPitch: liveTiltRef.current.pitch,
      };
      (e.target as HTMLElement).setPointerCapture(e.pointerId);
    };

    const handlePointerMove = (e: PointerEvent) => {
      if (!isDraggingRef.current || trackingModeRef.current !== 'mouse') return;
      const dx = e.clientX - dragStartRef.current.x;
      const dy = e.clientY - dragStartRef.current.y;

      const sensitivity = 0.0018;
      const commanded = clampBoardTilt({
        pitch: dragStartRef.current.initialPitch - dy * sensitivity,
        roll: dragStartRef.current.initialRoll + dx * sensitivity,
      });
      onMouseTiltRef.current?.(commanded.pitch, commanded.roll);
    };

    const handlePointerUp = (e: PointerEvent) => {
      if (isDraggingRef.current) {
        isDraggingRef.current = false;
        try {
          (e.target as HTMLElement).releasePointerCapture(e.pointerId);
        } catch {
          // ignore
        }
      }
    };

    renderer.domElement.addEventListener('pointerdown', handlePointerDown);
    renderer.domElement.addEventListener('pointermove', handlePointerMove);
    renderer.domElement.addEventListener('pointerup', handlePointerUp);
    renderer.domElement.addEventListener('pointercancel', handlePointerUp);

    // 10. Animation & Render Loop
    let lastTime = performance.now();
    let lastRenderTime = 0;
    const headlessRenderInterval = isHeadless ? 1000 / 15 : 0;
    let animId: number;

    const animate = (time: number) => {
      animId = requestAnimationFrame(animate);

      if (isHeadless && time - lastRenderTime < headlessRenderInterval) {
        return;
      }
      lastRenderTime = time;

      const dt = Math.min((time - lastTime) / 1000, 0.1);
      lastTime = time;

      // Check level update (id or version changed for procedural mazes)
      if (
        levelRef.current.id !== currentBuiltLevelId ||
        levelRef.current.version !== currentBuiltLevelVersion
      ) {
        buildLevelScene(levelRef.current);
        currentBuiltLevelId = levelRef.current.id;
        currentBuiltLevelVersion = levelRef.current.version;
      }

      // Trigger impact collision sparks
      if (impactSparksRef.current && impactSparksRef.current.key !== lastHandledSparkKey) {
        lastHandledSparkKey = impactSparksRef.current.key;
        triggerImpactSparks(
          impactSparksRef.current.x,
          impactSparksRef.current.z,
          impactSparksRef.current.intensity
        );
      }

      // Smooth mechanical gimbal tilt:
      // Middle Gimbal Ring tilts on pitch (X-axis)
      // Exact authoritative physics tilt: no second visual smoothing / lag.
      const safePose = clampBoardTilt(liveTiltRef.current);
      midGimbal.rotation.x = safePose.pitch;

      // Inner Labyrinth Board tilts on roll (Z-axis relative to middle ring)
      innerBoard.rotation.z = -safePose.roll;

      // Turn the rotating spindle around its own axis, NOT the whole knob housing.
      // These are visual direct-drive ratios; no invented sixfold amplification.
      const pitchRotor = sideKnobPitchRef.current?.userData.rotor as THREE.Group | undefined;
      const rollRotor = frontKnobRollRef.current?.userData.rotor as THREE.Group | undefined;
      if (pitchRotor) pitchRotor.rotation.z = safePose.pitch;
      if (rollRotor) rollRotor.rotation.z = -safePose.roll;

      // Update Steel Ball Bearing
      const curBall = liveBallRef.current;
      if (ballMeshRef.current) {
        ballMeshRef.current.position.set(curBall.x, curBall.radius + curBall.y, curBall.z);

        // Apply true 3D quaternion rotation from physics
        ballMeshRef.current.quaternion.set(curBall.qx, curBall.qy, curBall.qz, curBall.qw);

        // Update contact shadow
        if (ballShadowRef.current) {
          ballShadowRef.current.position.set(curBall.x, 0.012, curBall.z);
          const shadowScale = Math.max(0.15, 1.0 - Math.abs(curBall.y * 1.5));
          ballShadowRef.current.scale.set(shadowScale, shadowScale, 1);
          ballShadowRef.current.visible = !curBall.isFalling;
        }
      }

      // Continuous rolling sound updates
      const speed = Math.sqrt(curBall.vx * curBall.vx + curBall.vz * curBall.vz);
      if (statusRef.current === 'playing' && !curBall.isFalling) {
        soundEngine.updateRolling(speed, curBall.slip);
      } else {
        soundEngine.stopRolling();
      }

      // Gem hover & spin
      const colGems = collectedGemsRef.current;
      gemsMapRef.current.forEach((gemGroup, gemId) => {
        if (colGems.has(gemId)) {
          gemGroup.visible = false;
        } else {
          gemGroup.visible = true;
          const gemMesh = gemGroup.children[1];
          if (gemMesh) {
            gemMesh.rotation.y += 2.2 * dt;
            gemMesh.position.y = 0.52 + Math.sin(time * 0.003 + gemGroup.position.x) * 0.12;
          }
        }
      });

      // Update Particle Simulation
      if (particlesRef.current) {
        let hasActive = false;
        for (let i = 0; i < particleCount; i++) {
          if (particleLifes[i] > 0) {
            particleLifes[i] -= dt;
            particlePositions[i * 3] += particleVelocities[i * 3] * dt;
            particlePositions[i * 3 + 1] += particleVelocities[i * 3 + 1] * dt;
            particlePositions[i * 3 + 2] += particleVelocities[i * 3 + 2] * dt;
            particleVelocities[i * 3 + 1] -= 9.8 * dt;
            hasActive = true;
          } else {
            particlePositions[i * 3 + 1] = -100;
          }
        }
        if (hasActive) {
          particleGeo.attributes.position.needsUpdate = true;
        }
      }

      renderer.render(scene, camera);
    };

    animId = requestAnimationFrame(animate);

    // Resize handler
    const handleResize = () => {
      if (!container) return;
      const w = container.clientWidth;
      const h = container.clientHeight;
      camera.aspect = w / h;
      const responsiveOffset = w >= 1180 ? 2.8 : 0.25;
      camera.position.x = responsiveOffset;
      camera.lookAt(responsiveOffset - 0.85, -1.25, 0.2);
      camera.updateProjectionMatrix();
      renderer.setSize(w, h);
    };

    window.addEventListener('resize', handleResize);

    return () => {
      cancelAnimationFrame(animId);
      window.removeEventListener('resize', handleResize);
      renderer.domElement.removeEventListener('pointerdown', handlePointerDown);
      renderer.domElement.removeEventListener('pointermove', handlePointerMove);
      renderer.domElement.removeEventListener('pointerup', handlePointerUp);
      renderer.domElement.removeEventListener('pointercancel', handlePointerUp);

      soundEngine.stopRolling();
      // Release everything still in the scene as well as renderer-owned resources.
      const remainingGeometry = new Set<THREE.BufferGeometry>();
      const remainingMaterials = new Set<THREE.Material>();
      scene.traverse(child => {
        const mesh = child as THREE.Mesh;
        if (mesh.geometry) remainingGeometry.add(mesh.geometry);
        if (mesh.material) {
          (Array.isArray(mesh.material) ? mesh.material : [mesh.material]).forEach(mat => remainingMaterials.add(mat));
        }
      });
      remainingGeometry.forEach(geo => geo.dispose());
      const remainingTextures = new Set<THREE.Texture>();
      remainingMaterials.forEach(mat => {
        Object.values(mat).forEach(value => {
          if (value instanceof THREE.Texture) remainingTextures.add(value);
        });
        mat.dispose();
      });
      if (scene.environment) remainingTextures.add(scene.environment as THREE.Texture);
      remainingTextures.forEach(tex => tex.dispose());
      renderer.dispose();

      if (container.contains(renderer.domElement)) {
        container.removeChild(renderer.domElement);
      }
    };
  }, []);

  return (
    <div
      ref={mountRef}
      className="absolute inset-0 w-full h-full cursor-grab active:cursor-grabbing touch-none select-none overflow-hidden"
      data-testid="three-labyrinth-canvas-container"
    />
  );
};
