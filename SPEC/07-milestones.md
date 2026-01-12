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
- [ ] Category management (if time permits)
  - [ ] Predefined categories
  - [ ] Custom categories
  - [ ] Category icons (emoji)

### Deliverable

User can see Dashboard with balance summaries, filter records, and track who owes whom.

### Review Gate

- [ ] Balance calculation verified with test cases
- [ ] Dashboard UI review
- [ ] Approval to proceed

---

## Milestone 3: Import/Export

**Goal:** Share data between users via URL and files.

### Tasks

- [ ] File export
  - [ ] Export selected records
  - [ ] Export entire group
  - [ ] `.recordmoney` file generation
- [ ] File import
  - [ ] File picker UI
  - [ ] JSON parsing and validation
  - [ ] UUID conflict detection
  - [ ] Exact-match duplicate detection
  - [ ] Import preview UI
  - [ ] Merge/keep-new options
- [ ] URL export
  - [ ] Base64 encoding
  - [ ] 2000 char limit check
  - [ ] Copy-to-clipboard
  - [ ] "URL too large" error handling
- [ ] URL import
  - [ ] `/import?data=...` route
  - [ ] Parse and validate
  - [ ] Same dedup flow as file import
- [ ] Manual duplicate finder
  - [ ] Scan existing records
  - [ ] Show potential duplicates
  - [ ] Merge/keep UI

### Deliverable

Users can share expenses via links (small) or files (large).

### Review Gate

- [ ] Test import/export round-trip
- [ ] Test dedup scenarios
- [ ] Approval to proceed

---

## Milestone 4: PWA & Offline

**Goal:** App works offline, installable on mobile.

### Tasks

- [ ] PWA setup
  - [ ] vite-plugin-pwa integration
  - [ ] Manifest file
  - [ ] App icons (192, 512, maskable)
- [ ] Service worker
  - [ ] Cache static assets
  - [ ] Cache-first strategy
  - [ ] Network-only for API calls
- [ ] Offline indicator
  - [ ] useOnlineStatus hook
  - [ ] Offline banner component
- [ ] Add to Home Screen
  - [ ] Test on iOS Safari
  - [ ] Test on Android Chrome
- [ ] Netlify deployment
  - [ ] Build configuration
  - [ ] Deploy preview
  - [ ] Production deploy
- [ ] Lighthouse audit
  - [ ] Target: 100 PWA score
  - [ ] Fix any issues

### Deliverable

Deployed PWA that works offline and is installable.

### Review Gate

- [ ] Lighthouse PWA audit passed
- [ ] Offline functionality verified
- [ ] Production URL working
- [ ] Approval to proceed

---

## Milestone 5: AI Integration (Basic)

**Goal:** Natural language expense entry via Claude.

### Tasks

- [ ] API key management
  - [ ] Input UI
  - [ ] Security warning display
  - [ ] Storage in IndexedDB
  - [ ] Key validation (test API call)
  - [ ] Settings page for key management
- [ ] Chat UI
  - [ ] Floating action button
  - [ ] Expandable chat panel
  - [ ] Message input
  - [ ] Message history (session only)
- [ ] Claude integration
  - [ ] API client setup
  - [ ] System prompt for expense parsing
  - [ ] Response parsing
- [ ] CRUD via chat
  - [ ] Natural language → create record
  - [ ] Natural language → query records
  - [ ] Natural language → update/delete
- [ ] Confirmation flow
  - [ ] Summary card
  - [ ] Expandable details
  - [ ] Confirm/Edit/Cancel buttons
- [ ] Auto-apply toggle
  - [ ] Checkbox in chat UI
  - [ ] Persist preference
- [ ] Iterative correction
  - [ ] Multi-turn conversation
  - [ ] Edit based on user feedback

### Deliverable

User can add/query expenses by chatting with AI.

### Review Gate

- [ ] Test various natural language inputs
- [ ] Verify confirmation flow
- [ ] Error handling reviewed
- [ ] Approval to proceed

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
- [ ] Reports/Graphs
  - [ ] Spending by category (pie chart)
  - [ ] Spending over time (line chart)
  - [ ] Currency-converted totals
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
