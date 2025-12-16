
export interface Vector3 {
  x: number;
  y: number; // Vertical axis (Up/Down)
  z: number;
}

export enum TileType {
  FAIRWAY = 'FAIRWAY',
  ROUGH = 'ROUGH',
  SAND = 'SAND',
  WATER = 'WATER',
  GREEN = 'GREEN',
  GRAVEL = 'GRAVEL',
  TREE = 'TREE',
  OBSTACLE = 'OBSTACLE',
  EMPTY = 'EMPTY',
}

export interface Tile {
  x: number;
  z: number;
  height: number;
  type: TileType;
}

export interface BallState {
  position: Vector3;
  velocity: Vector3;
  isMoving: boolean;
  inHole: boolean;
  lastStablePosition: Vector3;
}

export interface Level {
  tiles: Tile[];
  startPosition: Vector3;
  holePosition: Vector3;
  par: number;
  // Wind removed
}

export interface PhysicsConfig {
  gravity: number;
  dragAir: number;
  frictionGround: number;
  frictionSand: number;
  frictionGreen: number;
  frictionGravel: number;
  frictionRough: number;
  restitution: number; // Bounciness
  maxVelocity: number;
  minVelocityToStop: number;
}

export enum GamePhase {
  AIMING = 'AIMING',
  EXECUTING = 'EXECUTING',
  IDLE = 'IDLE',
  HOLED = 'HOLED',
  LEVEL_COMPLETE = 'LEVEL_COMPLETE',
  OUT_OF_BOUNDS = 'OUT_OF_BOUNDS',
  GAME_OVER = 'GAME_OVER',
}

export interface CameraState {
  offset: { x: number; y: number };
  zoom: number;
  rotation: number; // Radians
}

export enum ClubType {
  DRIVER = 'DRIVER',
  IRON = 'IRON',
  WEDGE = 'WEDGE',
  PUTTER = 'PUTTER',
}

export interface TrajectoryData {
  points: Vector3[];
  maxHeight: number;
  range: number;
  launchAngle: number; // Degrees
  duration: number; // Seconds
}

export interface AimData {
  force: number; // Newtons
  maxForce: number; // Newtons (Club Max)
  velocity: Vector3;
  launchAngle: number; // Degrees
  powerRatio: number; // 0-1
  mass: number; // kg
  contactTime: number; // s
  predictedTotalTime: number; // s
  maxHeight: number; // m
  range: number; // m
}
