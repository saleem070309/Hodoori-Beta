---
name: voxel-builder
description: >-
  Generate, construct, and validate 3D voxel models and layer-based JSON files compatible with Voxel Island 3D Studio (voxel_island_3d.html). Use whenever the user asks to create, build, or generate 3D voxel objects (e.g., sphere, pyramid, house, temple, tree, heart, animal, character, cup, sword, car, logo), export 3D layer models, or convert designs into Voxel Studio JSON format.
---

# 🧊 Voxel Builder Skill (مهارة بناء مجسمات الفوكسل ثلاثية الأبعاد)

This skill enables AI agents to design, compute, generate, and validate complete 3D voxel models formatted as JSON files ready for instant import into **Voxel Island 3D Studio** (`voxel_island_3d.html`).

---

## 📐 1. The Voxel Island JSON Architecture

Voxel Island Studio uses a **Layer-based 2D/3D representation** where a 3D model consists of a sequence of horizontal slicing planes (layers) stacked along the $Y$ axis.

### Coordinate System
- **Grid Size ($N$)**: Symmetrical dimension ($N \times N$, e.g., $4, 6, 7, 8, 10, 12, 14, 16$).
- **Offset Index**: $\text{offset} = \lfloor N / 2 \rfloor$.
- **$X$ Axis (Columns $c \in [0, N-1]$)**:
  $$X = c - \text{offset} + \text{centerOffset.x}$$
  Negative $X$ is West (Left), Positive $X$ is East (Right).
- **$Y$ Axis (Height $y \ge 1$)**:
  $$Y = y + \text{centerOffset.y}$$
  $Y=1$ is resting directly on top of the island grass.
- **$Z$ Axis (Rows $r \in [0, N-1]$)**:
  $$Z = r - \text{offset} + \text{centerOffset.z}$$
  Negative $Z$ is North (Back), Positive $Z$ is South (Front).

---

## 📋 2. Complete JSON Specification

```json
{
  "title": "اسم المجسم بالعربية أو الإنجليزية",
  "generator": "Voxel Island 3D Studio",
  "version": "3.5",
  "gridSize": 8,
  "centerOffset": { "x": 0, "y": 0, "z": 0 },
  "layers": [
    {
      "id": 1,
      "name": "طبقة 1: القاعدة (Y=1)",
      "y": 1,
      "grid": [
        [null, null, null, "#38bdf8", "#38bdf8", null, null, null],
        [null, null, "#38bdf8", "#38bdf8", "#38bdf8", "#38bdf8", null, null],
        [null, "#38bdf8", "#38bdf8", "#38bdf8", "#38bdf8", "#38bdf8", "#38bdf8", null],
        ["#38bdf8", "#38bdf8", "#38bdf8", "#38bdf8", "#38bdf8", "#38bdf8", "#38bdf8", "#38bdf8"],
        ["#38bdf8", "#38bdf8", "#38bdf8", "#38bdf8", "#38bdf8", "#38bdf8", "#38bdf8", "#38bdf8"],
        [null, "#38bdf8", "#38bdf8", "#38bdf8", "#38bdf8", "#38bdf8", "#38bdf8", null],
        [null, null, "#38bdf8", "#38bdf8", "#38bdf8", "#38bdf8", null, null],
        [null, null, null, "#38bdf8", "#38bdf8", null, null, null]
      ]
    }
  ]
}
```

> [!IMPORTANT]
> - `grid[r][c]` **MUST** be either a valid 6-character hex string starting with `#` (e.g. `"#f472b6"`) or `null` for empty air.
> - All rows in `grid` must have exactly `gridSize` columns, and `grid` must have exactly `gridSize` rows.
> - Layers **MUST** be sorted by `y` in ascending order ($y=1, 2, 3, \dots$).

---

## 🎨 3. Curated Color Palette

| Theme | Common Hex Colors |
| :--- | :--- |
| **Sakura & Pink** | `"#f472b6"` (Sakura), `"#fbcfe8"` (Soft Blossom), `"#db2777"` (Deep Magenta), `"#fff0f5"` (White Rose), `"#e11d48"` (Crimson) |
| **Nature & Wood** | `"#5a3220"` (Cherry Wood), `"#3d2014"` (Dark Bark), `"#7a4833"` (Oak), `"#4d7c0f"` (Dark Green), `"#22c55e"` (Vibrant Leaves) |
| **Elements & Gold** | `"#38bdf8"` (Water/Ice), `"#0284c7"` (Deep Ocean), `"#f59e0b"` (Gold/Lantern), `"#fef08a"` (Warm Glow), `"#64748b"` (Stone), `"#18181b"` (Charcoal) |
| **Pure Contrast** | `"#ffffff"` (White), `"#000000"` (Black) |

---

## 🧮 4. Procedural 3D Math Formulas

When generating geometric shapes, compute each cell $(r, c, y)$ by testing against 3D equations:

### 1. Solid Sphere (كرة مصمتة)
Center $(x_0, y_0, z_0)$ and Radius $R$:
$$\text{IsSolid}(x, y, z) = (x - x_0)^2 + (y - y_0)^2 + (z - z_0)^2 \le R^2$$

### 2. Hollow / Shell Sphere (كرة مجوفة)
$$(R - 0.9)^2 \le (x - x_0)^2 + (y - y_0)^2 + (z - z_0)^2 \le R^2$$

### 3. Cylinder / Column (أسطوانة أو برج)
Center $(x_0, z_0)$, Radius $R$, Height range $y \in [y_{min}, y_{max}]$:
$$\text{IsSolid}(x, y, z) = (x - x_0)^2 + (z - z_0)^2 \le R^2 \quad \text{and} \quad y_{min} \le y \le y_{max}$$

### 4. 3D Heart (قلب مجسم ثلاثي الأبعاد)
Normalize $u = (x-x_0)/R, v = (y-y_0)/R, w = (z-z_0)/R$:
$$(u^2 + \frac{9}{4}v^2 + w^2 - 1)^3 - u^2 w^3 - \frac{9}{80} v^2 w^3 \le 0$$

### 5. Stepped Pyramid (هرم مدرج)
$$\max(|x - x_0|, |z - z_0|) \le (y_{max} - y)$$

### 6. Torus / Donut (دونات)
Major radius $R_{major}$, tube radius $r_{tube}$:
$$\left(\sqrt{(x-x_0)^2 + (z-z_0)^2} - R_{major}\right)^2 + (y-y_0)^2 \le r_{tube}^2$$

---

## ⚡ 5. Built-in Generator Script

The skill includes a Node.js generator script located at:
`d:/Hodoori-Beta/.agents/skills/voxel-builder/scripts/generate_voxel_model.js`

### CLI Usage:
```bash
# Generate a solid blue sphere (8x8)
node d:/Hodoori-Beta/.agents/skills/voxel-builder/scripts/generate_voxel_model.js --shape sphere --size 8 --color "#38bdf8" --output d:/Hodoori-Beta/plant/models/sphere.json

# Generate a 3D heart
node d:/Hodoori-Beta/.agents/skills/voxel-builder/scripts/generate_voxel_model.js --shape heart --size 8 --output d:/Hodoori-Beta/plant/models/heart.json

# Generate a golden pyramid
node d:/Hodoori-Beta/.agents/skills/voxel-builder/scripts/generate_voxel_model.js --shape pyramid --size 8 --output d:/Hodoori-Beta/plant/models/pyramid.json

# Generate a cozy cottage house
node d:/Hodoori-Beta/.agents/skills/voxel-builder/scripts/generate_voxel_model.js --shape house --size 8 --output d:/Hodoori-Beta/plant/models/house.json

# Generate a coffee cup with steam
node d:/Hodoori-Beta/.agents/skills/voxel-builder/scripts/generate_voxel_model.js --shape cup --size 8 --output d:/Hodoori-Beta/plant/models/cup.json
```

---

## 🛠️ 6. Step-by-Step Procedure for the Agent

When the user asks to build any 3D model (e.g. "اصنع لي مجسم كرة" or "Generate a 3D car"):

1. **Determine Grid Size & Layers Count**:
   - Small items: `gridSize: 8` with 6-8 layers.
   - Detailed items: `gridSize: 10` or `12` with 8-14 layers.
2. **Compute or Write the Voxel Data**:
   - Run the script `generate_voxel_model.js` or write a custom layer array.
   - Apply appropriate thematic colors and gradients.
3. **Save the File**:
   - Write the JSON file directly to workspace (e.g., `d:/Hodoori-Beta/plant/models/<name>.json`).
4. **Present the Model to User**:
   - Provide a clickable file link (e.g. [`models/sphere_blue_8x8.json`](file:///d:/Hodoori-Beta/plant/models/sphere_blue_8x8.json)).
   - Explain how they can import it into [`voxel_island_3d.html`](file:///d:/Hodoori-Beta/plant/voxel_island_3d.html) via the **📂 استيراد JSON** button for an instant 3D morph transition!
