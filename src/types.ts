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

export interface TopologyMeta {
  num_nodes: number;
  base_node: number;
  time_unit: string;
}

export interface BackendConfig {
  num_satellites: number;
  num_fragments: number;
  fragment_size: number;
  base_sat_bandwidth: number;
  sat_sat_bandwidth: number;
  base_sat_delay_ns: number;
  sat_sat_delay_ns: number;
  topology: string;
  scheduler_type: string;
  gossip_fanout: number;
  injection_type: string;
  topo_file: string;
  max_concurrent_links_per_sat: number;
  random_seed: number;
}

export interface BackendTopologyFile {
  name: string;
  size_bytes: number;
}

export interface BackendOptionsResponse {
  default_config: BackendConfig;
  scheduler_options: string[];
  injection_options: string[];
  static_topology_options: string[];
  topology_files: BackendTopologyFile[];
  default_topology_file?: string;
}

export interface BackendTopologyResponse {
  file: string;
  meta: TopologyMeta;
  links: LinkData[];
}

export interface BackendDeliveryEvent {
  time_sec: number;
  src_id: number;
  dst_id: number;
  fragment_id: number;
}

export interface BackendSimulationNode {
  id: number;
  type: NodeType;
  final_shard_count: number;
}

export interface BackendSimulationSummary {
  completed: boolean;
  completion_time_sec?: number;
  final_time_sec: number;
  event_count: number;
  total_deliveries: number;
  satellites: number;
  total_fragments: number;
}

export interface BackendSimulationResponse {
  config: BackendConfig;
  topology: {
    mode: string;
    file?: string;
    meta: TopologyMeta;
    links: LinkData[];
  };
  nodes: BackendSimulationNode[];
  deliveries: BackendDeliveryEvent[];
  summary: BackendSimulationSummary;
}
