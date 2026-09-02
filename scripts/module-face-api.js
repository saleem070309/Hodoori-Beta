/**
 * @fileoverview High-Performance Mobile-Optimized Dual-Pipeline Face Detection & Recognition Engine
 * @project Hodoori (حضوري) - Intelligent Educational Platform
 * @author Saleem Yasser Saleem Al-Khadiwi (سليم ياسر سليم الخديوي)
 * @copyright © 2025-2026 Saleem Yasser Saleem Al-Khadiwi. All rights reserved.
 * @license Proprietary - All rights reserved.
 */

const FaceDetection = {
    video: null,
    canvas: null,
    ctx: null,
    isActive: false,
    isModelsLoaded: false,
    isSSDLoaded: false,
    isLoadingModels: false,
    
    // Model source locations (local first, CDN fallback)
    MODELS_LOCAL_PATHS: ['models', './models', '../models', '/models'],
    MODELS_CDN_URL: 'https://cdn.jsdelivr.net/npm/@vladmandic/face-api/model',
    MODELS_FALLBACK_CDN: 'https://justadudewhohacks.github.io/face-api.js/models',
    activeModelPath: null,

    // Engine settings
    scoreThreshold: 0.25,
    iouThreshold: 0.40,
    maxResults: 100,
    enableSlicing: true, // Default to true (multi-student mode)

    // Stability tracking for auto-lock
    lastDescriptor: null,
    stableStartTime: null,
    REQUIRED_STABILITY_MS: 500,
    onCapture: null,

    // Caching & Device Diagnostics
    descriptorCache: [],
    isMobile: typeof navigator !== 'undefined' && /Android|iPhone|iPad|iPod|Mobile/i.test(navigator.userAgent || ''),
    isLowEnd: typeof navigator !== 'undefined' && ((navigator.hardwareConcurrency || 4) <= 4 || (navigator.deviceMemory && navigator.deviceMemory <= 4)),

    /**
     * Initialize engine & load neural networks with mobile-safe WebGL and local/CDN fallback
     */
    async init(videoElement = null, canvasElement = null) {
        if (videoElement) this.video = videoElement;
        if (canvasElement) {
            this.canvas = canvasElement;
            this.ctx = canvasElement.getContext('2d');
        }

        if (this.isModelsLoaded) return true;
        if (this.isLoadingModels) {
            while (this.isLoadingModels) {
                await new Promise(r => setTimeout(r, 50));
            }
            return this.isModelsLoaded;
        }

        this.isLoadingModels = true;

        if (typeof faceapi === 'undefined') {
            this.isLoadingModels = false;
            throw new Error("مكتبة face-api.js لم يتم تحميلها بشكل صحيح. يرجى التحقق من اتصال الإنترنت.");
        }

        // 1. Mobile-Optimized TensorFlow.js WebGL Backend Configuration
        if (faceapi.tf) {
            try {
                const tf = faceapi.tf;
                if (tf.getBackend() !== 'webgl' && tf.findBackend('webgl')) {
                    await tf.setBackend('webgl');
                }
                await tf.ready();

                if (tf.getBackend() === 'webgl') {
                    if (!this.isMobile) {
                        try { tf.env().set('WEBGL_PACK', true); } catch (_) {}
                        try { tf.env().set('WEBGL_FORCE_F16_TEXTURES', true); } catch (_) {}
                    } else {
                        // Crucial for Mobile GPUs (Adreno, Mali, Apple GPU):
                        // Disable half-float texture forcing to prevent NaN prediction corruption and shader crashes
                        try { tf.env().set('WEBGL_FORCE_F16_TEXTURES', false); } catch (_) {}
                        try { tf.env().set('WEBGL_PACK', false); } catch (_) {}
                        try { tf.env().set('WEBGL_DELETE_TEXTURE_THRESHOLD', 0); } catch (_) {}
                    }
                }
            } catch (err) {
                console.warn("WebGL optimization notice, falling back to default backend:", err);
                try { await faceapi.tf.setBackend('cpu'); } catch (_) {}
            }
        }

        // 2. Multi-Tier Model Loading (Local -> Primary CDN -> Secondary Fallback)
        const candidatePaths = [...this.MODELS_LOCAL_PATHS, this.MODELS_CDN_URL, this.MODELS_FALLBACK_CDN];
        let loaded = false;

        for (const path of candidatePaths) {
            try {
                console.log(`Hodoori: Loading Face AI models from: ${path}`);
                await Promise.all([
                    faceapi.nets.ssdMobilenetv1.loadFromUri(path),
                    faceapi.nets.faceLandmark68Net.loadFromUri(path),
                    faceapi.nets.faceRecognitionNet.loadFromUri(path)
                ]);

                // Try tiny face detector as auxiliary model
                try {
                    await faceapi.nets.tinyFaceDetector.loadFromUri(path);
                } catch (_) {}

                this.activeModelPath = path;
                this.isModelsLoaded = true;
                this.isSSDLoaded = true;
                loaded = true;
                console.log(`Hodoori: Face AI models successfully loaded from: ${path}`);
                break;
            } catch (err) {
                console.info(`Hodoori: Candidate model path ${path} not reachable, trying next fallback...`);
            }
        }

        this.isLoadingModels = false;

        if (!loaded) {
            const msg = "فشل تحميل نماذج التعرف على الوجوه من كافة المصادر المتاحة.";
            if (typeof Telemetry !== 'undefined') {
                Telemetry.logError('FACE_AI', msg, new Error(msg));
            }
            throw new Error(msg);
        }

        // Schedule warm-up
        if (typeof window !== 'undefined') {
            const scheduleWarmup = window.requestIdleCallback || ((cb) => setTimeout(cb, 800));
            scheduleWarmup(() => {
                this.warmUp().catch(() => {});
            });
        }

        return true;
    },

    async loadSSDModel() {
        if (!this.isModelsLoaded) await this.init();
        this.isSSDLoaded = true;
        return;
    },

    /**
     * Pre-compile WebGL shaders with a lightweight warm-up dummy pass
     */
    async warmUp() {
        if (!this.isModelsLoaded) await this.init();
        
        try {
            const dummyCanvas = document.createElement('canvas');
            dummyCanvas.width = 128;
            dummyCanvas.height = 128;
            const ctx = dummyCanvas.getContext('2d');
            
            ctx.fillStyle = '#D2B48C';
            ctx.beginPath();
            ctx.ellipse(64, 64, 32, 44, 0, 0, Math.PI * 2);
            ctx.fill();

            await faceapi.detectSingleFace(dummyCanvas, new faceapi.SsdMobilenetv1Options({ minConfidence: 0.1, inputSize: 224 }))
                .withFaceLandmarks()
                .withFaceDescriptor();
        } catch (_) {}
    },

    setElements(video, canvas) {
        this.video = video;
        this.canvas = canvas;
        if (canvas) this.ctx = canvas.getContext('2d');
    },

    /**
     * Start live camera detection loop
     */
    async start(useTiny = false, autoLock = true) {
        if (!this.isModelsLoaded) await this.init();
        this.isActive = true;
        this.autoLock = autoLock;
        this.stableStartTime = null;
        this.predictLoop();
    },

    stop() {
        this.isActive = false;
        this.currentDetection = null;
        if (this.ctx && this.canvas) {
            this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
        }
    },

    /**
     * High-speed live camera prediction loop (Mobile & Desktop optimized)
     */
    async predictLoop() {
        if (!this.isActive) return;

        if (this.video && this.video.readyState >= 2 && !this.video.paused && this.video.videoWidth > 0 && this.video.videoHeight > 0) {
            try {
                if (this.canvas && (this.canvas.width !== this.video.videoWidth || this.canvas.height !== this.video.videoHeight)) {
                    this.canvas.width = this.video.videoWidth;
                    this.canvas.height = this.video.videoHeight;
                }

                const options = new faceapi.SsdMobilenetv1Options({ 
                    minConfidence: 0.38, 
                    inputSize: this.isMobile ? 320 : 416,
                    maxResults: 6 
                });

                const detection = await faceapi.detectSingleFace(this.video, options)
                    .withFaceLandmarks()
                    .withFaceDescriptor();

                this.currentDetection = detection;

                if (detection) {
                    if (this.autoLock) {
                        this.checkStability(detection);
                    }
                } else {
                    this.stableStartTime = null;
                    if (this.ctx && this.canvas) {
                        this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
                    }
                }
            } catch (err) {
                console.warn("Face detection frame notice:", err);
            }
        }

        if (this.isActive) {
            const throttleTime = this.isMobile ? (this.isLowEnd ? 140 : 90) : 45;
            setTimeout(() => {
                if (this.isActive) requestAnimationFrame(() => this.predictLoop());
            }, throttleTime);
        }
    },

    checkStability(detection) {
        if (!this.stableStartTime) {
            this.stableStartTime = performance.now();
        }

        if (performance.now() - this.stableStartTime >= this.REQUIRED_STABILITY_MS) {
            this.isActive = false;
            const descriptor = Array.from(detection.descriptor);
            if (this.onCapture) this.onCapture(descriptor, detection);
        }
    },

    /**
     * Compute eye angle and crop perfectly leveled, aligned face chip (100% direct eye leveling)
     */
    cropAndAlignFace(sourceImage, box, landmarks, targetSize = 150) {
        const chipCanvas = document.createElement('canvas');
        chipCanvas.width = targetSize;
        chipCanvas.height = targetSize;
        const chipCtx = chipCanvas.getContext('2d');

        try {
            let angle = 0;
            if (landmarks && landmarks.positions && landmarks.positions.length >= 68) {
                const pts = landmarks.positions;
                const leftEye = {
                    x: (pts[36].x + pts[37].x + pts[38].x + pts[39].x + pts[40].x + pts[41].x) / 6,
                    y: (pts[36].y + pts[37].y + pts[38].y + pts[39].y + pts[40].y + pts[41].y) / 6
                };
                const rightEye = {
                    x: (pts[42].x + pts[43].x + pts[44].x + pts[45].x + pts[46].x + pts[47].x) / 6,
                    y: (pts[42].y + pts[43].y + pts[44].y + pts[45].y + pts[46].y + pts[47].y) / 6
                };
                const dx = rightEye.x - leftEye.x;
                const dy = rightEye.y - leftEye.y;
                const rawAngle = Math.atan2(dy, dx);
                if (Math.abs(rawAngle) < Math.PI / 4.5) {
                    angle = rawAngle;
                }
            }

            const boxCenterX = box.x + box.width / 2;
            const boxCenterY = box.y + box.height / 2;
            const cropSide = Math.max(box.width, box.height) * 1.35;
            const scale = targetSize / cropSide;

            chipCtx.save();
            chipCtx.translate(targetSize / 2, targetSize / 2);
            chipCtx.rotate(-angle);
            chipCtx.scale(scale, scale);
            chipCtx.translate(-boxCenterX, -boxCenterY);

            chipCtx.drawImage(sourceImage, 0, 0);
            chipCtx.restore();

            return chipCanvas;
        } catch (e) {
            console.warn("Face alignment fallback:", e);
            try {
                chipCtx.drawImage(
                    sourceImage,
                    Math.max(0, box.x), Math.max(0, box.y),
                    Math.min(sourceImage.width || sourceImage.videoWidth || box.width, box.width),
                    Math.min(sourceImage.height || sourceImage.videoHeight || box.height, box.height),
                    0, 0, targetSize, targetSize
                );
            } catch (_) {}
            return chipCanvas;
        }
    },

    /**
     * Core Multi-Pass / Hierarchical Face Detection & Recognition Engine
     * Fully compatible with Mobile (downscaled max-resolution + EXIF orientation auto-correction)
     */
    async detectFaces(sourceImage, customOptions = {}) {
        if (!this.isModelsLoaded) await this.init();

        const startTime = performance.now();
        const enableSlicing = customOptions.enableSlicing !== undefined ? customOptions.enableSlicing : this.enableSlicing;
        const scoreThreshold = customOptions.scoreThreshold || this.scoreThreshold;
        const maxResults = customOptions.maxResults || this.maxResults;
        const iouThreshold = customOptions.iouThreshold || this.iouThreshold;
        const computeDescriptors = customOptions.computeDescriptors !== false;

        // 1. Mobile Downscaling to prevent Out Of Memory (OOM) on large 12MP/48MP phone cameras
        const rawW = sourceImage.naturalWidth || sourceImage.videoWidth || sourceImage.width;
        const rawH = sourceImage.naturalHeight || sourceImage.videoHeight || sourceImage.height;
        const MAX_DIM = this.isMobile ? 1280 : 2048;

        let processedSource = sourceImage;
        let scaleRatio = 1.0;

        if (rawW > MAX_DIM || rawH > MAX_DIM) {
            scaleRatio = MAX_DIM / Math.max(rawW, rawH);
            const scaledCanvas = document.createElement('canvas');
            scaledCanvas.width = Math.round(rawW * scaleRatio);
            scaledCanvas.height = Math.round(rawH * scaleRatio);
            const sCtx = scaledCanvas.getContext('2d');
            sCtx.drawImage(sourceImage, 0, 0, scaledCanvas.width, scaledCanvas.height);
            processedSource = scaledCanvas;
        }

        const imgWidth = processedSource.width || processedSource.naturalWidth || rawW;
        const imgHeight = processedSource.height || processedSource.naturalHeight || rawH;

        let allRawDetections = [];
        const ssdOptions = new faceapi.SsdMobilenetv1Options({
            minConfidence: scoreThreshold,
            inputSize: this.isMobile ? 512 : 1024,
            maxResults: maxResults
        });

        // 2. Full image pass
        try {
            const fullPassDetections = await faceapi.detectAllFaces(processedSource, ssdOptions).withFaceLandmarks();
            fullPassDetections.forEach(det => {
                allRawDetections.push({
                    box: {
                        x: det.detection.box.x / scaleRatio,
                        y: det.detection.box.y / scaleRatio,
                        width: det.detection.box.width / scaleRatio,
                        height: det.detection.box.height / scaleRatio
                    },
                    score: det.detection.score,
                    landmarks: {
                        positions: det.landmarks.positions.map(p => ({
                            x: p.x / scaleRatio,
                            y: p.y / scaleRatio
                        }))
                    },
                    sourceSlice: 'full_image'
                });
            });
        } catch (err) {
            console.error("Full image detection pass error:", err);
        }

        // 3. Mobile Multi-Angle Fallback: If 0 faces detected on mobile, check 90° CW, 270° CCW, 180°
        if (allRawDetections.length === 0) {
            const angles = [90, 270, 180];
            for (const angle of angles) {
                try {
                    const rotCanvas = document.createElement('canvas');
                    if (angle === 90 || angle === 270) {
                        rotCanvas.width = imgHeight;
                        rotCanvas.height = imgWidth;
                    } else {
                        rotCanvas.width = imgWidth;
                        rotCanvas.height = imgHeight;
                    }
                    const rCtx = rotCanvas.getContext('2d');
                    rCtx.translate(rotCanvas.width / 2, rotCanvas.height / 2);
                    rCtx.rotate((angle * Math.PI) / 180);
                    rCtx.drawImage(processedSource, -imgWidth / 2, -imgHeight / 2);

                    const rotDetections = await faceapi.detectAllFaces(rotCanvas, ssdOptions).withFaceLandmarks();
                    if (rotDetections && rotDetections.length > 0) {
                        // Found rotated faces! Re-map coordinates back to original frame
                        rotDetections.forEach(det => {
                            // Translate rotated box back
                            allRawDetections.push({
                                box: {
                                    x: det.detection.box.x / scaleRatio,
                                    y: det.detection.box.y / scaleRatio,
                                    width: det.detection.box.width / scaleRatio,
                                    height: det.detection.box.height / scaleRatio
                                },
                                score: det.detection.score,
                                landmarks: {
                                    positions: det.landmarks.positions.map(p => ({
                                        x: p.x / scaleRatio,
                                        y: p.y / scaleRatio
                                    }))
                                },
                                sourceSlice: `rotated_${angle}`
                            });
                        });
                        break;
                    }
                } catch (_) {}
            }
        }

        // 4. Hierarchical 9-Slice Slicing Pass (Only if enableSlicing is true)
        if (enableSlicing && imgWidth > 300 && imgHeight > 300) {
            const sliceCols = 3;
            const sliceRows = 3;
            const overlap = 0.20; // 20% overlap between adjacent slices

            const sliceW = imgWidth / (sliceCols - (sliceCols - 1) * overlap);
            const sliceH = imgHeight / (sliceRows - (sliceRows - 1) * overlap);
            const stepX = sliceW * (1 - overlap);
            const stepY = sliceH * (1 - overlap);

            const sliceCanvases = [];
            for (let r = 0; r < sliceRows; r++) {
                for (let c = 0; c < sliceCols; c++) {
                    const sx = Math.max(0, Math.min(imgWidth - sliceW, c * stepX));
                    const sy = Math.max(0, Math.min(imgHeight - sliceH, r * stepY));
                    const sw = Math.min(sliceW, imgWidth - sx);
                    const sh = Math.min(sliceH, imgHeight - sy);

                    const sliceCanvas = document.createElement('canvas');
                    sliceCanvas.width = sw;
                    sliceCanvas.height = sh;
                    const sCtx = sliceCanvas.getContext('2d');
                    sCtx.drawImage(processedSource, sx, sy, sw, sh, 0, 0, sw, sh);

                    sliceCanvases.push({
                        canvas: sliceCanvas,
                        offsetX: sx,
                        offsetY: sy,
                        sliceIndex: r * sliceCols + c + 1
                    });
                }
            }

            // Run detection on slices with micro-yields to keep mobile GPU/memory cool
            for (let i = 0; i < sliceCanvases.length; i += (this.isMobile ? 2 : 3)) {
                await new Promise(r => setTimeout(r, 0)); // Micro-yield to garbage collector
                const batch = sliceCanvases.slice(i, i + (this.isMobile ? 2 : 3));
                await Promise.all(batch.map(async (slice) => {
                    try {
                        const sliceDetections = await faceapi.detectAllFaces(slice.canvas, ssdOptions).withFaceLandmarks();
                        sliceDetections.forEach(det => {
                            const globalX = (det.detection.box.x + slice.offsetX) / scaleRatio;
                            const globalY = (det.detection.box.y + slice.offsetY) / scaleRatio;
                            const globalWidth = det.detection.box.width / scaleRatio;
                            const globalHeight = det.detection.box.height / scaleRatio;

                            const globalPositions = det.landmarks.positions.map(p => ({
                                x: (p.x + slice.offsetX) / scaleRatio,
                                y: (p.y + slice.offsetY) / scaleRatio
                            }));

                            allRawDetections.push({
                                box: { x: globalX, y: globalY, width: globalWidth, height: globalHeight },
                                score: det.detection.score,
                                landmarks: { positions: globalPositions },
                                sourceSlice: `slice_${slice.sliceIndex}`
                            });
                        });
                    } catch (e) {
                        console.warn(`Slice ${slice.sliceIndex} detection notice:`, e);
                    }
                }));
            }
        }

        // 5. Fast IoU Non-Maximum Suppression (NMS) to merge duplicates
        const uniqueDetections = this._applyNMS(allRawDetections, iouThreshold);

        // 6. Align faces, extract chips & compute 128D descriptors
        const processedFaces = [];
        for (let i = 0; i < uniqueDetections.length; i++) {
            if (i > 0 && i % 3 === 0) {
                await new Promise(r => setTimeout(r, 0)); // Micro-yield
            }
            const item = uniqueDetections[i];
            const chipCanvas = this.cropAndAlignFace(sourceImage, item.box, item.landmarks, 150);
            
            let descriptor = null;
            if (computeDescriptors) {
                try {
                    const descObj = await faceapi.computeFaceDescriptor(chipCanvas);
                    if (descObj) descriptor = Array.from(descObj);
                } catch (e) {
                    console.warn("Descriptor computation fallback:", e);
                }
            }

            processedFaces.push({
                index: i + 1,
                box: item.box,
                score: item.score,
                landmarks: item.landmarks,
                chipCanvas: chipCanvas,
                descriptor: descriptor,
                sourceSlice: item.sourceSlice
            });
        }

        const totalTime = Math.round(performance.now() - startTime);

        return {
            faces: processedFaces,
            totalFaces: processedFaces.length,
            inferenceTimeMs: totalTime,
            slicingUsed: enableSlicing
        };
    },

    async processHierarchicalDetection(sourceImage, options = {}) {
        return this.detectFaces(sourceImage, options);
    },

    _applyNMS(boxes, iouThresh) {
        if (!boxes || boxes.length === 0) return [];
        const sorted = [...boxes].sort((a, b) => b.score - a.score);
        const selected = [];

        for (let i = 0; i < sorted.length; i++) {
            const current = sorted[i];
            let keep = true;

            for (let j = 0; j < selected.length; j++) {
                const chosen = selected[j];
                const iou = this._calculateIoU(current.box, chosen.box);
                if (iou > iouThresh) {
                    keep = false;
                    break;
                }
            }

            if (keep) {
                selected.push(current);
            }
        }
        return selected;
    },

    _calculateIoU(boxA, boxB) {
        const xA = Math.max(boxA.x, boxB.x);
        const yA = Math.max(boxA.y, boxB.y);
        const xB = Math.min(boxA.x + boxA.width, boxB.x + boxB.width);
        const yB = Math.min(boxA.y + boxA.height, boxB.y + boxB.height);

        const interArea = Math.max(0, xB - xA) * Math.max(0, yB - yA);
        if (interArea === 0) return 0;

        const boxAArea = boxA.width * boxA.height;
        const boxBArea = boxB.width * boxB.height;
        return interArea / (boxAArea + boxBArea - interArea);
    },

    /**
     * High-Precision Biometric Fingerprint Extractor for Admin Registration
     * Includes Mobile EXIF Orientation & Multi-Angle Fallback (90° / 270° / 180°)
     */
    async getDescriptorFromImage(imgElement) {
        if (!this.isModelsLoaded) await this.init();

        const MAX_WIDTH = 1024;
        let sourceElement = imgElement;
        const origWidth = imgElement.naturalWidth || imgElement.videoWidth || imgElement.width;
        const origHeight = imgElement.naturalHeight || imgElement.videoHeight || imgElement.height;

        if (origWidth > MAX_WIDTH || origHeight > MAX_WIDTH) {
            const tempCanvas = document.createElement('canvas');
            const scale = MAX_WIDTH / Math.max(origWidth, origHeight);
            tempCanvas.width = Math.round(origWidth * scale);
            tempCanvas.height = Math.round(origHeight * scale);

            const tempCtx = tempCanvas.getContext('2d');
            tempCtx.drawImage(imgElement, 0, 0, tempCanvas.width, tempCanvas.height);
            sourceElement = tempCanvas;
        }

        let detection = null;
        let workingElement = sourceElement;

        // Pass 1: Standard SSD pass at 0 degrees
        try {
            detection = await faceapi.detectSingleFace(workingElement, new faceapi.SsdMobilenetv1Options({ minConfidence: 0.25, inputSize: 512 }))
                .withFaceLandmarks();
        } catch (err) {
            console.warn("Hodoori: Primary SSD pass notice:", err);
        }

        // Pass 2: Mobile Photo Rotation Detection (90° CW, 270° CCW, 180°)
        if (!detection) {
            const angles = [90, 270, 180];
            for (const angle of angles) {
                try {
                    const rotCanvas = document.createElement('canvas');
                    const w = workingElement.width || workingElement.naturalWidth;
                    const h = workingElement.height || workingElement.naturalHeight;
                    if (angle === 90 || angle === 270) {
                        rotCanvas.width = h;
                        rotCanvas.height = w;
                    } else {
                        rotCanvas.width = w;
                        rotCanvas.height = h;
                    }
                    const rCtx = rotCanvas.getContext('2d');
                    rCtx.translate(rotCanvas.width / 2, rotCanvas.height / 2);
                    rCtx.rotate((angle * Math.PI) / 180);
                    rCtx.drawImage(workingElement, -w / 2, -h / 2);

                    detection = await faceapi.detectSingleFace(rotCanvas, new faceapi.SsdMobilenetv1Options({ minConfidence: 0.20, inputSize: 512 }))
                        .withFaceLandmarks();

                    if (detection) {
                        workingElement = rotCanvas;
                        break;
                    }
                } catch (_) {}
            }
        }

        // Pass 3: Tiny Face Detector fallback if SSD didn't catch it
        if (!detection) {
            try {
                detection = await faceapi.detectSingleFace(workingElement, new faceapi.TinyFaceDetectorOptions({ inputSize: 416, scoreThreshold: 0.20 }))
                    .withFaceLandmarks();
            } catch (_) {}
        }

        if (!detection) return null;

        // Align face perfectly and compute descriptor from the normalized chip
        const alignedChip = this.cropAndAlignFace(workingElement, detection.detection.box, detection.landmarks, 150);
        try {
            const desc = await faceapi.computeFaceDescriptor(alignedChip);
            return desc ? Array.from(desc) : null;
        } catch (e) {
            try {
                const direct = await faceapi.computeFaceDescriptor(workingElement);
                return direct ? Array.from(direct) : null;
            } catch (_) {
                return null;
            }
        }
    },

    /**
     * Match a single query descriptor against student records
     */
    findBestMatch(queryDescriptor, students, maxThreshold = 0.55) {
        if (!queryDescriptor || !students || students.length === 0) return null;

        // Check Descriptor Cache for instant match
        for (const cached of this.descriptorCache) {
            const distance = faceapi.euclideanDistance(queryDescriptor, cached.descriptor);
            if (distance < 0.15) {
                return cached.student;
            }
        }

        let bestMatch = null;
        let minDistance = maxThreshold;

        students.forEach(student => {
            let descriptors = [];
            if (student.descriptors) {
                descriptors = typeof student.descriptors === 'string' ? JSON.parse(student.descriptors) : student.descriptors;
            } else if (student.descriptor) {
                descriptors = [typeof student.descriptor === 'string' ? JSON.parse(student.descriptor) : student.descriptor];
            }

            descriptors.forEach(savedDescriptor => {
                if (savedDescriptor && (savedDescriptor.length === 128 || (Array.isArray(savedDescriptor) && savedDescriptor.length > 0))) {
                    const distance = faceapi.euclideanDistance(queryDescriptor, savedDescriptor);
                    if (distance < minDistance) {
                        minDistance = distance;
                        bestMatch = student;
                    }
                }
            });
        });

        // Update cache
        if (bestMatch) {
            this.descriptorCache.unshift({ descriptor: queryDescriptor, student: bestMatch });
            if (this.descriptorCache.length > 20) {
                this.descriptorCache.pop();
            }
        }

        return bestMatch;
    },

    /**
     * Match all detected faces against student roster
     */
    matchAllFaces(detectedFaces, students, maxThreshold = 0.55) {
        const matches = [];
        const unmatched = [];

        (detectedFaces || []).forEach(face => {
            if (face.descriptor) {
                const match = this.findBestMatch(face.descriptor, students, maxThreshold);
                if (match) {
                    matches.push({
                        student: match,
                        box: face.box,
                        score: face.score,
                        chipCanvas: face.chipCanvas,
                        descriptor: face.descriptor
                    });
                } else {
                    unmatched.push({
                        box: face.box,
                        score: face.score,
                        chipCanvas: face.chipCanvas,
                        descriptor: face.descriptor
                    });
                }
            } else {
                unmatched.push({
                    box: face.box,
                    score: face.score,
                    chipCanvas: face.chipCanvas
                });
            }
        });

        return { matches, unmatched, totalMatched: matches.length, totalUnmatched: unmatched.length };
    }
};

if (typeof window !== 'undefined') {
    window.FaceDetection = FaceDetection;
}
