# Security

## Threat Model

High-trust (friends/family). Fork to exclude bad actors.

### Protected

- Unauthorized writes → tx signatures
- Tampering → signature verification  
- Eavesdropping → symmetric encryption
- Single device compromise → key rotation

### Not protected

- Compromised group member → fork to exclude
- Intercepted invite link → acceptable risk
- Metadata analysis → partial (randomized order)

## Device Removal

1. Create device removal tx
2. Remove from DeviceRing
3. Rotate device sym key
4. Others see tx → stop polling removed device

## Group Member Removal

1. Create member removal tx
2. Rotate group sym key
3. Distribute new key via PeerDirectory (remaining members only)
4. Others stop polling removed member

## Malicious Actor

Detection: invalid sig, unknown author, malformed content, bad timestamp

Response: stop pulling, show UI warning with name, handle socially

Nuclear option: fork group without bad actor

## Spam

No technical rate limit. If someone spams overrides:
- Their txs are signed (identified)
- Show UI warning
- Remove from group or fork

## Pairing Security

- QR contains sensitive keys → show in trusted environment only
- Temp IPNS key → single use, discard after
- Emoji verification → prevents MITM
- If QR compromised: emoji won't match, no data leak
