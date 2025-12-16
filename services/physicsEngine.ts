
import { Vector3, PhysicsConfig, Tile, TileType, TrajectoryData } from '../types';

export const addVectors = (v1: Vector3, v2: Vector3): Vector3 => ({
  x: v1.x + v2.x,
  y: v1.y + v2.y,
  z: v1.z + v2.z,
});

export const scaleVector = (v: Vector3, s: number): Vector3 => ({
  x: v.x * s,
  y: v.y * s,
  z: v.z * s,
});

export const magnitude = (v: Vector3): number => Math.sqrt(v.x * v.x + v.y * v.y + v.z * v.z);

export const normalize = (v: Vector3): Vector3 => {
  const m = magnitude(v);
  return m === 0 ? { x: 0, y: 0, z: 0 } : scaleVector(v, 1 / m);
};

export const getFrictionForTile = (tileType: TileType | undefined, config: PhysicsConfig): number => {
  switch (tileType) {
    case TileType.SAND: return config.frictionSand;
    case TileType.GREEN: return config.frictionGreen;
    case TileType.ROUGH: return config.frictionRough;
    case TileType.GRAVEL: return config.frictionGravel;
    case TileType.FAIRWAY: return config.frictionGround;
    case TileType.WATER: return 0.5; 
    default: return config.frictionGround;
  }
};

export const calculateNextState = (
  pos: Vector3,
  vel: Vector3,
  dt: number,
  config: PhysicsConfig,
  tileMap: Map<string, Tile>,
): { pos: Vector3; vel: Vector3; collision?: string } => {
  
  // 1. Apply Gravity and Drag
  const forces: Vector3 = { x: 0, y: -config.gravity, z: 0 };

  forces.x -= vel.x * config.dragAir;
  forces.y -= vel.y * config.dragAir;
  forces.z -= vel.z * config.dragAir;

  // Integration
  let newVel = addVectors(vel, scaleVector(forces, dt));
  let newPos = addVectors(pos, scaleVector(newVel, dt));

  // 2. Object Collision (Trees/Obstacles)
  const checkRadius = 2;
  const cx = Math.round(newPos.x);
  const cz = Math.round(newPos.z);

  for (let i = -checkRadius; i <= checkRadius; i++) {
    for (let j = -checkRadius; j <= checkRadius; j++) {
       const key = `${cx + i},${cz + j}`;
       const obs = tileMap.get(key);
       
       if (obs && (obs.type === TileType.TREE || obs.type === TileType.OBSTACLE)) {
          const colliderRadius = obs.type === TileType.TREE ? 0.35 : 0.45; 
          const ballRadius = 0.15;
          const minDist = colliderRadius + ballRadius;

          // Only collide if ball is low enough (trunk collision)
          if (newPos.y > obs.height + 3) continue; 
          
          const dx = newPos.x - obs.x;
          const dz = newPos.z - obs.z;
          const distSq = dx*dx + dz*dz;

          if (distSq < minDist * minDist) {
              const dist = Math.sqrt(distSq);
              
              const nx = dist > 0 ? dx / dist : 1; 
              const nz = dist > 0 ? dz / dist : 0;
              
              const pushOutDist = (minDist - dist) + 0.01; 
              newPos.x += nx * pushOutDist;
              newPos.z += nz * pushOutDist;

              const dot = newVel.x * nx + newVel.z * nz;
              
              if (dot < 0) { 
                  const restitution = 0.7; 
                  newVel.x = (newVel.x - 2 * dot * nx) * restitution;
                  newVel.z = (newVel.z - 2 * dot * nz) * restitution;
                  newVel.x *= 0.9;
                  newVel.z *= 0.9;
              }
          }
       }
    }
  }

  // 3. Ground/Terrain Interaction
  const finalTile = tileMap.get(`${Math.round(newPos.x)},${Math.round(newPos.z)}`);

  const floorHeight = finalTile ? finalTile.height : -10;

  if (newPos.y <= floorHeight) {
      newPos.y = floorHeight;

      if (finalTile?.type === TileType.WATER) {
          return { pos: newPos, vel: { x:0, y:0, z:0 }, collision: 'WATER' };
      }

      // Vertical Bounce
      if (Math.abs(newVel.y) > 0.5) {
          newVel.y = -newVel.y * config.restitution;
      } else {
          newVel.y = 0;
      }

      // Ground Friction
      if (newVel.y === 0) {
          const mu = getFrictionForTile(finalTile?.type, config);
          const frictionMag = mu * config.gravity * dt;
          
          const hVel = { x: newVel.x, y: 0, z: newVel.z };
          const speed = magnitude(hVel);

          if (speed > 0) {
              if (speed <= frictionMag) {
                  newVel.x = 0;
                  newVel.z = 0;
              } else {
                  const factor = (speed - frictionMag) / speed;
                  newVel.x *= factor;
                  newVel.z *= factor;
              }
          }
      } else {
          // Air friction near ground (bouncing)
          // FIXED: Replaced aggressive 0.98 multiplier with time-dependent drag
          // This prevents high-velocity shots from being destroyed by frame-rate dependent damping
          const nearGroundDrag = 1.0 * dt; 
          newVel.x *= (1 - nearGroundDrag);
          newVel.z *= (1 - nearGroundDrag);
      }
  }

  return { pos: newPos, vel: newVel };
};

export const predictTrajectory = (
  startPos: Vector3,
  startVel: Vector3,
  config: PhysicsConfig,
  levelTiles: Tile[], 
  steps: number = 100, 
  dt: number = 0.05
): Vector3[] => {
  // Optimization: Build map once here for prediction.
  const tileMap = new Map<string, Tile>();
  levelTiles.forEach(t => tileMap.set(`${t.x},${t.z}`, t));

  const path: Vector3[] = [];
  let currentPos = startPos;
  let currentVel = startVel;

  path.push(currentPos);

  for (let i = 0; i < steps; i++) {
    const { pos, vel } = calculateNextState(currentPos, currentVel, dt, config, tileMap);
    
    // Stop prediction check
    const currentTile = tileMap.get(`${Math.round(currentPos.x)},${Math.round(currentPos.z)}`);
    const floor = currentTile?.height || 0;
    
    if (pos.y <= floor + 0.05 && currentVel.y < 0) {
        path.push({ ...pos, y: floor });
        break; 
    }
    
    currentPos = pos;
    currentVel = vel;
    path.push(currentPos);

    if (currentPos.y <= floor && Math.abs(currentVel.y) < 0.1 && i > 0) {
      break;
    }
  }

  return path;
};

// Wrapper for metrics + points
export const calculateTrajectoryData = (
    startPos: Vector3,
    startVel: Vector3,
    config: PhysicsConfig,
    levelTiles: Tile[],
    maxSteps: number
): TrajectoryData => {
    const dt = 0.05;
    const points = predictTrajectory(startPos, startVel, config, levelTiles, maxSteps, dt);
    
    // Metrics
    const hSpeed = Math.sqrt(startVel.x**2 + startVel.z**2);
    const angleRad = Math.atan2(startVel.y, hSpeed);
    const launchAngle = angleRad * (180 / Math.PI);

    let maxHeight = startPos.y;
    points.forEach(p => { if (p.y > maxHeight) maxHeight = p.y; });

    const last = points[points.length - 1];
    const range = Math.sqrt((last.x - startPos.x)**2 + (last.z - startPos.z)**2);

    const duration = Math.max(0, points.length - 1) * dt;

    return {
        points,
        maxHeight,
        range,
        launchAngle,
        duration
    };
};
