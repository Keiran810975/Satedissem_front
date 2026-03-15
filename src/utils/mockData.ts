import { NodeData, LinkData } from '../types';

export const generateMockNodes = (count: number): NodeData[] => {
  const nodes: NodeData[] = [];
  
  // Base Station at origin (or slightly offset)
  nodes.push({
    id: 0,
    type: 'station',
    position: [0, -5, 0],
    shards: new Set(Array.from({ length: 10 }, (_, i) => i)), // Station has all 10 shards
  });

  // Satellites in a sphere/orbit
  for (let i = 1; i <= count; i++) {
    const phi = Math.acos(-1 + (2 * i) / count);
    const theta = Math.sqrt(count * Math.PI) * phi;
    const radius = 10;
    
    nodes.push({
      id: i,
      type: 'satellite',
      position: [
        radius * Math.cos(theta) * Math.sin(phi),
        radius * Math.sin(theta) * Math.sin(phi) + 2,
        radius * Math.cos(phi),
      ],
      shards: new Set(),
    });
  }

  return nodes;
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
