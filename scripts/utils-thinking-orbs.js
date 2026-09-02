/**
 * Official Jakub Antalík Thinking Orbs Engine for Browser (orbs.jakubantalik.com)
 * Standalone 2D Canvas Renderer for AI Thinking States
 */
(function (global) {
    'use strict';

    function lerp(n, s, t) { return n + (s - n) * t; }
    function fract(n) { return n - Math.floor(n); }

    function noise2D(n, s) {
        const t = Math.floor(n), r = Math.floor(s);
        let a = n - t, o = s - r;
        a = a * a * (3 - 2 * a);
        o = o * o * (3 - 2 * o);
        const c = hash(t, r), M = hash(t + 1, r), h = hash(t, r + 1), m = hash(t + 1, r + 1);
        return c + (M - c) * a + (h - c) * o + (c - M - h + m) * a * o;
    }

    function hash(n, s) {
        const t = Math.sin(n * 12.9898 + s * 78.233) * 43758.5453;
        return t - Math.floor(t);
    }

    function fibonacciSphere(n, s) {
        const t = Math.PI * (3 - Math.sqrt(5)), r = 1 - 2 * (n + 0.5) / s, a = Math.sqrt(Math.max(0, 1 - r * r)), o = n * t;
        return [a * Math.cos(o), r, a * Math.sin(o)];
    }

    function angleDiff(n, s) {
        return Math.atan2(Math.sin(n - s), Math.cos(n - s));
    }

    function makeProj(n, s, t, r, a) {
        const o = Math.sin(s), c = Math.cos(s), M = Math.sin(n), h = Math.cos(n);
        return (m, D, p) => {
            const e = m * h + p * M, l = -m * M + p * h, R = D * c - l * o, w = D * o + l * c;
            return [t + e * a, r - R * a, w];
        };
    }

    function paintDots(ctx, dots, isDark) {
        for (let i = 0; i < dots.length; i++) {
            const a = dots[i];
            const alpha = a.a !== undefined ? a.a : 1;
            const c = Math.min(1, Math.max(0, a.white));
            // Dark mode: crisp pure white / silver dots (val ~ 153..255)
            // Light mode: deep warm charcoal / black ink dots (val ~ 25..85)
            const val = isDark
                ? Math.round((1 - c * 0.4) * 255)
                : Math.round((0.10 + c * 0.22) * 255);
            ctx.fillStyle = `rgba(${val},${val},${val},${alpha})`;
            ctx.beginPath();
            ctx.arc(a.x, a.y, Math.max(0.35, a.r), 0, Math.PI * 2);
            ctx.fill();
        }
    }

    function paintLines(ctx, lines, isDark) {
        for (let i = 0; i < lines.length; i++) {
            const r = lines[i];
            const alpha = r.a !== undefined ? r.a : 1;
            const o = Math.min(1, Math.max(0, r.white));
            const c = isDark
                ? Math.round((1 - o * 0.4) * 255)
                : Math.round((0.10 + o * 0.22) * 255);
            ctx.strokeStyle = `rgba(${c},${c},${c},${alpha})`;
            ctx.lineWidth = r.w || 1;
            ctx.beginPath();
            ctx.moveTo(r.x1, r.y1);
            ctx.lineTo(r.x2, r.y2);
            ctx.stroke();
        }
    }

    function finalizeFrame(dots, lines, rMin = 0.3) {
        const r = [];
        for (let i = 0; i < dots.length; i++) {
            const a = dots[i];
            if ((a.a !== undefined ? a.a : 1) >= 0.02) {
                a.r = Math.max(rMin, a.r);
                r.push(a);
            }
        }
        r.sort((a, o) => a.z - o.z);
        return { dots: r, lines: lines.filter(a => (a.a !== undefined ? a.a : 1) >= 0.02) };
    }

    function radiusScale(n, s = 0.6) {
        return Math.pow(n / 300, s);
    }

    // ─── Mode Drawers ───
    const MODES = {
        // Solving (Rubik bands)
        rubik(sz, t, opts) {
            const r = sz / 2, a = sz / 2, o = sz / 2 * 0.82;
            const c = makeProj(t * 0.55, 0.35 + 0.1 * Math.sin(t * 0.9), r, a, o);
            const M = radiusScale(sz, opts.rsPow || 0.6);
            const dots = [];
            const e = opts.latRings || 15, l = opts.lonDensity || 40;
            for (let R = 0; R <= e; R++) {
                const w = -Math.PI / 2 + R / e * Math.PI, i = Math.cos(w), u = Math.sin(w);
                const y = Math.max(1, Math.round(Math.abs(i) * l));
                for (let b = 0; b < y; b++) {
                    const f = b / y * 2 * Math.PI;
                    const P = i * Math.cos(f), x = u, g = i * Math.sin(f);
                    const [v, k, N] = c(P, x, g);
                    const z = (N + 1) / 2;
                    dots.push({
                        x: v, y: k, z: N,
                        r: ((opts.rBase || 0.6) + (opts.rDepth || 1.7) * z) * M,
                        white: (opts.inkFar || 0.62) - (opts.inkSpan || 0.54) * z,
                        a: 0.3 + 0.7 * z
                    });
                }
            }
            return finalizeFrame(dots, [], opts.rMin);
        },

        // Searching (Globe Scan)
        globe(sz, t, opts) {
            const a = sz / 2, o = sz / 2, c = sz / 2 * 0.82;
            const M = 0.4 + 0.06 * Math.sin(t * 0.35);
            const h = makeProj(t * 0.5, M, a, o, c);
            const m = t * (0.5 + 1.2 * (opts.scanMul || 1));
            const D = radiusScale(sz, opts.rsPow || 0.6);
            const p = opts.dimBase || 0.45;
            const dots = [];
            const l = opts.latRings || 17, R = opts.lonDensity || 44;
            for (let w = 0; w <= l; w++) {
                const i = -Math.PI / 2 + w / l * Math.PI, u = Math.cos(i), y = Math.sin(i);
                const b = Math.max(1, Math.round(Math.abs(u) * R));
                for (let f = 0; f < b; f++) {
                    const P = f / b * 2 * Math.PI;
                    const [x, g, d] = h(u * Math.cos(P), y, u * Math.sin(P));
                    const v = (d + 1) / 2;
                    const k = angleDiff(P + t * 0.5, m);
                    const N = Math.exp(-(k * k) / 0.18) * Math.max(0, d);
                    dots.push({
                        x, y: g, z: d,
                        r: ((opts.rBase || 0.6) + (opts.rDepth || 1.7) * v + (opts.rBoost || 1) * N) * D,
                        white: (opts.inkFar || 0.62) - (opts.inkSpan || 0.54) * v,
                        a: p + (1 - p) * Math.min(1, N)
                    });
                }
            }
            return finalizeFrame(dots, [], opts.rMin);
        },

        // Working (Tilted Orbits)
        orbits(sz, t, opts) {
            const r = sz / 2, a = sz / 2, o = sz / 2 * 0.82;
            const c = makeProj(t * 0.12, 0.3, r, a, 1);
            const M = radiusScale(sz, opts.rsPow || 0.6);
            const dots = [];
            const m = opts.orbitN || 12, D = opts.ghostN || 40, p = opts.particles || 3;
            for (let e = 0; e < m; e++) {
                const l = hash(e, 1.7), R = hash(e, 5.2), w = hash(e, 8.9);
                const i = o * (0.45 + 0.52 * l), u = l * 2 * Math.PI, y = Math.acos(2 * R - 1);
                const b = Math.sin(y) * Math.cos(u), f = Math.cos(y), P = Math.sin(y) * Math.sin(u);
                let x = -f, g = b;
                const v = Math.max(1e-6, Math.sqrt(x * x + g * g));
                x /= v; g /= v;
                const k = f * 0 - P * g, N = P * x - b * 0, z = b * g - f * x;
                const O = (0.25 + 0.55 * w) * (w > 0.5 ? 1 : -1);
                for (let B = 0; B < D; B++) {
                    const I = B / D * 2 * Math.PI;
                    const [S, A, T] = c((x * Math.cos(I) + k * Math.sin(I)) * i, (g * Math.cos(I) + N * Math.sin(I)) * i, (z * Math.sin(I)) * i);
                    const C = (T / i + 1) / 2;
                    dots.push({ x: S, y: A, z: T, r: (opts.ghostR || 0.9) * M, white: 0.72, a: (opts.ghostA || 0.5) * (0.4 + 0.6 * C) });
                }
                for (let B = 0; B < p; B++) {
                    const I = t * O + B / p * 2 * Math.PI + R * 6;
                    const [S, A, T] = c((x * Math.cos(I) + k * Math.sin(I)) * i, (g * Math.cos(I) + N * Math.sin(I)) * i, (z * Math.sin(I)) * i);
                    const C = (T / i + 1) / 2;
                    dots.push({ x: S, y: A, z: T, r: ((opts.partR || 1.2) + (opts.partRDepth || 1.6) * C) * M, white: 0.3 - 0.22 * C, a: 0.9 });
                }
            }
            return finalizeFrame(dots, [], opts.rMin);
        },

        // Composing (Ribbon Sash)
        ribbon(sz, t, opts) {
            const r = sz / 2, a = sz / 2, o = sz / 2 * 0.78, c = opts.spin !== undefined ? opts.spin : 1;
            const M = 0.3, h = makeProj(t * 0.1 * c, M, r, a, 1);
            const m = radiusScale(sz, opts.rsPow || 0.6);
            const dots = [];
            const e = t * 0.24 * c, l = 0.55 + 0.3 * Math.sin(t * 0.18) * c;
            const R = Math.cos(e), i = Math.sin(e), u = -i * Math.sin(l), y = Math.cos(l), b = R * Math.sin(l);
            const f = -i * y, P = i * u - R * b, x = R * y;
            const g = 0.23 * (opts.wobMul || 1), d = o, v = opts.lanes || 5, k = opts.segs || 88;
            const N = Math.max(1, Math.round(v * (opts.bandMul || 1)));
            for (let z = 0; z < N; z++) {
                const O = (z - (N - 1) / 2) * 0.075, B = Math.abs(z - (N - 1) / 2) / Math.max(1, (N - 1) / 2);
                for (let I = 0; I < k; I++) {
                    const S = I / k * 2 * Math.PI;
                    const A = (0.16 * Math.sin(S * 3 - t * 1.7 + z * 0.22) + 0.07 * Math.sin(S * 5 + t * 1.1)) * (opts.wobMul || 1);
                    const q = R * Math.cos(S) + u * Math.sin(S) + f * (O + A);
                    const F = y * Math.sin(S) + P * (O + A);
                    const j = i * Math.cos(S) + b * Math.sin(S) + x * (O + A);
                    const W = Math.sqrt(q * q + F * F + j * j), Y = d, [ct, at, X] = h(q / W * Y, F / W * Y, j / W * Y), K = (X / o + 1) / 2;
                    dots.push({
                        x: ct, y: at, z: X,
                        r: ((opts.rBase || 1.1) + (opts.rDepth || 1.7) * K) * (1 - 0.25 * B) * m,
                        white: 0.52 - 0.44 * K + 0.18 * B,
                        a: 0.4 + 0.6 * K
                    });
                }
            }
            return finalizeFrame(dots, [], opts.rMin);
        },

        // Shaping (Morphing Outline)
        morph(sz, t, opts) {
            const r = sz / 2, a = sz / 2;
            const dots = [];
            const angle = t * 1.5;
            const count = 28;
            for (let i = 0; i < count; i++) {
                const frac = i / count;
                const rad = angle + frac * Math.PI * 2;
                const dist = (sz * 0.36) * (1 + 0.08 * Math.sin(rad * 3 + t * 2));
                dots.push({
                    x: r + Math.cos(rad) * dist,
                    y: a + Math.sin(rad) * dist,
                    z: 0,
                    r: 1.6,
                    white: 0.2,
                    a: 0.85
                });
            }
            return finalizeFrame(dots, [], 0.3);
        }
    };

    const STATE_MAP = {
        solving: 'rubik',
        searching: 'globe',
        working: 'orbits',
        composing: 'ribbon',
        shaping: 'morph',
        connecting: 'orbits',
        listening: 'globe',
        weaving: 'rubik',
        breathing: 'ribbon'
    };

    const SPEEDS = {
        rubik: 1.1,
        globe: 1.15,      // Calmed down from 2.65 for smooth, cinematic scanning
        orbits: 1.35,     // Calmed down from 3.2 for elegant orbiting
        ribbon: 1.25,     // Calmed down from 2.8 for gentle thinking flow
        morph: 1.05
    };

    // ─── Active Orb Canvases Registry ───
    const activeOrbs = new Map();
    let animFrameId = null;

    function renderLoop(time) {
        animFrameId = requestAnimationFrame(renderLoop);
        const tSec = time / 1000;

        activeOrbs.forEach((orb) => {
            if (!orb.canvas || !orb.canvas.isConnected) return;
            const isDark = document.documentElement.classList.contains('theme-dark-orange') ||
                           document.documentElement.classList.contains('dark') ||
                           document.body.classList.contains('theme-dark-orange') ||
                           document.body.classList.contains('dark') ||
                           (localStorage.getItem('admin_theme_mode') === 'dark-orange' || localStorage.getItem('admin_theme_mode') === 'dark');
            const ctx = orb.ctx;
            const dpr = orb.dpr;

            if (orb.isTransitioning && orb.targetState && orb.prevState) {
                const elapsed = performance.now() - (orb.transitionStart || 0);
                const rawT = Math.min(1, Math.max(0, elapsed / (orb.transitionDuration || 500)));
                // Smooth cubic bezier easing
                const t = rawT < 0.5 ? 4 * rawT * rawT * rawT : 1 - Math.pow(-2 * rawT + 2, 3) / 2;

                const modeA = STATE_MAP[orb.prevState] || 'rubik';
                const modeB = STATE_MAP[orb.targetState] || 'rubik';
                const speedA = (SPEEDS[modeA] || 2) * (orb.speed || 1);
                const speedB = (SPEEDS[modeB] || 2) * (orb.speed || 1);
                const drawFnA = MODES[modeA] || MODES.rubik;
                const drawFnB = MODES[modeB] || MODES.rubik;

                const frameA = drawFnA(orb.size, tSec * speedA, {});
                const frameB = drawFnB(orb.size, tSec * speedB, {});

                const dotsA = frameA.dots || [];
                const dotsB = frameB.dots || [];
                const count = Math.max(dotsA.length, dotsB.length);
                const morphedDots = [];

                for (let i = 0; i < count; i++) {
                    const dA = dotsA[i % (dotsA.length || 1)] || { x: orb.size / 2, y: orb.size / 2, z: 0, r: 0.5, white: 0.5, a: 0 };
                    const dB = dotsB[i % (dotsB.length || 1)] || { x: orb.size / 2, y: orb.size / 2, z: 0, r: 0.5, white: 0.5, a: 0 };

                    morphedDots.push({
                        x: lerp(dA.x, dB.x, t),
                        y: lerp(dA.y, dB.y, t),
                        z: lerp(dA.z, dB.z, t),
                        r: lerp(dA.r, dB.r, t),
                        white: lerp(dA.white, dB.white, t),
                        a: lerp(dA.a !== undefined ? dA.a : 1, dB.a !== undefined ? dB.a : 1, t)
                    });
                }

                morphedDots.sort((a, b) => a.z - b.z);

                ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
                ctx.clearRect(0, 0, orb.size, orb.size);
                paintDots(ctx, morphedDots, isDark);

                if (rawT >= 1) {
                    orb.state = orb.targetState;
                    orb.prevState = null;
                    orb.targetState = null;
                    orb.isTransitioning = false;
                }
            } else {
                const mode = STATE_MAP[orb.state] || 'rubik';
                const speed = (SPEEDS[mode] || 2) * (orb.speed || 1);
                const drawFn = MODES[mode] || MODES.rubik;
                
                const frame = drawFn(orb.size, tSec * speed, {});
                
                ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
                ctx.clearRect(0, 0, orb.size, orb.size);
                
                if (frame.lines && frame.lines.length) {
                    paintLines(ctx, frame.lines, isDark);
                }
                if (frame.dots && frame.dots.length) {
                    paintDots(ctx, frame.dots, isDark);
                }
            }
        });
    }

    function startGlobalLoop() {
        if (!animFrameId) {
            animFrameId = requestAnimationFrame(renderLoop);
        }
    }

    const ThinkingOrbs = {
        mount(canvas, state = 'composing', size = 64, speed = 1) {
            if (!canvas) return null;
            const dpr = Math.min(2, window.devicePixelRatio || 1);
            canvas.width = Math.round(size * dpr);
            canvas.height = Math.round(size * dpr);
            
            const ctx = canvas.getContext('2d');
            const orbObj = { canvas, ctx, state, size, speed, dpr };
            activeOrbs.set(canvas, orbObj);
            startGlobalLoop();
            return orbObj;
        },

        setState(canvas, newState) {
            const orb = activeOrbs.get(canvas);
            if (orb && orb.state !== newState) {
                orb.prevState = orb.targetState || orb.state;
                orb.targetState = newState;
                orb.transitionStart = performance.now();
                orb.transitionDuration = 550; // Fluid 550ms continuous particle morph
                orb.isTransitioning = true;
            }
        },

        unmount(canvas) {
            activeOrbs.delete(canvas);
        },

        // Helper to create a complete floating badge matching orbs.jakubantalik.com exactly
        createBadge(state = 'composing', text = 'Thinking....') {
            const pill = document.createElement('div');
            pill.className = 'agent-thinking-pill';

            const canvas = document.createElement('canvas');
            canvas.className = 'thinking-orb-canvas';
            pill.appendChild(canvas);

            const textSpan = document.createElement('span');
            textSpan.className = 'thinking-text';
            textSpan.textContent = text;
            pill.appendChild(textSpan);

            pill._orb = ThinkingOrbs.mount(canvas, state, 64);
            pill._canvas = canvas;
            pill._textSpan = textSpan;

            return pill;
        },

        updateBadge(pill, state, text) {
            if (!pill) return;
            if (pill._canvas && state) {
                ThinkingOrbs.setState(pill._canvas, state);
            }
            if (pill._textSpan && text && pill._textSpan.textContent !== text) {
                const span = pill._textSpan;
                span.style.transition = 'all 0.2s cubic-bezier(0.2, 0.8, 0.2, 1)';
                span.style.opacity = '0';
                span.style.transform = 'translateY(-4px) scale(0.96)';
                span.style.filter = 'blur(2px)';
                setTimeout(() => {
                    span.textContent = text;
                    span.style.transform = 'translateY(4px) scale(0.96)';
                    void span.offsetWidth;
                    span.style.opacity = '1';
                    span.style.transform = 'translateY(0) scale(1)';
                    span.style.filter = 'blur(0)';
                }, 200);
            }
        },

        completeBadge(pill) {
            if (!pill) return;
            if (pill._canvas) {
                ThinkingOrbs.unmount(pill._canvas);
            }
            pill.style.opacity = '0';
            pill.style.transform = 'translateY(-6px) scale(0.96)';
            pill.style.transition = 'all 0.25s cubic-bezier(0.2, 0.8, 0.2, 1)';
            setTimeout(() => {
                if (pill.parentNode) pill.remove();
            }, 260);
        },

        setSpeed(modeOrState, speedValue) {
            const mode = STATE_MAP[modeOrState] || modeOrState;
            if (SPEEDS[mode] !== undefined && typeof speedValue === 'number') {
                SPEEDS[mode] = speedValue;
            }
        },

        getSpeeds() {
            return { ...SPEEDS };
        }
    };

    // React ThinkingOrb Component Export
    function ReactThinkingOrb(props) {
        const state = props.state || 'composing';
        const size = props.size || 64;
        const speed = props.speed || 1;
        const style = props.style || {};
        const canvasRef = window.React ? window.React.useRef(null) : null;

        if (window.React && window.React.useEffect) {
            window.React.useEffect(() => {
                if (canvasRef && canvasRef.current) {
                    const canvas = canvasRef.current;
                    ThinkingOrbs.mount(canvas, state, size, speed);
                    return () => ThinkingOrbs.unmount(canvas);
                }
            }, [state, size, speed]);

            return window.React.createElement('canvas', {
                ref: canvasRef,
                style: { width: (style.width || (size + 'px')), height: (style.height || (size + 'px')), display: 'block', ...style },
                ...props
            });
        }
        return null;
    }

    global.ThinkingOrb = ReactThinkingOrb;
    global.ThinkingOrbs = ThinkingOrbs;
})(window);
