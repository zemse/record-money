import { useState } from 'react'
import { db, updateSettings } from '../db'

interface OnboardingProps {
  onComplete: () => void
}

type IdentifierType = 'email' | 'phone' | 'crypto'

export function Onboarding({ onComplete }: OnboardingProps) {
  const [step, setStep] = useState(1)
  const [name, setName] = useState('')
  const [identifierType, setIdentifierType] = useState<IdentifierType>('email')
  const [identifier, setIdentifier] = useState('')
  const [error, setError] = useState('')

  const handleSkip = async () => {
    // Mark onboarding as complete without setting user
    await updateSettings({ onboardingComplete: true })
    onComplete()
  }

  const handleComplete = async () => {
    setError('')

    // Validate
    if (!name.trim()) {
      setError('Please enter your name')
      return
    }
    if (!identifier.trim()) {
      setError('Please enter your identifier')
      return
    }

    // Format identifier based on type
    let formattedIdentifier = identifier.trim().toLowerCase()
    if (identifierType === 'email') {
      // Basic email validation
      if (!formattedIdentifier.includes('@')) {
        setError('Please enter a valid email address')
        return
      }
    } else if (identifierType === 'phone') {
      // Basic phone validation - should start with + or be numeric
      if (!/^[+\d][\d\s-]+$/.test(formattedIdentifier)) {
        setError('Please enter a valid phone number')
        return
      }
      formattedIdentifier = formattedIdentifier.replace(/[\s-]/g, '')
    } else if (identifierType === 'crypto') {
      // Crypto addresses/ENS names - just basic validation
      if (formattedIdentifier.length < 3) {
        setError('Please enter a valid crypto address or ENS name')
        return
      }
    }

    const fullIdentifier = `${identifierType}:${formattedIdentifier}`

    // Create user
    await db.users.add({
      email: fullIdentifier, // We use 'email' field but it stores the full identifier
      alias: name.trim(),
    })

    // Set as current user and mark onboarding complete
    await updateSettings({
      currentUserEmail: fullIdentifier,
      onboardingComplete: true,
    })

    onComplete()
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-surface-secondary p-4">
      <div className="w-full max-w-md rounded-2xl border border-border-default bg-surface p-6 shadow-lg">
        {step === 1 && (
          <div className="text-center">
            <span className="text-5xl">👋</span>
            <h1 className="mt-4 text-2xl font-semibold text-content">Welcome to Record Money</h1>
            <p className="mt-2 text-content-secondary">
              Track shared expenses and settle up with friends easily.
            </p>

            <div className="mt-8 space-y-3">
              <button
                onClick={() => setStep(2)}
                className="w-full rounded-xl bg-primary px-4 py-3 font-medium text-white transition-colors hover:bg-primary-hover"
              >
                Get Started
              </button>
              <button
                onClick={handleSkip}
                className="w-full rounded-xl bg-surface-tertiary px-4 py-3 font-medium text-content-secondary transition-colors hover:bg-surface-hover"
              >
                Skip for now
              </button>
            </div>

            <p className="mt-4 text-xs text-content-tertiary">
              All data stays on your device. No account required.
            </p>
          </div>
        )}

        {step === 2 && (
          <div>
            <button
              onClick={() => setStep(1)}
              className="mb-4 text-sm text-content-secondary hover:text-content"
            >
              ← Back
            </button>

            <h2 className="text-xl font-semibold text-content">What's your name?</h2>
            <p className="mt-1 text-sm text-content-secondary">
              This will be your display name in the app.
            </p>

            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Enter your name"
              className="mt-4 w-full rounded-xl border border-border-default bg-surface px-4 py-3 text-content transition-colors focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
              autoFocus
            />

            <button
              onClick={() => name.trim() && setStep(3)}
              disabled={!name.trim()}
              className="mt-4 w-full rounded-xl bg-primary px-4 py-3 font-medium text-white transition-colors hover:bg-primary-hover disabled:cursor-not-allowed disabled:opacity-50"
            >
              Continue
            </button>
          </div>
        )}

        {step === 3 && (
          <div>
            <button
              onClick={() => setStep(2)}
              className="mb-4 text-sm text-content-secondary hover:text-content"
            >
              ← Back
            </button>

            <h2 className="text-xl font-semibold text-content">Choose your identifier</h2>
            <p className="mt-1 text-sm text-content-secondary">
              This helps others recognize you when sharing expenses.
            </p>

            {/* Identifier Type Selector */}
            <div className="mt-4 grid grid-cols-3 gap-2">
              <button
                onClick={() => {
                  setIdentifierType('email')
                  setIdentifier('')
                }}
                className={`rounded-xl px-3 py-2.5 text-sm font-medium transition-colors ${
                  identifierType === 'email'
                    ? 'bg-primary text-white'
                    : 'bg-surface-tertiary text-content-secondary hover:bg-surface-hover'
                }`}
              >
                📧 Email
              </button>
              <button
                onClick={() => {
                  setIdentifierType('phone')
                  setIdentifier('')
                }}
                className={`rounded-xl px-3 py-2.5 text-sm font-medium transition-colors ${
                  identifierType === 'phone'
                    ? 'bg-primary text-white'
                    : 'bg-surface-tertiary text-content-secondary hover:bg-surface-hover'
                }`}
              >
                📱 Phone
              </button>
              <button
                onClick={() => {
                  setIdentifierType('crypto')
                  setIdentifier('')
                }}
                className={`rounded-xl px-3 py-2.5 text-sm font-medium transition-colors ${
                  identifierType === 'crypto'
                    ? 'bg-primary text-white'
                    : 'bg-surface-tertiary text-content-secondary hover:bg-surface-hover'
                }`}
              >
                🔗 Crypto
              </button>
            </div>

            {/* Identifier Input */}
            <input
              type={identifierType === 'email' ? 'email' : 'text'}
              value={identifier}
              onChange={(e) => setIdentifier(e.target.value)}
              placeholder={
                identifierType === 'email'
                  ? 'name@example.com'
                  : identifierType === 'phone'
                    ? '+91 98765 43210'
                    : 'vitalik.eth or 0x...'
              }
              className="mt-4 w-full rounded-xl border border-border-default bg-surface px-4 py-3 text-content transition-colors focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
            />

            {error && <p className="mt-2 text-sm text-red-500">{error}</p>}

            <p className="mt-3 text-xs text-content-tertiary">
              {identifierType === 'email' &&
                'Your email helps others find you when splitting bills.'}
              {identifierType === 'phone' && 'Include country code for international use.'}
              {identifierType === 'crypto' && 'Use your ENS name or wallet address.'}
            </p>

            <button
              onClick={handleComplete}
              disabled={!identifier.trim()}
              className="mt-4 w-full rounded-xl bg-primary px-4 py-3 font-medium text-white transition-colors hover:bg-primary-hover disabled:cursor-not-allowed disabled:opacity-50"
            >
              Complete Setup
            </button>
          </div>
        )}

        {/* Progress dots */}
        <div className="mt-6 flex justify-center gap-2">
          {[1, 2, 3].map((s) => (
            <div
              key={s}
              className={`h-2 w-2 rounded-full transition-colors ${
                s === step ? 'bg-primary' : s < step ? 'bg-primary/50' : 'bg-surface-tertiary'
              }`}
            />
          ))}
        </div>
      </div>
    </div>
  )
}
