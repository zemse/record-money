import { useState } from 'react'

// Common expense-related emojis organized by category
const EMOJI_GROUPS = {
  Food: ['🍽️', '🍕', '🍔', '🍜', '🍣', '☕', '🍺', '🍷', '🧁', '🍦'],
  Transport: ['🚗', '🚕', '🚌', '✈️', '🚆', '🛵', '⛽', '🚢', '🚲', '🛴'],
  Shopping: ['🛍️', '🛒', '👕', '👟', '💄', '🎁', '📱', '💻', '🎮', '📚'],
  Home: ['🏠', '🔑', '🛋️', '🔧', '💡', '🧹', '🧺', '🪴', '🚿', '🛏️'],
  Health: ['💊', '🏥', '🩺', '💉', '🧘', '🏋️', '🧴', '🩹', '👓', '🦷'],
  Entertainment: ['🎬', '🎵', '🎮', '📺', '🎭', '🎪', '🎡', '🎤', '🎸', '🎯'],
  Money: ['💰', '💵', '💳', '🏦', '📈', '💸', '🤝', '🧾', '📊', '💎'],
  Nature: ['🌳', '🌊', '⛰️', '🏖️', '🌸', '🐕', '🐈', '🦜', '🌅', '🏕️'],
  Objects: ['📄', '✉️', '📦', '🔋', '📷', '⌚', '🎒', '👜', '🧳', '🎓'],
}

interface EmojiPickerProps {
  onSelect: (emoji: string) => void
  onClose: () => void
}

export function EmojiPicker({ onSelect, onClose }: EmojiPickerProps) {
  const [selectedGroup, setSelectedGroup] = useState<keyof typeof EMOJI_GROUPS>('Food')

  const handleSelect = (emoji: string) => {
    onSelect(emoji)
    onClose()
  }

  return (
    <div className="rounded-xl border border-border-default bg-surface p-3 shadow-lg">
      {/* Category tabs */}
      <div className="mb-3 flex flex-wrap gap-1">
        {Object.keys(EMOJI_GROUPS).map((group) => (
          <button
            key={group}
            onClick={() => setSelectedGroup(group as keyof typeof EMOJI_GROUPS)}
            className={`rounded-lg px-2 py-1 text-xs font-medium transition-colors ${
              selectedGroup === group
                ? 'bg-primary text-white'
                : 'bg-surface-tertiary text-content-secondary hover:bg-surface-hover'
            }`}
          >
            {group}
          </button>
        ))}
      </div>

      {/* Emoji grid */}
      <div className="grid grid-cols-5 gap-1">
        {EMOJI_GROUPS[selectedGroup].map((emoji) => (
          <button
            key={emoji}
            onClick={() => handleSelect(emoji)}
            className="flex h-10 w-10 items-center justify-center rounded-lg text-xl transition-colors hover:bg-surface-tertiary"
          >
            {emoji}
          </button>
        ))}
      </div>

      {/* Close button */}
      <div className="mt-3 border-t border-border-default pt-2">
        <button
          onClick={onClose}
          className="w-full rounded-lg bg-surface-tertiary px-3 py-1.5 text-xs font-medium text-content-secondary hover:bg-surface-hover"
        >
          Cancel
        </button>
      </div>
    </div>
  )
}
