/**
 * Tests for crypto module
 */

import { describe, it, expect } from 'vitest'
import {
  generateP256KeyPair,
  getP256PublicKey,
  signP256,
  verifyP256,
  ecdhP256,
  deriveDeviceId,
  generateEd25519KeyPair,
  getEd25519PublicKey,
  signEd25519,
  verifyEd25519,
  generateSymmetricKey,
  deriveAesKeyFromSharedSecret,
  encryptAesGcm,
  decryptAesGcm,
  encryptAesGcmPacked,
  decryptAesGcmPacked,
  hashSha256,
  hashSha256String,
  bytesToHex,
  hexToBytes,
  bytesToBase64,
  base64ToBytes,
  stringToBytes,
  bytesToString,
  encryptForRecipient,
  decryptFromSender,
  deriveVerificationEmojis,
} from './crypto'

describe('P-256 Key Operations', () => {
  it('should generate a valid P-256 keypair', () => {
    const keyPair = generateP256KeyPair()

    expect(keyPair.privateKey).toBeInstanceOf(Uint8Array)
    expect(keyPair.publicKey).toBeInstanceOf(Uint8Array)
    expect(keyPair.privateKey.length).toBe(32)
    expect(keyPair.publicKey.length).toBe(65) // uncompressed
    expect(keyPair.publicKey[0]).toBe(0x04) // uncompressed prefix
  })

  it('should derive public key from private key', () => {
    const keyPair = generateP256KeyPair()
    const derivedPublic = getP256PublicKey(keyPair.privateKey)

    expect(derivedPublic).toEqual(keyPair.publicKey)
  })

  it('should generate different keypairs each time', () => {
    const kp1 = generateP256KeyPair()
    const kp2 = generateP256KeyPair()

    expect(kp1.privateKey).not.toEqual(kp2.privateKey)
    expect(kp1.publicKey).not.toEqual(kp2.publicKey)
  })
})

describe('P-256 Signing', () => {
  it('should sign and verify a message', () => {
    const keyPair = generateP256KeyPair()
    const message = hashSha256String('test message')

    const signature = signP256(keyPair.privateKey, message)

    expect(signature).toBeInstanceOf(Uint8Array)
    expect(signature.length).toBe(64) // r || s

    const isValid = verifyP256(keyPair.publicKey, message, signature)
    expect(isValid).toBe(true)
  })

  it('should reject invalid signature', () => {
    const keyPair = generateP256KeyPair()
    const message = hashSha256String('test message')
    const signature = signP256(keyPair.privateKey, message)

    // Tamper with signature
    const tamperedSig = new Uint8Array(signature)
    tamperedSig[0] ^= 0xff

    const isValid = verifyP256(keyPair.publicKey, message, tamperedSig)
    expect(isValid).toBe(false)
  })

  it('should reject signature with wrong public key', () => {
    const kp1 = generateP256KeyPair()
    const kp2 = generateP256KeyPair()
    const message = hashSha256String('test message')
    const signature = signP256(kp1.privateKey, message)

    const isValid = verifyP256(kp2.publicKey, message, signature)
    expect(isValid).toBe(false)
  })

  it('should reject signature with wrong message', () => {
    const keyPair = generateP256KeyPair()
    const message1 = hashSha256String('message 1')
    const message2 = hashSha256String('message 2')
    const signature = signP256(keyPair.privateKey, message1)

    const isValid = verifyP256(keyPair.publicKey, message2, signature)
    expect(isValid).toBe(false)
  })
})

describe('P-256 ECDH', () => {
  it('should compute same shared secret from both sides', () => {
    const alice = generateP256KeyPair()
    const bob = generateP256KeyPair()

    const secretAlice = ecdhP256(alice.privateKey, bob.publicKey)
    const secretBob = ecdhP256(bob.privateKey, alice.publicKey)

    expect(secretAlice).toEqual(secretBob)
    expect(secretAlice.length).toBe(32)
  })

  it('should produce different secrets with different key pairs', () => {
    const alice = generateP256KeyPair()
    const bob = generateP256KeyPair()
    const charlie = generateP256KeyPair()

    const secretAB = ecdhP256(alice.privateKey, bob.publicKey)
    const secretAC = ecdhP256(alice.privateKey, charlie.publicKey)

    expect(secretAB).not.toEqual(secretAC)
  })
})

describe('Device ID Derivation', () => {
  it('should derive a 64-character hex device ID', () => {
    const keyPair = generateP256KeyPair()
    const deviceId = deriveDeviceId(keyPair.publicKey)

    expect(deviceId).toMatch(/^[a-f0-9]{64}$/)
  })

  it('should produce same device ID for same public key', () => {
    const keyPair = generateP256KeyPair()
    const id1 = deriveDeviceId(keyPair.publicKey)
    const id2 = deriveDeviceId(keyPair.publicKey)

    expect(id1).toBe(id2)
  })

  it('should produce different device IDs for different keys', () => {
    const kp1 = generateP256KeyPair()
    const kp2 = generateP256KeyPair()

    const id1 = deriveDeviceId(kp1.publicKey)
    const id2 = deriveDeviceId(kp2.publicKey)

    expect(id1).not.toBe(id2)
  })
})

describe('Ed25519 Key Operations', () => {
  it('should generate a valid Ed25519 keypair', () => {
    const keyPair = generateEd25519KeyPair()

    expect(keyPair.privateKey).toBeInstanceOf(Uint8Array)
    expect(keyPair.publicKey).toBeInstanceOf(Uint8Array)
    expect(keyPair.privateKey.length).toBe(32)
    expect(keyPair.publicKey.length).toBe(32)
  })

  it('should derive public key from private key', () => {
    const keyPair = generateEd25519KeyPair()
    const derivedPublic = getEd25519PublicKey(keyPair.privateKey)

    expect(derivedPublic).toEqual(keyPair.publicKey)
  })
})

describe('Ed25519 Signing', () => {
  it('should sign and verify a message', () => {
    const keyPair = generateEd25519KeyPair()
    const message = stringToBytes('test message')

    const signature = signEd25519(keyPair.privateKey, message)

    expect(signature).toBeInstanceOf(Uint8Array)
    expect(signature.length).toBe(64)

    const isValid = verifyEd25519(keyPair.publicKey, message, signature)
    expect(isValid).toBe(true)
  })

  it('should reject invalid signature', () => {
    const keyPair = generateEd25519KeyPair()
    const message = stringToBytes('test message')
    const signature = signEd25519(keyPair.privateKey, message)

    const tamperedSig = new Uint8Array(signature)
    tamperedSig[0] ^= 0xff

    const isValid = verifyEd25519(keyPair.publicKey, message, tamperedSig)
    expect(isValid).toBe(false)
  })
})

describe('Symmetric Key Generation', () => {
  it('should generate a 32-byte symmetric key', () => {
    const key = generateSymmetricKey()

    expect(key).toBeInstanceOf(Uint8Array)
    expect(key.length).toBe(32)
  })

  it('should generate different keys each time', () => {
    const key1 = generateSymmetricKey()
    const key2 = generateSymmetricKey()

    expect(key1).not.toEqual(key2)
  })
})

describe('AES Key Derivation', () => {
  it('should derive a 32-byte AES key from shared secret', () => {
    const sharedSecret = generateSymmetricKey()
    const aesKey = deriveAesKeyFromSharedSecret(sharedSecret)

    expect(aesKey).toBeInstanceOf(Uint8Array)
    expect(aesKey.length).toBe(32)
  })

  it('should produce same key from same secret', () => {
    const sharedSecret = generateSymmetricKey()
    const key1 = deriveAesKeyFromSharedSecret(sharedSecret)
    const key2 = deriveAesKeyFromSharedSecret(sharedSecret)

    expect(key1).toEqual(key2)
  })
})

describe('AES-256-GCM Encryption', () => {
  it('should encrypt and decrypt data', async () => {
    const key = generateSymmetricKey()
    const plaintext = stringToBytes('Hello, World!')

    const encrypted = await encryptAesGcm(key, plaintext)

    expect(encrypted.iv).toBeInstanceOf(Uint8Array)
    expect(encrypted.iv.length).toBe(12)
    expect(encrypted.ciphertext).toBeInstanceOf(Uint8Array)
    expect(encrypted.ciphertext.length).toBeGreaterThan(plaintext.length) // includes auth tag

    const decrypted = await decryptAesGcm(key, encrypted.iv, encrypted.ciphertext)
    expect(decrypted).toEqual(plaintext)
  })

  it('should produce different ciphertext for same plaintext (random IV)', async () => {
    const key = generateSymmetricKey()
    const plaintext = stringToBytes('test')

    const enc1 = await encryptAesGcm(key, plaintext)
    const enc2 = await encryptAesGcm(key, plaintext)

    expect(enc1.iv).not.toEqual(enc2.iv)
    expect(enc1.ciphertext).not.toEqual(enc2.ciphertext)
  })

  it('should fail decryption with wrong key', async () => {
    const key1 = generateSymmetricKey()
    const key2 = generateSymmetricKey()
    const plaintext = stringToBytes('secret')

    const encrypted = await encryptAesGcm(key1, plaintext)

    await expect(decryptAesGcm(key2, encrypted.iv, encrypted.ciphertext)).rejects.toThrow()
  })

  it('should fail decryption with tampered ciphertext', async () => {
    const key = generateSymmetricKey()
    const plaintext = stringToBytes('secret')

    const encrypted = await encryptAesGcm(key, plaintext)
    encrypted.ciphertext[0] ^= 0xff

    await expect(decryptAesGcm(key, encrypted.iv, encrypted.ciphertext)).rejects.toThrow()
  })
})

describe('AES-GCM Packed Format', () => {
  it('should encrypt and decrypt with packed format', async () => {
    const key = generateSymmetricKey()
    const plaintext = stringToBytes('packed test')

    const packed = await encryptAesGcmPacked(key, plaintext)

    expect(packed).toBeInstanceOf(Uint8Array)
    expect(packed.length).toBeGreaterThan(12 + plaintext.length)

    const decrypted = await decryptAesGcmPacked(key, packed)
    expect(decrypted).toEqual(plaintext)
  })
})

describe('Hashing', () => {
  it('should compute SHA-256 hash of bytes', () => {
    const data = stringToBytes('test')
    const hash = hashSha256(data)

    expect(hash).toBeInstanceOf(Uint8Array)
    expect(hash.length).toBe(32)
  })

  it('should compute SHA-256 hash of string', () => {
    const hash = hashSha256String('test')

    expect(hash).toBeInstanceOf(Uint8Array)
    expect(hash.length).toBe(32)
  })

  it('should produce same hash for same input', () => {
    const hash1 = hashSha256String('hello')
    const hash2 = hashSha256String('hello')

    expect(hash1).toEqual(hash2)
  })

  it('should produce different hash for different input', () => {
    const hash1 = hashSha256String('hello')
    const hash2 = hashSha256String('world')

    expect(hash1).not.toEqual(hash2)
  })
})

describe('Encoding Utilities', () => {
  describe('Hex encoding', () => {
    it('should convert bytes to hex', () => {
      const bytes = new Uint8Array([0x01, 0x23, 0x45, 0x67, 0x89, 0xab, 0xcd, 0xef])
      const hex = bytesToHex(bytes)

      expect(hex).toBe('0123456789abcdef')
    })

    it('should convert hex to bytes', () => {
      const hex = '0123456789abcdef'
      const bytes = hexToBytes(hex)

      expect(bytes).toEqual(new Uint8Array([0x01, 0x23, 0x45, 0x67, 0x89, 0xab, 0xcd, 0xef]))
    })

    it('should round-trip hex encoding', () => {
      const original = new Uint8Array([1, 2, 3, 4, 5])
      const hex = bytesToHex(original)
      const decoded = hexToBytes(hex)

      expect(decoded).toEqual(original)
    })

    it('should throw on invalid hex string', () => {
      expect(() => hexToBytes('123')).toThrow() // odd length
    })
  })

  describe('Base64 encoding', () => {
    it('should convert bytes to base64', () => {
      const bytes = stringToBytes('Hello, World!')
      const base64 = bytesToBase64(bytes)

      expect(base64).toBe('SGVsbG8sIFdvcmxkIQ==')
    })

    it('should convert base64 to bytes', () => {
      const base64 = 'SGVsbG8sIFdvcmxkIQ=='
      const bytes = base64ToBytes(base64)

      expect(bytesToString(bytes)).toBe('Hello, World!')
    })

    it('should round-trip base64 encoding', () => {
      const original = generateSymmetricKey()
      const base64 = bytesToBase64(original)
      const decoded = base64ToBytes(base64)

      expect(decoded).toEqual(original)
    })
  })

  describe('String encoding', () => {
    it('should encode and decode strings', () => {
      const original = 'Hello, 世界! 🚀'
      const bytes = stringToBytes(original)
      const decoded = bytesToString(bytes)

      expect(decoded).toBe(original)
    })
  })
})

describe('ECDH Key Sharing', () => {
  it('should encrypt and decrypt for recipient', async () => {
    const sender = generateP256KeyPair()
    const recipient = generateP256KeyPair()
    const plaintext = stringToBytes('secret message')

    const ciphertext = await encryptForRecipient(sender.privateKey, recipient.publicKey, plaintext)

    const decrypted = await decryptFromSender(recipient.privateKey, sender.publicKey, ciphertext)

    expect(decrypted).toEqual(plaintext)
  })

  it('should fail with wrong recipient', async () => {
    const sender = generateP256KeyPair()
    const recipient = generateP256KeyPair()
    const wrongRecipient = generateP256KeyPair()
    const plaintext = stringToBytes('secret')

    const ciphertext = await encryptForRecipient(sender.privateKey, recipient.publicKey, plaintext)

    await expect(
      decryptFromSender(wrongRecipient.privateKey, sender.publicKey, ciphertext)
    ).rejects.toThrow()
  })
})

describe('Emoji Verification', () => {
  it('should derive 6 emojis from keys', () => {
    const ipnsKeyPair = generateEd25519KeyPair()
    const authKeyPair = generateP256KeyPair()

    const emojis = deriveVerificationEmojis(ipnsKeyPair.publicKey, authKeyPair.publicKey)

    expect(emojis).toHaveLength(6)
    emojis.forEach((emoji) => {
      expect(typeof emoji).toBe('string')
      expect(emoji.length).toBeGreaterThan(0)
    })
  })

  it('should produce same emojis for same keys', () => {
    const ipnsKeyPair = generateEd25519KeyPair()
    const authKeyPair = generateP256KeyPair()

    const emojis1 = deriveVerificationEmojis(ipnsKeyPair.publicKey, authKeyPair.publicKey)
    const emojis2 = deriveVerificationEmojis(ipnsKeyPair.publicKey, authKeyPair.publicKey)

    expect(emojis1).toEqual(emojis2)
  })

  it('should produce different emojis for different keys', () => {
    const ipns1 = generateEd25519KeyPair()
    const ipns2 = generateEd25519KeyPair()
    const auth = generateP256KeyPair()

    const emojis1 = deriveVerificationEmojis(ipns1.publicKey, auth.publicKey)
    const emojis2 = deriveVerificationEmojis(ipns2.publicKey, auth.publicKey)

    // Very unlikely to be equal with different keys
    expect(emojis1).not.toEqual(emojis2)
  })
})
