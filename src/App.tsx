/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { SatelliteScene } from './components/SatelliteScene';
import { generateNodesFromMeta } from './utils/mockData';
import { fetchBackendOptions, fetchTopology, runBackendSimulation } from './utils/api';
import {
  BackendConfig,
  BackendDeliveryEvent,
  BackendSimulationSummary,
  LinkData,
  NodeData,
  TopologyMeta,
  Transmission,
} from './types';
import { Play, Pause, RotateCcw, LocateFixed, Activity, Database, Radio, Info, Loader2, ChevronDown } from 'lucide-react';
import { motion } from 'motion/react';

const FALLBACK_TOTAL_SHARDS = 10;
const TRANSMISSION_DURATION_SEC = 0.25;
const SPEED_OPTIONS = [0.2, 1, 5];
const DEFAULT_TOPOLOGY_FILE = 'intervals32.json';
const PLAYBACK_SLOWDOWN = 0.12;
const MAX_DELIVERIES_PER_TICK = 1;
const PACKET_VISUAL_DURATION_SEC = TRANSMISSION_DURATION_SEC * PLAYBACK_SLOWDOWN;
const MAX_VISIBLE_LOG_ITEMS = 300;

function maxTimelineFromLinks(links: LinkData[]): number {
  let maxEnd = 0;
  for (const link of links) {
    for (const [, end] of link.intervals) {
      if (end > maxEnd) {
        maxEnd = end;
      }
    }
  }
  return maxEnd;
}

export default function App() {
  const [nodes, setNodes] = useState<NodeData[]>([]);
  const [links, setLinks] = useState<LinkData[]>([]);
  const [transmissions, setTransmissions] = useState<Transmission[]>([]);
  const [currentTime, setCurrentTime] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const [speed, setSpeed] = useState(0.2);
  const [cameraResetSignal, setCameraResetSignal] = useState(0);

  const [config, setConfig] = useState<BackendConfig | null>(null);
  const [topologyMeta, setTopologyMeta] = useState<TopologyMeta>({
    num_nodes: 33,
    base_node: 0,
    time_unit: 's',
  });
  const [selectedTopologyFile, setSelectedTopologyFile] = useState(DEFAULT_TOPOLOGY_FILE);
  const [schedulerOptions, setSchedulerOptions] = useState<string[]>([]);
  const [deliveries, setDeliveries] = useState<BackendDeliveryEvent[]>([]);
  const [summary, setSummary] = useState<BackendSimulationSummary | null>(null);
  const [playbackEndTime, setPlaybackEndTime] = useState(0);
  const [isLoading, setIsLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');
  const [isLogCollapsed, setIsLogCollapsed] = useState(true);

  const lastUpdateRef = useRef<number>(0);
  const deliveryCursorRef = useRef<number>(0);

  const resetPlaybackState = useCallback(() => {
    setCurrentTime(0);
    setIsPlaying(false);
    setTransmissions([]);
    deliveryCursorRef.current = 0;
    lastUpdateRef.current = 0;
  }, []);

  useEffect(() => {
    const initialize = async () => {
      setIsLoading(true);
      setErrorMessage('');

      try {
        const options = await fetchBackendOptions();
        setSchedulerOptions(options.scheduler_options);

        const preferredTopology = options.topology_files.some((file) => file.name === DEFAULT_TOPOLOGY_FILE)
          ? DEFAULT_TOPOLOGY_FILE
          : options.default_topology_file ?? options.topology_files[0]?.name ?? DEFAULT_TOPOLOGY_FILE;

        setSelectedTopologyFile(preferredTopology);

        const initialConfig: BackendConfig = {
          ...options.default_config,
          topo_file: preferredTopology,
        };
        setConfig(initialConfig);

        const topology = await fetchTopology(preferredTopology);
        setTopologyMeta(topology.meta);
        setLinks(topology.links);
        setNodes(generateNodesFromMeta(topology.meta.num_nodes, topology.meta.base_node, initialConfig.num_fragments));
        setPlaybackEndTime(maxTimelineFromLinks(topology.links));
      } catch (error) {
        setErrorMessage(error instanceof Error ? error.message : 'Failed to initialize backend topology');
      } finally {
        setIsLoading(false);
      }
    };

    initialize();
  }, []);

  const handleRunSimulation = useCallback(async () => {
    if (!config) return;

    setIsLoading(true);
    setErrorMessage('');

    try {
      const requestConfig: BackendConfig = {
        ...config,
        topo_file: selectedTopologyFile || config.topo_file,
      };

      const response = await runBackendSimulation(requestConfig, selectedTopologyFile);
      setConfig(response.config);
      setTopologyMeta(response.topology.meta);
      setLinks(response.topology.links);
      setNodes(
        generateNodesFromMeta(
          response.topology.meta.num_nodes,
          response.topology.meta.base_node,
          response.config.num_fragments,
        ),
      );
      setDeliveries(response.deliveries);
      setSummary(response.summary);
      setPlaybackEndTime(response.summary.completion_time_sec ?? response.summary.final_time_sec);
      resetPlaybackState();
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'Backend simulation failed');
    } finally {
      setIsLoading(false);
    }
  }, [config, resetPlaybackState, selectedTopologyFile]);

  const updateSimulation = useCallback((deltaSeconds: number) => {
    setCurrentTime((prevTime) => {
      const timelineDelta = deltaSeconds * speed * PLAYBACK_SLOWDOWN;
      const nextTime = prevTime + timelineDelta;

      const newEvents: BackendDeliveryEvent[] = [];
      while (
        deliveryCursorRef.current < deliveries.length
        && deliveries[deliveryCursorRef.current].time_sec <= nextTime
        && newEvents.length < MAX_DELIVERIES_PER_TICK
      ) {
        newEvents.push(deliveries[deliveryCursorRef.current]);
        deliveryCursorRef.current += 1;
      }

      if (newEvents.length > 0) {
        setNodes((prevNodes) => {
          const shardMap = new Map<number, Set<number>>();
          for (const node of prevNodes) {
            shardMap.set(node.id, new Set(node.shards));
          }

          for (const event of newEvents) {
            const targetShards = shardMap.get(event.dst_id);
            if (targetShards) {
              targetShards.add(event.fragment_id);
            }
          }

          return prevNodes.map((node) => ({
            ...node,
            shards: shardMap.get(node.id) ?? new Set<number>(),
          }));
        });
      }

      setTransmissions((prevTransmissions) => {
        const activeTransmissions = prevTransmissions.filter(
          (tx) => nextTime - tx.startTime <= tx.duration,
        );

        if (newEvents.length === 0) {
          return activeTransmissions;
        }

        const spawnedTransmissions = newEvents.map((event, index) => ({
          id: `${event.src_id}-${event.dst_id}-${event.fragment_id}-${event.time_sec}-${index}`,
          fromId: event.src_id,
          toId: event.dst_id,
          shardId: event.fragment_id,
          startTime: nextTime,
          duration: PACKET_VISUAL_DURATION_SEC,
        }));

        return [...activeTransmissions, ...spawnedTransmissions];
      });

      if (
        playbackEndTime > 0
        && nextTime >= playbackEndTime + PACKET_VISUAL_DURATION_SEC
        && deliveryCursorRef.current >= deliveries.length
      ) {
        setIsPlaying(false);
      }

      return nextTime;
    });
  }, [deliveries, playbackEndTime, speed]);

  useEffect(() => {
    if (!isPlaying) return;

    let frameId = 0;
    const loop = (time: number) => {
      const deltaSeconds = lastUpdateRef.current ? (time - lastUpdateRef.current) / 1000 : 0;
      lastUpdateRef.current = time;
      updateSimulation(deltaSeconds);
      frameId = requestAnimationFrame(loop);
    };

    frameId = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(frameId);
  }, [isPlaying, updateSimulation]);

  const handleReset = useCallback(() => {
    const shardCount = Math.max(config?.num_fragments ?? FALLBACK_TOTAL_SHARDS, 1);
    resetPlaybackState();

    setNodes((prevNodes) =>
      prevNodes.map((node) => ({
        ...node,
        shards:
          node.type === 'station'
            ? new Set(Array.from({ length: shardCount }, (_, i) => i))
            : new Set<number>(),
      })),
    );
  }, [config, resetPlaybackState]);

  const totalShards = Math.max(config?.num_fragments ?? FALLBACK_TOTAL_SHARDS, 1);
  const totalProgress = useMemo(() => {
    const satellites = nodes.filter((node) => node.type === 'satellite');
    const denominator = satellites.length * totalShards;
    if (denominator === 0) return 0;

    const ownedShards = satellites.reduce((sum, node) => sum + node.shards.size, 0);
    return ownedShards / denominator;
  }, [nodes, totalShards]);

  const runStatus = useMemo(() => {
    if (isLoading) return 'Running backend...';
    if (errorMessage) return errorMessage;
    if (!summary) return 'Ready (select algorithm, then Run Backend)';

    if (summary.completed) {
      const doneAt = summary.completion_time_sec?.toFixed(2) ?? summary.final_time_sec.toFixed(2);
      return `Completed at ${doneAt}s`;
    }
    return `Incomplete (${summary.total_deliveries} deliveries)`;
  }, [errorMessage, isLoading, summary]);

  const visibleLogs = useMemo(() => {
    if (deliveries.length === 0) return [];

    const reachedEvents = deliveries.filter((event) => event.time_sec <= currentTime);
    const startIndex = Math.max(0, reachedEvents.length - MAX_VISIBLE_LOG_ITEMS);
    return reachedEvents.slice(startIndex).reverse();
  }, [deliveries, currentTime]);

  const formatNodeLabel = useCallback((nodeId: number) => {
    return nodeId === topologyMeta.base_node ? `Base Station(${nodeId})` : `Sat ${nodeId}`;
  }, [topologyMeta.base_node]);

  return (
    <div className="flex flex-col h-screen bg-[#020617] text-slate-200 overflow-hidden font-sans">
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
            <span className="font-mono text-lg text-indigo-300">{currentTime.toFixed(2)}s</span>
          </div>
          <div className="h-8 w-px bg-white/10" />
          <div className="flex items-center gap-2">
            <button
              onClick={() => {
                if (playbackEndTime > 0 && currentTime >= playbackEndTime) {
                  handleReset();
                  setIsPlaying(true);
                  return;
                }
                setIsPlaying((prev) => !prev);
              }}
              disabled={deliveries.length === 0 || isLoading}
              className="p-3 bg-white text-black rounded-full hover:bg-indigo-400 hover:text-white transition-all active:scale-95 shadow-lg shadow-indigo-500/20 disabled:opacity-50"
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
            <button
              onClick={handleRunSimulation}
              disabled={!config || isLoading}
              className="flex items-center gap-2 px-4 py-2 bg-indigo-600 hover:bg-indigo-500 text-white rounded-lg transition-all text-sm font-medium disabled:opacity-50"
            >
              {isLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Play className="w-4 h-4" />}
              <span>Run Backend</span>
            </button>
          </div>
        </div>
      </header>

      <main className="flex-1 relative flex">
        <aside className="w-80 border-r border-white/10 bg-black/40 backdrop-blur-xl p-6 flex flex-col gap-8 z-10 min-h-0">
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

              <div className="p-3 bg-white/5 rounded-lg border border-white/5">
                <span className="block text-[10px] text-slate-500 uppercase">Status</span>
                <span className={`text-sm ${errorMessage ? 'text-red-300' : 'text-slate-300'}`}>{runStatus}</span>
              </div>
            </div>
          </section>

          <section>
            <h3 className="text-xs font-semibold text-slate-500 uppercase tracking-widest mb-4 flex items-center gap-2">
              <Radio className="w-3 h-3" /> Backend Algorithm
            </h3>
            <div className="space-y-3">
              <div>
                <label className="block text-[10px] uppercase text-slate-500 mb-1">Scheduler</label>
                <select
                  value={config?.scheduler_type ?? ''}
                  onChange={(event) =>
                    setConfig((prev) => (prev ? { ...prev, scheduler_type: event.target.value } : prev))
                  }
                  className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-sm"
                  disabled={!config || isLoading}
                >
                  {schedulerOptions.map((scheduler) => (
                    <option key={scheduler} value={scheduler}>
                      {scheduler}
                    </option>
                  ))}
                </select>
              </div>

              <div className="p-3 bg-white/5 rounded-lg border border-white/5">
                <span className="block text-[10px] text-slate-500 uppercase">Topology</span>
                <span className="text-sm text-slate-300">{selectedTopologyFile}</span>
              </div>
            </div>
          </section>

          <section className="flex-1 min-h-0 overflow-hidden flex flex-col">
            <h3 className="text-xs font-semibold text-slate-500 uppercase tracking-widest mb-4 flex items-center gap-2">
              <Database className="w-3 h-3" /> Node Registry
            </h3>
            <div className="flex-1 min-h-0 overflow-y-auto pr-2 space-y-2 custom-scrollbar">
              {nodes.map((node) => (
                <div key={node.id} className="group p-3 bg-white/5 rounded-lg border border-white/5 hover:border-indigo-500/30 transition-colors">
                  <div className="flex justify-between items-center mb-1">
                    <span className="text-sm font-medium text-slate-300">
                      {node.type === 'station' ? 'Base Station' : `Satellite ${node.id}`}
                    </span>
                    <span className={`w-2 h-2 rounded-full ${node.shards.size === totalShards ? 'bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.5)]' : 'bg-indigo-500'}`} />
                  </div>
                  <div className="flex items-center gap-2">
                    <div className="flex-1 h-1 bg-white/10 rounded-full overflow-hidden">
                      <div
                        className="h-full bg-indigo-400/50"
                        style={{ width: `${(node.shards.size / totalShards) * 100}%` }}
                      />
                    </div>
                    <span className="text-[10px] font-mono text-slate-500">{node.shards.size}/{totalShards}</span>
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
                  Playback now uses backend scheduler deliveries from the real simulation API.
                </p>
              </div>
            </div>
          </section>
        </aside>

        <div className="flex-1 relative">
          <SatelliteScene
            nodes={nodes}
            links={links}
            transmissions={transmissions}
            currentTime={currentTime}
            totalShards={totalShards}
            cameraResetSignal={cameraResetSignal}
          />

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

          <div className="absolute top-8 right-8 flex items-center gap-4 p-2 bg-black/60 backdrop-blur-md rounded-full border border-white/10">
            {SPEED_OPTIONS.map((multiplier) => (
              <button
                key={multiplier}
                onClick={() => setSpeed(multiplier)}
                className={`px-4 py-1.5 rounded-full text-[10px] font-bold transition-all ${speed === multiplier ? 'bg-white text-black' : 'text-slate-400 hover:text-white'}`}
              >
                {multiplier}x
              </button>
            ))}
          </div>

          <div className="absolute top-24 right-8 z-20 flex flex-col items-end gap-3 pointer-events-auto">
            {!isLogCollapsed && (
              <div className="w-[420px] max-w-[42vw] bg-black/65 backdrop-blur-md rounded-2xl border border-white/10 overflow-hidden">
                <div className="px-4 py-3 border-b border-white/10">
                  <p className="text-xs uppercase tracking-widest text-slate-500">Transmission Log</p>
                  <p className="text-sm text-slate-300">{visibleLogs.length} / {deliveries.length} events shown</p>
                </div>

                <div className="max-h-72 overflow-y-auto custom-scrollbar px-4 py-3 space-y-2">
                  {visibleLogs.length === 0 ? (
                    <p className="text-xs text-slate-500">No delivery events reached current timeline yet.</p>
                  ) : (
                    visibleLogs.map((event, index) => (
                      <div key={`${event.time_sec}-${event.src_id}-${event.dst_id}-${event.fragment_id}-${index}`} className="text-xs text-slate-300 leading-relaxed">
                        <span className="text-indigo-300 font-mono">[{event.time_sec.toFixed(2)}s]</span>{' '}
                        <span>{formatNodeLabel(event.src_id)}</span>{' '}
                        <span className="text-slate-500">→</span>{' '}
                        <span>{formatNodeLabel(event.dst_id)}</span>{' '}
                        <span className="text-slate-500">fragment</span>{' '}
                        <span className="text-amber-300">#{event.fragment_id}</span>
                      </div>
                    ))
                  )}
                </div>
              </div>
            )}

            <button
              onClick={() => setIsLogCollapsed((prev) => !prev)}
              className="px-4 py-2 bg-indigo-600/90 hover:bg-indigo-500 text-white rounded-full border border-indigo-300/30 shadow-lg shadow-indigo-900/40 text-xs font-semibold tracking-wide transition-colors flex items-center gap-2"
            >
              <span>Log</span>
              <ChevronDown className={`w-4 h-4 transition-transform ${isLogCollapsed ? '' : 'rotate-180'}`} />
            </button>
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
      ` }} />
    </div>
  );
}
