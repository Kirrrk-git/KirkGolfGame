import React, { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import GameCanvas from './components/GameCanvas';
import PhysicsOverlay from './components/PhysicsOverlay';
import { generateLevel } from './services/levelGenerator';
import { calculateNextState, magnitude, calculateTrajectoryData } from './services/physicsEngine';
import { GamePhase, Level, BallState, Vector3, ClubType, TrajectoryData, AimData, Tile } from './types';
import { PHYSICS_CONFIG } from './constants';
import { playSwingSound, playHoleSound } from './services/audioService';

const STARTING_LIVES = 5;

const App: React.FC = () => {
  // Game State
  const [level, setLevel] = useState<Level>(generateLevel(1));
  const [ballState, setBallState] = useState<BallState>({
    position: level.startPosition,
    velocity: { x: 0, y: 0, z: 0 },
    isMoving: false,
    inHole: false,
    lastStablePosition: level.startPosition,
  });
  const [gamePhase, setGamePhase] = useState<GamePhase>(GamePhase.AIMING);
  
  // Scoring
  const [lives, setLives] = useState(STARTING_LIVES);
  const [levelScore, setLevelScore] = useState(0); // Total levels completed
  const [highScore, setHighScore] = useState(0);

  const [selectedClub, setSelectedClub] = useState<ClubType>(ClubType.DRIVER);
  const [isPaused, setIsPaused] = useState(false);
  
  // Real-time aiming data for UI (Persisted)
  const [aimData, setAimData] = useState<AimData | null>(null);
  
  // Physics Memory for Visualization
  const [lastTrajectory, setLastTrajectory] = useState<TrajectoryData | undefined>(undefined);

  // Animation Loop Ref
  const requestRef = useRef<number>();
  const lastTimeRef = useRef<number>();

  // Optimization: Pre-calculate map for physics lookups (O(1))
  const tileMap = useMemo(() => {
    const map = new Map<string, Tile>();
    level.tiles.forEach(t => map.set(`${t.x},${t.z}`, t));
    return map;
  }, [level]);

  // Init High Score
  useEffect(() => {
      const savedScore = localStorage.getItem('golf-high-score');
      if (savedScore) setHighScore(parseInt(savedScore, 10));
  }, []);

  // Update High Score logic
  useEffect(() => {
    if (levelScore > highScore) {
      setHighScore(levelScore);
      localStorage.setItem('golf-high-score', levelScore.toString());
    }
  }, [levelScore, highScore]);

  const resetBall = useCallback(() => {
     setBallState(prev => ({
         ...prev,
         position: prev.lastStablePosition,
         velocity: {x:0, y:0, z:0},
         isMoving: false
     }));
     setGamePhase(GamePhase.AIMING);
  }, []);

  const handleRestart = useCallback(() => {
    // Full Restart of the Run
    const newLevel = generateLevel(Math.floor(Math.random() * 1000));
    setLevel(newLevel);
    setBallState({
        position: newLevel.startPosition,
        velocity: { x: 0, y: 0, z: 0 },
        isMoving: false,
        inHole: false,
        lastStablePosition: newLevel.startPosition,
    });
    setLives(STARTING_LIVES);
    setLevelScore(0);
    setGamePhase(GamePhase.AIMING);
    setLastTrajectory(undefined);
    setIsPaused(false);
  }, []);

  const handleNextLevel = useCallback(() => {
    const newLevel = generateLevel(Math.floor(Math.random() * 1000));
    setLevel(newLevel);
    setBallState({
        position: newLevel.startPosition,
        velocity: { x: 0, y: 0, z: 0 },
        isMoving: false,
        inHole: false,
        lastStablePosition: newLevel.startPosition,
    });
    setLives(STARTING_LIVES); // Reset lives for new level
    setGamePhase(GamePhase.AIMING);
    setLastTrajectory(undefined);
    setIsPaused(false);
  }, []);

  const handleShoot = useCallback((velocity: Vector3) => {
    if (gamePhase !== GamePhase.AIMING) return;
    
    // Decrement Life immediately
    setLives(l => l - 1);
    
    playSwingSound();

    // Calculate and store the trajectory for the "ghost" memory before moving
    const trajData = calculateTrajectoryData(
        ballState.position, 
        velocity, 
        PHYSICS_CONFIG, 
        level.tiles, 
        200 // Max steps for full arc calculation
    );
    setLastTrajectory(trajData);
    
    setBallState(prev => ({
      ...prev,
      velocity: velocity,
      isMoving: true,
      lastStablePosition: prev.position // Checkpoint before shot
    }));
    
    setGamePhase(GamePhase.EXECUTING);
  }, [gamePhase, ballState.position, level.tiles]);

  // Wrapper for onAim to only update if we have data, or keep old data if null (released but not shot)
  const handleAim = (data: AimData | null) => {
      if (data) setAimData(data);
  };

  const updatePhysics = useCallback((time: number) => {
    if (lastTimeRef.current !== undefined) {
      const dt = Math.min((time - lastTimeRef.current) / 1000, 0.1); 
      
      // PAUSE CHECK
      if (!isPaused && ballState.isMoving) {
          
        setBallState(prev => {
            // SUB-STEPPING for better collision accuracy
            const SUB_STEPS = 8;
            const subDt = dt / SUB_STEPS;
            
            let currentState = { ...prev };
            
            for(let i = 0; i < SUB_STEPS; i++) {
                if (!currentState.isMoving) break;

                // Void Killer
                if (currentState.position.y < -10) {
                    currentState.isMoving = false;
                    currentState.velocity = {x:0, y:0, z:0};
                    break;
                }

                // Check collisions using O(1) map
                const { pos, vel, collision } = calculateNextState(
                    currentState.position, 
                    currentState.velocity, 
                    subDt, 
                    PHYSICS_CONFIG, 
                    tileMap
                );

                if (collision === 'WATER') {
                    currentState.position = pos;
                    currentState.velocity = vel;
                    currentState.isMoving = false;
                    break;
                }

                const currentTile = tileMap.get(`${Math.round(pos.x)},${Math.round(pos.z)}`);
                const speed = magnitude(vel);
                const isBasicallyStopped = speed < PHYSICS_CONFIG.minVelocityToStop && Math.abs(pos.y - (currentTile?.height || 0)) < 0.1;
                
                const distToHole = magnitude({
                    x: pos.x - level.holePosition.x,
                    y: 0, 
                    z: pos.z - level.holePosition.z
                });
                
                let inHole = currentState.inHole;
                if (distToHole < 0.3 && speed < 5) { 
                    inHole = true;
                }

                currentState.position = inHole ? level.holePosition : pos;
                currentState.velocity = inHole || isBasicallyStopped ? { x: 0, y: 0, z: 0 } : vel;
                currentState.isMoving = !isBasicallyStopped && !inHole;
                currentState.inHole = inHole;
                
                if (inHole) break; // Stop integrating if in hole
            }
            
            return currentState;
        });
      }
    }
    lastTimeRef.current = time;
    requestRef.current = requestAnimationFrame(updatePhysics);
  }, [tileMap, isPaused, ballState.isMoving, level.holePosition]); 

  useEffect(() => {
    requestRef.current = requestAnimationFrame(updatePhysics);
    return () => {
        if (requestRef.current) cancelAnimationFrame(requestRef.current);
    };
  }, [updatePhysics]);

  // Phase Transition Logic
  useEffect(() => {
    if (gamePhase === GamePhase.EXECUTING) {
        if (ballState.inHole) {
            playHoleSound();
            setLevelScore(s => s + 1);
            setGamePhase(GamePhase.LEVEL_COMPLETE);
        } else if (!ballState.isMoving) {
            // Check if ball ended up in water or bad place or void
            const currentTile = tileMap.get(`${Math.round(ballState.position.x)},${Math.round(ballState.position.z)}`);
            
            // If ball is really deep (void killer triggered) or on water
            if (!currentTile || currentTile.type === 'WATER' || ballState.position.y < -5) {
                setGamePhase(GamePhase.OUT_OF_BOUNDS);
                setTimeout(resetBall, 1000); 
            } else {
                // Ball stopped, not in hole. Check Lives.
                if (lives <= 0) {
                    setGamePhase(GamePhase.GAME_OVER);
                } else {
                    setGamePhase(GamePhase.AIMING);
                }
            }
        }
    }
  }, [ballState.isMoving, ballState.inHole, ballState.position, gamePhase, tileMap, resetBall, lives]);

  // Helper to find current tile type for UI
  const getCurrentTileType = () => {
      const t = tileMap.get(`${Math.round(ballState.position.x)},${Math.round(ballState.position.z)}`);
      return t?.type;
  };

  return (
    <div className="relative w-full h-screen bg-sky-200 overflow-hidden">
      <GameCanvas
        tiles={level.tiles}
        ballPosition={ballState.position}
        holePosition={level.holePosition}
        onShoot={handleShoot}
        onAim={handleAim}
        gamePhase={gamePhase}
        selectedClub={selectedClub}
        lastTrajectory={lastTrajectory}
        isPaused={isPaused}
      />
      <PhysicsOverlay
        ballPosition={ballState.position}
        ballVelocity={ballState.velocity}
        phase={gamePhase}
        strokes={lives} // Passing lives here
        par={level.par}
        levelScore={levelScore}
        highScore={highScore}
        selectedClub={selectedClub}
        setSelectedClub={setSelectedClub}
        currentTileType={getCurrentTileType()}
        aimData={aimData}
        isPaused={isPaused}
        onTogglePause={() => setIsPaused(p => !p)}
        onRestart={handleRestart}
        onNextLevel={handleNextLevel}
      />
    </div>
  );
};

export default App;