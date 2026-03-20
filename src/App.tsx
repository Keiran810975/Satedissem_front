/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useCallback, useRef } from 'react';
import { SatelliteScene } from './components/SatelliteScene';
import { generateMockNodes, generateMockTopology } from './utils/mockData';
import { parseTopologyJson } from './utils/topologyParser';
import { NodeData, LinkData, Transmission } from './types';
import { Play, Pause, RotateCcw, LocateFixed, Activity, Database, Radio, Info, Upload } from 'lucide-react';
import { motion } from 'motion/react';

const TOTAL_SHARDS = 10;
const SATELLITE_COUNT = 12;
const TRANSMISSION_DURATION = 2000; // ms

export default function App() {
  const [nodes, setNodes] = useState<NodeData[]>([]);
  const [links, setLinks] = useState<LinkData[]>([]);
  const [transmissions, setTransmissions] = useState<Transmission[]>([]);
  const [currentTime, setCurrentTime] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const [speed, setSpeed] = useState(1000); // simulation time units per real second
  const [cameraResetSignal, setCameraResetSignal] = useState(0);
  
  const fileInputRef = useRef<HTMLInputElement>(null);
  const lastUpdateRef = useRef<number>(0);

  // Initialize
  useEffect(() => {
    setNodes(generateMockNodes(SATELLITE_COUNT));
    setLinks(generateMockTopology(SATELLITE_COUNT));
  }, []);

  const handleFileUpload = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const json = JSON.parse(e.target?.result as string);
        const parsedLinks = parseTopologyJson(json);
        setLinks(parsedLinks);
        
        // Update nodes if topology has more nodes than current
        const maxNodeId = Math.max(...parsedLinks.flatMap(l => [l.from, l.to]), SATELLITE_COUNT);
        if (maxNodeId >= nodes.length) {
          setNodes(generateMockNodes(maxNodeId));
        }
        
        handleReset();
      } catch (err) {
        console.error("Failed to parse topology JSON", err);
        alert("Invalid topology JSON format");
      }
    };
    reader.readAsText(file);
  };

  // Simulation Logic
  const updateSimulation = useCallback((deltaTime: number) => {
    setCurrentTime(prev => prev + deltaTime * speed);

    setTransmissions(prev => {
      // Filter out completed transmissions and update nodes
      const active = prev.filter(tx => {
        const elapsed = (currentTime + deltaTime * speed) - tx.startTime;
        if (elapsed >= tx.duration) {
          // Transmission completed, update target node
          setNodes(currentNodes => currentNodes.map(node => {
            if (node.id === tx.toId) {
              const newShards = new Set(node.shards);
              newShards.add(tx.shardId);
              return { ...node, shards: newShards };
            }
            return node;
          }));
          return false;
        }
        return true;
      });

      // Try to start new transmissions
      const newTx: Transmission[] = [];
      
      // For each node that has shards, check if it can transmit to a neighbor
      nodes.forEach(fromNode => {
        if (fromNode.shards.size === 0) return;

        // Find neighbors via active links
        const activeLinks = links.filter(link => {
          const isRelevant = link.from === fromNode.id || link.to === fromNode.id;
          const isActive = link.intervals.some(([start, end]) => currentTime >= start && currentTime <= end);
          return isRelevant && isActive;
        });

        activeLinks.forEach(link => {
          const toId = link.from === fromNode.id ? link.to : link.from;
          const toNode = nodes.find(n => n.id === toId);
          
          if (!toNode) return;

          // Check if toNode needs any shards that fromNode has
          const missingShards = Array.from(fromNode.shards).filter(s => !toNode.shards.has(s));
          
          if (missingShards.length > 0) {
            // Check if there's already a transmission to this node for one of these shards
            const alreadyTransmitting = [...prev, ...newTx].some(tx => tx.toId === toId && missingShards.includes(tx.shardId));
            
            if (!alreadyTransmitting && Math.random() < 0.05) { // Random chance to start to simulate "scheduling"
              const shardToTransmit = missingShards[0];
              newTx.push({
                id: `${fromNode.id}-${toId}-${shardToTransmit}-${currentTime}`,
                fromId: fromNode.id,
                toId: toId,
                shardId: shardToTransmit,
                startTime: currentTime,
                duration: TRANSMISSION_DURATION,
              });
            }
          }
        });
      });

      return [...active, ...newTx];
    });
  }, [nodes, links, currentTime, speed]);

  useEffect(() => {
    let frameId: number;
    const loop = (time: number) => {
      if (isPlaying) {
        const deltaTime = lastUpdateRef.current ? (time - lastUpdateRef.current) / 1000 : 0;
        updateSimulation(deltaTime);
      }
      lastUpdateRef.current = time;
      frameId = requestAnimationFrame(loop);
    };
    frameId = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(frameId);
  }, [isPlaying, updateSimulation]);

  const handleReset = () => {
    setCurrentTime(0);
    setNodes(generateMockNodes(SATELLITE_COUNT));
    setTransmissions([]);
    setIsPlaying(false);
  };

  const totalProgress = nodes.length > 1 
    ? nodes.filter(n => n.type === 'satellite').reduce((acc, n) => acc + n.shards.size, 0) / ((nodes.length - 1) * TOTAL_SHARDS)
    : 0;

  return (
    <div className="flex flex-col h-screen bg-[#020617] text-slate-200 overflow-hidden font-sans">
      {/* Header */}
      <header className="flex items-center justify-between px-8 py-4 border-b border-white/10 bg-black/20 backdrop-blur-md z-10">
        <div className="flex items-center gap-3">
          <div className="p-2 bg-indigo-500/20 rounded-lg">
            <Radio className="w-6 h-6 text-indigo-400" />
          </div>
          <div>
            <h1 className="text-xl font-bold tracking-tight text-white">SatSim <span className="text-indigo-400 font-normal italic text-sm ml-2">v1.0</span></h1>
            <p className="text-xs text-slate-400 uppercase tracking-widest">Orbital Data Transmission</p>
          </div>
        </div>

        <div className="flex items-center gap-6">
          <div className="flex flex-col items-end">
            <span className="text-[10px] uppercase tracking-tighter text-slate-500">Simulation Time</span>
            <span className="font-mono text-lg text-indigo-300">{(currentTime / 1000).toFixed(2)}s</span>
          </div>
          <div className="h-8 w-px bg-white/10" />
          <div className="flex items-center gap-2">
            <button 
              onClick={() => setIsPlaying(!isPlaying)}
              className="p-3 bg-white text-black rounded-full hover:bg-indigo-400 hover:text-white transition-all active:scale-95 shadow-lg shadow-indigo-500/20"
            >
              {isPlaying ? <Pause className="w-5 h-5" /> : <Play className="w-5 h-5 fill-current" />}
            </button>
            <button 
              onClick={handleReset}
              className="p-3 bg-white/5 border border-white/10 rounded-full hover:bg-white/10 transition-all active:scale-95"
            >
              <RotateCcw className="w-5 h-5" />
            </button>
            <button
              onClick={() => setCameraResetSignal((prev) => prev + 1)}
              className="p-3 bg-white/5 border border-white/10 rounded-full hover:bg-white/10 transition-all active:scale-95"
              title="恢复初始视角"
              aria-label="恢复初始视角"
            >
              <LocateFixed className="w-5 h-5" />
            </button>
            <div className="h-8 w-px bg-white/10 mx-2" />
            <input 
              type="file" 
              ref={fileInputRef} 
              onChange={handleFileUpload} 
              className="hidden" 
              accept=".json"
            />
            <button 
              onClick={() => fileInputRef.current?.click()}
              className="flex items-center gap-2 px-4 py-2 bg-indigo-600 hover:bg-indigo-500 text-white rounded-lg transition-all text-sm font-medium"
            >
              <Upload className="w-4 h-4" />
              <span>Import Topology</span>
            </button>
          </div>
        </div>
      </header>

      <main className="flex-1 relative flex">
        {/* Sidebar */}
        <aside className="w-80 border-r border-white/10 bg-black/40 backdrop-blur-xl p-6 flex flex-col gap-8 z-10">
          <section>
            <h3 className="text-xs font-semibold text-slate-500 uppercase tracking-widest mb-4 flex items-center gap-2">
              <Activity className="w-3 h-3" /> Network Status
            </h3>
            <div className="space-y-4">
              <div className="p-4 bg-white/5 rounded-xl border border-white/5">
                <div className="flex justify-between items-end mb-2">
                  <span className="text-sm text-slate-400">Total Progress</span>
                  <span className="text-xl font-bold text-white">{(totalProgress * 100).toFixed(1)}%</span>
                </div>
                <div className="w-full h-1.5 bg-white/10 rounded-full overflow-hidden">
                  <motion.div 
                    className="h-full bg-indigo-500" 
                    initial={{ width: 0 }}
                    animate={{ width: `${totalProgress * 100}%` }}
                  />
                </div>
              </div>
              
              <div className="grid grid-cols-2 gap-3">
                <div className="p-3 bg-white/5 rounded-lg border border-white/5">
                  <span className="block text-[10px] text-slate-500 uppercase">Nodes</span>
                  <span className="text-lg font-semibold">{nodes.length}</span>
                </div>
                <div className="p-3 bg-white/5 rounded-lg border border-white/5">
                  <span className="block text-[10px] text-slate-500 uppercase">Active Tx</span>
                  <span className="text-lg font-semibold text-amber-400">{transmissions.length}</span>
                </div>
              </div>
            </div>
          </section>

          <section className="flex-1 overflow-hidden flex flex-col">
            <h3 className="text-xs font-semibold text-slate-500 uppercase tracking-widest mb-4 flex items-center gap-2">
              <Database className="w-3 h-3" /> Node Registry
            </h3>
            <div className="flex-1 overflow-y-auto pr-2 space-y-2 custom-scrollbar">
              {nodes.map(node => (
                <div key={node.id} className="group p-3 bg-white/5 rounded-lg border border-white/5 hover:border-indigo-500/30 transition-colors">
                  <div className="flex justify-between items-center mb-1">
                    <span className="text-sm font-medium text-slate-300">
                      {node.type === 'station' ? 'Base Station' : `Satellite ${node.id}`}
                    </span>
                    <span className={`w-2 h-2 rounded-full ${node.shards.size === TOTAL_SHARDS ? 'bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.5)]' : 'bg-indigo-500'}`} />
                  </div>
                  <div className="flex items-center gap-2">
                    <div className="flex-1 h-1 bg-white/10 rounded-full overflow-hidden">
                      <div 
                        className="h-full bg-indigo-400/50" 
                        style={{ width: `${(node.shards.size / TOTAL_SHARDS) * 100}%` }} 
                      />
                    </div>
                    <span className="text-[10px] font-mono text-slate-500">{node.shards.size}/{TOTAL_SHARDS}</span>
                  </div>
                </div>
              ))}
            </div>
          </section>

          <section>
            <div className="p-4 bg-indigo-500/10 rounded-xl border border-indigo-500/20">
              <div className="flex items-start gap-3">
                <Info className="w-4 h-4 text-indigo-400 mt-0.5" />
                <p className="text-xs text-indigo-300/80 leading-relaxed">
                  Transmission logic: Nodes share missing shards with neighbors over active links. Base station initiates the process.
                </p>
              </div>
            </div>
          </section>
        </aside>

        {/* 3D View */}
        <div className="flex-1 relative">
          <SatelliteScene 
            nodes={nodes} 
            links={links} 
            transmissions={transmissions} 
            currentTime={currentTime}
            totalShards={TOTAL_SHARDS}
            cameraResetSignal={cameraResetSignal}
          />
          
          {/* Legend */}
          <div className="absolute bottom-8 left-8 p-4 bg-black/60 backdrop-blur-md rounded-2xl border border-white/10 flex gap-6">
            <div className="flex items-center gap-2">
              <div className="w-3 h-3 rounded-full bg-emerald-500" />
              <span className="text-xs text-slate-400">Ground Station</span>
            </div>
            <div className="flex items-center gap-2">
              <div className="w-3 h-3 rounded-full bg-indigo-500" />
              <span className="text-xs text-slate-400">Satellite</span>
            </div>
            <div className="flex items-center gap-2">
              <div className="w-3 h-3 rounded-full bg-blue-500" />
              <span className="text-xs text-slate-400">Synced</span>
            </div>
            <div className="flex items-center gap-2">
              <div className="w-3 h-3 rounded-full bg-amber-400" />
              <span className="text-xs text-slate-400">Data Packet</span>
            </div>
          </div>

          {/* Speed Control */}
          <div className="absolute top-8 right-8 flex items-center gap-4 p-2 bg-black/60 backdrop-blur-md rounded-full border border-white/10">
            {[100, 1000, 5000].map(s => (
              <button
                key={s}
                onClick={() => setSpeed(s)}
                className={`px-4 py-1.5 rounded-full text-[10px] font-bold transition-all ${speed === s ? 'bg-white text-black' : 'text-slate-400 hover:text-white'}`}
              >
                {s === 100 ? '0.1x' : s === 1000 ? '1x' : '5x'}
              </button>
            ))}
          </div>
        </div>
      </main>

      <style dangerouslySetInnerHTML={{ __html: `
        .custom-scrollbar::-webkit-scrollbar {
          width: 4px;
        }
        .custom-scrollbar::-webkit-scrollbar-track {
          background: transparent;
        }
        .custom-scrollbar::-webkit-scrollbar-thumb {
          background: rgba(255, 255, 255, 0.1);
          border-radius: 10px;
        }
        .custom-scrollbar::-webkit-scrollbar-thumb:hover {
          background: rgba(255, 255, 255, 0.2);
        }
      `}} />
    </div>
  );
}