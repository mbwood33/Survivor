// SpatialGrid: Uniform grid spatial hash for broadphase queries.
// Insert AABBs by object reference; query returns candidates intersecting an AABB.

export class SpatialGrid {
  constructor(cellSize = 128) {
    this.cellSize = cellSize | 0;
    this.cells = new Map(); // key: "cx,cy" -> array of items
    this._tmpVisited = new Set();
  }

  _cellKey(cx, cy) { return `${cx},${cy}`; }

  clear() { this.cells.clear(); }

  insert(obj, aabb) {
    const { cellSize } = this;
    const minCx = Math.floor(aabb.x / cellSize);
    const minCy = Math.floor(aabb.y / cellSize);
    const maxCx = Math.floor((aabb.x + aabb.w) / cellSize);
    const maxCy = Math.floor((aabb.y + aabb.h) / cellSize);
    for (let cy = minCy; cy <= maxCy; cy++) {
      for (let cx = minCx; cx <= maxCx; cx++) {
        const key = this._cellKey(cx, cy);
        let arr = this.cells.get(key);
        if (!arr) { arr = []; this.cells.set(key, arr); }
        arr.push(obj);
      }
    }
  }

  // Rebuild helper: clear cells then insert all items externally.
  // For dynamic objects, a full rebuild per frame is acceptable for small counts.

  query(aabb, out = []) {
    out.length = 0;
    this._tmpVisited.clear();
    const { cellSize } = this;
    const minCx = Math.floor(aabb.x / cellSize);
    const minCy = Math.floor(aabb.y / cellSize);
    const maxCx = Math.floor((aabb.x + aabb.w) / cellSize);
    const maxCy = Math.floor((aabb.y + aabb.h) / cellSize);
    for (let cy = minCy; cy <= maxCy; cy++) {
      for (let cx = minCx; cx <= maxCx; cx++) {
        const key = this._cellKey(cx, cy);
        const arr = this.cells.get(key);
        if (!arr) continue;
        for (let i = 0; i < arr.length; i++) {
          const obj = arr[i];
          // Avoid duplicates when objects span multiple cells by using a per-query visited set.
          if (this._tmpVisited.has(obj)) continue;
          this._tmpVisited.add(obj);
          out.push(obj);
        }
      }
    }
    return out;
  }
}

