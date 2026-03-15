import { LinkData } from '../types';

export const parseTopologyJson = (json: any): LinkData[] => {
  const links: LinkData[] = [];
  
  for (const [key, intervals] of Object.entries(json)) {
    const [from, to] = key.split('-').map(Number);
    if (!isNaN(from) && !isNaN(to)) {
      links.push({
        from,
        to,
        intervals: intervals as [number, number][],
      });
    }
  }
  
  return links;
};
