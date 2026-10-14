import React, { useEffect, useRef, useState, useCallback } from 'react';
import * as THREE from 'three';

export interface DiceRequest {
  id: string;
  type: 'd6' | 'd20' | 'd8';
  targetValue: number;
  label?: string;
  color?: string;
}

export interface DiceResult {
  id: string;
  type: 'd6' | 'd20' | 'd8';
  value: number;
  label?: string;
}

interface Props {
  activeRoll?: {
    dice: DiceRequest[];
    title: string;
    onComplete: (results: DiceResult[]) => void;
  } | null;
  onCloseOverlay?: () => void;
  isStandalone?: boolean;
}

// -------------------------------------------------------------
// PERFORMANCE OPTIMIZATION: Global In-Memory Texture Cache
// Pre-generates textures ONCE. Eliminates 2D canvas lag during rolls.
// -------------------------------------------------------------
const TEXTURE_CACHE = new Map<string, THREE.CanvasTexture>();

function getD6Texture(faceValue: number, dieColor: string = '#1e293b', dotColor: string = '#d4a94a'): THREE.CanvasTexture {
  const cacheKey = `d6_${faceValue}_${dieColor}_${dotColor}`;
  if (TEXTURE_CACHE.has(cacheKey)) {
    return TEXTURE_CACHE.get(cacheKey)!;
  }

  const canvas = document.createElement('canvas');
  canvas.width = 128; // Reduced from 256 for optimal GPU memory
  canvas.height = 128;
  const ctx = canvas.getContext('2d', { willReadFrequently: false })!;

  ctx.fillStyle = dieColor;
  ctx.fillRect(0, 0, 128, 128);

  ctx.strokeStyle = '#334155';
  ctx.lineWidth = 6;
  ctx.strokeRect(3, 3, 122, 122);

  ctx.fillStyle = dotColor;
  const drawDot = (x: number, y: number) => {
    ctx.beginPath();
    ctx.arc(x, y, 11, 0, Math.PI * 2);
    ctx.fill();
  };

  const center = 64;
  const left = 34;
  const right = 94;
  const top = 34;
  const bottom = 94;

  switch (faceValue) {
    case 1: drawDot(center, center); break;
    case 2: drawDot(left, top); drawDot(right, bottom); break;
    case 3: drawDot(left, top); drawDot(center, center); drawDot(right, bottom); break;
    case 4: drawDot(left, top); drawDot(right, top); drawDot(left, bottom); drawDot(right, bottom); break;
    case 5: drawDot(left, top); drawDot(right, top); drawDot(center, center); drawDot(left, bottom); drawDot(right, bottom); break;
    case 6: drawDot(left, top); drawDot(right, top); drawDot(left, center); drawDot(right, center); drawDot(left, bottom); drawDot(right, bottom); break;
  }

  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  TEXTURE_CACHE.set(cacheKey, texture);
  return texture;
}

function getNumberTexture(text: string, dieColor: string = '#1e293b', textColor: string = '#d4a94a'): THREE.CanvasTexture {
  const cacheKey = `num_${text}_${dieColor}_${textColor}`;
  if (TEXTURE_CACHE.has(cacheKey)) {
    return TEXTURE_CACHE.get(cacheKey)!;
  }

  const canvas = document.createElement('canvas');
  canvas.width = 128;
  canvas.height = 128;
  const ctx = canvas.getContext('2d', { willReadFrequently: false })!;

  ctx.fillStyle = dieColor;
  ctx.fillRect(0, 0, 128, 128);

  ctx.fillStyle = textColor;
  ctx.font = 'bold 54px sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(text, 64, 64);

  ctx.strokeStyle = textColor;
  ctx.lineWidth = 4;
  ctx.strokeRect(8, 8, 112, 112);

  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  TEXTURE_CACHE.set(cacheKey, texture);
  return texture;
}

// Procedural Web Audio API sound for realistic dice clatter
function playDiceClatterSound() {
  try {
    const AudioCtx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    if (!AudioCtx) return;
    const ctx = new AudioCtx();
    const now = ctx.currentTime;

    for (let i = 0; i < 3; i++) {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      const time = now + i * 0.08;

      osc.type = 'triangle';
      osc.frequency.setValueAtTime(180 + Math.random() * 200, time);
      osc.frequency.exponentialRampToValueAtTime(70, time + 0.06);

      gain.gain.setValueAtTime(0.2 / (i + 1), time);
      gain.gain.exponentialRampToValueAtTime(0.001, time + 0.05);

      osc.connect(gain);
      gain.connect(ctx.destination);

      osc.start(time);
      osc.stop(time + 0.06);
    }
  } catch {
    // Ignore audio permission blocks
  }
}

// Shared geometry caches
const sharedD6Geometry = new THREE.BoxGeometry(1.6, 1.6, 1.6);
const sharedD20Geometry = new THREE.IcosahedronGeometry(1.2, 0);
const sharedD8Geometry = new THREE.OctahedronGeometry(1.3, 0);

interface PhysicsDie {
  mesh: THREE.Mesh;
  type: 'd6' | 'd20' | 'd8';
  targetValue: number;
  id: string;
  label?: string;
  pos: THREE.Vector3;
  vel: THREE.Vector3;
  rot: THREE.Vector3;
  angVel: THREE.Vector3;
  settled: boolean;
  targetQuat: THREE.Quaternion;
}

export const ThreeDiceCanvas: React.FC<Props> = ({ activeRoll, onCloseOverlay, isStandalone = false }) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const [rollSummary, setRollSummary] = useState<DiceResult[] | null>(null);
  const [isRolling, setIsRolling] = useState(false);

  const sceneRef = useRef<THREE.Scene | null>(null);
  const rendererRef = useRef<THREE.WebGLRenderer | null>(null);
  const cameraRef = useRef<THREE.PerspectiveCamera | null>(null);
  const diceListRef = useRef<PhysicsDie[]>([]);
  const animFrameRef = useRef<number | null>(null);

  const getD6TargetQuat = (face: number): THREE.Quaternion => {
    const q = new THREE.Quaternion();
    switch (face) {
      case 1: q.setFromEuler(new THREE.Euler(0, 0, 0)); break;
      case 6: q.setFromEuler(new THREE.Euler(Math.PI, 0, 0)); break;
      case 2: q.setFromEuler(new THREE.Euler(0, 0, Math.PI / 2)); break;
      case 5: q.setFromEuler(new THREE.Euler(0, 0, -Math.PI / 2)); break;
      case 3: q.setFromEuler(new THREE.Euler(-Math.PI / 2, 0, 0)); break;
      case 4: q.setFromEuler(new THREE.Euler(Math.PI / 2, 0, 0)); break;
    }
    return q;
  };

  const createDieMesh = (req: DiceRequest): THREE.Mesh => {
    const primaryColor = req.color || '#1c2822';
    const accentColor = '#d4a94a';

    if (req.type === 'd6') {
      const materials = [
        new THREE.MeshStandardMaterial({ map: getD6Texture(2, primaryColor, accentColor), roughness: 0.3 }),
        new THREE.MeshStandardMaterial({ map: getD6Texture(5, primaryColor, accentColor), roughness: 0.3 }),
        new THREE.MeshStandardMaterial({ map: getD6Texture(1, primaryColor, accentColor), roughness: 0.3 }),
        new THREE.MeshStandardMaterial({ map: getD6Texture(6, primaryColor, accentColor), roughness: 0.3 }),
        new THREE.MeshStandardMaterial({ map: getD6Texture(3, primaryColor, accentColor), roughness: 0.3 }),
        new THREE.MeshStandardMaterial({ map: getD6Texture(4, primaryColor, accentColor), roughness: 0.3 }),
      ];
      const mesh = new THREE.Mesh(sharedD6Geometry, materials);
      mesh.castShadow = true;
      return mesh;
    } else if (req.type === 'd20') {
      const mat = new THREE.MeshStandardMaterial({
        map: getNumberTexture(req.targetValue.toString(), '#2a1a38', '#ffd166'),
        roughness: 0.25,
        flatShading: true
      });
      const mesh = new THREE.Mesh(sharedD20Geometry, mat);
      mesh.castShadow = true;
      return mesh;
    } else {
      const mat = new THREE.MeshStandardMaterial({
        map: getNumberTexture(req.targetValue.toString(), '#163326', '#4aa3e0'),
        roughness: 0.25,
        flatShading: true
      });
      const mesh = new THREE.Mesh(sharedD8Geometry, mat);
      mesh.castShadow = true;
      return mesh;
    }
  };

  const spawnDice = useCallback((requests: DiceRequest[]) => {
    if (!sceneRef.current) return;
    const scene = sceneRef.current;

    diceListRef.current.forEach(d => scene.remove(d.mesh));
    diceListRef.current = [];

    const spacing = 2.4;
    const startX = -((requests.length - 1) * spacing) / 2;

    playDiceClatterSound();
    setIsRolling(true);
    setRollSummary(null);

    requests.forEach((req, idx) => {
      const mesh = createDieMesh(req);
      const x = startX + idx * spacing + (Math.random() - 0.5) * 0.4;
      const y = 4.5 + Math.random() * 1.5;
      const z = (Math.random() - 0.5) * 1.2;

      mesh.position.set(x, y, z);
      scene.add(mesh);

      const die: PhysicsDie = {
        mesh,
        type: req.type,
        targetValue: req.targetValue,
        id: req.id,
        label: req.label,
        pos: new THREE.Vector3(x, y, z),
        vel: new THREE.Vector3((Math.random() - 0.5) * 2, -(4 + Math.random() * 2), (Math.random() - 0.5) * 2),
        rot: new THREE.Vector3(Math.random() * Math.PI, Math.random() * Math.PI, Math.random() * Math.PI),
        angVel: new THREE.Vector3((Math.random() - 0.5) * 20, (Math.random() - 0.5) * 20, (Math.random() - 0.5) * 20),
        settled: false,
        targetQuat: req.type === 'd6' ? getD6TargetQuat(req.targetValue) : new THREE.Quaternion()
      };

      diceListRef.current.push(die);
    });
  }, []);

  // Initialize Three.js scene
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const width = container.clientWidth || 600;
    const height = container.clientHeight || 400;

    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0x0c1310);
    sceneRef.current = scene;

    const camera = new THREE.PerspectiveCamera(40, width / height, 0.1, 50);
    camera.position.set(0, 10, 8);
    camera.lookAt(0, 0, 0);
    cameraRef.current = camera;

    // Optimization: Capped pixel ratio to prevent GPU overload
    const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
    renderer.setSize(width, height);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.5));
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.BasicShadowMap; // Faster than PCFSoft
    rendererRef.current = renderer;

    container.innerHTML = '';
    container.appendChild(renderer.domElement);

    const ambientLight = new THREE.AmbientLight(0xfff5e6, 0.9);
    scene.add(ambientLight);

    const dirLight = new THREE.DirectionalLight(0xfff0d0, 1.6);
    dirLight.position.set(5, 12, 6);
    dirLight.castShadow = true;
    dirLight.shadow.mapSize.width = 512; // Capped for performance
    dirLight.shadow.mapSize.height = 512;
    scene.add(dirLight);

    const floorGeo = new THREE.PlaneGeometry(30, 20);
    const floorMat = new THREE.MeshStandardMaterial({ color: 0x14221b, roughness: 0.8 });
    const floor = new THREE.Mesh(floorGeo, floorMat);
    floor.rotation.x = -Math.PI / 2;
    floor.receiveShadow = true;
    scene.add(floor);

    let lastTime = performance.now();
    let rollDuration = 0;

    const animate = () => {
      animFrameRef.current = requestAnimationFrame(animate);

      const now = performance.now();
      const delta = Math.min((now - lastTime) / 1000, 0.05);
      lastTime = now;

      if (diceListRef.current.length > 0) {
        rollDuration += delta;
        let allSettled = true;

        diceListRef.current.forEach(die => {
          if (!die.settled) {
            allSettled = false;
            die.vel.y -= 26 * delta;

            die.pos.addScaledVector(die.vel, delta);
            die.mesh.position.copy(die.pos);

            die.rot.addScaledVector(die.angVel, delta);
            die.mesh.rotation.set(die.rot.x, die.rot.y, die.rot.z);

            const floorLevel = die.type === 'd6' ? 0.8 : 0.9;
            if (die.pos.y <= floorLevel) {
              die.pos.y = floorLevel;
              die.vel.y = -die.vel.y * 0.42;
              die.vel.x *= 0.75;
              die.vel.z *= 0.75;
              die.angVel.multiplyScalar(0.7);

              if (Math.abs(die.vel.y) < 0.25 && die.vel.length() < 0.4) {
                die.vel.set(0, 0, 0);
                if (rollDuration > 0.7) {
                  die.settled = true;
                }
              }
            }
          } else {
            if (die.type === 'd6') {
              die.mesh.quaternion.slerp(die.targetQuat, 0.18);
            }
          }
        });

        if (allSettled && isRolling && rollDuration > 1.0) {
          setIsRolling(false);
          const results: DiceResult[] = diceListRef.current.map(d => ({
            id: d.id,
            type: d.type,
            value: d.targetValue,
            label: d.label
          }));
          setRollSummary(results);
          if (activeRoll?.onComplete) {
            activeRoll.onComplete(results);
          }
        }
      }

      renderer.render(scene, camera);
    };

    animate();

    const handleResize = () => {
      if (!container || !rendererRef.current || !cameraRef.current) return;
      const w = container.clientWidth;
      const h = container.clientHeight;
      cameraRef.current.aspect = w / h;
      cameraRef.current.updateProjectionMatrix();
      rendererRef.current.setSize(w, h);
    };

    window.addEventListener('resize', handleResize);

    return () => {
      window.removeEventListener('resize', handleResize);
      if (animFrameRef.current) cancelAnimationFrame(animFrameRef.current);
      renderer.dispose();
      if (container) container.innerHTML = '';
    };
  }, [activeRoll, isRolling]);

  useEffect(() => {
    if (activeRoll && activeRoll.dice && activeRoll.dice.length > 0) {
      spawnDice(activeRoll.dice);
    }
  }, [activeRoll, spawnDice]);

  const rollQuick = (type: '2d6' | '1d20' | 'd8' | '4d6') => {
    let requests: DiceRequest[] = [];
    if (type === '2d6') {
      const v1 = 1 + Math.floor(Math.random() * 6);
      const v2 = 1 + Math.floor(Math.random() * 6);
      requests = [
        { id: 'd6_1', type: 'd6', targetValue: v1, label: 'Die 1' },
        { id: 'd6_2', type: 'd6', targetValue: v2, label: 'Die 2' }
      ];
    } else if (type === '1d20') {
      const v = 1 + Math.floor(Math.random() * 20);
      requests = [{ id: 'd20_1', type: 'd20', targetValue: v, label: 'D20 Check' }];
    } else if (type === 'd8') {
      const v = 1 + Math.floor(Math.random() * 8);
      requests = [{ id: 'd8_1', type: 'd8', targetValue: v, label: 'Element Die' }];
    } else if (type === '4d6') {
      requests = [1, 2, 3, 4].map(n => ({
        id: `d6_${n}`,
        type: 'd6' as const,
        targetValue: 1 + Math.floor(Math.random() * 6),
        label: `d6 #${n}`
      }));
    }
    spawnDice(requests);
  };

  const totalValue = rollSummary?.reduce((sum, r) => sum + r.value, 0) ?? 0;

  return (
    <div className={`relative flex flex-col ${isStandalone ? 'w-full h-full' : 'w-full max-w-2xl bg-[#111a15] rounded-xl border border-[#3d5446] overflow-hidden shadow-2xl'}`}>
      <div className="flex items-center justify-between px-4 py-2.5 bg-[#16221c] border-b border-[#2a3c33] z-10">
        <div className="flex items-center gap-2">
          <span className="text-amber-400 font-display text-sm tracking-wide">
            {activeRoll?.title || 'Physical 3D Dice Chamber'}
          </span>
          {isRolling && (
            <span className="text-xs text-amber-300 animate-pulse font-mono-nums">
              [Rolling...]
            </span>
          )}
        </div>
        {!isStandalone && onCloseOverlay && (
          <button
            onClick={onCloseOverlay}
            className="text-xs text-stone-400 hover:text-white px-2 py-1 rounded bg-[#22332a] border border-[#3d5446]"
          >
            Close
          </button>
        )}
      </div>

      <div
        ref={containerRef}
        className={`w-full relative ${isStandalone ? 'flex-1 min-h-[380px]' : 'h-[300px]'}`}
      />

      {rollSummary && !isRolling && (
        <div className="absolute top-12 left-1/2 -translate-x-1/2 bg-[#0c100ebf] backdrop-blur-md px-6 py-2 rounded-full border border-amber-500/50 shadow-xl flex items-center gap-4 z-20 pointer-events-none">
          <span className="text-stone-300 text-xs">Result:</span>
          <div className="flex items-center gap-2">
            {rollSummary.map((r, i) => (
              <span key={i} className="text-sm font-bold text-amber-300 font-mono-nums">
                {r.value}
                {i < rollSummary.length - 1 ? ' +' : ''}
              </span>
            ))}
            {rollSummary.length > 1 && (
              <span className="text-lg font-extrabold text-amber-400 ml-1 font-mono-nums">
                = {totalValue}
              </span>
            )}
          </div>
        </div>
      )}

      <div className="px-4 py-3 bg-[#142019] border-t border-[#2a3c33] flex items-center justify-between gap-2 flex-wrap z-10">
        <div className="flex items-center gap-1.5 flex-wrap">
          <span className="text-xs text-stone-400 mr-1">GM Roll:</span>
          <button
            onClick={() => rollQuick('2d6')}
            disabled={isRolling}
            className="px-3 py-1 text-xs font-semibold rounded bg-[#22332a] hover:bg-[#2e4438] text-amber-300 border border-[#3d5446] disabled:opacity-50"
          >
            Roll 2d6
          </button>
          <button
            onClick={() => rollQuick('1d20')}
            disabled={isRolling}
            className="px-3 py-1 text-xs font-semibold rounded bg-[#22332a] hover:bg-[#2e4438] text-amber-300 border border-[#3d5446] disabled:opacity-50"
          >
            Roll 1d20
          </button>
          <button
            onClick={() => rollQuick('d8')}
            disabled={isRolling}
            className="px-3 py-1 text-xs font-semibold rounded bg-[#22332a] hover:bg-[#2e4438] text-teal-300 border border-[#3d5446] disabled:opacity-50"
          >
            Roll d8
          </button>
          <button
            onClick={() => rollQuick('4d6')}
            disabled={isRolling}
            className="px-3 py-1 text-xs font-semibold rounded bg-[#22332a] hover:bg-[#2e4438] text-stone-300 border border-[#3d5446] disabled:opacity-50"
          >
            Roll 4d6
          </button>
        </div>

        {rollSummary && (
          <div className="text-xs text-stone-400 font-mono-nums">
            Last: <b className="text-amber-300">{rollSummary.map(r => r.value).join(', ')}</b> (Sum: {totalValue})
          </div>
        )}
      </div>
    </div>
  );
};
