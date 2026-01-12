// Claude API client for expense parsing and chat

const CLAUDE_API_URL = 'https://api.anthropic.com/v1/messages'
const CLAUDE_MODEL = 'claude-sonnet-4-20250514'

export interface Message {
  role: 'user' | 'assistant'
  content: string
}

export interface ClaudeResponse {
  success: true
  content: string
}

export interface ClaudeError {
  success: false
  error: string
}

// Validate API key by making a simple request
export async function validateApiKey(apiKey: string): Promise<ClaudeResponse | ClaudeError> {
  try {
    const response = await fetch(CLAUDE_API_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
        'anthropic-dangerous-direct-browser-access': 'true',
      },
      body: JSON.stringify({
        model: CLAUDE_MODEL,
        max_tokens: 10,
        messages: [{ role: 'user', content: 'Hi' }],
      }),
    })

    if (!response.ok) {
      const error = await response.json().catch(() => ({}))
      if (response.status === 401) {
        return { success: false, error: 'Invalid API key' }
      }
      return { success: false, error: error.error?.message || `API error: ${response.status}` }
    }

    return { success: true, content: 'API key is valid' }
  } catch (e) {
    return {
      success: false,
      error: e instanceof Error ? e.message : 'Network error',
    }
  }
}

// System prompt for expense parsing
const EXPENSE_SYSTEM_PROMPT = `You are an AI assistant for a personal expense tracking app called "Record Money". Your job is to help users manage their expenses through natural language.

CAPABILITIES:
1. Create expense records from natural language descriptions
2. Query existing expenses
3. Answer questions about balances and spending

WHEN CREATING EXPENSES, extract:
- title: Brief description of the expense
- amount: Numeric value
- currency: ISO 4217 code (default to INR if not specified)
- category: One of: Food, Transport, Shopping, Entertainment, Bills, Health, Travel, Other
- date: ISO format YYYY-MM-DD (default to today)
- paidBy: Who paid (default to "me" / current user)
- paidFor: Who the expense is for (default to same as paidBy for personal expenses)
- splitType: "equal", "exact", or "percentage"

RESPONSE FORMAT:
For expense creation, respond with a JSON block:
\`\`\`json
{
  "action": "create_expense",
  "data": {
    "title": "string",
    "amount": number,
    "currency": "string",
    "category": "string",
    "date": "YYYY-MM-DD",
    "paidBy": ["email or 'me'"],
    "paidFor": ["email or 'me'"],
    "splitType": "equal"
  },
  "confirmation": "Human-readable summary of what will be created"
}
\`\`\`

For queries, respond naturally with the requested information.

For unclear requests, ask clarifying questions.

IMPORTANT:
- Be concise and helpful
- Default to sensible values when not specified
- Use "me" for the current user in paidBy/paidFor
- Always include a confirmation message explaining the expense`

// Send message to Claude
export async function sendMessage(
  apiKey: string,
  messages: Message[],
  context?: {
    currentUserEmail?: string
    currentDate?: string
    users?: { email: string; alias: string }[]
  }
): Promise<ClaudeResponse | ClaudeError> {
  try {
    // Build context string
    let systemPrompt = EXPENSE_SYSTEM_PROMPT

    if (context) {
      systemPrompt += '\n\nCONTEXT:'
      if (context.currentUserEmail) {
        systemPrompt += `\n- Current user ("me"): ${context.currentUserEmail}`
      }
      if (context.currentDate) {
        systemPrompt += `\n- Today's date: ${context.currentDate}`
      }
      if (context.users && context.users.length > 0) {
        systemPrompt += `\n- Known users: ${context.users.map((u) => `${u.alias} (${u.email})`).join(', ')}`
      }
    }

    const response = await fetch(CLAUDE_API_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
        'anthropic-dangerous-direct-browser-access': 'true',
      },
      body: JSON.stringify({
        model: CLAUDE_MODEL,
        max_tokens: 1024,
        system: systemPrompt,
        messages: messages.map((m) => ({
          role: m.role,
          content: m.content,
        })),
      }),
    })

    if (!response.ok) {
      const error = await response.json().catch(() => ({}))
      if (response.status === 401) {
        return { success: false, error: 'Invalid API key' }
      }
      if (response.status === 429) {
        return { success: false, error: 'Rate limited. Please wait a moment.' }
      }
      return { success: false, error: error.error?.message || `API error: ${response.status}` }
    }

    const data = await response.json()
    const content = data.content?.[0]?.text || ''

    return { success: true, content }
  } catch (e) {
    return {
      success: false,
      error: e instanceof Error ? e.message : 'Network error',
    }
  }
}

// Parse expense action from Claude's response
export interface ExpenseAction {
  action: 'create_expense'
  data: {
    title: string
    amount: number
    currency: string
    category: string
    date: string
    paidBy: string[]
    paidFor: string[]
    splitType: 'equal' | 'exact' | 'percentage'
  }
  confirmation: string
}

export function parseExpenseAction(content: string): ExpenseAction | null {
  // Look for JSON block in response
  const jsonMatch = content.match(/```json\s*([\s\S]*?)\s*```/)
  if (!jsonMatch) return null

  try {
    const parsed = JSON.parse(jsonMatch[1])
    if (parsed.action === 'create_expense' && parsed.data) {
      return parsed as ExpenseAction
    }
    return null
  } catch {
    return null
  }
}
