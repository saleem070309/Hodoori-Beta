/**
 * @fileoverview Zero-Knowledge AES-GCM 256-bit Encryption Engine & Session Key Lifecycle Manager
 * @project Hodoori (حضوري) - Intelligent Educational Platform
 * @author Saleem Yasser Saleem Al-Khadiwi (سليم ياسر سليم الخديوي)
 * @copyright © 2025-2026 Saleem Yasser Saleem Al-Khadiwi. All rights reserved.
 * @license Proprietary - All rights reserved.
 */

const CryptoEngine = (() => {
    'use strict';

    // Ephemeral in-memory key reference (Never persisted to disk or localStorage)
    let _sessionCryptoKey = null;
    let _sessionKeyIdentifier = null;

    /**
     * Converts a string to ArrayBuffer (UTF-8)
     */
    function strToBuffer(str) {
        return new TextEncoder().encode(str);
    }

    /**
     * Converts an ArrayBuffer to UTF-8 string
     */
    function bufferToStr(buf) {
        return new TextDecoder().decode(buf);
    }

    /**
     * Converts ArrayBuffer to Base64 string
     */
    function bufferToBase64(buf) {
        const binString = Array.from(new Uint8Array(buf), byte => String.fromCharCode(byte)).join('');
        return btoa(binString);
    }

    /**
     * Converts Base64 string to ArrayBuffer
     */
    function base64ToBuffer(base64) {
        const binString = atob(base64);
        const bytes = new Uint8Array(binString.length);
        for (let i = 0; i < binString.length; i++) {
            bytes[i] = binString.charCodeAt(i);
        }
        return bytes.buffer;
    }

    return {
        /**
         * Checks if the browser supports the Web Crypto API
         */
        isSupported() {
            return typeof window !== 'undefined' && 
                   window.crypto && 
                   window.crypto.subtle && 
                   typeof window.crypto.subtle.encrypt === 'function';
        },

        /**
         * Checks if an active session encryption key is loaded in memory
         */
        hasActiveKey() {
            return _sessionCryptoKey !== null;
        },

        /**
         * Initializes / Derives an AES-GCM 256-bit key from authenticated user credentials
         * The resulting key is strictly maintained in ephemeral RAM memory.
         * @param {string} userId - User identifier
         * @param {string} entropySecret - Session secret or user credential hash
         */
        async initSessionKey(userId, entropySecret) {
            if (!this.isSupported()) {
                console.warn('Hodoori CryptoEngine: Web Crypto API not supported. Falling back to memory-only.');
                return false;
            }

            try {
                const combinedKeyMaterial = `hodoori_sec_v2_${userId || 'anon'}_${entropySecret || 'ephemeral'}_salt_2026`;
                const rawKeyBuffer = strToBuffer(combinedKeyMaterial);

                // 1. Import raw material as PBKDF2 base key
                const baseKey = await window.crypto.subtle.importKey(
                    'raw',
                    rawKeyBuffer,
                    { name: 'PBKDF2' },
                    false,
                    ['deriveKey']
                );

                // 2. Static domain salt for key derivation
                const salt = strToBuffer('hodoori_crypto_domain_salt_9982');

                // 3. Derive 256-bit AES-GCM encryption key
                _sessionCryptoKey = await window.crypto.subtle.deriveKey(
                    {
                        name: 'PBKDF2',
                        salt: salt,
                        iterations: 100000,
                        hash: 'SHA-256'
                    },
                    baseKey,
                    { name: 'AES-GCM', length: 256 },
                    false, // Non-exportable key for maximum memory safety
                    ['encrypt', 'decrypt']
                );

                _sessionKeyIdentifier = userId;
                return true;
            } catch (err) {
                console.error('Hodoori CryptoEngine: Key derivation failed:', err);
                _sessionCryptoKey = null;
                _sessionKeyIdentifier = null;
                return false;
            }
        },

        /**
         * Encrypts a plain JavaScript object or string into a secure AES-GCM 256-bit payload
         * @param {string|Object} data - Data to encrypt
         * @returns {Promise<string>} Base64 encoded payload: `iv:ciphertext`
         */
        async encrypt(data) {
            if (!data) return data;
            if (!this.hasActiveKey()) {
                return data;
            }

            try {
                const text = typeof data === 'object' ? JSON.stringify(data) : String(data);
                const dataBuffer = strToBuffer(text);

                // Generate a random 12-byte initialization vector (IV) per encryption
                const iv = window.crypto.getRandomValues(new Uint8Array(12));

                const encryptedBuffer = await window.crypto.subtle.encrypt(
                    {
                        name: 'AES-GCM',
                        iv: iv
                    },
                    _sessionCryptoKey,
                    dataBuffer
                );

                // Format: ENC:v1:[ivBase64]:[ciphertextBase64]
                const ivBase64 = bufferToBase64(iv);
                const cipherBase64 = bufferToBase64(encryptedBuffer);

                return `ENC:v1:${ivBase64}:${cipherBase64}`;
            } catch (err) {
                console.error('Hodoori CryptoEngine: Encryption failed:', err);
                return data;
            }
        },

        /**
         * Decrypts a secure AES-GCM payload back into original string or parsed object
         * @param {string} payload - Encrypted string starting with `ENC:v1:`
         * @returns {Promise<any>} Original decrypted data
         */
        async decrypt(payload) {
            if (typeof payload !== 'string' || !payload.startsWith('ENC:v1:')) {
                return payload;
            }

            if (!this.hasActiveKey()) {
                throw new Error('Hodoori CryptoEngine: Session locked. Decryption key is destroyed.');
            }

            try {
                const parts = payload.split(':');
                if (parts.length < 4) return payload;

                const ivBase64 = parts[2];
                const cipherBase64 = parts[3];

                const iv = new Uint8Array(base64ToBuffer(ivBase64));
                const cipherBuffer = base64ToBuffer(cipherBase64);

                const decryptedBuffer = await window.crypto.subtle.decrypt(
                    {
                        name: 'AES-GCM',
                        iv: iv
                    },
                    _sessionCryptoKey,
                    cipherBuffer
                );

                const decryptedText = bufferToStr(decryptedBuffer);

                try {
                    return JSON.parse(decryptedText);
                } catch (_) {
                    return decryptedText;
                }
            } catch (err) {
                console.error('Hodoori CryptoEngine: Decryption failed (Corrupted or Invalid Key):', err);
                throw new Error('فشل فك تشفير البيانات. الجلسة غير صالحة أو مقفلة.');
            }
        },

        /**
         * Completely destroys and wipes the active crypto key from RAM.
         * Renders all encrypted offline records on disk completely unreadable (Ciphertext Lock).
         */
        destroySessionKey() {
            _sessionCryptoKey = null;
            _sessionKeyIdentifier = null;
            console.log('🔒 Hodoori CryptoEngine: Session key destroyed. Data locked.');
        }
    };
})();

if (typeof window !== 'undefined') {
    window.CryptoEngine = CryptoEngine;
}

if (typeof global !== 'undefined') {
    global.CryptoEngine = CryptoEngine;
}

if (typeof module !== 'undefined' && module.exports) {
    module.exports = CryptoEngine;
}

