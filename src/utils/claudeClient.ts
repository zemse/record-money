// Claude API client for expense parsing and chat

import { DEFAULT_CLAUDE_MODEL, type ClaudeModel } from '../types'

const CLAUDE_API_URL = 'https://api.anthropic.com/v1/messages'

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
export async function validateApiKey(
  apiKey: string,
  model: ClaudeModel = DEFAULT_CLAUDE_MODEL
): Promise<ClaudeResponse | ClaudeError> {
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
        model,
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
2. Update existing expenses (change amount, title, category, etc.)
3. Delete expenses
4. Query existing expenses from the data provided in CONTEXT
5. Answer questions about balances and spending using the balance data in CONTEXT

WHEN CREATING EXPENSES, extract:
- title: Brief description of the expense
- amount: Numeric value
- currency: ISO 4217 code (default to INR if not specified)
- category: One of: Food, Transport, Shopping, Entertainment, Bills, Health, Travel, Other
- date: ISO format YYYY-MM-DD (default to today)
- paidBy: Who paid (default to "me" / current user)
- paidFor: Who the expense is for (default to same as paidBy for personal expenses)
- splitType: "equal", "exact", or "percentage"
- accounts: Optional array of payment accounts with amounts (if user mentions which account they paid from)

RESPONSE FORMAT:

For expense CREATION:
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
    "splitType": "equal",
    "accounts": [{"accountId": "account-id", "amount": number}]
  },
  "confirmation": "Human-readable summary of what will be created"
}
\`\`\`
Note: "accounts" is optional. Only include it if the user specifies which account(s) they paid from. Match account names from AVAILABLE ACCOUNTS.

For expense UPDATE (only include fields that are changing):
\`\`\`json
{
  "action": "update_expense",
  "data": {
    "uuid": "the expense uuid from RECENT EXPENSES",
    "title": "new title (optional)",
    "amount": new_amount (optional),
    "currency": "new currency (optional)",
    "category": "new category (optional)",
    "date": "new date (optional)"
  },
  "confirmation": "Human-readable summary of what will be changed"
}
\`\`\`

For expense DELETE:
\`\`\`json
{
  "action": "delete_expense",
  "data": {
    "uuid": "the expense uuid from RECENT EXPENSES"
  },
  "confirmation": "Human-readable summary of what will be deleted"
}
\`\`\`

For CREATING a new payment ACCOUNT:
\`\`\`json
{
  "action": "create_account",
  "data": {
    "name": "Account name",
    "icon": "💳",
    "thenCreateExpense": {
      "title": "string",
      "amount": number,
      "currency": "string",
      "category": "string",
      "date": "YYYY-MM-DD",
      "paidBy": ["email or 'me'"],
      "paidFor": ["email or 'me'"],
      "splitType": "equal"
    }
  },
  "confirmation": "Human-readable summary"
}
\`\`\`
Note: "thenCreateExpense" is optional. Include it when the user wants to create both account and expense in one go.

For queries about expenses, balances, or spending:
- Use the RECENT EXPENSES data to answer questions about spending history
- Use the BALANCES data to answer questions about who owes whom
- Respond naturally with the requested information
- Format currency amounts nicely (e.g., ₹450 or INR 450)

HANDLING UNKNOWN ACCOUNTS:
When user mentions an account name that doesn't exist in AVAILABLE ACCOUNTS:
1. Check if there's a similar account name (e.g., "cash" vs "Cash", "hdfc" vs "HDFC Bank")
2. If similar accounts exist, ask: "Did you mean [similar account]? Or would you like me to create a new account called '[mentioned name]'?"
3. If no similar accounts, ask: "I don't see '[mentioned name]' in your accounts. Would you like me to create it?"
4. Choose an appropriate emoji icon based on the account name (💵 for cash, 🏦 for banks, 📱 for digital wallets like Paytm/GPay, 💳 for cards)
5. Only create the account after user confirms

For unclear requests, ask clarifying questions.

IMPORTANT:
- Be concise and helpful
- Default to sensible values when not specified
- Use "me" for the current user in paidBy/paidFor
- Always include a confirmation message explaining the action
- When answering balance queries, use the pre-calculated balance data provided
- "owes" means the current user owes money TO those people
- "owedBy" means those people owe money TO the current user
- For update/delete, you MUST use the exact uuid from RECENT EXPENSES
- If user refers to an expense vaguely (e.g., "the lunch yesterday"), find the matching expense in RECENT EXPENSES and use its uuid`

// Send message to Claude
export async function sendMessage(
  apiKey: string,
  messages: Message[],
  context?: {
    currentUserEmail?: string
    currentDate?: string
    userSummary?: string // AI memory - brief summary of user preferences
    users?: { email: string; alias: string }[]
    accounts?: { id: string; name: string; icon: string }[]
    defaultAccountId?: string
    recentExpenses?: {
      uuid: string
      title: string
      amount: number
      currency: string
      category: string
      date: string
      paidBy: string[]
      paidFor: string[]
    }[]
    balances?: {
      owes: { email: string; amount: number; currency: string }[]
      owedBy: { email: string; amount: number; currency: string }[]
      netBalance: number
    } | null
  },
  model: ClaudeModel = DEFAULT_CLAUDE_MODEL
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
      if (context.userSummary) {
        systemPrompt += `\n\nUSER NOTES (remembered from previous interactions):\n${context.userSummary}`
      }
      if (context.users && context.users.length > 0) {
        systemPrompt += `\n- Known users: ${context.users.map((u) => `${u.alias} (${u.email})`).join(', ')}`
      }

      // Add available accounts
      if (context.accounts && context.accounts.length > 0) {
        systemPrompt += '\n\nAVAILABLE ACCOUNTS (for payment tracking):'
        context.accounts.forEach((a) => {
          const isDefault = a.id === context.defaultAccountId ? ' [DEFAULT]' : ''
          systemPrompt += `\n- [id: ${a.id}] ${a.icon} ${a.name}${isDefault}`
        })
        if (context.defaultAccountId) {
          systemPrompt += `\n(When user doesn't specify an account, use the default account)`
        }
      }

      // Add balance data
      if (context.balances) {
        systemPrompt += '\n\nBALANCES (for the current user):'
        if (context.balances.owes.length > 0) {
          systemPrompt += '\nYou owe:'
          context.balances.owes.forEach((b) => {
            systemPrompt += `\n  - ${b.email}: ${b.currency} ${b.amount.toFixed(2)}`
          })
        } else {
          systemPrompt += '\nYou owe: Nobody (all settled!)'
        }
        if (context.balances.owedBy.length > 0) {
          systemPrompt += '\nOwed to you:'
          context.balances.owedBy.forEach((b) => {
            systemPrompt += `\n  - ${b.email}: ${b.currency} ${b.amount.toFixed(2)}`
          })
        } else {
          systemPrompt += '\nOwed to you: Nobody'
        }
        systemPrompt += `\nNet balance: ${context.balances.netBalance >= 0 ? '+' : ''}${context.balances.netBalance.toFixed(2)} (positive means others owe you)`
      } else {
        systemPrompt += '\n\nBALANCES: No expense data available yet.'
      }

      // Add recent expenses data
      if (context.recentExpenses && context.recentExpenses.length > 0) {
        systemPrompt += '\n\nRECENT EXPENSES (up to 50 most recent):'
        context.recentExpenses.forEach((e) => {
          systemPrompt += `\n- [uuid: ${e.uuid}] ${e.date}: ${e.title} - ${e.currency} ${e.amount} (${e.category}) | Paid by: ${e.paidBy.join(', ')} | For: ${e.paidFor.join(', ')}`
        })
      } else {
        systemPrompt += '\n\nRECENT EXPENSES: No expenses recorded yet.'
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
        model,
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
export interface CreateExpenseAction {
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
    accounts?: { accountId: string; amount: number }[]
  }
  confirmation: string
}

export interface UpdateExpenseAction {
  action: 'update_expense'
  data: {
    uuid: string
    title?: string
    amount?: number
    currency?: string
    category?: string
    date?: string
  }
  confirmation: string
}

export interface DeleteExpenseAction {
  action: 'delete_expense'
  data: {
    uuid: string
  }
  confirmation: string
}

export interface CreateAccountAction {
  action: 'create_account'
  data: {
    name: string
    icon: string
    thenCreateExpense?: {
      title: string
      amount: number
      currency: string
      category: string
      date: string
      paidBy: string[]
      paidFor: string[]
      splitType: 'equal' | 'exact' | 'percentage'
    }
  }
  confirmation: string
}

export type ExpenseAction =
  | CreateExpenseAction
  | UpdateExpenseAction
  | DeleteExpenseAction
  | CreateAccountAction

export function parseExpenseAction(content: string): ExpenseAction | null {
  // Look for JSON block in response
  const jsonMatch = content.match(/```json\s*([\s\S]*?)\s*```/)
  if (!jsonMatch) return null

  try {
    const parsed = JSON.parse(jsonMatch[1])
    if (parsed.action === 'create_expense' && parsed.data) {
      return parsed as CreateExpenseAction
    }
    if (parsed.action === 'update_expense' && parsed.data?.uuid) {
      return parsed as UpdateExpenseAction
    }
    if (parsed.action === 'delete_expense' && parsed.data?.uuid) {
      return parsed as DeleteExpenseAction
    }
    if (parsed.action === 'create_account' && parsed.data?.name) {
      return parsed as CreateAccountAction
    }
    return null
  } catch {
    return null
  }
}

// ============= Vision API Support =============

export interface ParsedReceipt {
  title: string
  amount: number
  currency: string
  date: string
  category: string
  lineItems?: string[] // Individual items on the receipt
  merchant?: string
  confidence: 'high' | 'medium' | 'low'
}

export interface ParsedTransaction {
  title: string
  amount: number
  currency: string
  date: string
  category: string
  type: 'expense' | 'income'
  reference?: string // Transaction reference/ID from statement
}

export interface VisionParseResult<T> {
  success: true
  data: T
  rawResponse: string
}

export interface VisionParseError {
  success: false
  error: string
}

const RECEIPT_SYSTEM_PROMPT = `You are an AI assistant that extracts expense information from receipt images.

Analyze the receipt image and extract:
1. Merchant/Store name (use as title)
2. Total amount (the final amount paid)
3. Currency (detect from symbol or assume INR if unclear)
4. Date of purchase
5. Category (one of: Food, Transport, Shopping, Entertainment, Bills, Health, Travel, Other)
6. Individual line items if visible

RESPOND ONLY with a JSON object in this exact format:
\`\`\`json
{
  "title": "Merchant name or description",
  "amount": 123.45,
  "currency": "INR",
  "date": "YYYY-MM-DD",
  "category": "Food",
  "lineItems": ["Item 1 - ₹50", "Item 2 - ₹73.45"],
  "merchant": "Store name",
  "confidence": "high"
}
\`\`\`

Confidence levels:
- "high": Clear receipt, all information visible
- "medium": Some information unclear or estimated
- "low": Poor image quality, significant guessing required

If the image is not a receipt or is unreadable, respond with:
\`\`\`json
{
  "error": "Description of the problem"
}
\`\`\``

const BANK_STATEMENT_SYSTEM_PROMPT = `You are an AI assistant that extracts transactions from bank statement images or PDFs.

Analyze the bank statement and extract ALL transactions visible.

For each transaction, extract:
1. Description/Narration (use as title)
2. Amount (positive for credits/income, negative for debits/expenses)
3. Currency (detect from statement or assume INR)
4. Date of transaction
5. Category (one of: Food, Transport, Shopping, Entertainment, Bills, Health, Travel, Other, Income)
6. Type: "expense" for debits, "income" for credits

RESPOND ONLY with a JSON object in this exact format:
\`\`\`json
{
  "transactions": [
    {
      "title": "Transaction description",
      "amount": 123.45,
      "currency": "INR",
      "date": "YYYY-MM-DD",
      "category": "Shopping",
      "type": "expense",
      "reference": "TXN123456"
    }
  ],
  "accountInfo": {
    "bankName": "Bank name if visible",
    "accountNumber": "Last 4 digits if visible",
    "statementPeriod": "Date range if visible"
  }
}
\`\`\`

If the image is not a bank statement or is unreadable, respond with:
\`\`\`json
{
  "error": "Description of the problem"
}
\`\`\``

// Parse a receipt image using Claude Vision
export async function parseReceiptImage(
  apiKey: string,
  imageBase64: string,
  mediaType: 'image/jpeg' | 'image/png' | 'image/webp' | 'image/gif',
  model: ClaudeModel = DEFAULT_CLAUDE_MODEL
): Promise<VisionParseResult<ParsedReceipt> | VisionParseError> {
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
        model,
        max_tokens: 1024,
        system: RECEIPT_SYSTEM_PROMPT,
        messages: [
          {
            role: 'user',
            content: [
              {
                type: 'image',
                source: {
                  type: 'base64',
                  media_type: mediaType,
                  data: imageBase64,
                },
              },
              {
                type: 'text',
                text: 'Please extract the expense information from this receipt.',
              },
            ],
          },
        ],
      }),
    })

    if (!response.ok) {
      const error = await response.json().catch(() => ({}))
      return {
        success: false,
        error: error.error?.message || `API error: ${response.status}`,
      }
    }

    const data = await response.json()
    const content = data.content?.[0]?.text || ''

    // Parse the JSON response
    const jsonMatch = content.match(/```json\s*([\s\S]*?)\s*```/)
    if (!jsonMatch) {
      return { success: false, error: 'Could not parse AI response' }
    }

    const parsed = JSON.parse(jsonMatch[1])

    if (parsed.error) {
      return { success: false, error: parsed.error }
    }

    return {
      success: true,
      data: parsed as ParsedReceipt,
      rawResponse: content,
    }
  } catch (e) {
    return {
      success: false,
      error: e instanceof Error ? e.message : 'Failed to parse receipt',
    }
  }
}

// Parse a bank statement image using Claude Vision
export async function parseBankStatement(
  apiKey: string,
  imageBase64: string,
  mediaType: 'image/jpeg' | 'image/png' | 'image/webp' | 'image/gif',
  model: ClaudeModel = DEFAULT_CLAUDE_MODEL
): Promise<
  | VisionParseResult<{
      transactions: ParsedTransaction[]
      accountInfo?: { bankName?: string; accountNumber?: string; statementPeriod?: string }
    }>
  | VisionParseError
> {
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
        model,
        max_tokens: 4096,
        system: BANK_STATEMENT_SYSTEM_PROMPT,
        messages: [
          {
            role: 'user',
            content: [
              {
                type: 'image',
                source: {
                  type: 'base64',
                  media_type: mediaType,
                  data: imageBase64,
                },
              },
              {
                type: 'text',
                text: 'Please extract all transactions from this bank statement.',
              },
            ],
          },
        ],
      }),
    })

    if (!response.ok) {
      const error = await response.json().catch(() => ({}))
      return {
        success: false,
        error: error.error?.message || `API error: ${response.status}`,
      }
    }

    const data = await response.json()
    const content = data.content?.[0]?.text || ''

    // Parse the JSON response
    const jsonMatch = content.match(/```json\s*([\s\S]*?)\s*```/)
    if (!jsonMatch) {
      return { success: false, error: 'Could not parse AI response' }
    }

    const parsed = JSON.parse(jsonMatch[1])

    if (parsed.error) {
      return { success: false, error: parsed.error }
    }

    return {
      success: true,
      data: {
        transactions: parsed.transactions || [],
        accountInfo: parsed.accountInfo,
      },
      rawResponse: content,
    }
  } catch (e) {
    return {
      success: false,
      error: e instanceof Error ? e.message : 'Failed to parse bank statement',
    }
  }
}

// Helper to convert File to base64
export function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => {
      const result = reader.result as string
      // Remove the data URL prefix (e.g., "data:image/jpeg;base64,")
      const base64 = result.split(',')[1]
      resolve(base64)
    }
    reader.onerror = reject
    reader.readAsDataURL(file)
  })
}

// Helper to get media type from file
export function getMediaType(
  file: File
): 'image/jpeg' | 'image/png' | 'image/webp' | 'image/gif' | null {
  const validTypes = ['image/jpeg', 'image/png', 'image/webp', 'image/gif']
  if (validTypes.includes(file.type)) {
    return file.type as 'image/jpeg' | 'image/png' | 'image/webp' | 'image/gif'
  }
  return null
}
