import React, { useState } from 'react';
import { Vector3, GamePhase, ClubType, TileType, AimData } from '../types';
import { magnitude } from '../services/physicsEngine';
import { PHYSICS_CONFIG, COLORS, PHYSICS_CONSTANTS } from '../constants';

interface PhysicsOverlayProps {
  ballPosition: Vector3;
  ballVelocity: Vector3;
  phase: GamePhase;
  strokes: number; // This is actually LIVES now
  par: number;
  levelScore: number;
  highScore: number;
  selectedClub: ClubType;
  setSelectedClub: (c: ClubType) => void;
  currentTileType?: TileType;
  aimData: AimData | null;
  isPaused: boolean;
  onTogglePause: () => void;
  onRestart: () => void;
  onNextLevel: () => void;
}

const PhysicsOverlay: React.FC<PhysicsOverlayProps> = ({
  ballPosition,
  phase,
  strokes,
  levelScore,
  highScore,
  selectedClub,
  setSelectedClub,
  currentTileType,
  aimData,
  isPaused,
  onTogglePause,
  onRestart,
  onNextLevel
}) => {
  const [isAimDataMinimised, setIsAimDataMinimised] = useState(false);

  // Calculate Theoretical Values for the "Chain" display
  const gravity = PHYSICS_CONFIG.gravity;
  const vTotal = aimData ? magnitude(aimData.velocity) : 0;
  const angleRad = aimData ? aimData.launchAngle * (Math.PI / 180) : 0;
  
  const vY = vTotal * Math.sin(angleRad);
  const vX = vTotal * Math.cos(angleRad);
  
  // Theoretical Vacuum Calculations (No Drag)
  const tTheoretical = gravity > 0 ? (2 * vY) / gravity : 0;
  const hTheoretical = gravity > 0 ? (vY * vY) / (2 * gravity) : 0;
  const rTheoretical = vX * tTheoretical;

  // Formatting helpers
  const val = (n: number) => <span className="text-white font-bold">{n.toFixed(1)}</span>;
  const unit = (s: string) => <span className="text-slate-500 text-[10px] ml-0.5">{s}</span>;

  return (
    <div className="absolute inset-0 pointer-events-none">
      
      {/* 0. BLOCKERS (Pause, Game Over, Level Complete) - EATS CLICKS */}
      {(isPaused || phase === GamePhase.GAME_OVER || phase === GamePhase.LEVEL_COMPLETE) && (
         <div className="absolute inset-0 bg-black/40 backdrop-blur-sm z-40 pointer-events-auto flex items-center justify-center">
             {/* PAUSE */}
             {isPaused && (
                 <div className="bg-black/80 text-white px-12 py-6 rounded-2xl text-4xl font-bold tracking-widest border border-white/20 shadow-2xl backdrop-blur-xl">
                     PAUSED
                 </div>
             )}
             
             {/* GAME OVER */}
             {phase === GamePhase.GAME_OVER && (
                 <div className="bg-slate-900 text-white p-8 rounded-2xl border-2 border-red-500 shadow-2xl flex flex-col items-center gap-4 max-w-sm">
                     <h2 className="text-4xl font-black text-red-500 tracking-tighter">GAME OVER</h2>
                     <div className="text-center space-y-2">
                         <div className="text-slate-400 text-sm">Levels Completed</div>
                         <div className="text-5xl font-mono font-bold text-white">{levelScore}</div>
                     </div>
                     <div className="bg-slate-800 rounded-lg p-3 w-full text-center">
                         <span className="text-xs text-slate-400 uppercase tracking-widest">High Score</span>
                         <div className="text-xl font-bold text-amber-400">{highScore}</div>
                     </div>
                     <button 
                         onClick={onRestart}
                         className="mt-4 bg-white text-black font-bold py-3 px-8 rounded-xl hover:bg-slate-200 active:scale-95 transition-all shadow-lg w-full cursor-pointer"
                     >
                         PLAY AGAIN
                     </button>
                 </div>
             )}

             {/* LEVEL COMPLETE */}
             {phase === GamePhase.LEVEL_COMPLETE && (
                 <div className="bg-slate-900 text-white p-8 rounded-2xl border-2 border-emerald-500 shadow-2xl flex flex-col items-center gap-4 max-w-sm animate-bounce-short">
                     <h2 className="text-3xl font-black text-emerald-400 tracking-tighter">LEVEL COMPLETE!</h2>
                     <div className="text-center">
                         <div className="text-slate-400 text-sm">Total Score</div>
                         <div className="text-4xl font-mono font-bold text-white">{levelScore}</div>
                     </div>
                     <button 
                         onClick={onNextLevel}
                         className="mt-4 bg-emerald-500 text-white font-bold py-3 px-8 rounded-xl hover:bg-emerald-400 active:scale-95 transition-all shadow-lg w-full cursor-pointer"
                     >
                         NEXT LEVEL →
                     </button>
                 </div>
             )}
         </div>
      )}

      {/* 1. Header (Top Left) */}
      <div className="absolute top-6 left-6 pointer-events-auto z-50">
        <div className="bg-white/80 backdrop-blur-md px-4 py-2 rounded-xl shadow-lg border border-white/50">
          <h1 className="text-lg font-bold text-slate-800 tracking-tight">Physics Golf Lab</h1>
        </div>
      </div>

      {/* 2. HUD: LIVES & SCORE (Top Center) */}
      <div className="absolute top-6 left-1/2 transform -translate-x-1/2 pointer-events-auto z-50">
         <div className="bg-slate-900/90 text-white backdrop-blur-md px-6 py-3 rounded-2xl shadow-2xl border border-slate-700 flex gap-6 items-center">
             <div className="flex flex-col items-center">
                 <span className="text-[10px] text-slate-400 font-bold tracking-widest uppercase">Lives</span>
                 <div className="flex gap-1 mt-1">
                     {[...Array(5)].map((_, i) => (
                         <div key={i} className={`w-3 h-3 rounded-full ${i < strokes ? 'bg-red-500 shadow-[0_0_8px_rgba(239,68,68,0.6)]' : 'bg-slate-700'}`} />
                     ))}
                 </div>
             </div>
             <div className="w-px h-8 bg-slate-700"></div>
             <div className="flex flex-col items-center min-w-[60px]">
                 <span className="text-[10px] text-slate-400 font-bold tracking-widest uppercase">Levels</span>
                 <span className="text-2xl font-mono font-bold text-emerald-400">{levelScore}</span>
             </div>
         </div>
      </div>

      {/* 3. Controls & Terrain (Top Right) */}
      <div className="absolute top-6 right-6 flex flex-col gap-3 items-end pointer-events-auto z-50">
          <div className="flex gap-2">
            <button 
                onClick={onTogglePause}
                className="cursor-pointer bg-white/90 text-black px-4 py-2 rounded-lg font-bold shadow hover:bg-white hover:scale-105 active:scale-95 transition-all text-sm backdrop-blur border border-slate-200"
            >
                {isPaused ? '▶ RESUME' : 'II PAUSE'}
            </button>
            <button 
                onClick={onRestart}
                className="cursor-pointer bg-slate-800 text-white px-4 py-2 rounded-lg font-bold shadow hover:bg-slate-700 hover:scale-105 active:scale-95 transition-all text-sm border border-slate-600"
            >
                ↻ RESTART
            </button>
          </div>

          <div className="bg-slate-900/80 backdrop-blur text-white p-3 rounded-lg border border-slate-700 w-48 shadow-xl transition-all">
              <div className="text-xs text-slate-400 uppercase tracking-widest mb-1">Terrain Physics</div>
              <div className="flex items-center gap-3">
                  <div 
                    className="w-4 h-4 rounded-full border border-white/20 shadow-inner" 
                    style={{ backgroundColor: COLORS[currentTileType || TileType.FAIRWAY] }}
                  />
                  <div className="flex flex-col">
                      <span className="font-bold text-sm">{currentTileType || 'AIR'}</span>
                  </div>
              </div>
          </div>
      </div>

      {/* Physics Data Container (Calculations) */}
      {aimData && (
         <div className={`absolute top-24 left-6 bg-slate-900 text-slate-100 rounded-xl font-mono text-xs w-80 shadow-2xl border border-slate-700 overflow-hidden pointer-events-auto z-30 transition-all duration-300 ${isAimDataMinimised ? 'max-h-[46px]' : 'max-h-[75vh]'}`}>
            <div 
                onClick={() => setIsAimDataMinimised(!isAimDataMinimised)}
                className="bg-slate-800/80 p-3 flex justify-between items-center cursor-pointer hover:bg-slate-800 border-b border-slate-700"
            >
                <div className="flex items-center gap-2">
                    <span className="font-bold text-sm tracking-wider">PHYSICS ENGINE</span>
                    <span className="text-[10px] bg-indigo-600 px-2 py-0.5 rounded text-white">{selectedClub}</span>
                </div>
                <button className="text-slate-400 hover:text-white transition-colors">
                    {isAimDataMinimised ? '▼' : '▲'}
                </button>
            </div>
            
            <div className="p-4 space-y-4 overflow-y-auto custom-scrollbar" style={{maxHeight: 'calc(75vh - 46px)'}}>
               {/* STEP 1: FORCE */}
               <div className="bg-slate-800/50 p-2 rounded border border-slate-700">
                  <div className="text-emerald-400 font-bold text-[10px] mb-1">STEP 1: FORCE (F)</div>
                  <div className="grid grid-cols-2 gap-x-2 text-[10px] text-slate-400 mb-1 border-b border-slate-700 pb-1">
                      <div>Given:</div>
                      <div className="text-right">
                          P = {val(aimData.powerRatio * 100)}{unit('%')} <br/>
                          F_max = {val(aimData.maxForce)}{unit('N')}
                      </div>
                  </div>
                  <div className="text-slate-300 mb-1">Formula: F = P × F_max</div>
                  <div className="text-right pt-1">
                      <span className="text-emerald-400 font-bold text-sm">{aimData.force.toFixed(0)} N</span>
                  </div>
               </div>

               {/* STEP 2: VELOCITY */}
               <div className="bg-slate-800/50 p-2 rounded border border-slate-700">
                  <div className="text-emerald-400 font-bold text-[10px] mb-1">STEP 2: VELOCITY (v)</div>
                  <div className="grid grid-cols-2 gap-x-2 text-[10px] text-slate-400 mb-1 border-b border-slate-700 pb-1">
                      <div>Given:</div>
                      <div className="text-right">
                          F = {val(aimData.force)}{unit('N')} <br/>
                          Δt = {val(PHYSICS_CONSTANTS.CONTACT_TIME)}{unit('s')} <br/>
                          m = {val(PHYSICS_CONSTANTS.BALL_MASS)}{unit('kg')}
                      </div>
                  </div>
                  <div className="text-slate-300 mb-1">Formula: v = (F · Δt) / m</div>
                  <div className="text-right pt-1">
                      <span className="text-emerald-400 font-bold text-sm">{vTotal.toFixed(1)} m/s</span>
                  </div>
               </div>

               {/* STEP 3: VECTORS */}
               <div className="bg-slate-800/30 p-2 rounded border border-dashed border-slate-700">
                   <div className="text-slate-500 font-bold text-[10px] mb-1">STEP 3: DECOMPOSE VECTORS</div>
                   <div className="text-[10px] text-slate-400 flex justify-between">
                       <span>Given v = {val(vTotal)} @ {val(aimData.launchAngle)}°</span>
                   </div>
                   <div className="flex justify-between mt-1 text-[10px]">
                       <span>v_y = v·sinθ = {val(vY)}</span>
                       <span>v_x = v·cosθ = {val(vX)}</span>
                   </div>
               </div>

               {/* STEP 4: TIME */}
               <div className="bg-slate-800/50 p-2 rounded border border-slate-700">
                   <div className="text-emerald-400 font-bold text-[10px] mb-1">STEP 4: FLIGHT TIME (T)</div>
                   <div className="grid grid-cols-2 gap-x-2 text-[10px] text-slate-400 mb-1 border-b border-slate-700 pb-1">
                       <div>Given:</div>
                       <div className="text-right">
                           v_y = {val(vY)}{unit('m/s')} <br/>
                           g = {val(gravity)}{unit('m/s²')}
                       </div>
                   </div>
                   <div className="text-slate-300 mb-1">Formula: T = 2 · v_y / g</div>
                   <div className="flex justify-between items-end pt-1">
                       <span className="text-[10px] text-slate-500">Theoretical: {tTheoretical.toFixed(2)}s</span>
                       <span className="text-white font-bold text-sm">{aimData.predictedTotalTime.toFixed(2)} s <span className="text-[9px] text-pink-400">(Sim)</span></span>
                   </div>
               </div>

               {/* STEP 5: HEIGHT */}
               <div className="bg-slate-800/50 p-2 rounded border border-slate-700">
                   <div className="text-emerald-400 font-bold text-[10px] mb-1">STEP 5: MAX HEIGHT (H)</div>
                   <div className="grid grid-cols-2 gap-x-2 text-[10px] text-slate-400 mb-1 border-b border-slate-700 pb-1">
                       <div>Given:</div>
                       <div className="text-right">
                           v_y = {val(vY)}{unit('m/s')} <br/>
                           g = {val(gravity)}{unit('m/s²')}
                       </div>
                   </div>
                   <div className="text-slate-300 mb-1">Formula: H = v_y² / 2g</div>
                   <div className="flex justify-between items-end pt-1">
                       <span className="text-[10px] text-slate-500">Theoretical: {hTheoretical.toFixed(2)}m</span>
                       <span className="text-white font-bold text-sm">{aimData.maxHeight.toFixed(2)} m <span className="text-[9px] text-pink-400">(Sim)</span></span>
                   </div>
               </div>

               {/* STEP 6: RANGE */}
               <div className="bg-indigo-900/30 p-2 rounded border border-indigo-500/30">
                   <div className="text-pink-400 font-bold text-[10px] mb-1">STEP 6: RANGE (R)</div>
                   <div className="grid grid-cols-2 gap-x-2 text-[10px] text-slate-400 mb-1 border-b border-slate-700 pb-1">
                       <div>Given:</div>
                       <div className="text-right">
                           v_x = {val(vX)}{unit('m/s')} <br/>
                           T = {val(tTheoretical)}{unit('s')}
                       </div>
                   </div>
                   <div className="text-slate-300 mb-1">Formula: R = v_x · T</div>
                   <div className="flex justify-between items-end pt-1">
                       <span className="text-[10px] text-slate-500">Theoretical: {rTheoretical.toFixed(2)}m</span>
                       <span className="text-pink-400 font-bold text-sm">{aimData.range.toFixed(2)} m <span className="text-[9px] text-pink-400">(Sim)</span></span>
                   </div>
               </div>
            </div>
         </div>
      )}

      {/* Center Feedback (Out of Bounds) */}
      <div className="absolute top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2 pointer-events-none z-50">
        {!isPaused && phase === GamePhase.OUT_OF_BOUNDS && (
             <div className="bg-red-500 text-white px-8 py-4 rounded-2xl shadow-2xl text-2xl font-bold animate-pulse">
             OUT OF BOUNDS
         </div>
        )}
      </div>

      {/* Bottom Controls - STRICTLY POSITIONED AT BOTTOM */}
      <div className="absolute bottom-8 left-1/2 transform -translate-x-1/2 pointer-events-auto flex flex-col items-center gap-4 w-full z-30">
         {phase === GamePhase.AIMING && !isPaused && (
            <div className="flex bg-white/90 backdrop-blur rounded-xl p-1 shadow-lg border border-slate-200">
                {[ClubType.DRIVER, ClubType.IRON, ClubType.WEDGE, ClubType.PUTTER].map((club) => (
                    <button
                        key={club}
                        onClick={() => setSelectedClub(club)}
                        className={`px-6 py-2 rounded-lg text-xs md:text-sm font-bold transition-all cursor-pointer ${
                            selectedClub === club 
                            ? 'bg-slate-800 text-white shadow-md scale-105' 
                            : 'text-slate-600 hover:bg-slate-100 hover:scale-105'
                        }`}
                    >
                        {club}
                    </button>
                ))}
            </div>
         )}
         
         {phase === GamePhase.AIMING && !isPaused && (
             <div className="bg-white/50 backdrop-blur px-4 py-1 rounded-full shadow text-slate-600 text-xs font-medium animate-pulse">
                 Selected: <span className="font-bold text-slate-900">{selectedClub}</span> • Drag ball to aim
             </div>
         )}
      </div>
    </div>
  );
};

export default PhysicsOverlay;