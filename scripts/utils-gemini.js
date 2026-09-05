/**
 * @fileoverview API Keys & Model Authentication Utility with .env Support
 * @project Hodoori (حضوري) - Intelligent Educational Platform
 * @author Saleem Yasser Saleem Al-Khadiwi (سليم ياسر سليم الخديوي)
 * @copyright © 2025-2026 Saleem Yasser Saleem Al-Khadiwi. All rights reserved.
 * @license Proprietary - All rights reserved.
 */

(function () {
    'use strict';

    /**
     * Parses standard .env format text into key-value pairs
     * Handles comments (#), whitespace, quotes (' or "), and inline assignments.
     */
    function parseEnvContent(text) {
        const result = {};
        if (!text || typeof text !== 'string') return result;

        const lines = text.split(/\r?\n/);
        for (let rawLine of lines) {
            let line = rawLine.trim();
            if (!line || line.startsWith('#')) continue;

            const eqIdx = line.indexOf('=');
            if (eqIdx === -1) continue;

            const key = line.substring(0, eqIdx).trim();
            let val = line.substring(eqIdx + 1).trim();

            // Strip enclosing double or single quotes
            if (
                (val.startsWith('"') && val.endsWith('"') && val.length >= 2) ||
                (val.startsWith("'") && val.endsWith("'") && val.length >= 2)
            ) {
                val = val.substring(1, val.length - 1);
            }

            if (key) {
                result[key] = val;
            }
        }
        return result;
    }

    const Gemini = {
        env: {},
        isLoaded: false,

        /**
         * Parse raw env text and integrate into current runtime
         */
        parseAndApply(rawText) {
            const parsed = parseEnvContent(rawText);
            this.env = Object.assign({}, this.env, parsed);
            this.isLoaded = true;

            // Expose globally for instant inspector and script access
            if (typeof window !== 'undefined') {
                window.__ENV__ = Object.assign({}, window.__ENV__ || {}, this.env);
                window.ENV = window.__ENV__;

                // Sync non-empty keys into localStorage for backward-compatibility
                try {
                    if (this.env.OPENROUTER_API_KEY && this.env.OPENROUTER_API_KEY.trim()) {
                        localStorage.setItem('openrouter_api_key', this.env.OPENROUTER_API_KEY.trim());
                    }
                    if (this.env.GEMINI_API_KEY && this.env.GEMINI_API_KEY.trim()) {
                        localStorage.setItem('gemini_api_key', this.env.GEMINI_API_KEY.trim());
                    }
                    if (this.env.INWORLD_API_KEY && this.env.INWORLD_API_KEY.trim()) {
                        localStorage.setItem('inworld_api_key', this.env.INWORLD_API_KEY.trim());
                    }
                    if (this.env.DEEPINFRA_API_KEY && this.env.DEEPINFRA_API_KEY.trim()) {
                        localStorage.setItem('deepinfra_api_key', this.env.DEEPINFRA_API_KEY.trim());
                    }
                } catch (e) {
                    // Ignore storage quota or cross-origin restrictions
                }
            }
            return this.env;
        },

        /**
         * Synchronous / Immediate environment loader
         */
        init() {
            // 1. Node.js environment support (CLI, automated tests)
            if (typeof process !== 'undefined' && process.versions && process.versions.node) {
                try {
                    const fs = require('fs');
                    const path = require('path');
                    const candidatePaths = [
                        path.resolve(process.cwd(), '.env'),
                        path.resolve(__dirname, '..', '.env'),
                        path.resolve(__dirname, '.env')
                    ];
                    for (const p of candidatePaths) {
                        if (fs.existsSync(p)) {
                            const content = fs.readFileSync(p, 'utf8');
                            this.parseAndApply(content);
                            break;
                        }
                    }
                } catch (err) {}
                return;
            }

            // 2. Browser environment: Immediate synchronous XHR to fetch .env
            if (typeof window !== 'undefined' && typeof XMLHttpRequest !== 'undefined') {
                const trySyncFetch = (url) => {
                    try {
                        const xhr = new XMLHttpRequest();
                        xhr.open('GET', url, false); // Synchronous fetch for instant availability
                        xhr.send(null);
                        if (xhr.status === 200 || (xhr.status === 0 && xhr.responseText)) {
                            this.parseAndApply(xhr.responseText);
                            return true;
                        }
                    } catch (e) {
                        return false;
                    }
                    return false;
                };

                // Try absolute root, then relative path
                if (!trySyncFetch('/.env')) {
                    trySyncFetch('./.env');
                }

                // Asynchronous fallback in case synchronous XHR was blocked
                if (!this.isLoaded && typeof fetch !== 'undefined') {
                    fetch('/.env')
                        .then(r => r.ok ? r.text() : fetch('./.env').then(r2 => r2.ok ? r2.text() : ''))
                        .then(txt => {
                            if (txt) this.parseAndApply(txt);
                        })
                        .catch(() => {});
                }
            }
        },

        getApiKey() {
            return (
                (this.env && (this.env.GEMINI_API_KEY || this.env.gemini_api_key)) ||
                (typeof localStorage !== 'undefined' ? localStorage.getItem('gemini_api_key') : '') ||
                ''
            );
        },

        getOpenRouterKey() {
            return (
                (this.env && (this.env.OPENROUTER_API_KEY || this.env.openrouter_api_key || this.env.OPENROUTER_KEY)) ||
                (typeof localStorage !== 'undefined' ? (localStorage.getItem('openrouter_api_key') || localStorage.getItem('OPENROUTER_API_KEY')) : '') ||
                ''
            );
        },

        getInworldKey() {
            return (
                (this.env && (this.env.INWORLD_API_KEY || this.env.inworld_api_key)) ||
                (typeof localStorage !== 'undefined' ? localStorage.getItem('inworld_api_key') : '') ||
                ''
            );
        },

        getDeepInfraKey() {
            return (
                (this.env && (this.env.DEEPINFRA_API_KEY || this.env.deepinfra_api_key)) ||
                (typeof localStorage !== 'undefined' ? localStorage.getItem('deepinfra_api_key') : '') ||
                ''
            );
        },

        get(key, defaultValue = '') {
            if (this.env && typeof this.env[key] !== 'undefined') {
                return this.env[key];
            }
            if (typeof localStorage !== 'undefined') {
                const stored = localStorage.getItem(key) || localStorage.getItem(key.toLowerCase());
                if (stored !== null) return stored;
            }
            return defaultValue;
        }
    };

    // Auto-initialize immediately upon script load
    Gemini.init();

    // Export for Browser and Node.js
    if (typeof window !== 'undefined') {
        window.Gemini = Gemini;
    }
    if (typeof module !== 'undefined' && module.exports) {
        module.exports = Gemini;
    }
})();
