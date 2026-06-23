/**
 * Face Detection & Recognition Engine using face-api.js
 * Optimized for local "Digital Fingerprint" (Descriptor) matching.
 */

const FaceDetection = {
    nets: null,
    video: null,
    canvas: null,
    ctx: null,
    isActive: false,
    isModelsLoaded: false,
    
    // Config for different modes
    MODELS_URL: 'https://justadudewhohacks.github.io/face-api.js/models', // Public models
    isSSDLoaded: false,
    
    // Stability tracking
    lastDescriptor: null,
    stableStartTime: null,
    REQUIRED_STABILITY_MS: 600, 
    
    onCapture: null, // Callback with descriptor when face is locked

    // Performance Mode
    isLowEnd: (navigator.hardwareConcurrency || 4) <= 4,
    descriptorCache: [], // Cache of recent { descriptor, student } to skip full DB scan

    async init(videoElement = null, canvasElement = null) {
        if (videoElement) this.video = videoElement;
        if (canvasElement) {
            this.canvas = canvasElement;
            this.ctx = canvasElement.getContext('2d');
        }

        if (this.isModelsLoaded) return;
        
        if (typeof faceapi === 'undefined') {
            throw new Error("مكتبة face-api.js لم يتم تحميلها بشكل صحيح. يرجى التحقق من اتصال الإنترنت.");
        }

        // Optimize TensorFlow.js WebGL backend if available
        if (faceapi.tf) {
            try {
                const tf = faceapi.tf;
                if (tf.getBackend() !== 'webgl' && tf.findBackend('webgl')) {
                    await tf.setBackend('webgl');
                }
                await tf.ready();
                
                if (tf.getBackend() === 'webgl') {
                    tf.env().set('WEBGL_PACK', true);
                    tf.env().set('WEBGL_FLUSH_THRESHOLD', -1);
                    tf.env().set('WEBGL_FORCE_F16_TEXTURES', true);
                    console.log("Hodoori: WebGL Backend optimized successfully.");
                }
                console.log("Hodoori: Active TFJS Backend is", tf.getBackend());
            } catch (err) {
                console.warn("Hodoori: WebGL backend optimization failed, using default:", err);
            }
        }

        try {
            console.log("Loading Face AI models (SSD Mobilenet)...");
            await Promise.all([
                faceapi.nets.ssdMobilenetv1.loadFromUri(this.MODELS_URL),
                faceapi.nets.faceLandmark68Net.loadFromUri(this.MODELS_URL),
                faceapi.nets.faceRecognitionNet.loadFromUri(this.MODELS_URL)
            ]);
            this.isModelsLoaded = true;
            this.isSSDLoaded = true;
            console.log("Face AI Ready (SSD Mobilenet)");
        } catch (e) {
            console.error("Face API Init Failed:", e);
            throw e;
        }
    },

    /**
     * Lazy load helper - no-op as SSD is loaded in init
     */
    async loadSSDModel() {
        this.isSSDLoaded = true;
        return;
    },

    /**
     * "Warm up" the engine by running a dummy detection.
     * This pre-compiles WebGL shaders and avoids lag during real use.
     */
    async warmUp() {
        if (!this.isModelsLoaded) await this.init();
        
        console.log("Warming up Face AI engine (SSD Pipeline)...");
        const dummyCanvas = document.createElement('canvas');
        dummyCanvas.width = 160;
        dummyCanvas.height = 160;
        const ctx = dummyCanvas.getContext('2d');
        
        // Draw a face-like oval shape for more realistic warm up
        ctx.fillStyle = '#D2B48C';
        ctx.beginPath();
        ctx.ellipse(80, 80, 40, 55, 0, 0, Math.PI * 2);
        ctx.fill();
        // Add eye-like dots
        ctx.fillStyle = '#333';
        ctx.beginPath();
        ctx.arc(65, 70, 4, 0, Math.PI * 2);
        ctx.arc(95, 70, 4, 0, Math.PI * 2);
        ctx.fill();

        try {
            // Warm up the FULL pipeline with SSD
            await faceapi.detectSingleFace(dummyCanvas, 
                new faceapi.SsdMobilenetv1Options({ minConfidence: 0.1 }))
                .withFaceLandmarks()
                .withFaceDescriptor();
        } catch (e) {
            console.warn("SSD warm up failed, trying detection-only:", e);
            try {
                await faceapi.detectSingleFace(dummyCanvas, new faceapi.SsdMobilenetv1Options());
            } catch (_) {}
        }
        console.log("Face AI engine warmed up.");
    },

    setElements(video, canvas) {
        this.video = video;
        this.canvas = canvas;
        if (canvas) this.ctx = canvas.getContext('2d');
    },

    async start(useTiny = false, autoLock = true) {
        if (!this.isModelsLoaded) return;

        this.isActive = true;
        this.useTiny = false; // Always enforce SSD Mobilenet V1
        this.autoLock = autoLock;
        this.stableStartTime = null;
        this.predictLoop();
    },

    stop() {
        this.isActive = false;
        this.currentDetection = null; // Clear current detection on stop
        if (this.ctx && this.canvas) {
            this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
        }
    },

    async predictLoop() {
        if (!this.isActive) return;

        // Ensure video is playing and metadata is loaded
        if (this.video.readyState >= 2 && !this.video.paused) {
            try {
                // Sync canvas size only if needed
                if (this.canvas.width !== this.video.videoWidth) {
                    this.canvas.width = this.video.videoWidth;
                    this.canvas.height = this.video.videoHeight;
                }

                // Enforce SSD Mobilenet Options at all times
                const options = new faceapi.SsdMobilenetv1Options({ minConfidence: 0.45 });

                const detection = await faceapi.detectSingleFace(this.video, options)
                    .withFaceLandmarks()
                    .withFaceDescriptor();

                this.currentDetection = detection; // Store globally for manual capture

                if (detection) {
                    this.drawDetections(detection);
                    if (this.autoLock) {
                        this.checkStability(detection);
                    }
                } else {
                    this.stableStartTime = null;
                    if (this.ctx) this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
                }
            } catch (err) {
                console.warn("Face detection frame error:", err);
            }
        }

        if (this.isActive) {
            // Throttling: SSD is computationally heavy on Core i3 CPU, use 180ms minimum throttle to give GPU/CPU breathing room
            const throttleTime = this.isLowEnd ? 180 : 80;
            setTimeout(() => {
                if (this.isActive) requestAnimationFrame(() => this.predictLoop());
            }, throttleTime);
        }
    },

    drawDetections(detection) {
        if (!this.ctx) return;
        this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
        // Disabled as requested - poor tracking performance
        return;
    },

    checkStability(detection) {
        if (!this.stableStartTime) {
            this.stableStartTime = performance.now();
        }

        if (performance.now() - this.stableStartTime >= this.REQUIRED_STABILITY_MS) {
            this.isActive = false;
            const descriptor = Array.from(detection.descriptor);
            if (this.onCapture) this.onCapture(descriptor);
        }
    },

    /**
     * Helper to get a descriptor from a static image (for registration)
     */
    async getDescriptorFromImage(imgElement) {
        if (!this.isModelsLoaded) await this.init();
        
        // 1. Optimization: Downscale image to max 1024px (instead of 600px) to preserve facial details on registration
        const MAX_WIDTH = 1024;
        let scale = 1;
        let sourceElement = imgElement;

        // Create a temporary canvas for downscaling
        if (imgElement.width > MAX_WIDTH || imgElement.naturalWidth > MAX_WIDTH) {
            const tempCanvas = document.createElement('canvas');
            const origWidth = imgElement.naturalWidth || imgElement.width;
            const origHeight = imgElement.naturalHeight || imgElement.height;
            scale = MAX_WIDTH / origWidth;
            
            tempCanvas.width = MAX_WIDTH;
            tempCanvas.height = origHeight * scale;
            
            const tempCtx = tempCanvas.getContext('2d');
            tempCtx.drawImage(imgElement, 0, 0, tempCanvas.width, tempCanvas.height);
            sourceElement = tempCanvas;
        }

        let detection = null;
        
        // 2. Primary: Try high-precision SSD Mobilenet for the most accurate registration fingerprint
        try {
            await this.loadSSDModel();
            detection = await faceapi.detectSingleFace(sourceElement, new faceapi.SsdMobilenetv1Options({ minConfidence: 0.4 }))
                .withFaceLandmarks()
                .withFaceDescriptor();
        } catch (err) {
            console.warn("Hodoori: SSD registration failed, trying Tiny fallback:", err);
        }

        // 3. Fallback: If SSD fails or fails to find a face, try TinyFaceDetector
        if (!detection) {
            console.log("SSD registration failed/unavailable, using TinyFaceDetector fallback...");
            detection = await faceapi.detectSingleFace(sourceElement, new faceapi.TinyFaceDetectorOptions({ inputSize: 416, scoreThreshold: 0.3 }))
                .withFaceLandmarks()
                .withFaceDescriptor();
        }
            
        return detection ? Array.from(detection.descriptor) : null;
    },

    /**
     * Local recognition: match a captured descriptor against a list of student descriptors
     */
    findBestMatch(queryDescriptor, students) {
        if (!queryDescriptor) return null;
        
        // 1. Check Descriptor Cache for highly similar recent descriptors
        for (const cached of this.descriptorCache) {
            const distance = faceapi.euclideanDistance(queryDescriptor, cached.descriptor);
            if (distance < 0.15) { // Very close descriptors must be the same person
                return cached.student;
            }
        }
        
        let bestMatch = null;
        let minDistance = 0.55; // Balanced threshold (0.6 was too loose, 0.45 was too strict for lighting changes, 0.55 is optimal)

        students.forEach(student => {
            // Support both single descriptor and multiple descriptors (array)
            let descriptors = [];
            if (student.descriptors) {
                descriptors = typeof student.descriptors === 'string' ? JSON.parse(student.descriptors) : student.descriptors;
            } else if (student.descriptor) {
                descriptors = [typeof student.descriptor === 'string' ? JSON.parse(student.descriptor) : student.descriptor];
            }

            descriptors.forEach(savedDescriptor => {
                const distance = faceapi.euclideanDistance(queryDescriptor, savedDescriptor);
                if (distance < minDistance) {
                    minDistance = distance;
                    bestMatch = student;
                }
            });
        });

        // 2. Save result to cache (keep last 10 entries)
        this.descriptorCache.unshift({ descriptor: queryDescriptor, student: bestMatch });
        if (this.descriptorCache.length > 10) {
            this.descriptorCache.pop();
        }

        return bestMatch;
    }
};

