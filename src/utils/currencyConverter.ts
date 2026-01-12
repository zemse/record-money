import { db } from '../db'
import type { ExchangeRates } from '../types'

// Frankfurter API base URL
const FRANKFURTER_API = 'https://api.frankfurter.app'

// Cache duration: 1 hour in milliseconds
const CACHE_DURATION_MS = 60 * 60 * 1000

// Supported currencies
export const SUPPORTED_CURRENCIES = [
  'AUD',
  'BGN',
  'BRL',
  'CAD',
  'CHF',
  'CNY',
  'CZK',
  'DKK',
  'EUR',
  'GBP',
  'HKD',
  'HUF',
  'IDR',
  'ILS',
  'INR',
  'ISK',
  'JPY',
  'KRW',
  'MXN',
  'MYR',
  'NOK',
  'NZD',
  'PHP',
  'PLN',
  'RON',
  'SEK',
  'SGD',
  'THB',
  'TRY',
  'USD',
  'ZAR',
]

/**
 * Get stored exchange rates from IndexedDB
 */
export async function getStoredRates(): Promise<ExchangeRates | undefined> {
  return db.exchangeRates.get('rates')
}

/**
 * Check if stored rates are still valid (not expired)
 */
export function areRatesValid(rates: ExchangeRates | undefined): boolean {
  if (!rates) return false
  const age = Date.now() - rates.fetchedAt
  return age < CACHE_DURATION_MS
}

/**
 * Fetch fresh exchange rates from Frankfurter API
 * Uses EUR as base currency (Frankfurter's default)
 */
export async function fetchExchangeRates(): Promise<ExchangeRates> {
  const response = await fetch(`${FRANKFURTER_API}/latest`)

  if (!response.ok) {
    throw new Error(`Failed to fetch exchange rates: ${response.statusText}`)
  }

  const data = await response.json()

  const rates: ExchangeRates = {
    key: 'rates',
    baseCurrency: data.base || 'EUR',
    rates: {
      ...data.rates,
      [data.base || 'EUR']: 1, // Add base currency with rate 1
    },
    fetchedAt: Date.now(),
  }

  // Store in IndexedDB
  const existing = await getStoredRates()
  if (existing) {
    await db.exchangeRates.update('rates', {
      baseCurrency: rates.baseCurrency,
      rates: rates.rates,
      fetchedAt: rates.fetchedAt,
    })
  } else {
    await db.exchangeRates.add(rates)
  }

  return rates
}

/**
 * Get exchange rates - returns cached if valid, otherwise fetches fresh
 */
export async function getExchangeRates(forceRefresh = false): Promise<ExchangeRates | null> {
  try {
    // Check cached rates first
    if (!forceRefresh) {
      const cached = await getStoredRates()
      if (areRatesValid(cached)) {
        return cached!
      }
    }

    // Fetch fresh rates
    return await fetchExchangeRates()
  } catch (error) {
    console.error('Failed to get exchange rates:', error)

    // Return stale cached rates if available (better than nothing)
    const cached = await getStoredRates()
    if (cached) {
      return cached
    }

    return null
  }
}

/**
 * Convert amount from one currency to another
 */
export function convertAmount(
  amount: number,
  fromCurrency: string,
  toCurrency: string,
  rates: ExchangeRates
): number {
  if (fromCurrency === toCurrency) return amount

  const fromRate = rates.rates[fromCurrency]
  const toRate = rates.rates[toCurrency]

  if (!fromRate || !toRate) {
    console.warn(`Cannot convert ${fromCurrency} to ${toCurrency}: rate not found`)
    return amount // Return original if conversion not possible
  }

  // Convert through base currency (EUR)
  // amount in EUR = amount / fromRate
  // amount in target = (amount / fromRate) * toRate
  return (amount / fromRate) * toRate
}

/**
 * Format the "rates as of" timestamp for display
 */
export function formatRatesTimestamp(fetchedAt: number): string {
  const date = new Date(fetchedAt)
  return date.toLocaleString('en-IN', {
    dateStyle: 'medium',
    timeStyle: 'short',
  })
}

/**
 * Check if rates need refresh (older than cache duration)
 */
export function ratesNeedRefresh(rates: ExchangeRates | undefined): boolean {
  return !areRatesValid(rates)
}

/**
 * Get age of rates in human-readable format
 */
export function getRatesAge(fetchedAt: number): string {
  const ageMs = Date.now() - fetchedAt
  const ageMinutes = Math.floor(ageMs / (60 * 1000))
  const ageHours = Math.floor(ageMs / (60 * 60 * 1000))
  const ageDays = Math.floor(ageMs / (24 * 60 * 60 * 1000))

  if (ageDays > 0) return `${ageDays} day${ageDays > 1 ? 's' : ''} ago`
  if (ageHours > 0) return `${ageHours} hour${ageHours > 1 ? 's' : ''} ago`
  if (ageMinutes > 0) return `${ageMinutes} minute${ageMinutes > 1 ? 's' : ''} ago`
  return 'just now'
}
