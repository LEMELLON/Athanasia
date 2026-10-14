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

// Procedural texture generator for d6 faces
function createD6Texture(faceValue: number, dieColor: string = '#1e293b', dotColor: string = '#d4a94a'): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 256;
  canvas.height = 256;
  const ctx = canvas.getContext('2d')!;

  // Background
  ctx.fillStyle = dieColor;
  ctx.fillRect(0, 0, 256, 256);

  // Border & bevel rim
  ctx.strokeStyle = '#334155';
  ctx.lineWidth = 12;
  ctx.strokeRect(6, 6, 244, 244);
  ctx.strokeStyle = '#0f172a';
  ctx.lineWidth = 6;
  ctx.strokeRect(12, 12, 232, 232);

  // Gold pips or numerals
  ctx.fillStyle = dotColor;
  const drawDot = (x: number, y: number) => {
    ctx.beginPath();
    ctx.arc(x, y, 22, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = '#fff8db';
    ctx.lineWidth = 3;
    ctx.stroke();
  };

  const center = 128;
  const left = 68;
  const right = 188;
  const top = 68;
  const bottom = 188;

  switch (faceValue) {
    case 1:
      drawDot(center, center);
      break;
    case 2:
      drawDot(left, top);
      drawDot(right, bottom);
      break;
    case 3:
      drawDot(left, top);
      drawDot(center, center);
      drawDot(right, bottom);
      break;
    case 4:
      drawDot(left, top);
      drawDot(right, top);
      drawDot(left, bottom);
      drawDot(right, bottom);
      break;
    case 5:
      drawDot(left, top);
      drawDot(right, top);
      drawDot(center, center);
      drawDot(left, bottom);
      drawDot(right, bottom);
      break;
    case 6:
      drawDot(left, top);
      drawDot(right, top);
      drawDot(left, center);
      drawDot(right, center);
      drawDot(left, bottom);
      drawDot(right, bottom);
      break;
  }

  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

// Procedural texture for d20 / d8 numeral decals
function createNumberTexture(text: string, dieColor: string = '#1e293b', textColor: string = '#d4a94a'): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 256;
  canvas.height = 256;
  const ctx = canvas.getContext('2d')!;

  ctx.fillStyle = dieColor;
  ctx.fillRect(0, 0, 256, 256);

  ctx.fillStyle = textColor;
  ctx.font = 'bold 96px "Cinzel", "Plus Jakarta Sans", sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(text, 128, 128);

  // Decorative border
  ctx.strokeStyle = textColor;
  ctx.lineWidth = 8;
  ctx.strokeRect(16, 16, 224, 224);

  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

// Procedural Web Audio API sound for realistic dice clatter
function playDiceClatterSound() {
  try {
    const AudioCtx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    if (!AudioCtx) return;
    const ctx = new AudioCtx();
    const now = ctx.currentTime;

    // Rattle of multiple impacts
    for (let i = 0; i < 4; i++) {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      const time = now + i * 0.08 + Math.random() * 0.04;

      osc.type = i % 2 === 0 ? 'triangle' : 'sine';
      osc.frequency.setValueAtTime(180 + Math.random() * 260, time);
      osc.frequency.exponentialRampToValueAtTime(80, time + 0.07);

      gain.gain.setValueAtTime(0.25 / (i + 1), time);
      gain.gain.exponentialRampToValueAtTime(0.001, time + 0.06);

      osc.connect(gain);
      gain.connect(ctx.destination);

      osc.start(time);
      osc.stop(time + 0.07);
    }
  } catch {
    // Ignore audio permission blocks
  }
}

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

  // References to keep animation loop clean without GC
  const sceneRef = useRef<THREE.Scene | null>(null);
  const rendererRef = useRef<THREE.WebGLRenderer | null>(null);
  const cameraRef = useRef<THREE.PerspectiveCamera | null>(null);
  const diceListRef = useRef<PhysicsDie[]>([]);
  const animFrameRef = useRef<number | null>(null);

  // Quaternions to orient top face of d6
  const getD6TargetQuat = (face: number): THREE.Quaternion => {
    const q = new THREE.Quaternion();
    // Standard box materials array index: 0:+X, 1:-X, 2:+Y, 3:-Y, 4:+Z, 5:-Z
    // Mapping: face 1=Top(+Y), 6=Bottom(-Y), 2=Right(+X), 5=Left(-X), 3=Front(+Z), 4=Back(-Z)
    switch (face) {
      case 1: q.setFromEuler(new THREE.Euler(0, 0, 0)); break; // +Y up
      case 6: q.setFromEuler(new THREE.Euler(Math.PI, 0, 0)); break; // -Y up
      case 2: q.setFromEuler(new THREE.Euler(0, 0, Math.PI / 2)); break; // -X up
      case 5: q.setFromEuler(new THREE.Euler(0, 0, -Math.PI / 2)); break; // +X up
      case 3: q.setFromEuler(new THREE.Euler(-Math.PI / 2, 0, 0)); break; // +Z up
      case 4: q.setFromEuler(new THREE.Euler(Math.PI / 2, 0, 0)); break; // -Z up
    }
    return q;
  };

  const createDieMesh = (req: DiceRequest): THREE.Mesh => {
    const primaryColor = req.color || '#1c2822';
    const accentColor = '#d4a94a';

    if (req.type === 'd6') {
      const geo = new THREE.BoxGeometry(1.6, 1.6, 1.6);
      // Materials order: +X (2), -X (5), +Y (1), -Y (6), +Z (3), -Z (4)
      const materials = [
        new THREE.MeshStandardMaterial({ map: createD6Texture(2, primaryColor, accentColor), roughness: 0.25, metalness: 0.1 }),
        new THREE.MeshStandardMaterial({ map: createD6Texture(5, primaryColor, accentColor), roughness: 0.25, metalness: 0.1 }),
        new THREE.MeshStandardMaterial({ map: createD6Texture(1, primaryColor, accentColor), roughness: 0.25, metalness: 0.1 }),
        new THREE.MeshStandardMaterial({ map: createD6Texture(6, primaryColor, accentColor), roughness: 0.25, metalness: 0.1 }),
        new THREE.MeshStandardMaterial({ map: createD6Texture(3, primaryColor, accentColor), roughness: 0.25, metalness: 0.1 }),
        new THREE.MeshStandardMaterial({ map: createD6Texture(4, primaryColor, accentColor), roughness: 0.25, metalness: 0.1 }),
      ];
      const mesh = new THREE.Mesh(geo, materials);
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      return mesh;
    } else if (req.type === 'd20') {
      const geo = new THREE.IcosahedronGeometry(1.2, 0);
      const mat = new THREE.MeshStandardMaterial({
        map: createNumberTexture(req.targetValue.toString(), '#2a1a38', '#ffd166'),
        roughness: 0.2,
        metalness: 0.3,
        flatShading: true
      });
      const mesh = new THREE.Mesh(geo, mat);
      mesh.castShadow = true;
      return mesh;
    } else {
      // d8
      const geo = new THREE.OctahedronGeometry(1.3, 0);
      const mat = new THREE.MeshStandardMaterial({
        map: createNumberTexture(req.targetValue.toString(), '#163326', '#4aa3e0'),
        roughness: 0.25,
        metalness: 0.2,
        flatShading: true
      });
      const mesh = new THREE.Mesh(geo, mat);
      mesh.castShadow = true;
      return mesh;
    }
  };

  const spawnDice = useCallback((requests: DiceRequest[]) => {
    if (!sceneRef.current) return;
    const scene = sceneRef.current;

    // Clean up old dice
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
      const y = 5 + Math.random() * 2;
      const z = (Math.random() - 0.5) * 1.5;

      mesh.position.set(x, y, z);
      scene.add(mesh);

      const die: PhysicsDie = {
        mesh,
        type: req.type,
        targetValue: req.targetValue,
        id: req.id,
        label: req.label,
        pos: new THREE.Vector3(x, y, z),
        vel: new THREE.Vector3((Math.random() - 0.5) * 2.5, -(4 + Math.random() * 2), (Math.random() - 0.5) * 2.5),
        rot: new THREE.Vector3(Math.random() * Math.PI, Math.random() * Math.PI, Math.random() * Math.PI),
        angVel: new THREE.Vector3((Math.random() - 0.5) * 25, (Math.random() - 0.5) * 25, (Math.random() - 0.5) * 25),
        settled: false,
        targetQuat: req.type === 'd6' ? getD6TargetQuat(req.targetValue) : new THREE.Quaternion().setFromEuler(new THREE.Euler(0, 0, 0))
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

    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    renderer.setSize(width, height);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    rendererRef.current = renderer;

    container.innerHTML = '';
    container.appendChild(renderer.domElement);

    // Studio Lights
    const ambientLight = new THREE.AmbientLight(0xfff5e6, 0.8);
    scene.add(ambientLight);

    const dirLight = new THREE.DirectionalLight(0xfff0d0, 1.8);
    dirLight.position.set(5, 14, 7);
    dirLight.castShadow = true;
    dirLight.shadow.mapSize.width = 1024;
    dirLight.shadow.mapSize.height = 1024;
    dirLight.shadow.camera.near = 0.5;
    dirLight.shadow.camera.far = 25;
    dirLight.shadow.bias = -0.0005;
    scene.add(dirLight);

    const blueRimLight = new THREE.DirectionalLight(0x4aa3e0, 0.6);
    blueRimLight.position.set(-6, 8, -4);
    scene.add(blueRimLight);

    // Felt Rolling Arena Floor
    const floorGeo = new THREE.PlaneGeometry(30, 20);
    const floorMat = new THREE.MeshStandardMaterial({
      color: 0x14221b,
      roughness: 0.8,
      metalness: 0.05
    });
    const floor = new THREE.Mesh(floorGeo, floorMat);
    floor.rotation.x = -Math.PI / 2;
    floor.position.y = 0;
    floor.receiveShadow = true;
    scene.add(floor);

    // Felt boundary rim
    const rimGeo = new THREE.BoxGeometry(16, 0.6, 10);
    const rimMat = new THREE.MeshStandardMaterial({ color: 0x241710, roughness: 0.6 });
    const rim = new THREE.Mesh(rimGeo, rimMat);
    rim.position.set(0, 0.1, 0);
    rim.receiveShadow = true;
    scene.add(rim);

    // Animation Loop with physics
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
            // Apply gravity
            die.vel.y -= 26 * delta;

            // Update pos
            die.pos.addScaledVector(die.vel, delta);
            die.mesh.position.copy(die.pos);

            // Rotate
            die.rot.addScaledVector(die.angVel, delta);
            die.mesh.rotation.set(die.rot.x, die.rot.y, die.rot.z);

            // Floor collision
            const floorLevel = die.type === 'd6' ? 0.8 : 0.9;
            if (die.pos.y <= floorLevel) {
              die.pos.y = floorLevel;
              die.vel.y = -die.vel.y * 0.45; // restitution
              die.vel.x *= 0.75;
              die.vel.z *= 0.75;
              die.angVel.multiplyScalar(0.7);

              if (Math.abs(die.vel.y) < 0.25 && die.vel.length() < 0.4) {
                die.vel.set(0, 0, 0);
                // Settle towards target face
                if (rollDuration > 0.8) {
                  die.settled = true;
                }
              }
            }
          } else {
            // Smoothly align final orientation for crystal clarity
            if (die.type === 'd6') {
              die.mesh.quaternion.slerp(die.targetQuat, 0.15);
            }
          }
        });

        // Conclude roll
        if (allSettled && isRolling && rollDuration > 1.2) {
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

  // Handle external activeRoll triggers
  useEffect(() => {
    if (activeRoll && activeRoll.dice && activeRoll.dice.length > 0) {
      spawnDice(activeRoll.dice);
    }
  }, [activeRoll, spawnDice]);

  // Quick GM test rollers
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
      {/* Top Header */}
      <div className="flex items-center justify-between px-4 py-2.5 bg-[#16221c] border-b border-[#2a3c33] z-10">
        <div className="flex items-center gap-2">
          <span className="text-amber-400 font-display text-sm tracking-wide">
            {activeRoll?.title || 'Physical 3D Dice Chamber'}
          </span>
          {isRolling && (
            <span className="text-xs text-amber-300 animate-pulse font-mono-nums">
              [Tumbling...]
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

      {/* 3D WebGL Canvas Viewport */}
      <div
        ref={containerRef}
        className={`w-full relative ${isStandalone ? 'flex-1 min-h-[380px]' : 'h-[300px]'}`}
      />

      {/* Result Display Overlay */}
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

      {/* Quick Roll Controls Dock */}
      <div className="px-4 py-3 bg-[#142019] border-t border-[#2a3c33] flex items-center justify-between gap-2 flex-wrap z-10">
        <div className="flex items-center gap-1.5 flex-wrap">
          <span className="text-xs text-stone-400 mr-1">GM Roll:</span>
          <button
            onClick={() => rollQuick('2d6')}
            disabled={isRolling}
            className="px-3 py-1 text-xs font-semibold rounded bg-[#22332a] hover:bg-[#2e4438] text-amber-300 border border-[#3d5446] disabled:opacity-50"
          >
            Roll 2d6 (Hit/Move)
          </button>
          <button
            onClick={() => rollQuick('1d20')}
            disabled={isRolling}
            className="px-3 py-1 text-xs font-semibold rounded bg-[#22332a] hover:bg-[#2e4438] text-amber-300 border border-[#3d5446] disabled:opacity-50"
          >
            Roll 1d20 (Damage)
          </button>
          <button
            onClick={() => rollQuick('d8')}
            disabled={isRolling}
            className="px-3 py-1 text-xs font-semibold rounded bg-[#22332a] hover:bg-[#2e4438] text-teal-300 border border-[#3d5446] disabled:opacity-50"
          >
            Roll d8 (Element)
          </button>
          <button
            onClick={() => rollQuick('4d6')}
            disabled={isRolling}
            className="px-3 py-1 text-xs font-semibold rounded bg-[#22332a] hover:bg-[#2e4438] text-stone-300 border border-[#3d5446] disabled:opacity-50"
          >
            Roll 4d6 Pool
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
