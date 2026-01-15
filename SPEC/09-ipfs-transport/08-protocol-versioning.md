# Protocol Versioning

## Overview

Mutations are versioned for forward compatibility. Groups upgrade to the minimum version supported by all members.

## Version Field

Every mutation includes a `version` field:

```typescript
interface Mutation {
  version: number;  // 1, 2, 3, ...
  // ... other fields
}
```

**Rules:**
- Mutation version must be ≤ group's `protocolVersion`
- Clients reject mutations with version > their supported version
- New groups start at version 1
- **Backward compatibility required:** A client supporting v3 must also support v1 and v2. Clients must handle all versions from 1 to their max supported version.

## Upgrade Mechanism

Simple consensus: members propose their max supported version, system upgrades to the minimum after 48 hours.

### ProposeUpgrade Mutation

```typescript
{
  version: 1,  // uses current group version
  targetType: 'group',
  targetUuid: groupUuid,
  operation: {
    type: 'propose_upgrade',
    maxSupportedVersion: 3  // "I support up to v3"
  }
}
```

### Upgrade Flow

1. **First proposal** opens a 48-hour window
2. **Other members see** the pending upgrade notification
3. **Each member proposes** their `maxSupportedVersion`
4. **After 48 hours**, system upgrades to `min(all proposals)`
5. **Expedited:** If all members propose, activates immediately

```typescript
// Activation logic
function getTargetVersion(group: Group): number {
  const proposals = group.pendingUpgrade.proposals;
  return Math.min(...proposals.map(p => p.maxSupportedVersion));
}
```

### Example

Group with Alice, Bob, Carol at v1:

| Member | maxSupportedVersion |
|--------|---------------------|
| Alice | 3 |
| Bob | 2 |
| Carol | 3 |

**Result:** Group upgrades to v2 (minimum of 3, 2, 3)

Bob's older client still works. Alice and Carol can't use v3 features yet, but v2 features are unlocked.

## Pending Upgrade State

```typescript
interface Group {
  protocolVersion: number;
  pendingUpgrade?: {
    windowStart: number;    // when first proposal arrived
    windowEnd: number;      // windowStart + 48 hours
    proposals: [{
      personUuid: string;
      maxSupportedVersion: number;
    }];
  };
}
```

**One proposal per person:** Upgrades are approved per person, not per device. User only needs to respond once (from any device). Later proposals from same person update their `maxSupportedVersion`. If user has multiple devices with different client versions, they should propose with the lowest version among their devices.

## Client Behavior

### On Receiving Mutations

```typescript
function validateMutation(mutation: Mutation, group: Group): ValidationResult {
  if (mutation.version > group.protocolVersion) {
    return { valid: false, error: 'mutation_version_too_high' };
  }
  if (mutation.version > CLIENT_MAX_VERSION) {
    return { valid: false, error: 'client_update_required' };
  }
  return { valid: true };
}
```

### On Creating Mutations

Always use the group's current version:

```typescript
function createMutation(group: Group, operation: MutationOperation): Mutation {
  return {
    version: group.protocolVersion,  // NOT client's max
    // ...
  };
}
```

### Feature Gating

If feature requires v2 but group is v1:
- Disable the feature in UI
- Show tooltip: "Propose upgrade to use this feature"

## UI/UX

### Upgrade Prompt

When user tries to use a new feature:

```
┌─────────────────────────────────────────┐
│  This feature requires Protocol v2      │
│                                         │
│  Propose an upgrade? All members will   │
│  have 48 hours to respond with their    │
│  supported version.                     │
│                                         │
│  [Propose Upgrade]  [Cancel]            │
└─────────────────────────────────────────┘
```

### Pending Upgrade Banner

```
┌─────────────────────────────────────────┐
│  ⬆️ Upgrade proposed                    │
│                                         │
│  Alice: supports v3                     │
│  Bob: supports v2                       │
│  You: (tap to respond)                  │
│                                         │
│  Activates in: 36 hours                 │
│  Target version: v2 (minimum)           │
│                                         │
│  [I support v3]                         │
└─────────────────────────────────────────┘
```

### Update Required

```
┌─────────────────────────────────────────┐
│  ⚠️ Update Required                     │
│                                         │
│  This group uses Protocol v3.           │
│  Your app supports up to v2.            │
│                                         │
│  [Update Now]  [Remind Later]           │
└─────────────────────────────────────────┘
```

## Edge Cases

### Member Doesn't Respond

- After 48 hours, only proposals received are considered
- Non-responders don't block upgrade
- Their client will show "update required" if they're below the new version

### Member Offline

- When they come online, they see the group's new version
- If their client supports it: sync normally
- If not: "update required" prompt

### Member Removed During Upgrade

- Removed member's proposal is discarded
- Activation checks current membership (people list at execution time)
- If remaining members have all proposed: activates immediately
- Example: 3 members, Alice/Bob proposed, Carol removed → Alice+Bob = all current members → activates

### No Upgrade Possible

If `min(proposals) == group.protocolVersion`:
- No upgrade happens
- Window closes, `pendingUpgrade` cleared
- UI: "Upgrade to v2 not possible - Bob only supports v1"

### Concurrent Features at Different Versions

Track which features require which version:

```typescript
const FEATURE_VERSIONS = {
  'basic_records': 1,
  'recurring_expenses': 2,
  'attachments': 3,
};

function isFeatureEnabled(feature: string, group: Group): boolean {
  return group.protocolVersion >= FEATURE_VERSIONS[feature];
}
```

## Version History

| Version | Features |
|---------|----------|
| v1 | Initial: records, persons, groups, sync |
| v2 | (reserved) |
| v3 | (reserved) |

## Downgrade

If a user's client only supports a version lower than the group's current version, they can propose a downgrade.

**Flow:**
1. User proposes `maxSupportedVersion: 2` when group is at v3
2. Other members see UI: "[User] needs v2 to participate. Accept downgrade?"
3. Members who accept propose v2 (or lower)
4. After 48h, group goes to `min(all proposals)`
5. If min < current version → downgrade occurs

**Downgrade consequences:**
- Features requiring higher versions become disabled
- Data created with higher-version features remains (just can't create new)
- UI shows: "Group downgraded to v2. [Feature X] is now disabled."

**Requiring consent:** Unlike upgrades where non-responders don't block, downgrades that would disable features should ideally have explicit acceptance from members who use those features. Implementation can show warnings but ultimately `min(proposals)` decides.

## Design Principles

1. **No rejections** - system finds common ground automatically
2. **No blocking** - old clients don't prevent upgrades, just limit how far
3. **Simple** - one mutation type, no accept/reject coordination
4. **Graceful** - upgrades/downgrades to version everyone supports
5. **Full backward compatibility** - newer clients must support ALL older versions (v3 client handles v1, v2, v3 mutations)
