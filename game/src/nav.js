// nav.js — A* pathfinding over Port Palmshade's intersection graph.
//
// Intersections are the nodes, street segments the edges. findPath snaps a
// start and a goal to their nearest intersections, runs A* with a Manhattan
// heuristic, and returns world-space waypoints along the road centrelines:
// the start point, each intersection the route turns at, and the goal point.
// Police interceptors steer along these waypoints and only leave the network
// for the final approach, which is what keeps pursuits on the streets.

import { PITCH, GRID_COLS, GRID_ROWS } from './config.js';

export function nearestIntersection(x, y) {
  const i = Math.max(0, Math.min(GRID_COLS - 1, Math.round(x / PITCH)));
  const j = Math.max(0, Math.min(GRID_ROWS - 1, Math.round(y / PITCH)));
  return { i, j, x: i * PITCH, y: j * PITCH };
}

function key(i, j) {
  return i + ',' + j;
}

function neighbours(i, j) {
  const out = [];
  if (i > 0) out.push([i - 1, j]);
  if (i < GRID_COLS - 1) out.push([i + 1, j]);
  if (j > 0) out.push([i, j - 1]);
  if (j < GRID_ROWS - 1) out.push([i, j + 1]);
  return out;
}

// A* between two intersection nodes. Returns a list of {i, j} nodes.
export function astarNodes(si, sj, gi, gj) {
  if (si === gi && sj === gj) return [{ i: si, j: sj }];
  const open = new Map();
  const cameFrom = new Map();
  const gScore = new Map();
  const startKey = key(si, sj);
  gScore.set(startKey, 0);
  open.set(startKey, { i: si, j: sj, f: Math.abs(gi - si) + Math.abs(gj - sj) });
  const closed = new Set();
  while (open.size) {
    let bestKey = null;
    let best = null;
    for (const [k, node] of open) {
      if (!best || node.f < best.f) {
        best = node;
        bestKey = k;
      }
    }
    if (!best) break;
    if (best.i === gi && best.j === gj) {
      const path = [];
      let k = bestKey;
      let node = best;
      while (node) {
        path.unshift({ i: node.i, j: node.j });
        k = cameFrom.get(k);
        node = k ? { i: Number(k.split(',')[0]), j: Number(k.split(',')[1]) } : null;
      }
      return path;
    }
    open.delete(bestKey);
    closed.add(bestKey);
    const g = gScore.get(bestKey);
    for (const [ni, nj] of neighbours(best.i, best.j)) {
      const nk = key(ni, nj);
      if (closed.has(nk)) continue;
      const ng = g + 1;
      if (ng < (gScore.get(nk) ?? Infinity)) {
        gScore.set(nk, ng);
        cameFrom.set(nk, bestKey);
        open.set(nk, { i: ni, j: nj, f: ng + Math.abs(gi - ni) + Math.abs(gj - nj) });
      }
    }
  }
  return [{ i: si, j: sj }];
}

// World-space route from (ax, ay) to (bx, by) along street centrelines.
// Consecutive collinear intersections are kept (they pace the steering), but
// the first waypoint is dropped when the start already sits on its segment.
export function findPath(ax, ay, bx, by) {
  const s = nearestIntersection(ax, ay);
  const g = nearestIntersection(bx, by);
  const nodes = astarNodes(s.i, s.j, g.i, g.j);
  const points = nodes.map((n) => ({ x: n.i * PITCH, y: n.j * PITCH }));
  const route = [{ x: ax, y: ay }];
  for (const p of points) {
    const last = route[route.length - 1];
    if (Math.hypot(p.x - last.x, p.y - last.y) > 4) route.push(p);
  }
  route.push({ x: bx, y: by });
  return route;
}

// Length of a waypoint route, in pixels.
export function pathLength(route) {
  let total = 0;
  for (let i = 1; i < route.length; i++) {
    total += Math.hypot(route[i].x - route[i - 1].x, route[i].y - route[i - 1].y);
  }
  return total;
}
