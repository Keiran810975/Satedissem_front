export type NodeType = 'station' | 'satellite';

export interface NodeData {
  id: number;
  type: NodeType;
  position: [number, number, number];
  shards: Set<number>;
}

export interface LinkData {
  from: number;
  to: number;
  intervals: [number, number][];
}

export interface Transmission {
  id: string;
  fromId: number;
  toId: number;
  shardId: number;
  startTime: number;
  duration: number;
}

export interface SimulationState {
  currentTime: number;
  nodes: NodeData[];
  links: LinkData[];
  transmissions: Transmission[];
  totalShards: number;
}
