const assert = require('assert');
const { webcrypto } = require('crypto');
global.window = { crypto: webcrypto };

const CryptoEngine = require('../scripts/core-crypto.js');

async function testCrypto() {
    console.log("=== Testing CryptoEngine & Zero-Knowledge Lockdown ===");

    // 1. Initialize session key
    const initRes = await CryptoEngine.initSessionKey("teacher_01", "secret_pass_123");
    assert.strictEqual(initRes, true, "Session key should initialize successfully");
    assert.strictEqual(CryptoEngine.hasActiveKey(), true, "CryptoEngine should report active key");

    // 2. Encrypt sensitive student data
    const studentData = { id: 'std_99', name: 'سليم الخديوي', phone: '0599123456', nationalId: '401928374' };
    const encrypted = await CryptoEngine.encrypt(studentData);
    assert.ok(typeof encrypted === 'string' && encrypted.startsWith('ENC:v1:'), "Data should be encrypted with ENC:v1 prefix");
    assert.ok(!encrypted.includes('سليم'), "Plaintext Arabic name must not exist in ciphertext");
    assert.ok(!encrypted.includes('0599123456'), "Phone number must not exist in ciphertext");

    // 3. Decrypt data while session is active
    const decrypted = await CryptoEngine.decrypt(encrypted);
    assert.deepStrictEqual(decrypted, studentData, "Decrypted data must exactly match original student object");
    console.log("  ✓ PASS: AES-GCM 256-bit encryption and decryption verified");

    // 4. Destroy session key (Simulate Logout)
    CryptoEngine.destroySessionKey();
    assert.strictEqual(CryptoEngine.hasActiveKey(), false, "CryptoEngine key should be destroyed on logout");

    // 5. Verify decryption is completely blocked after logout
    let blocked = false;
    try {
        await CryptoEngine.decrypt(encrypted);
    } catch (err) {
        blocked = true;
    }
    assert.strictEqual(blocked, true, "Decryption must throw error and be strictly blocked after logout key destruction");
    console.log("  ✓ PASS: Zero-knowledge data lockdown on logout verified (Ciphertext locked)");

    console.log("\n========================================");
    console.log("Crypto Test Results: All Passed (100%)");
    console.log("========================================");
}

testCrypto().catch(err => {
    console.error("Crypto test failed:", err);
    process.exit(1);
});
