
import { PhysicsConfig, TileType } from './types';

export const PHYSICS_CONFIG: PhysicsConfig = {
  gravity: 35.0, // Strong gravity for realistic arc
  dragAir: 0.8, // High air resistance to prevent "floating"
  frictionGround: 0.4, // Significantly reduced from 3.0 for better roll
  frictionSand: 8.0, // Sand stops ball very fast
  frictionGreen: 0.15, // Significantly reduced from 0.8 to allows proper putting
  frictionGravel: 5.0,
  frictionRough: 0.8, // Reduced from 5.0
  restitution: 0.4, // Less bouncy
  maxVelocity: 80, 
  minVelocityToStop: 0.2, // Lowered
};

export const PHYSICS_CONSTANTS = {
  BALL_MASS: 0.0459, // Standard Golf Ball Mass (kg)
  CONTACT_TIME: 0.0005, // Duration of impact (s)
};

export const TILE_SIZE = 40;
export const MAX_DRAG_DISTANCE = 150; 

export const COLORS = {
  [TileType.FAIRWAY]: '#4ade80', // green-400
  [TileType.ROUGH]: '#15803d', // green-700
  [TileType.SAND]: '#fde047', // yellow-300
  [TileType.WATER]: '#3b82f6', // blue-500
  [TileType.GREEN]: '#86efac', // green-300
  [TileType.GRAVEL]: '#a8a29e', // stone-400
  [TileType.OBSTACLE]: '#78716c', // stone-500
  [TileType.TREE]: '#14532d', // green-900 
  [TileType.EMPTY]: 'transparent',
};

export const SIDE_COLORS = {
  SOIL: '#574435', // Dark brown
  SAND: '#eab308', // Darker yellow
  WATER: '#1d4ed8', // Darker blue
  STONE: '#57534e', // Darker stone
};

export const ISO_ANGLE = Math.PI / 6; // 30 degrees
