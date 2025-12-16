
import { Level, TileType, Tile, Vector3 } from '../types';

type MapType = 'ARCHIPELAGO' | 'CONTINENT';
type Biome = 'MEADOW' | 'DESERT' | 'ALPINE';

export const generateLevel = (levelIndex: number): Level => {
  const size = 32; // Good size for variety
  const tiles: Tile[] = [];
  
  // 1. Determine Map Mode & Biome
  const mapType: MapType = Math.random() > 0.5 ? 'ARCHIPELAGO' : 'CONTINENT';
  const biome: Biome = Math.random() > 0.6 ? (Math.random() > 0.5 ? 'DESERT' : 'ALPINE') : 'MEADOW';

  // Biome Settings
  let baseGround = TileType.ROUGH;
  let featureGround = TileType.GRAVEL;
  let treeChance = 0.1;
  let obstacleChance = 0.02;

  if (biome === 'DESERT') {
    baseGround = TileType.SAND;
    featureGround = TileType.GRAVEL;
    treeChance = 0.03; // Cacti
    obstacleChance = 0.05; // Rocks
  } else if (biome === 'ALPINE') {
    baseGround = TileType.GRAVEL;
    featureGround = TileType.ROUGH;
    treeChance = 0.35; // Dense forest
  }

  // Init Grid
  const grid: TileType[][] = Array(size).fill(null).map(() => Array(size).fill(TileType.WATER));
  const heightMap: number[][] = Array(size).fill(null).map(() => Array(size).fill(-0.5));

  // Noise Helper
  const seed = Math.random() * 10000;
  const noise = (x: number, z: number, scale: number) => 
      Math.sin(x * scale + seed) * Math.cos(z * scale + seed);

  // 2. Place Start and Hole (Enforce Distance)
  const margin = 4;
  let startX = margin, startZ = margin;
  let endX = size - margin, endZ = size - margin;
  
  // Retry loop to ensure they are far apart
  for(let i=0; i<20; i++) {
      const sX = Math.floor(Math.random() * (size - 2*margin)) + margin;
      const sZ = Math.floor(Math.random() * (size - 2*margin)) + margin;
      
      const eX = Math.floor(Math.random() * (size - 2*margin)) + margin;
      const eZ = Math.floor(Math.random() * (size - 2*margin)) + margin;

      const dist = Math.sqrt((sX - eX)**2 + (sZ - eZ)**2);
      if (dist > size * 0.6) { // Must be at least 60% of map width apart
          startX = sX; startZ = sZ;
          endX = eX; endZ = eZ;
          break;
      }
  }

  // 3. Terrain Generation Logic
  if (mapType === 'ARCHIPELAGO') {
      // --- ISLAND HOPPING ---
      // 1. Create islands at Start, End, and 2-3 Waypoints
      const waypoints = [
          { x: startX, z: startZ },
          { x: endX, z: endZ }
      ];

      // Add intermediate islands
      const steps = 3;
      for(let i=1; i<steps; i++) {
          const t = i / steps;
          // Linear interp with random wiggle
          const wx = startX + (endX - startX) * t + (Math.random() - 0.5) * 10;
          const wz = startZ + (endZ - startZ) * t + (Math.random() - 0.5) * 10;
          waypoints.push({ x: Math.floor(wx), z: Math.floor(wz) });
      }

      // Render Islands
      waypoints.forEach(pt => {
          // Island Radius
          const radius = 3 + Math.random() * 2;
          for(let x=0; x<size; x++) {
              for(let z=0; z<size; z++) {
                  const dist = Math.sqrt((x - pt.x)**2 + (z - pt.z)**2);
                  const n = noise(x, z, 0.4) * 1.5; // Irregular shape
                  if (dist + n < radius) {
                      if (x > 0 && x < size-1 && z > 0 && z < size-1) {
                        grid[x][z] = baseGround;
                        heightMap[x][z] = 0;
                      }
                  }
              }
          }
      });

      // Connect with Fairways (Bridges)
      // We essentially just run the walker between waypoints
      waypoints.sort((a,b) => {
          // Sort waypoints by distance from start to ensure path order
          const da = (a.x - startX)**2 + (a.z - startZ)**2;
          const db = (b.x - startX)**2 + (b.z - startZ)**2;
          return da - db;
      });

      for(let i=0; i<waypoints.length-1; i++) {
          connectPoints(grid, heightMap, waypoints[i], waypoints[i+1], TileType.FAIRWAY, 0);
      }

  } else {
      // --- CONTINENT / SOLID LAND ---
      // Fill mostly with land, carve out lakes
      for(let x=0; x<size; x++) {
          for(let z=0; z<size; z++) {
              const n = noise(x, z, 0.15);
              // 75% land
              if (n > -0.6) {
                   if (x > 1 && x < size-2 && z > 1 && z < size-2) {
                       grid[x][z] = baseGround;
                       heightMap[x][z] = 0;
                       
                       // Patches of feature ground
                       if (noise(x, z, 0.5) > 0.5) {
                           grid[x][z] = featureGround;
                       }
                   }
              }
          }
      }
      
      // Ensure Path Exists
      connectPoints(grid, heightMap, {x: startX, z: startZ}, {x: endX, z: endZ}, TileType.FAIRWAY, 1);
  }

  // 4. Place Trees & Obstacles (Enhanced)
  for (let x = 0; x < size; x++) {
      for (let z = 0; z < size; z++) {
          const type = grid[x][z];
          if (type === baseGround || type === featureGround) {
              if (Math.random() < treeChance) {
                  grid[x][z] = TileType.TREE;
                  heightMap[x][z] = 1; 
              } else if (Math.random() < obstacleChance) {
                  // Place rocks
                  grid[x][z] = TileType.OBSTACLE;
                  heightMap[x][z] = 0.5;
                  
                  // Chance to place a cluster of rocks
                  if (Math.random() > 0.6) {
                      // Try neighbors
                      const neighbors = [[1,0], [-1,0], [0,1], [0,-1]];
                      for(let n of neighbors) {
                          const nx = x+n[0], nz = z+n[1];
                          if(nx>0 && nx<size && nz>0 && nz<size && grid[nx][nz] !== TileType.WATER && grid[nx][nz] !== TileType.FAIRWAY) {
                              grid[nx][nz] = TileType.OBSTACLE;
                              heightMap[nx][nz] = 0.4;
                          }
                      }
                  }
              }
          }
      }
  }

  // 5. Finalize Start/End
  // Clear radius around start/end
  const clearRadius = (cx: number, cz: number, r: number) => {
      for(let i=-r; i<=r; i++) {
          for(let j=-r; j<=r; j++) {
             const tx = cx + i; const tz = cz + j;
             if (tx >=0 && tx < size && tz >= 0 && tz < size) {
                 if (grid[tx][tz] === TileType.TREE || grid[tx][tz] === TileType.OBSTACLE || grid[tx][tz] === TileType.WATER) {
                     grid[tx][tz] = baseGround;
                     heightMap[tx][tz] = 0;
                 }
             }
          }
      }
  };
  clearRadius(startX, startZ, 2);
  clearRadius(endX, endZ, 2);

  grid[startX][startZ] = TileType.GREEN;
  grid[endX][endZ] = TileType.GREEN;

  // Flatten to Tile Array
  for (let x = 0; x < size; x++) {
      for (let z = 0; z < size; z++) {
          tiles.push({
              x,
              z,
              height: heightMap[x][z],
              type: grid[x][z]
          });
      }
  }

  return {
    tiles,
    startPosition: { x: startX, y: 0.15, z: startZ }, // Lowered from 0.5 to prevent initial bounce
    holePosition: { x: endX, y: 0, z: endZ },
    par: 4, 
  };
};

// Helper: The "Walker" to connect points
function connectPoints(
    grid: TileType[][], 
    heightMap: number[][], 
    p1: {x:number, z:number}, 
    p2: {x:number, z:number}, 
    type: TileType,
    width: number
) {
    let currX = p1.x;
    let currZ = p1.z;
    const endX = p2.x;
    const endZ = p2.z;
    
    let steps = 0;
    const size = grid.length;
    
    while ((Math.abs(currX - endX) > 0 || Math.abs(currZ - endZ) > 0) && steps < 100) {
        steps++;
        const dx = endX - currX;
        const dz = endZ - currZ;
        
        if (Math.abs(dx) > Math.abs(dz)) currX += Math.sign(dx);
        else currZ += Math.sign(dz);
        
        // Random wiggle
        if (Math.random() > 0.7) {
             if (Math.random() > 0.5) currX += (Math.random() > 0.5 ? 1 : -1);
             else currZ += (Math.random() > 0.5 ? 1 : -1);
        }
        
        // Clamp
        currX = Math.max(1, Math.min(size-2, currX));
        currZ = Math.max(1, Math.min(size-2, currZ));

        // Paint
        for(let i=-width; i<=width; i++) {
            for(let j=-width; j<=width; j++) {
                const tx = currX + i;
                const tz = currZ + j;
                if (tx >=0 && tx < size && tz >=0 && tz < size) {
                    if (grid[tx][tz] === TileType.WATER || grid[tx][tz] !== TileType.GREEN) {
                        grid[tx][tz] = type;
                        heightMap[tx][tz] = 0;
                    }
                }
            }
        }
    }
}
