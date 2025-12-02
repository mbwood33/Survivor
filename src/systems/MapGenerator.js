import { RNG } from "../utils/RNG.js";

export class MapGenerator {
    constructor(width, height, tileSize = 16) {
        this.width = width;
        this.height = height;
        this.tileSize = tileSize;
        this.grid = []; // 0 = Empty/Sand, 1 = Grass
        this.biomeGrid = []; // Stores the offset (0, 48, 96) for each cell
        this.rng = new RNG(Date.now());

        // Biome Definitions
        this.BIOME_OFFSETS = [0, 48, 96];

        // New Sand/Dirt Mappings per Biome
        this.SAND_TILES = {
            0: [6, 7, 8],
            48: [22, 23, 24],
            96: [38, 39, 40]
        };

        // Bitmask Lookup Table (Sum -> Tile ID)
        // 1=N, 2=W, 4=E, 8=S
        this.TILE_TABLE = {
            0: [4, 5],
            1: 21,
            2: 20,
            3: 21,
            4: 21,
            5: 20,
            6: 2,
            7: 2,
            8: 5,
            9: 19,
            10: 5,
            11: 17,  // N+W+S  (open to E)
            12: 4,
            13: 19,  // N+E+S  (open to W) OR 0 if you prefer
            14: 34,
            15: 0
        };
    }

    generate() {
        this.grid = [];
        this.biomeGrid = [];

        // 1. Initialize Grids with Random Noise
        for (let y = 0; y < this.height; y++) {
            let row = [];
            let biomeRow = [];
            for (let x = 0; x < this.width; x++) {
                // Terrain: 60% chance to be grass
                row.push(this.rng.next() < 0.60 ? 1 : 0);

                // Biome: Equal chance for Spring, Summer, Forest
                let r = Math.floor(this.rng.next() * 3);
                biomeRow.push(this.BIOME_OFFSETS[r]);
            }
            this.grid.push(row);
            this.biomeGrid.push(biomeRow);
        }

        // 2. Smooth Biomes into Chunks
        for (let i = 0; i < 10; i++) this.smoothBiomes();

        // 3. Smooth Terrain (Grass/Dirt)
        for (let i = 0; i < 3; i++) this.smoothMap();

        // 4. Cleanup (Cut bridges, eat tails, remove dust)
        this.cleanupMap();

        return this.generateLayers();
    }

    // ... (keep smoothBiomes, smoothMap, cleanupMap, prune*, getAliveNeighborCount, psuedoRandom, cell, getAutotileID as is)

    generateLayers() {
        // Returns objects with 2D arrays for base and overlay layers
        const base = [];
        const overlay = [];

        for (let y = 0; y < this.height; y++) {
            const baseRow = [];
            const overlayRow = [];

            for (let x = 0; x < this.width; x++) {
                const biomeOffset = this.biomeGrid[y][x];

                // 1. Base Layer: Always Dirt/Sand
                let randIndex = Math.floor(this.psuedoRandom(x, y) * 3);
                let validSandIds = this.SAND_TILES[biomeOffset] || this.SAND_TILES[0];
                baseRow.push(validSandIds[randIndex]);

                // 2. Overlay Layer: Grass or Empty
                if (this.grid[y][x] === 1) {
                    // Grass
                    let genericId = this.getAutotileID(x, y);
                    let tileId = genericId + biomeOffset;

                    // Apply Variance to Solid Grass (Generic ID 0)
                    if (genericId === 0) {
                        let grassVariant = Math.floor(this.psuedoRandom(x, y) * 3); // 0, 1, 2
                        tileId += (grassVariant * 16); // +0, +16, or +32
                    }
                    overlayRow.push(tileId);
                } else {
                    // Empty
                    overlayRow.push(-1);
                }
            }
            base.push(baseRow);
            overlay.push(overlayRow);
        }
        return { base, overlay };
    }

    smoothBiomes() {
        let newBiomeGrid = JSON.parse(JSON.stringify(this.biomeGrid));

        for (let y = 0; y < this.height; y++) {
            for (let x = 0; x < this.width; x++) {

                // Count neighbors
                let counts = { 0: 0, 48: 0, 96: 0 };

                for (let i = -1; i <= 1; i++) {
                    for (let j = -1; j <= 1; j++) {
                        let ny = y + i;
                        let nx = x + j;

                        if (nx >= 0 && nx < this.width && ny >= 0 && ny < this.height) {
                            let val = this.biomeGrid[ny][nx];
                            counts[val]++;
                        }
                    }
                }

                // Find the dominant biome in this 3x3 area
                let maxCount = -1;
                let dominantBiome = this.biomeGrid[y][x];

                for (let biome in counts) {
                    if (counts[biome] > maxCount) {
                        maxCount = counts[biome];
                        dominantBiome = parseInt(biome);
                    }
                }

                newBiomeGrid[y][x] = dominantBiome;
            }
        }
        this.biomeGrid = newBiomeGrid;
    }

    smoothMap() {
        let newGrid = JSON.parse(JSON.stringify(this.grid));

        for (let y = 0; y < this.height; y++) {
            for (let x = 0; x < this.width; x++) {
                let neighbors = this.getAliveNeighborCount(x, y);

                if (neighbors > 4) {
                    newGrid[y][x] = 1;
                } else if (neighbors < 4) {
                    newGrid[y][x] = 0;
                }
            }
        }
        this.grid = newGrid;
    }

    cleanupMap() {
        // 1. Cut thin bridges first to separate clumps
        this.pruneBridges();
        // 2. Eat back protrusions/tails caused by cutting
        this.pruneProtrusions();
        // 3. Remove any remaining small dust
        this.pruneIslands();
    }

    pruneBridges() {
        for (let y = 0; y < this.height; y++) {
            for (let x = 0; x < this.width; x++) {
                if (this.grid[y][x] === 1) {
                    const N = this.cell(x, y - 1);
                    const S = this.cell(x, y + 1);
                    const W = this.cell(x - 1, y);
                    const E = this.cell(x + 1, y);

                    // Horizontal Bridge (East + West only)
                    if (W && E && !N && !S) {
                        this.grid[y][x] = 0;
                    }
                    // Vertical Bridge (North + South only)
                    else if (N && S && !W && !E) {
                        this.grid[y][x] = 0;
                    }
                }
            }
        }
    }

    pruneProtrusions() {
        let changed = true;
        while (changed) {
            changed = false;
            for (let y = 0; y < this.height; y++) {
                for (let x = 0; x < this.width; x++) {
                    if (this.grid[y][x] === 1) {
                        let neighbors = 0;
                        if (this.cell(x, y - 1)) neighbors++;
                        if (this.cell(x, y + 1)) neighbors++;
                        if (this.cell(x - 1, y)) neighbors++;
                        if (this.cell(x + 1, y)) neighbors++;

                        if (neighbors <= 1) {
                            this.grid[y][x] = 0;
                            changed = true;
                        }
                    }
                }
            }
        }
    }

    pruneIslands() {
        const THRESHOLD = 5;
        let visited = Array(this.height).fill().map(() => Array(this.width).fill(false));

        for (let y = 0; y < this.height; y++) {
            for (let x = 0; x < this.width; x++) {
                if (this.grid[y][x] === 1 && !visited[y][x]) {
                    let cells = [];
                    let stack = [[x, y]];
                    visited[y][x] = true;

                    while (stack.length) {
                        let [cx, cy] = stack.pop();
                        cells.push([cx, cy]);

                        [[0, 1], [0, -1], [1, 0], [-1, 0]].forEach(([dx, dy]) => {
                            let nx = cx + dx;
                            let ny = cy + dy;
                            if (nx >= 0 && nx < this.width && ny >= 0 && ny < this.height) {
                                if (this.grid[ny][nx] === 1 && !visited[ny][nx]) {
                                    visited[ny][nx] = true;
                                    stack.push([nx, ny]);
                                }
                            }
                        });
                    }

                    if (cells.length < THRESHOLD) {
                        cells.forEach(([cx, cy]) => {
                            this.grid[cy][cx] = 0;
                        });
                    }
                }
            }
        }
    }

    getAliveNeighborCount(x, y) {
        let count = 0;
        for (let i = -1; i <= 1; i++) {
            for (let j = -1; j <= 1; j++) {
                if (i === 0 && j === 0) continue;

                let checkX = x + j;
                let checkY = y + i;

                if (checkX < 0 || checkY < 0 || checkX >= this.width || checkY >= this.height) {
                    count = count + 0;
                } else {
                    count = count + this.grid[checkY][checkX];
                }
            }
        }
        return count;
    }

    psuedoRandom(x, y) {
        return Math.abs(Math.sin(x * 12.9898 + y * 78.233) * 43758.5453) % 1;
    }

    cell(x, y) {
        if (x < 0 || y < 0 || x >= this.width || y >= this.height) return 0;
        return this.grid[y][x];
    }

    getAutotileID(x, y) {
        const N = this.cell(x, y - 1);
        const S = this.cell(x, y + 1);
        const W = this.cell(x - 1, y);
        const E = this.cell(x + 1, y);

        const mask = (N * 1) + (W * 2) + (E * 4) + (S * 8);

        let finalId = this.TILE_TABLE[mask];

        if (Array.isArray(finalId)) {
            finalId = finalId[Math.floor(this.psuedoRandom(x, y) * finalId.length)];
        }

        if (mask === 15) {
            const NE = this.cell(x + 1, y - 1);
            const NW = this.cell(x - 1, y - 1);
            const SE = this.cell(x + 1, y + 1);
            const SW = this.cell(x - 1, y + 1);

            if (!SE) return 1;
            if (!SW) return 3;
            if (!NE) return 33;
            if (!NW) return 35;
        }

        return finalId;
    }


}
