/**
 * Cryptographic utilities for P2P sync
 *
 * Uses @noble/curves for all ECC operations (P-256, Ed25519)
 * and @noble/hashes for SHA-256, HKDF
 *
 * Key types:
 * - P-256: Signing (ECDSA) and key exchange (ECDH)
 * - Ed25519: IPNS key signing
 * - AES-256-GCM: Symmetric encryption
 */

import { p256 } from '@noble/curves/nist.js'
import { ed25519 } from '@noble/curves/ed25519.js'
import { sha256 } from '@noble/hashes/sha2.js'
import { hkdf } from '@noble/hashes/hkdf.js'
import { randomBytes } from '@noble/hashes/utils.js'

// ============================================================================
// Constants
// ============================================================================

/** HKDF info string for key derivation */
const HKDF_INFO = new TextEncoder().encode('recordmoney-key-share')

/** AES-GCM IV length in bytes (96 bits) */
const AES_GCM_IV_LENGTH = 12

/** AES key length in bytes (256 bits) */
const AES_KEY_LENGTH = 32

// ============================================================================
// P-256 Key Operations
// ============================================================================

export interface P256KeyPair {
  privateKey: Uint8Array // 32 bytes
  publicKey: Uint8Array // 65 bytes (uncompressed)
}

/**
 * Generate a new P-256 keypair for signing and ECDH
 */
export function generateP256KeyPair(): P256KeyPair {
  const { secretKey } = p256.keygen()
  const publicKey = p256.getPublicKey(secretKey, false) // false = uncompressed (65 bytes)
  return { privateKey: secretKey, publicKey }
}

/**
 * Get the public key from a P-256 private key
 */
export function getP256PublicKey(privateKey: Uint8Array): Uint8Array {
  return p256.getPublicKey(privateKey, false)
}

/**
 * Sign data with P-256 (ECDSA)
 * Returns 64-byte signature (r || s)
 */
export function signP256(privateKey: Uint8Array, messageHash: Uint8Array): Uint8Array {
  return p256.sign(messageHash, privateKey) // 64 bytes: r (32) || s (32)
}

/**
 * Verify a P-256 signature
 */
export function verifyP256(
  publicKey: Uint8Array,
  messageHash: Uint8Array,
  signature: Uint8Array
): boolean {
  try {
    return p256.verify(signature, messageHash, publicKey)
  } catch {
    return false
  }
}

/**
 * Perform ECDH key exchange with P-256
 * Returns 32-byte shared secret
 */
export function ecdhP256(privateKey: Uint8Array, publicKey: Uint8Array): Uint8Array {
  const sharedPoint = p256.getSharedSecret(privateKey, publicKey)
  // sharedPoint is 65 bytes (uncompressed), extract x-coordinate (32 bytes)
  return sharedPoint.slice(1, 33)
}

/**
 * Derive device ID from auth public key
 * deviceId = hex(SHA-256(authPublicKey))
 */
export function deriveDeviceId(authPublicKey: Uint8Array): string {
  const hash = sha256(authPublicKey)
  return bytesToHex(hash)
}

// ============================================================================
// Ed25519 Key Operations (for IPNS)
// ============================================================================

export interface Ed25519KeyPair {
  privateKey: Uint8Array // 32 bytes (seed)
  publicKey: Uint8Array // 32 bytes
}

/**
 * Generate a new Ed25519 keypair for IPNS
 */
export function generateEd25519KeyPair(): Ed25519KeyPair {
  const { secretKey, publicKey } = ed25519.keygen()
  return { privateKey: secretKey, publicKey }
}

/**
 * Get the public key from an Ed25519 private key
 */
export function getEd25519PublicKey(privateKey: Uint8Array): Uint8Array {
  return ed25519.getPublicKey(privateKey)
}

/**
 * Sign data with Ed25519
 */
export function signEd25519(privateKey: Uint8Array, message: Uint8Array): Uint8Array {
  return ed25519.sign(message, privateKey)
}

/**
 * Verify an Ed25519 signature
 */
export function verifyEd25519(
  publicKey: Uint8Array,
  message: Uint8Array,
  signature: Uint8Array
): boolean {
  try {
    return ed25519.verify(signature, message, publicKey)
  } catch {
    return false
  }
}

// ============================================================================
// Symmetric Key Generation
// ============================================================================

/**
 * Generate a random 256-bit symmetric key (for Personal Key, Broadcast Key, Group Key)
 */
export function generateSymmetricKey(): Uint8Array {
  return randomBytes(AES_KEY_LENGTH)
}

/**
 * Derive an AES key from ECDH shared secret using HKDF
 */
export function deriveAesKeyFromSharedSecret(sharedSecret: Uint8Array): Uint8Array {
  return hkdf(sha256, sharedSecret, new Uint8Array(0), HKDF_INFO, AES_KEY_LENGTH)
}

// ============================================================================
// AES-256-GCM Encryption
// ============================================================================

export interface EncryptedData {
  iv: Uint8Array // 12 bytes
  ciphertext: Uint8Array // variable length, includes auth tag
}

/**
 * Encrypt data with AES-256-GCM
 * Uses Web Crypto API for the actual encryption
 */
export async function encryptAesGcm(
  key: Uint8Array,
  plaintext: Uint8Array
): Promise<EncryptedData> {
  const iv = randomBytes(AES_GCM_IV_LENGTH)
  const cryptoKey = await crypto.subtle.importKey('raw', key, { name: 'AES-GCM' }, false, [
    'encrypt',
  ])

  const ciphertext = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, cryptoKey, plaintext)

  return {
    iv,
    ciphertext: new Uint8Array(ciphertext),
  }
}

/**
 * Decrypt data with AES-256-GCM
 * Throws if decryption fails (wrong key, tampered data)
 */
export async function decryptAesGcm(
  key: Uint8Array,
  iv: Uint8Array,
  ciphertext: Uint8Array
): Promise<Uint8Array> {
  const cryptoKey = await crypto.subtle.importKey('raw', key, { name: 'AES-GCM' }, false, [
    'decrypt',
  ])

  const plaintext = await crypto.subtle.decrypt({ name: 'AES-GCM', iv }, cryptoKey, ciphertext)

  return new Uint8Array(plaintext)
}

/**
 * Convenience function to encrypt and serialize to a single Uint8Array
 * Format: iv (12 bytes) || ciphertext
 */
export async function encryptAesGcmPacked(
  key: Uint8Array,
  plaintext: Uint8Array
): Promise<Uint8Array> {
  const { iv, ciphertext } = await encryptAesGcm(key, plaintext)
  const packed = new Uint8Array(iv.length + ciphertext.length)
  packed.set(iv, 0)
  packed.set(ciphertext, iv.length)
  return packed
}

/**
 * Convenience function to decrypt from a packed format
 * Expects: iv (12 bytes) || ciphertext
 */
export async function decryptAesGcmPacked(
  key: Uint8Array,
  packed: Uint8Array
): Promise<Uint8Array> {
  const iv = packed.slice(0, AES_GCM_IV_LENGTH)
  const ciphertext = packed.slice(AES_GCM_IV_LENGTH)
  return decryptAesGcm(key, iv, ciphertext)
}

// ============================================================================
// Hashing
// ============================================================================

/**
 * Compute SHA-256 hash
 */
export function hashSha256(data: Uint8Array): Uint8Array {
  return sha256(data)
}

/**
 * Compute SHA-256 hash of a string (UTF-8 encoded)
 */
export function hashSha256String(data: string): Uint8Array {
  return sha256(new TextEncoder().encode(data))
}

// ============================================================================
// Encoding Utilities
// ============================================================================

/**
 * Convert bytes to hex string
 */
export function bytesToHex(bytes: Uint8Array): string {
  return Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('')
}

/**
 * Convert hex string to bytes
 */
export function hexToBytes(hex: string): Uint8Array {
  if (hex.length % 2 !== 0) {
    throw new Error('Invalid hex string')
  }
  const bytes = new Uint8Array(hex.length / 2)
  for (let i = 0; i < bytes.length; i++) {
    bytes[i] = parseInt(hex.slice(i * 2, i * 2 + 2), 16)
  }
  return bytes
}

/**
 * Convert bytes to base64 string
 */
export function bytesToBase64(bytes: Uint8Array): string {
  const binary = String.fromCharCode(...bytes)
  return btoa(binary)
}

/**
 * Convert base64 string to bytes
 */
export function base64ToBytes(base64: string): Uint8Array {
  const binary = atob(base64)
  const bytes = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i)
  }
  return bytes
}

/**
 * Encode string to UTF-8 bytes
 */
export function stringToBytes(str: string): Uint8Array {
  return new TextEncoder().encode(str)
}

/**
 * Decode UTF-8 bytes to string
 */
export function bytesToString(bytes: Uint8Array): string {
  return new TextDecoder().decode(bytes)
}

// ============================================================================
// ECDH Key Sharing Helpers
// ============================================================================

/**
 * Encrypt data for a specific recipient using ECDH
 * 1. Compute shared secret via ECDH
 * 2. Derive AES key using HKDF
 * 3. Encrypt with AES-GCM
 */
export async function encryptForRecipient(
  senderPrivateKey: Uint8Array,
  recipientPublicKey: Uint8Array,
  plaintext: Uint8Array
): Promise<Uint8Array> {
  const sharedSecret = ecdhP256(senderPrivateKey, recipientPublicKey)
  const aesKey = deriveAesKeyFromSharedSecret(sharedSecret)
  return encryptAesGcmPacked(aesKey, plaintext)
}

/**
 * Decrypt data from a specific sender using ECDH
 */
export async function decryptFromSender(
  recipientPrivateKey: Uint8Array,
  senderPublicKey: Uint8Array,
  ciphertext: Uint8Array
): Promise<Uint8Array> {
  const sharedSecret = ecdhP256(recipientPrivateKey, senderPublicKey)
  const aesKey = deriveAesKeyFromSharedSecret(sharedSecret)
  return decryptAesGcmPacked(aesKey, ciphertext)
}

// ============================================================================
// Emoji Verification
// ============================================================================

/**
 * Emoji set for verification (256 emojis for 8 bits per emoji)
 * Using common, visually distinct emojis
 */
const EMOJI_SET = [
  '🍎',
  '🍊',
  '🍋',
  '🍇',
  '🍓',
  '🍒',
  '🍑',
  '🍍',
  '🥝',
  '🍅',
  '🥑',
  '🍆',
  '🥕',
  '🌽',
  '🥦',
  '🧅',
  '🍄',
  '🥜',
  '🌰',
  '🍞',
  '🥐',
  '🥖',
  '🧀',
  '🥚',
  '🍳',
  '🥓',
  '🥩',
  '🍗',
  '🍖',
  '🌭',
  '🍔',
  '🍟',
  '🍕',
  '🥪',
  '🥙',
  '🧆',
  '🌮',
  '🌯',
  '🥗',
  '🥘',
  '🍝',
  '🍜',
  '🍲',
  '🍛',
  '🍣',
  '🍱',
  '🥟',
  '🍤',
  '🍙',
  '🍚',
  '🍘',
  '🍥',
  '🥠',
  '🥮',
  '🍢',
  '🍡',
  '🍧',
  '🍨',
  '🍦',
  '🥧',
  '🧁',
  '🍰',
  '🎂',
  '🍮',
  '🍭',
  '🍬',
  '🍫',
  '🍿',
  '🧈',
  '🥛',
  '🍼',
  '☕',
  '🍵',
  '🧃',
  '🥤',
  '🧋',
  '🍶',
  '🍺',
  '🍻',
  '🥂',
  '🍷',
  '🥃',
  '🍸',
  '🍹',
  '🧉',
  '🍾',
  '🧊',
  '🥄',
  '🍴',
  '🍽️',
  '🥣',
  '🥡',
  '🥢',
  '🧂',
  '⚽',
  '🏀',
  '🏈',
  '⚾',
  '🥎',
  '🎾',
  '🏐',
  '🏉',
  '🥏',
  '🎱',
  '🪀',
  '🏓',
  '🏸',
  '🏒',
  '🏑',
  '🥍',
  '🏏',
  '🪃',
  '🥅',
  '⛳',
  '🪁',
  '🏹',
  '🎣',
  '🤿',
  '🥊',
  '🥋',
  '🎽',
  '🛹',
  '🛼',
  '🛷',
  '⛸️',
  '🥌',
  '🎿',
  '⛷️',
  '🏂',
  '🪂',
  '🏋️',
  '🤼',
  '🤸',
  '🤺',
  '⛹️',
  '🤾',
  '🏌️',
  '🏇',
  '🧘',
  '🏄',
  '🏊',
  '🤽',
  '🚣',
  '🧗',
  '🚴',
  '🚵',
  '🎖️',
  '🏆',
  '🏅',
  '🥇',
  '🥈',
  '🥉',
  '🎪',
  '🤹',
  '🎭',
  '🎨',
  '🎬',
  '🎤',
  '🎧',
  '🎼',
  '🎹',
  '🥁',
  '🪘',
  '🎷',
  '🎺',
  '🪗',
  '🎸',
  '🪕',
  '🎻',
  '🎲',
  '♟️',
  '🎯',
  '🎳',
  '🎮',
  '🎰',
  '🧩',
  '🚗',
  '🚕',
  '🚙',
  '🚌',
  '🚎',
  '🏎️',
  '🚓',
  '🚑',
  '🚒',
  '🚐',
  '🛻',
  '🚚',
  '🚛',
  '🚜',
  '🏍️',
  '🛵',
  '🚲',
  '🛴',
  '🛺',
  '🚨',
  '🚔',
  '🚍',
  '🚘',
  '🚖',
  '🚡',
  '🚠',
  '🚟',
  '🚃',
  '🚋',
  '🚝',
  '🚄',
  '🚅',
  '🚈',
  '🚂',
  '🚆',
  '🚇',
  '🚊',
  '🚉',
  '✈️',
  '🛫',
  '🛬',
  '🛩️',
  '💺',
  '🛰️',
  '🚀',
  '🛸',
  '🚁',
  '🛶',
  '⛵',
  '🚤',
  '🛥️',
  '🛳️',
  '⛴️',
  '🚢',
  '⚓',
  '🪝',
  '⛽',
  '🚧',
  '🚦',
  '🚥',
  '🛑',
  '🚏',
  '🗿',
  '🗽',
  '🗼',
  '🏰',
  '🏯',
  '🏟️',
  '🎡',
  '🎢',
  '🎠',
  '⛲',
  '⛱️',
  '🏖️',
  '🏝️',
  '🏜️',
  '🌋',
  '⛰️',
  '🏔️',
  '🗻',
]

/**
 * Derive 6 verification emojis from device keys
 * Uses first 6 bytes of SHA-256(ipnsPubKey || authPubKey)
 */
export function deriveVerificationEmojis(
  ipnsPublicKey: Uint8Array,
  authPublicKey: Uint8Array
): string[] {
  const combined = new Uint8Array(ipnsPublicKey.length + authPublicKey.length)
  combined.set(ipnsPublicKey, 0)
  combined.set(authPublicKey, ipnsPublicKey.length)

  const hash = sha256(combined)
  const emojis: string[] = []

  for (let i = 0; i < 6; i++) {
    emojis.push(EMOJI_SET[hash[i]])
  }

  return emojis
}
