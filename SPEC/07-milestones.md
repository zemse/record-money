# Development Milestones

Each milestone ends with a **review gate**. No proceeding to next milestone without review approval.

---

## Milestone 1: Core Data & UI Shell

**Goal:** Basic app structure with CRUD operations.

### Tasks

- [x] Project setup
  - [x] Vite + React + TypeScript
  - [x] Tailwind CSS
  - [x] ESLint + Prettier
  - [x] Folder structure
- [x] IndexedDB setup
  - [x] Dexie.js integration
  - [x] Schema definition (records, users, groups, settings)
  - [x] Basic CRUD helpers
- [x] UI shell
  - [x] Navigation (bottom tabs or sidebar)
  - [x] Empty states
  - [x] Basic routing (react-router)
- [x] Records CRUD
  - [x] Add record form
  - [x] Edit record
  - [x] Delete record (with confirmation)
  - [x] Record list view
- [x] Users CRUD
  - [x] Add user (email + alias)
  - [x] Edit alias
  - [x] Delete user
  - [x] User picker component (for paidBy/paidFor)
- [x] Groups CRUD
  - [x] Create group
  - [x] Edit group (name, members)
  - [x] Delete group
  - [x] Default group handling

### Deliverable

Working app where user can add expenses with splits, manage users and groups.

### Review Gate

- [x] Code review
- [x] Manual testing of all CRUD
- [x] Approval to proceed

---

## Milestone 2: Balance & Display

**Goal:** Calculate and display who owes whom via a Dashboard home page.

### Tasks

- [x] Current user ("Me") support
  - [x] Add `currentUserEmail` to Settings type
  - [x] "Set as Me" button on user cards in Users page
  - [x] Display current user in Settings page
- [x] Default display currency
  - [x] Add `defaultDisplayCurrency` to Settings type
  - [x] Currency selector in Settings page
  - [x] Convert balances to display currency on Dashboard
- [x] Balance calculation logic
  - [x] Per-group balances
  - [x] Net simplification (A owes B ₹100, B owes A ₹30 → A owes B ₹70)
  - [x] Handle all share types (equal, percentage, exact, shares)
- [x] Dashboard page (new home page at `/`)
  - [x] Overall summary card (net balance, you owe vs owed to you)
  - [x] Per-group balance cards
  - [x] Non-group expenses summary
  - [x] Detailed balance list (expandable)
  - [x] Prompt to set "me" if not configured
  - [x] Color coding (green = owed, red = owe)
- [x] Navigation update
  - [x] Dashboard at `/` (new home)
  - [x] Records moves to `/records`
  - [x] Add Dashboard icon to nav
- [x] Records list improvements
  - [x] Filter by group
  - [x] Filter by date range
  - [x] Filter by category
  - [x] Search by title
- [x] Settle up (phase 2)
  - [x] Settle up button creates settlement record
- [x] Category management
  - [x] Predefined categories (code-defined only, no custom categories)
  - [x] Category icons (emoji)

### Deliverable

User can see Dashboard with balance summaries, filter records, and track who owes whom.

### Review Gate

- [x] Balance calculation verified with test cases
- [x] Dashboard UI review
- [x] Approval to proceed

---

## Milestone 3: Import/Export

**Goal:** Share data between users via URL and files.

### Tasks

- [x] File export
  - [x] Export selected records
  - [x] Export entire group
  - [x] `.recordmoney` file generation
- [x] File import
  - [x] File picker UI
  - [x] JSON parsing and validation
  - [x] UUID conflict detection
  - [x] Exact-match duplicate detection
  - [x] Import preview UI
  - [x] Merge/keep-new options
- [x] URL export
  - [x] Base64 encoding
  - [x] 2000 char limit check
  - [x] Copy-to-clipboard
  - [x] "URL too large" error handling
- [x] URL import
  - [x] `/import?data=...` route
  - [x] Parse and validate
  - [x] Same dedup flow as file import
- [x] Manual duplicate finder
  - [x] Scan existing records
  - [x] Show potential duplicates
  - [x] Merge/keep UI

### Deliverable

Users can share expenses via links (small) or files (large).

### Review Gate

- [x] Test import/export round-trip
- [x] Test dedup scenarios
- [x] Approval to proceed

---

## Milestone 4: PWA & Offline

**Goal:** App works offline, installable on mobile.

### Tasks

- [x] PWA setup
  - [x] vite-plugin-pwa integration
  - [x] Manifest file
  - [x] App icons (192, 512, maskable)
- [x] Service worker
  - [x] Cache static assets
  - [x] Cache-first strategy
  - [x] Network-only for API calls
- [x] Offline indicator
  - [x] useOnlineStatus hook
  - [x] Offline banner component
- [x] Add to Home Screen
  - [x] Test on iOS Safari
  - [x] Test on Android Chrome
- [x] Vercel deployment
  - [x] Build configuration
  - [x] Deploy preview
  - [x] Production deploy
- [x] Lighthouse audit
  - [x] Target: 100 PWA score
  - [x] Fix any issues

### Deliverable

Deployed PWA that works offline and is installable.

### Review Gate

- [x] Lighthouse PWA audit passed
- [x] Offline functionality verified
- [x] Production URL working
- [x] Approval to proceed

---

## Milestone 5: AI Integration (Basic)

**Goal:** Natural language expense entry via Claude.

### Tasks

- [x] API key management
  - [x] Input UI
  - [x] Security warning display
  - [x] Storage in IndexedDB
  - [x] Key validation (test API call)
  - [x] Settings page for key management
  - [x] Model selection (Haiku 3.5, Sonnet 4, Opus 4, Opus 4.5)
- [x] Chat UI
  - [x] Floating action button
  - [x] Expandable chat panel
  - [x] Message input
  - [x] Message history (session only)
- [x] Claude integration
  - [x] API client setup
  - [x] System prompt for expense parsing
  - [x] Response parsing
- [x] CRUD via chat
  - [x] Natural language → create record
  - [x] Natural language → query records
  - [x] Natural language → update/delete
- [x] Confirmation flow
  - [x] Summary card
  - [x] Expandable details
  - [x] Confirm/Edit/Cancel buttons
- [x] Auto-apply toggle
  - [x] Checkbox in chat UI
  - [x] Persist preference
- [x] Iterative correction
  - [x] Multi-turn conversation
  - [x] Edit based on user feedback

### Deliverable

User can add/query expenses by chatting with AI.

### Review Gate

- [x] Test various natural language inputs
- [x] Verify confirmation flow
- [x] Error handling reviewed
- [x] Approval to proceed

---

## Milestone 6: AI Vision Features

**Goal:** Parse receipts and bank statements.

### Tasks

- [ ] Receipt parsing
  - [ ] Image upload UI
  - [ ] Camera capture (mobile)
  - [ ] Send to Claude Vision
  - [ ] Extract: title, amount, date, category
  - [ ] Store line items in comments
  - [ ] Confirmation before save
- [ ] Bank statement parsing
  - [ ] PDF upload UI
  - [ ] PDF to image conversion (if needed)
  - [ ] Send to Claude Vision
  - [ ] Extract transaction list
  - [ ] Generate sourceHash for each
  - [ ] Dedup against existing records
- [ ] Bulk import UI
  - [ ] Show all extracted transactions
  - [ ] Checkboxes to include/exclude
  - [ ] Show duplicates as disabled
  - [ ] Import selected button

### Deliverable

User can scan receipts and import bank statements.

### Review Gate

- [ ] Test with real receipts
- [ ] Test with real bank statements
- [ ] Dedup working correctly
- [ ] Approval to proceed

---

## Milestone 7: Currency & Polish

**Goal:** Currency conversion, final polish, release.

### Tasks

- [ ] Currency conversion
  - [ ] Frankfurter API integration
  - [ ] "Convert to currency" UI
  - [ ] Display converted values
  - [ ] Rates timestamp display
  - [ ] Refresh rates button
- [x] Reports/Graphs
  - [x] Spending by category (pie chart with period selector)
  - [ ] Spending over time (line chart)
  - [ ] Currency-converted totals
- [x] Personal expenses
  - [x] Split toggle in expense form (default OFF for personal expenses)
  - [x] Hide paidBy/paidFor/splitType when personal
  - [x] Auto-fill current user for personal expenses
- [x] Feedback
  - [x] GitHub issues link in Settings page
- [ ] Onboarding & Multi-Identifier
  - [ ] First-launch setup flow (optional, skippable)
  - [ ] User enters their name and identifier
  - [ ] Support multiple identifier types (email, crypto wallet, phone)
  - [ ] Identifier format: `email:name@site.com`, `crypto:coolname.eth`, `phone:+91...`
- [ ] UI polish
  - [ ] Consistent styling
  - [ ] Loading states
  - [ ] Error states
  - [ ] Empty states
  - [ ] Animations/transitions
- [ ] Edge cases
  - [ ] Large data sets
  - [ ] Invalid inputs
  - [ ] Network errors
- [ ] Final testing
  - [ ] Cross-browser testing
  - [ ] Mobile testing
  - [ ] Accessibility review

### Deliverable

Complete, polished PoC ready for users.

### Review Gate

- [ ] Full app walkthrough
- [ ] All features tested
- [ ] Performance acceptable
- [ ] **PoC Release Approved**

---

## Timeline Estimate

| Milestone | Estimated Duration |
|-----------|-------------------|
| M1: Core Data & UI | 1 week |
| M2: Balance & Display | 1 week |
| M3: Import/Export | 1 week |
| M4: PWA & Offline | 0.5 week |
| M5: AI Basic | 1.5 weeks |
| M6: AI Vision | 1 week |
| M7: Currency & Polish | 1 week |
| **Total** | **~7 weeks** |

*Assumes single developer, may vary based on complexity discovered.*
