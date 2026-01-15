# Sync Protocol

P2P sync via IPFS/IPNS. No server. Each device owns its IPNS feed.

```
User A: Device1→IPNS_A1, Device2→IPNS_A2
All devices poll each other, merge locally.
Groups: each member publishes own feed, all poll all.
```

## Principles

- High-trust, social enforcement
- Fork to exclude bad actors
- Conflicts resolved by humans

## Docs

- [01-keys-and-crypto](./01-keys-and-crypto.md)
- [02-data-structures](./02-data-structures.md)
- [03-device-pairing](./03-device-pairing.md)
- [04-sync-protocol](./04-sync-protocol.md)
- [05-groups](./05-groups.md)
- [06-security](./06-security.md)
- [07-milestone](./07-milestone.md)

## Terms

- **DeviceManifest**: top-level IPNS content (database, mutations, device ring, peer directory)
- **Mutation**: signed change entry (create, update, delete, merge, exit)
- **DeviceRing**: user's linked devices (encrypted with Broadcast Key)
- **PeerDirectory**: key distribution + group sharing (ECDH encrypted per-recipient)
- **GroupManifest**: group data + membership (encrypted with Group Key)
- **Person**: individual in database (user/member/contact unified terminology)
- **Personal Key**: encrypts personal data (self devices only)
- **Broadcast Key**: encrypts DeviceRing (self devices + peers)
- **Group Key**: encrypts GroupManifest (group members)
