import React, { useRef, useEffect, useState, useCallback, useMemo } from 'react';
import { Tile, Vector3, TileType, GamePhase, CameraState, ClubType, TrajectoryData, AimData } from '../types';
import { TILE_SIZE, COLORS, SIDE_COLORS, MAX_DRAG_DISTANCE, PHYSICS_CONSTANTS } from '../constants';
import { calculateTrajectoryData } from '../services/physicsEngine';
import { PHYSICS_CONFIG } from '../constants';

interface GameCanvasProps {
  tiles: Tile[];
  ballPosition: Vector3;
  holePosition: Vector3;
  onShoot: (velocity: Vector3) => void;
  onAim: (data: AimData | null) => void;
  gamePhase: GamePhase;
  selectedClub: ClubType;
  lastTrajectory?: TrajectoryData;
  isPaused: boolean; 
}

// Angles in Degrees
const CLUB_STATS = {
  [ClubType.DRIVER]: { maxForce: 2200, minAngle: 18, angleRange: 12, guideLines: 100 }, 
  [ClubType.IRON]:   { maxForce: 1400, minAngle: 30, angleRange: 15, guideLines: 80 },
  [ClubType.WEDGE]:  { maxForce: 950, minAngle: 45, angleRange: 20, guideLines: 60 }, 
  [ClubType.PUTTER]: { maxForce: 1500, minAngle: 0, angleRange: 0, guideLines: 40 }, // Increased slightly
};

const BASE_GROUND_LEVEL = -4; 

const GameCanvas: React.FC<GameCanvasProps> = ({
  tiles,
  ballPosition,
  holePosition,
  onShoot,
  onAim,
  gamePhase,
  selectedClub,
  lastTrajectory,
  isPaused
}) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const terrainCacheRef = useRef<HTMLCanvasElement | null>(null);
  const [initialized, setInitialized] = useState(false);
  
  // Camera State
  const [camera, setCamera] = useState<CameraState>({
    offset: { x: 0, y: 0 },
    zoom: 1,
    rotation: -Math.PI / 4 
  });

  const [dragMode, setDragMode] = useState<'NONE' | 'PAN' | 'AIM'>('NONE');
  const [dragStart, setDragStart] = useState<{ x: number; y: number } | null>(null);
  const [dragCurrent, setDragCurrent] = useState<{ x: number; y: number } | null>(null);
  const [time, setTime] = useState(0);
  const [isHoveringBall, setIsHoveringBall] = useState(false);

  // Sorting tiles once per level change/render is better, but doing it in render loop is safer for depth
  // We will memoize the sorted tiles for the cache drawing
  const sortedTilesForCache = useMemo(() => {
     return [...tiles].sort((a, b) => {
        // Simple depth sort based on isometric projection logic (x + z)
        // Since rotation is fixed to 45 deg steps, (x+z) works for standard view
        // But we rotate the camera.
        // For caching to work with rotation, we need to invalidate cache on rotation.
        return (a.x + a.z) - (b.x + b.z);
     });
  }, [tiles]);

  useEffect(() => {
    let animId: number;
    const animate = () => {
        setTime(t => t + 0.05);
        animId = requestAnimationFrame(animate);
    }
    animId = requestAnimationFrame(animate);
    return () => cancelAnimationFrame(animId);
  }, []);

  // Coordinate Projection
  const worldToScreen = useCallback((v: Vector3): { x: number; y: number, depth: number } => {
    const cosR = Math.cos(camera.rotation);
    const sinR = Math.sin(camera.rotation);
    
    // Rotate world
    const rx = v.x * cosR - v.z * sinR;
    const rz = v.x * sinR + v.z * cosR;

    const ISO_X_SCALE = TILE_SIZE * Math.cos(Math.PI / 6);
    const ISO_Y_SCALE = TILE_SIZE * Math.sin(Math.PI / 6);

    // Project
    const isoX = (rx - rz) * ISO_X_SCALE;
    const isoY = (rx + rz) * ISO_Y_SCALE - (v.y * TILE_SIZE);

    return {
        x: isoX * camera.zoom + camera.offset.x,
        y: isoY * camera.zoom + camera.offset.y,
        depth: rz + rx 
    };
  }, [camera]);

  // Screen to World (Approximate at Y=0) for Pivot Logic
  const screenToWorldIso = useCallback((sx: number, sy: number) => {
    // Reverse offset and zoom
    const adjX = (sx - camera.offset.x) / camera.zoom;
    const adjY = (sy - camera.offset.y) / camera.zoom;
    
    const ISO_X_SCALE = TILE_SIZE * Math.cos(Math.PI / 6);
    const ISO_Y_SCALE = TILE_SIZE * Math.sin(Math.PI / 6);
    
    const term1 = adjX / ISO_X_SCALE;
    const term2 = adjY / ISO_Y_SCALE;

    const rx = (term1 + term2) / 2;
    const rz = (term2 - term1) / 2;

    // Un-rotate
    const cosR = Math.cos(-camera.rotation);
    const sinR = Math.sin(-camera.rotation);

    const x = rx * cosR - rz * sinR;
    const z = rx * sinR + rz * cosR;
    
    return { x, z };
  }, [camera]);

  // Rotate Camera Around Screen Center
  const rotateCamera = (direction: 'LEFT' | 'RIGHT') => {
      if (isPaused) return;

      const angleDelta = Math.PI / 4 * (direction === 'LEFT' ? 1 : -1);
      
      const rect = containerRef.current?.getBoundingClientRect();
      const cx = rect ? rect.width / 2 : window.innerWidth / 2;
      const cy = rect ? rect.height / 2 : window.innerHeight / 2;
      
      const pivot = screenToWorldIso(cx, cy);

      setCamera(prev => {
         const newRot = prev.rotation + angleDelta;
         
         const cosR = Math.cos(newRot);
         const sinR = Math.sin(newRot);
         
         const rx = pivot.x * cosR - pivot.z * sinR;
         const rz = pivot.x * sinR + pivot.z * cosR;

         const ISO_X_SCALE = TILE_SIZE * Math.cos(Math.PI / 6);
         const ISO_Y_SCALE = TILE_SIZE * Math.sin(Math.PI / 6);

         const isoX = (rx - rz) * ISO_X_SCALE;
         const isoY = (rx + rz) * ISO_Y_SCALE;
         
         const screenX = isoX * prev.zoom + prev.offset.x;
         const screenY = isoY * prev.zoom + prev.offset.y;

         return {
             ...prev,
             rotation: newRot,
             offset: {
                 x: prev.offset.x + (cx - screenX),
                 y: prev.offset.y + (cy - screenY)
             }
         };
      });
      // Invalidate cache
      terrainCacheRef.current = null;
  };

  const handleZoom = (delta: number) => {
      if (isPaused) return;
      setCamera(prev => ({
          ...prev,
          zoom: Math.max(0.3, Math.min(3, prev.zoom + delta))
      }));
      // Invalidate cache
      terrainCacheRef.current = null;
  };

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
        if (isPaused) return;
        if (e.key.toLowerCase() === 'q') rotateCamera('LEFT');
        if (e.key.toLowerCase() === 'e') rotateCamera('RIGHT');
        if (e.key === '=' || e.key === '+') handleZoom(0.1);
        if (e.key === '-') handleZoom(-0.1);
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [camera, isPaused]);

  const calculateShotPhysics = () => {
      if (!dragStart || !dragCurrent) return null;
      const sx = dragStart.x - dragCurrent.x;
      const sy = dragStart.y - dragCurrent.y;
      
      // Calculate Drag Direction in World Space
      const ISO_X_SCALE = TILE_SIZE * Math.cos(Math.PI / 6);
      const ISO_Y_SCALE = TILE_SIZE * Math.sin(Math.PI / 6);
      const term1 = sx / ISO_X_SCALE;
      const term2 = sy / ISO_Y_SCALE;
      const rx = (term1 + term2) / 2;
      const rz = (term2 - term1) / 2;
      
      const invRot = -camera.rotation;
      const cos = Math.cos(invRot);
      const sin = Math.sin(invRot);
      const vx = rx * cos - rz * sin;
      const vz = rx * sin + rz * cos;

      // 1. Calculate Power Ratio (0 to 1)
      const dragLen = Math.sqrt(sx*sx + sy*sy);
      const powerRatio = Math.min(dragLen, MAX_DRAG_DISTANCE) / MAX_DRAG_DISTANCE;
      
      const club = CLUB_STATS[selectedClub];

      // 2. Calculate Force Applied (Newtons)
      const force = powerRatio * club.maxForce;

      // 3. Calculate Velocity Magnitude from Impulse-Momentum Theorem
      // J = F * t = m * v  => v = (F * t) / m
      const velocityMag = (force * PHYSICS_CONSTANTS.CONTACT_TIME) / PHYSICS_CONSTANTS.BALL_MASS;

      // 4. Calculate Dynamic Launch Angle
      // Low power (Ratio near 0) -> Higher Angle (Chip shot) -> minAngle + angleRange
      // High power (Ratio near 1) -> Lower Angle (Drive) -> minAngle
      const angleDeg = club.minAngle + (1 - powerRatio) * club.angleRange;
      const angleRad = angleDeg * (Math.PI / 180);

      // 5. Decompose Velocity into Vector3
      // Vertical component
      const vY = velocityMag * Math.sin(angleRad);
      
      // Horizontal component magnitude
      const vH = velocityMag * Math.cos(angleRad);
      
      // Horizontal direction normalized
      const worldLen = Math.sqrt(vx*vx + vz*vz);
      const dirX = worldLen === 0 ? 0 : vx / worldLen;
      const dirZ = worldLen === 0 ? 0 : vz / worldLen;

      const velocity = { 
          x: dirX * vH, 
          y: vY, 
          z: dirZ * vH 
      };

      return { 
          velocity, 
          force,
          maxForce: club.maxForce,
          powerRatio, 
          launchAngle: angleDeg, 
          mass: PHYSICS_CONSTANTS.BALL_MASS,
          contactTime: PHYSICS_CONSTANTS.CONTACT_TIME
      };
  };

  useEffect(() => {
      if (dragMode === 'AIM' && dragStart && dragCurrent) {
          const phys = calculateShotPhysics();
          if (phys) {
              // We need to calculate trajectory duration here to pass it up
               // NOTE: We do not cache tiles here, passing tiles is fine as it is event based not per frame
               const traj = calculateTrajectoryData(
                 ballPosition, 
                 phys.velocity, 
                 PHYSICS_CONFIG, 
                 tiles, 
                 CLUB_STATS[selectedClub].guideLines
             );

             onAim({
                 ...phys,
                 predictedTotalTime: traj.duration,
                 maxHeight: traj.maxHeight,
                 range: traj.range
             });
          }
      } else {
          onAim(null);
      }
  }, [dragMode, dragStart, dragCurrent, selectedClub, camera.rotation]);

  useEffect(() => {
    if (!initialized && tiles.length > 0) {
        const dx = holePosition.x - ballPosition.x;
        const dz = holePosition.z - ballPosition.z;
        const targetAngle = Math.atan2(dz, dx);
        
        const startRotation = -targetAngle - Math.PI/4;

        setCamera({
            rotation: startRotation,
            zoom: 1,
            offset: { x: window.innerWidth / 2, y: window.innerHeight * 0.5 }
        });
        
        // Clear cache on new level
        terrainCacheRef.current = null;

        setTimeout(() => {
            setInitialized(true);
        }, 50);
    }
  }, [tiles, initialized, ballPosition, holePosition]);

  // DRAW FUNCTIONS
  const drawQuad = (ctx: CanvasRenderingContext2D, p1: any, p2: any, p3: any, p4: any, color: string) => {
      ctx.fillStyle = color;
      ctx.beginPath();
      ctx.moveTo(p1.x, p1.y);
      ctx.lineTo(p2.x, p2.y);
      ctx.lineTo(p3.x, p3.y);
      ctx.lineTo(p4.x, p4.y);
      ctx.closePath();
      ctx.fill();
  };

  const drawTile3D = (ctx: CanvasRenderingContext2D, tile: Tile) => {
    const c1 = { x: tile.x - 0.5, y: tile.height, z: tile.z - 0.5 };
    const c2 = { x: tile.x + 0.5, y: tile.height, z: tile.z - 0.5 };
    const c3 = { x: tile.x + 0.5, y: tile.height, z: tile.z + 0.5 };
    const c4 = { x: tile.x - 0.5, y: tile.height, z: tile.z + 0.5 };

    const s1 = worldToScreen(c1);
    const s2 = worldToScreen(c2);
    const s3 = worldToScreen(c3);
    const s4 = worldToScreen(c4);

    const topColor = COLORS[tile.type];
    let sideColor = SIDE_COLORS.SOIL;
    if (tile.type === TileType.WATER) sideColor = SIDE_COLORS.WATER;
    else if (tile.type === TileType.SAND) sideColor = SIDE_COLORS.SAND;
    else if (tile.type === TileType.GRAVEL) sideColor = SIDE_COLORS.STONE;

    const floorY = tile.type === TileType.WATER ? tile.height - 0.5 : BASE_GROUND_LEVEL;
    
    if (floorY < tile.height) {
        const b1 = worldToScreen({ ...c1, y: floorY });
        const b2 = worldToScreen({ ...c2, y: floorY });
        const b3 = worldToScreen({ ...c3, y: floorY });
        const b4 = worldToScreen({ ...c4, y: floorY });

        drawQuad(ctx, s1, s2, b2, b1, sideColor);
        drawQuad(ctx, s2, s3, b3, b2, sideColor);
        drawQuad(ctx, s3, s4, b4, b3, sideColor);
        drawQuad(ctx, s4, s1, b1, b4, sideColor);
        // Shadows
        ctx.fillStyle = "rgba(0,0,0,0.1)"; drawQuad(ctx, s1, s2, b2, b1, "rgba(0,0,0,0.1)");
        ctx.fillStyle = "rgba(0,0,0,0.2)"; drawQuad(ctx, s2, s3, b3, b2, "rgba(0,0,0,0.2)");
        ctx.fillStyle = "rgba(0,0,0,0.3)"; drawQuad(ctx, s3, s4, b4, b3, "rgba(0,0,0,0.3)");
    }

    ctx.beginPath();
    ctx.moveTo(s1.x, s1.y);
    ctx.lineTo(s2.x, s2.y);
    ctx.lineTo(s3.x, s3.y);
    ctx.lineTo(s4.x, s4.y);
    ctx.closePath();
    ctx.fillStyle = topColor;
    ctx.fill();
    ctx.strokeStyle = topColor;
    ctx.lineWidth = 1;
    ctx.stroke();

    const center = worldToScreen({x: tile.x, y: tile.height, z: tile.z});
    const size = TILE_SIZE * camera.zoom;
    
    // Draw Objects on top of tiles
    if (tile.type === TileType.TREE) drawTree(ctx, center, size);
    if (tile.type === TileType.OBSTACLE) drawRock(ctx, center, size);
    if (tile.type === TileType.ROUGH) drawGrass(ctx, center, size, tile.x, tile.z);
  };

  const drawTree = (ctx: CanvasRenderingContext2D, basePos: {x: number, y: number}, size: number) => {
      ctx.fillStyle = '#451a03';
      const trunkW = size * 0.25;
      const trunkH = size * 0.6;
      ctx.fillRect(basePos.x - trunkW/2, basePos.y - trunkH, trunkW, trunkH);
      ctx.fillStyle = '#14532d';
      ctx.beginPath();
      ctx.moveTo(basePos.x, basePos.y - trunkH - size * 1.2); 
      ctx.lineTo(basePos.x + size * 0.7, basePos.y - trunkH + size * 0.1);
      ctx.lineTo(basePos.x - size * 0.7, basePos.y - trunkH + size * 0.1);
      ctx.fill();
      ctx.beginPath();
      ctx.moveTo(basePos.x, basePos.y - trunkH - size * 0.8);
      ctx.lineTo(basePos.x + size * 0.7, basePos.y - trunkH + size * 0.4);
      ctx.lineTo(basePos.x - size * 0.7, basePos.y - trunkH + size * 0.4);
      ctx.fill();
  };

  const drawRock = (ctx: CanvasRenderingContext2D, basePos: {x: number, y: number}, size: number) => {
      // Draw a simple rock shape
      const s = size * 0.5;
      ctx.fillStyle = '#78716c'; // Stone color
      ctx.beginPath();
      ctx.moveTo(basePos.x - s*0.8, basePos.y);
      ctx.lineTo(basePos.x - s*0.4, basePos.y - s*0.7);
      ctx.lineTo(basePos.x + s*0.3, basePos.y - s*0.8);
      ctx.lineTo(basePos.x + s*0.8, basePos.y - s*0.2);
      ctx.lineTo(basePos.x + s*0.5, basePos.y + s*0.3); // bit below "ground" visual
      ctx.lineTo(basePos.x - s*0.6, basePos.y + s*0.2);
      ctx.closePath();
      ctx.fill();
      
      // Highlight
      ctx.fillStyle = '#a8a29e';
      ctx.beginPath();
      ctx.moveTo(basePos.x - s*0.4, basePos.y - s*0.7);
      ctx.lineTo(basePos.x + s*0.3, basePos.y - s*0.8);
      ctx.lineTo(basePos.x, basePos.y - s*0.3);
      ctx.fill();
  };

  const drawGrass = (ctx: CanvasRenderingContext2D, basePos: {x: number, y: number}, size: number, tx: number, tz: number) => {
      // Deterministic randomness based on tile coord
      const seed = Math.sin(tx * 12.9898 + tz * 78.233) * 43758.5453;
      if ((seed - Math.floor(seed)) > 0.4) return; 

      ctx.strokeStyle = '#14532d'; // Darker green
      ctx.lineWidth = 1 * camera.zoom;
      
      // Draw 2-3 blades
      for(let i=-1; i<=1; i++) {
         ctx.beginPath();
         ctx.moveTo(basePos.x + i*3*camera.zoom, basePos.y);
         ctx.lineTo(basePos.x + i*4*camera.zoom + (i%2)*2, basePos.y - 6*camera.zoom);
         ctx.stroke();
      }
  };

  const drawBall = (ctx: CanvasRenderingContext2D, pos: Vector3) => {
    const screenPos = worldToScreen(pos);
    const radius = 5 * camera.zoom;
    const shadowPos = worldToScreen({ x: pos.x, y: Math.max(pos.y > 0 ? 0 : pos.y, BASE_GROUND_LEVEL), z: pos.z });
    const height = Math.max(0, pos.y);
    const shadowScale = Math.max(0.2, 1 - height/10);
    
    ctx.beginPath();
    ctx.ellipse(shadowPos.x, shadowPos.y, radius * shadowScale, radius * 0.5 * shadowScale, 0, 0, Math.PI * 2);
    ctx.fillStyle = 'rgba(0,0,0,0.3)';
    ctx.fill();

    if (height > 0.1) {
        ctx.beginPath();
        ctx.moveTo(screenPos.x, screenPos.y);
        ctx.lineTo(shadowPos.x, shadowPos.y);
        ctx.strokeStyle = 'rgba(0,0,0,0.2)';
        ctx.lineWidth = 1;
        ctx.setLineDash([2, 2]);
        ctx.stroke();
        ctx.setLineDash([]);
    }

    ctx.beginPath();
    ctx.arc(screenPos.x, screenPos.y, radius, 0, Math.PI * 2);
    ctx.fillStyle = 'white';
    ctx.fill();
    ctx.strokeStyle = '#ddd';
    ctx.stroke();
  };

  const drawHole = (ctx: CanvasRenderingContext2D, pos: Vector3) => {
    const screenPos = worldToScreen(pos);
    const scale = camera.zoom;
    ctx.beginPath();
    ctx.ellipse(screenPos.x, screenPos.y, 8*scale, 4*scale, 0, 0, Math.PI * 2);
    ctx.fillStyle = '#1c1917';
    ctx.fill();
    ctx.beginPath();
    ctx.moveTo(screenPos.x, screenPos.y);
    ctx.lineTo(screenPos.x, screenPos.y - 60*scale);
    ctx.strokeStyle = '#fff';
    ctx.lineWidth = 2*scale;
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(screenPos.x, screenPos.y - 60*scale);
    ctx.lineTo(screenPos.x + 20*scale, screenPos.y - 50*scale);
    ctx.lineTo(screenPos.x, screenPos.y - 40*scale);
    ctx.fillStyle = '#ef4444';
    ctx.fill();
  };

  const drawPowerBar = (ctx: CanvasRenderingContext2D, screenPos: {x: number, y: number}, ratio: number) => {
      const barHeight = 100; const barWidth = 16;
      const x = screenPos.x + 40; const y = screenPos.y - barHeight / 2;
      
      // Bg
      ctx.fillStyle = 'rgba(0,0,0,0.6)';
      ctx.fillRect(x, y, barWidth, barHeight);
      
      let color = '#4ade80'; if (ratio > 0.5) color = '#facc15'; if (ratio > 0.8) color = '#ef4444'; 
      const fillHeight = barHeight * ratio;
      ctx.fillStyle = color;
      ctx.fillRect(x + 2, y + barHeight - fillHeight, barWidth - 4, fillHeight);
      
      ctx.strokeStyle = 'rgba(255,255,255,0.8)';
      ctx.lineWidth = 1;
      ctx.strokeRect(x, y, barWidth, barHeight);

      // Text Power
      ctx.fillStyle = 'white';
      ctx.font = 'bold 12px monospace';
      const pct = Math.round(ratio * 100);
      ctx.fillText(`${pct}%`, x + barWidth + 6, y + barHeight);
      
      // Club Label
      ctx.fillStyle = '#ccc';
      ctx.font = '10px sans-serif';
      ctx.fillText(selectedClub, x, y - 5);
  };

  // GENERIC TRAJECTORY DRAWER with Labels
  const drawTrajectoryWithLabels = (ctx: CanvasRenderingContext2D, data: TrajectoryData, isGhost: boolean) => {
    const points = data.points;
    if (points.length < 2) return;

    const start = points[0];
    const startScreen = worldToScreen(start);
    const end = points[points.length-1];
    const endScreen = worldToScreen(end);

    const opacity = isGhost ? 0.4 : 0.9; 
    const color = `rgba(255,255,255,${opacity})`;

    // 1. Draw Curve
    ctx.beginPath();
    ctx.moveTo(startScreen.x, startScreen.y);
    for (let i = 1; i < points.length; i++) {
        const p = worldToScreen(points[i]);
        ctx.lineTo(p.x, p.y);
    }
    ctx.strokeStyle = color;
    ctx.lineWidth = isGhost ? 2 : 2 * camera.zoom;
    ctx.setLineDash(isGhost ? [4, 4] : []);
    ctx.stroke();
    ctx.setLineDash([]);

    // 2. Labels (Theta, H, R)
    ctx.font = `bold ${10 * camera.zoom}px sans-serif`;
    ctx.fillStyle = color;

    // Angle Theta (Positioned Under the curve start)
    const theta = data.launchAngle;
    ctx.fillText(`θ: ${theta.toFixed(1)}°`, startScreen.x - 20, startScreen.y + 30);

    // Max Height (Vertical Line)
    const apexIdx = points.reduce((iMax, x, i, arr) => x.y > arr[iMax].y ? i : iMax, 0);
    const apex = points[apexIdx];
    const apexScreen = worldToScreen(apex);
    const apexGround = worldToScreen({x: apex.x, y: 0, z: apex.z}); 
    
    ctx.beginPath();
    ctx.moveTo(apexScreen.x, apexScreen.y);
    ctx.lineTo(apexGround.x, apexGround.y);
    ctx.strokeStyle = color;
    ctx.lineWidth = 1;
    ctx.setLineDash([2, 2]);
    ctx.stroke();
    ctx.fillText(`H: ${data.maxHeight.toFixed(1)}m`, apexScreen.x + 5, apexScreen.y);

    // Range (Horizontal Line)
    const endGround = worldToScreen({x: end.x, y: start.y, z: end.z});
    ctx.beginPath();
    ctx.moveTo(startScreen.x, startScreen.y);
    ctx.lineTo(endGround.x, endGround.y);
    ctx.stroke();
    
    // Label R in middle of line
    const midX = (startScreen.x + endGround.x) / 2;
    const midY = (startScreen.y + endGround.y) / 2;
    ctx.fillText(`R: ${data.range.toFixed(1)}m`, midX, midY + 15);

    // Landing Circle (Only for active aiming)
    if (!isGhost && points.length > 5) {
         const pulse = 1 + Math.sin(time * 5) * 0.1;
         const radius = 15 * camera.zoom * pulse;
         ctx.beginPath();
         ctx.ellipse(endScreen.x, endScreen.y, radius, radius * 0.5, 0, 0, Math.PI * 2);
         ctx.fillStyle = 'rgba(255, 255, 255, 0.2)';
         ctx.fill();
         ctx.strokeStyle = 'white';
         ctx.setLineDash([]);
         ctx.lineWidth = 2;
         ctx.stroke();
    }
  };

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    const dpr = window.devicePixelRatio || 1;
    const rect = containerRef.current?.getBoundingClientRect();
    
    if (rect) {
        if (canvas.width !== rect.width * dpr || canvas.height !== rect.height * dpr) {
            canvas.width = rect.width * dpr;
            canvas.height = rect.height * dpr;
            canvas.style.width = `${rect.width}px`;
            canvas.style.height = `${rect.height}px`;
            // Invalidate cache on resize
            terrainCacheRef.current = null;
        }
        ctx.scale(dpr, dpr);
    }

    // CACHING LOGIC
    // If cache is missing or invalidated, redraw the static terrain to the cache
    if (!terrainCacheRef.current) {
        const cache = document.createElement('canvas');
        cache.width = canvas.width; // Already DPR scaled
        cache.height = canvas.height;
        const cCtx = cache.getContext('2d');
        if (cCtx) {
            cCtx.scale(dpr, dpr); // Scale cache context too
            
            // Sort tiles for Painter's Algorithm
            // We need to re-sort here based on current camera rotation if we wanted perfection, 
            // but the iso sort approximation (x+z) generally holds for 4-way rotation if we just redraw.
            // Actually, we need to sort based on projected depth.
            const sorted = [...tiles].sort((a, b) => {
                 const depthA = worldToScreen({ x: a.x, y: 0, z: a.z }).depth;
                 const depthB = worldToScreen({ x: b.x, y: 0, z: b.z }).depth;
                 return depthA - depthB;
            });
            
            sorted.forEach(tile => drawTile3D(cCtx, tile));
            drawHole(cCtx, holePosition);
            
            terrainCacheRef.current = cache;
        }
    }

    const render = () => {
      ctx.clearRect(0, 0, canvas.width / dpr, canvas.height / dpr);
      
      // 1. Draw Cached Terrain
      if (terrainCacheRef.current) {
          ctx.save();
          ctx.resetTransform(); // Cache is already scaled and full size
          ctx.drawImage(terrainCacheRef.current, 0, 0);
          ctx.restore();
      } else {
          // Fallback if cache failed?
          // Just draw manually (shouldnt happen)
      }

      // 2. Draw Dynamic Elements
      drawBall(ctx, ballPosition);

      // 3. Draw Ghost (Previous Shot)
      if (lastTrajectory) {
          drawTrajectoryWithLabels(ctx, lastTrajectory, true);
      }

      // 4. Draw Current Aiming
      if (dragMode === 'AIM' && dragStart && dragCurrent) {
        ctx.beginPath();
        ctx.moveTo(dragStart.x, dragStart.y);
        ctx.lineTo(dragCurrent.x, dragCurrent.y);
        ctx.strokeStyle = 'rgba(255, 255, 255, 0.3)';
        ctx.lineWidth = 1;
        ctx.setLineDash([2,2]);
        ctx.stroke();
        ctx.setLineDash([]);
        
        const phys = calculateShotPhysics();
        if (phys && phys.powerRatio > 0.05) {
             // Calculate trajectory only when aiming to save perf
             // Actually we do this in the effect above, but we need to draw it.
             // We can re-calc here, its cheap enough for one line.
             const data = calculateTrajectoryData(
                 ballPosition, 
                 phys.velocity, 
                 PHYSICS_CONFIG, 
                 tiles, 
                 CLUB_STATS[selectedClub].guideLines
             );
             drawTrajectoryWithLabels(ctx, data, false);
             drawPowerBar(ctx, worldToScreen(ballPosition), phys.powerRatio);
        }
      }
    };
    render();
  }, [tiles, ballPosition, holePosition, dragMode, dragStart, dragCurrent, camera, worldToScreen, selectedClub, time, lastTrajectory]);

  const handleWheel = (e: React.WheelEvent) => {
      if (isPaused) return;
      const newZoom = Math.max(0.5, Math.min(3, camera.zoom - e.deltaY * 0.001));
      setCamera(p => ({ ...p, zoom: newZoom }));
      terrainCacheRef.current = null; // Invalidate
  };

  const handlePointerDown = (e: React.PointerEvent) => {
    if (isPaused) return;

    const ballScreen = worldToScreen(ballPosition);
    const dist = Math.hypot(e.clientX - ballScreen.x, e.clientY - ballScreen.y);
    if (dist < 60 * camera.zoom && gamePhase === GamePhase.AIMING) {
        setDragMode('AIM');
    } else {
        setDragMode('PAN');
    }
    setDragStart({ x: e.clientX, y: e.clientY });
    setDragCurrent({ x: e.clientX, y: e.clientY });
    (e.target as Element).setPointerCapture(e.pointerId);
  };

  const handlePointerMove = (e: React.PointerEvent) => {
    if (isPaused) return;
    
    // Check hover for cursor
    const ballScreen = worldToScreen(ballPosition);
    const dist = Math.hypot(e.clientX - ballScreen.x, e.clientY - ballScreen.y);
    if (dist < 60 * camera.zoom && gamePhase === GamePhase.AIMING) {
        setIsHoveringBall(true);
    } else {
        setIsHoveringBall(false);
    }

    if (dragMode === 'NONE') return;
    if (dragMode === 'PAN') {
        const dx = e.clientX - dragCurrent!.x;
        const dy = e.clientY - dragCurrent!.y;
        setCamera(p => ({ ...p, offset: { x: p.offset.x + dx, y: p.offset.y + dy } }));
        // Pan technically shifts offset, so we must invalidate or shift the image.
        // Simple invalidation is easier.
        terrainCacheRef.current = null;
    }
    setDragCurrent({ x: e.clientX, y: e.clientY });
  };

  const handlePointerUp = (e: React.PointerEvent) => {
    if (isPaused) return;
    if (dragMode === 'AIM') {
        const phys = calculateShotPhysics();
        if (phys && phys.powerRatio > 0.1) onShoot(phys.velocity);
    }
    setDragMode('NONE');
    setDragStart(null);
    setDragCurrent(null);
    (e.target as Element).releasePointerCapture(e.pointerId);
  };

  return (
    <div 
        ref={containerRef} 
        className={`absolute inset-0 z-20 touch-none select-none ${isPaused ? 'pointer-events-none' : ''} ${isHoveringBall ? 'cursor-pointer' : 'cursor-grab'} ${dragMode === 'PAN' ? 'cursor-grabbing' : ''}`}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerLeave={handlePointerUp}
        onWheel={handleWheel}
    >
      <canvas ref={canvasRef} className="w-full h-full block" />
      <div className="absolute bottom-6 right-6 flex flex-col gap-2 pointer-events-auto z-50">
          <div className="flex gap-2">
            <button onClick={() => rotateCamera('LEFT')} className="cursor-pointer bg-white/80 text-black border border-white p-3 rounded-full shadow hover:bg-white hover:scale-105 active:scale-95 transition-all text-xl backdrop-blur font-bold" title="Rotate Left (Q)">↺</button>
            <button onClick={() => rotateCamera('RIGHT')} className="cursor-pointer bg-white/80 text-black border border-white p-3 rounded-full shadow hover:bg-white hover:scale-105 active:scale-95 transition-all text-xl backdrop-blur font-bold" title="Rotate Right (E)">↻</button>
          </div>
          <div className="flex gap-2 justify-end">
            <button onClick={() => handleZoom(-0.2)} className="cursor-pointer bg-white/80 text-black border border-white p-3 rounded-full shadow hover:bg-white hover:scale-105 active:scale-95 transition-all text-xl backdrop-blur font-bold" title="Zoom Out (-)">-</button>
            <button onClick={() => handleZoom(0.2)} className="cursor-pointer bg-white/80 text-black border border-white p-3 rounded-full shadow hover:bg-white hover:scale-105 active:scale-95 transition-all text-xl backdrop-blur font-bold" title="Zoom In (+)">+</button>
          </div>
      </div>
      <div className="absolute bottom-6 left-6 text-slate-500 text-sm pointer-events-none bg-white/50 px-3 py-1 rounded backdrop-blur">
          Scroll/Pinch to Zoom • Drag Background to Pan • Drag Ball to Shoot
      </div>
    </div>
  );
};

export default GameCanvas;