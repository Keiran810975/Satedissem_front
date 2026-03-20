import { LinkData, TopologyMeta } from '../types';

function inferNumNodes(links: LinkData[]): number {
  let maxId = 0;
  for (const link of links) {
    if (link.from > maxId) maxId = link.from;
    if (link.to > maxId) maxId = link.to;
  }
  return links.length > 0 ? maxId + 1 : 1;
}

export const parseTopologyJson = (json: any): { meta: TopologyMeta; links: LinkData[] } => {
  const maybeMeta = json?.meta;
  const rawIntervals = json?.intervals && typeof json.intervals === 'object' ? json.intervals : json;
  const links: LinkData[] = [];

  if (!rawIntervals || typeof rawIntervals !== 'object') {
    return {
      meta: {
        num_nodes: 1,
        base_node: 0,
        time_unit: 's',
      },
      links,
    };
  }

  for (const [key, intervals] of Object.entries(rawIntervals)) {
    const [from, to] = key.split('-').map(Number);
    if (Number.isNaN(from) || Number.isNaN(to) || !Array.isArray(intervals)) {
      continue;
    }

    const sanitizedIntervals = (intervals as [number, number][])?.filter(
      (pair) => Array.isArray(pair) && pair.length === 2,
    );
    if (sanitizedIntervals.length === 0) {
      continue;
    }

    links.push({
      from,
      to,
      intervals: sanitizedIntervals,
    });
  }

  const inferredNodes = inferNumNodes(links);
  return {
    meta: {
      num_nodes:
        typeof maybeMeta?.num_nodes === 'number' && maybeMeta.num_nodes > 0
          ? maybeMeta.num_nodes
          : inferredNodes,
      base_node: typeof maybeMeta?.base_node === 'number' ? maybeMeta.base_node : 0,
      time_unit: typeof maybeMeta?.time_unit === 'string' && maybeMeta.time_unit ? maybeMeta.time_unit : 's',
    },
    links,
  };
};
