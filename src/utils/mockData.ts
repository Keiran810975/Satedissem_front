import { NodeData, LinkData } from '../types';

export const generateMockNodes = (count: number): NodeData[] => {
  return generateNodesFromMeta(count + 1, 0, 10);
};

export const generateNodesFromMeta = (
  numNodes: number,
  baseNodeId: number,
  totalShards: number,
): NodeData[] => {
  const nodeIds = Array.from({ length: numNodes }, (_, i) => i);
  return generateSceneNodes(nodeIds, baseNodeId, totalShards);
};

export const generateSceneNodes = (
  nodeIds: number[],
  baseNodeId: number,
  totalShards: number,
): NodeData[] => {
  const nodes: NodeData[] = [];

  const sortedNodeIds = [...nodeIds].sort((a, b) => a - b);
  const satelliteIds = sortedNodeIds.filter((id) => id !== baseNodeId);

  nodes.push({
    id: baseNodeId,
    type: 'station',
    position: [0, -5, 0],
    shards: new Set(Array.from({ length: totalShards }, (_, i) => i)),
  });

  const count = satelliteIds.length;
  for (let idx = 0; idx < satelliteIds.length; idx++) {
    const satId = satelliteIds[idx];
    const i = idx + 1;
    const phi = Math.acos(-1 + (2 * i) / Math.max(count, 1));
    const theta = Math.sqrt(Math.max(count, 1) * Math.PI) * phi;
    const radius = 10;

    nodes.push({
      id: satId,
      type: 'satellite',
      position: [
        radius * Math.cos(theta) * Math.sin(phi),
        radius * Math.sin(theta) * Math.sin(phi) + 2,
        radius * Math.cos(phi),
      ],
      shards: new Set(),
    });
  }

  return nodes.sort((a, b) => a.id - b.id);
};

export const generateMockTopology = (nodeCount: number): LinkData[] => {
  const links: LinkData[] = [];
  
  // Connect station to some satellites
  for (let i = 1; i <= Math.min(nodeCount, 5); i++) {
    links.push({
      from: 0,
      to: i,
      intervals: [[0, 100000], [200000, 300000]],
    });
  }

  // Connect satellites to each other (randomly or in a ring)
  for (let i = 1; i <= nodeCount; i++) {
    const next = (i % nodeCount) + 1;
    links.push({
      from: i,
      to: next,
      intervals: [[0, 500000]],
    });
    
    // Some random cross links
    if (i % 3 === 0) {
      const randomTarget = Math.floor(Math.random() * nodeCount) + 1;
      if (randomTarget !== i) {
        links.push({
          from: i,
          to: randomTarget,
          intervals: [[0, 500000]],
        });
      }
    }
  }

  return links;
};
