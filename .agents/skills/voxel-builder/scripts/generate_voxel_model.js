/**
 * Voxel Model Generator CLI & Utility
 * Generates valid JSON models for Voxel Island 3D Studio (voxel_island_3d.html)
 */

const fs = require('fs');

function createEmptyGrid(size) {
    return Array(size).fill(null).map(() => Array(size).fill(null));
}

function generateSphere(gridSize = 8, color = '#38bdf8', hollow = false) {
    const offset = Math.floor(gridSize / 2);
    const radius = (gridSize - 1) / 2.05;
    const layers = [];
    const height = gridSize;

    for (let y = 1; y <= height; y++) {
        const grid = createEmptyGrid(gridSize);
        const vy = y - offset - 0.5;

        for (let r = 0; r < gridSize; r++) {
            for (let c = 0; c < gridSize; c++) {
                const vx = c - offset + 0.5;
                const vz = r - offset + 0.5;
                const distSq = vx * vx + vy * vy + vz * vz;

                if (hollow) {
                    if (distSq <= radius * radius && distSq >= (radius - 1.1) * (radius - 1.1)) {
                        grid[r][c] = color;
                    }
                } else {
                    if (distSq <= radius * radius) {
                        grid[r][c] = y > height * 0.7 ? '#bae6fd' : (y < height * 0.3 ? '#0284c7' : color);
                    }
                }
            }
        }

        layers.push({
            id: y,
            name: `طبقة ${y} (Y=${y})`,
            y: y,
            grid: grid
        });
    }

    return {
        title: hollow ? 'كرة مجوفة ثلاثية الأبعاد' : 'كرة زرقاء متدرجة 3D',
        generator: 'Voxel Island 3D Studio - Generator',
        version: '3.5',
        gridSize: gridSize,
        centerOffset: { x: 0, y: 0, z: 0 },
        layers: layers
    };
}

function generate3DHeart(gridSize = 8) {
    const offset = Math.floor(gridSize / 2);
    const layers = [];
    const height = 8;
    const R = 3.2;

    for (let y = 1; y <= height; y++) {
        const grid = createEmptyGrid(gridSize);
        const v = (y - 3.8) / R;

        for (let r = 0; r < gridSize; r++) {
            for (let c = 0; c < gridSize; c++) {
                const u = (c - offset + 0.5) / R;
                const w = (r - offset + 0.5) / R;

                const a = u * u + 2.25 * v * v + w * w - 1.0;
                const val = a * a * a - u * u * w * w * w - 0.11 * v * v * w * w * w;

                if (val <= 0.05) {
                    const color = y >= 6 ? '#fda4af' : (y <= 2 ? '#9f1239' : '#e11d48');
                    grid[r][c] = color;
                }
            }
        }

        layers.push({
            id: y,
            name: `طبقة ${y} (Y=${y})`,
            y: y,
            grid: grid
        });
    }

    return {
        title: 'قلب ياقوتي ثلاثي الأبعاد (3D Ruby Heart)',
        generator: 'Voxel Island 3D Studio - Generator',
        version: '3.5',
        gridSize: gridSize,
        centerOffset: { x: 0, y: 0, z: 0 },
        layers: layers
    };
}

function generatePyramid(gridSize = 8) {
    const layers = [];
    const height = Math.floor(gridSize / 2) + 1;

    for (let y = 1; y <= height; y++) {
        const grid = createEmptyGrid(gridSize);
        const margin = y - 1;

        for (let r = margin; r < gridSize - margin; r++) {
            for (let c = margin; c < gridSize - margin; c++) {
                if (y === height) {
                    grid[r][c] = '#fef08a'; // Glowing Golden Capstone
                } else if (r === margin || r === gridSize - margin - 1 || c === margin || c === gridSize - margin - 1) {
                    grid[r][c] = '#d97706'; // Terracotta Border
                } else {
                    grid[r][c] = '#f59e0b'; // Gold Sandstone
                }
            }
        }

        layers.push({
            id: y,
            name: `طبقة ${y} (Y=${y})`,
            y: y,
            grid: grid
        });
    }

    return {
        title: 'هرم ذهبي مدرج (Golden Stepped Pyramid)',
        generator: 'Voxel Island 3D Studio - Generator',
        version: '3.5',
        gridSize: gridSize,
        centerOffset: { x: 0, y: 0, z: 0 },
        layers: layers
    };
}

function generateHouse(gridSize = 8) {
    const layers = [];
    
    // Layer 1: Floor & Door threshold
    const l1 = createEmptyGrid(gridSize);
    for (let r = 1; r < 7; r++) {
        for (let c = 1; c < 7; c++) {
            l1[r][c] = (r === 6 && (c === 3 || c === 4)) ? '#3d2014' : '#5a3220';
        }
    }
    layers.push({ id: 1, name: 'طبقة 1: الأساس والأرضية', y: 1, grid: l1 });

    // Layer 2: Walls & Door Opening
    const l2 = createEmptyGrid(gridSize);
    for (let r = 1; r < 7; r++) {
        for (let c = 1; c < 7; c++) {
            if (r === 1 || r === 6 || c === 1 || c === 6) {
                if (r === 6 && (c === 3 || c === 4)) {
                    l2[r][c] = null; // Door opening
                } else if ((r === 1 || r === 6) && (c === 1 || c === 6)) {
                    l2[r][c] = '#3d2014'; // Wooden corner pillar
                } else {
                    l2[r][c] = '#f5ebe0'; // Plaster wall
                }
            }
        }
    }
    layers.push({ id: 2, name: 'طبقة 2: الجدران والباب', y: 2, grid: l2 });

    // Layer 3: Walls & Glass Windows
    const l3 = createEmptyGrid(gridSize);
    for (let r = 1; r < 7; r++) {
        for (let c = 1; c < 7; c++) {
            if (r === 1 || r === 6 || c === 1 || c === 6) {
                if ((c === 1 || c === 6) && (r === 3 || r === 4)) {
                    l3[r][c] = '#38bdf8'; // Glass window
                } else if ((r === 1 || r === 6) && (c === 1 || c === 6)) {
                    l3[r][c] = '#3d2014';
                } else {
                    l3[r][c] = '#f5ebe0';
                }
            }
        }
    }
    layers.push({ id: 3, name: 'طبقة 3: النوافذ', y: 3, grid: l3 });

    // Layer 4: Roof Eaves
    const l4 = createEmptyGrid(gridSize);
    for (let r = 0; r < 8; r++) {
        for (let c = 0; c < 8; c++) {
            if (r === 0 || r === 7 || c === 0 || c === 7) {
                l4[r][c] = '#b91c1c'; // Red clay tiles
            } else if (r === 1 || r === 6 || c === 1 || c === 6) {
                l4[r][c] = '#991b1b';
            }
        }
    }
    layers.push({ id: 4, name: 'طبقة 4: سقف القرميد الأساسي', y: 4, grid: l4 });

    // Layer 5: Sloped Roof Middle
    const l5 = createEmptyGrid(gridSize);
    for (let r = 1; r < 7; r++) {
        for (let c = 1; c < 7; c++) {
            l5[r][c] = '#dc2626';
        }
    }
    layers.push({ id: 5, name: 'طبقة 5: سقف القرميد الأوسط', y: 5, grid: l5 });

    // Layer 6: Roof Ridge & Chimney
    const l6 = createEmptyGrid(gridSize);
    for (let r = 2; r < 6; r++) {
        for (let c = 3; c < 5; c++) {
            l6[r][c] = '#ef4444';
        }
    }
    l6[2][2] = '#52525b'; // Stone Chimney
    layers.push({ id: 6, name: 'طبقة 6: قمة السقف والمدخنة', y: 6, grid: l6 });

    // Layer 7: Smoke puff
    const l7 = createEmptyGrid(gridSize);
    l7[2][2] = '#e4e4e7'; // Chimney smoke
    layers.push({ id: 7, name: 'طبقة 7: دخان المدخنة', y: 7, grid: l7 });

    return {
        title: 'بيت ريفي بقرميد أحمر ومدخنة (Cozy Cottage)',
        generator: 'Voxel Island 3D Studio - Generator',
        version: '3.5',
        gridSize: gridSize,
        centerOffset: { x: 0, y: 0, z: 0 },
        layers: layers
    };
}

function generateCoffeeCup(gridSize = 8) {
    const layers = [];
    
    // Layer 1: Saucer plate
    const l1 = createEmptyGrid(gridSize);
    for (let r = 1; r < 7; r++) {
        for (let c = 1; c < 7; c++) {
            l1[r][c] = '#ffffff';
        }
    }
    layers.push({ id: 1, name: 'طبقة 1: صحن الفنجان', y: 1, grid: l1 });

    // Layer 2: Cup bottom
    const l2 = createEmptyGrid(gridSize);
    for (let r = 2; r < 6; r++) {
        for (let c = 2; c < 6; c++) {
            l2[r][c] = '#18181b';
        }
    }
    layers.push({ id: 2, name: 'طبقة 2: قاعدة الفنجان', y: 2, grid: l2 });

    // Layer 3: Cup middle with handle
    const l3 = createEmptyGrid(gridSize);
    for (let r = 2; r < 6; r++) {
        for (let c = 2; c < 6; c++) {
            if (r === 2 || r === 5 || c === 2 || c === 5) {
                l3[r][c] = '#18181b';
            } else {
                l3[r][c] = '#78350f'; // Dark Espresso Coffee
            }
        }
    }
    l3[3][6] = '#18181b'; // Cup Handle
    l3[4][6] = '#18181b';
    layers.push({ id: 3, name: 'طبقة 3: القهوة والمقبض', y: 3, grid: l3 });

    // Layer 4: Cup rim & Coffee foam
    const l4 = createEmptyGrid(gridSize);
    for (let r = 2; r < 6; r++) {
        for (let c = 2; c < 6; c++) {
            if (r === 2 || r === 5 || c === 2 || c === 5) {
                l4[r][c] = '#ffffff';
            } else {
                l4[r][c] = '#fef3c7'; // Creamy Foam Art
            }
        }
    }
    layers.push({ id: 4, name: 'طبقة 4: رغوة الكابتشينو', y: 4, grid: l4 });

    // Layer 5 & 6: Rising steam
    const l5 = createEmptyGrid(gridSize);
    l5[3][3] = '#e4e4e7';
    l5[4][4] = '#e4e4e7';
    layers.push({ id: 5, name: 'طبقة 5: بخار القهوة الساخن', y: 5, grid: l5 });

    const l6 = createEmptyGrid(gridSize);
    l6[3][4] = '#d4d4d8';
    layers.push({ id: 6, name: 'طبقة 6: قمة البخار', y: 6, grid: l6 });

    return {
        title: 'فنجان قهوة وبخار دافئ (Coffee Mug)',
        generator: 'Voxel Island 3D Studio - Generator',
        version: '3.5',
        gridSize: gridSize,
        centerOffset: { x: 0, y: 0, z: 0 },
        layers: layers
    };
}

module.exports = {
    generateSphere,
    generate3DHeart,
    generatePyramid,
    generateHouse,
    generateCoffeeCup
};

// CLI Execution
if (require.main === module) {
    const args = process.argv.slice(2);
    const getArg = (name, def) => {
        const idx = args.indexOf(name);
        return idx !== -1 && args[idx + 1] ? args[idx + 1] : def;
    };

    const shapeArg = getArg('--shape', 'sphere');
    const sizeArg = parseInt(getArg('--size', '8'), 10);
    const colorArg = getArg('--color', '#38bdf8');
    const outArg = getArg('--output', null);

    let model;
    if (shapeArg === 'sphere') model = generateSphere(sizeArg, colorArg, false);
    else if (shapeArg === 'hollow-sphere') model = generateSphere(sizeArg, colorArg, true);
    else if (shapeArg === 'heart') model = generate3DHeart(sizeArg);
    else if (shapeArg === 'pyramid') model = generatePyramid(sizeArg);
    else if (shapeArg === 'house') model = generateHouse(sizeArg);
    else if (shapeArg === 'cup') model = generateCoffeeCup(sizeArg);
    else model = generateSphere(sizeArg, colorArg, false);

    const jsonStr = JSON.stringify(model, null, 2);

    if (outArg) {
        fs.writeFileSync(outArg, jsonStr, 'utf8');
        console.log(`Successfully generated ${model.title} -> ${outArg}`);
    } else {
        console.log(jsonStr);
    }
}
