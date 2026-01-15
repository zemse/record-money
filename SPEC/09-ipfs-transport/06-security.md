# Security

## Threat Model

High-trust (family/friends). Fork to exclude bad actors.

### Protected

- Unauthorized writes → mutation signatures
- Tampering → signature verification
- Eavesdropping → symmetric encryption
- Single device compromise → key rotation

### Not protected

- Compromised group person → fork to exclude
- Metadata analysis → partial (randomized order)

## Malicious Actor

Detection: invalid sig, unknown author, malformed content, bad timestamp

Response: stop pulling, show UI warning with name, handle socially

Nuclear option: fork group without bad actor

## Spam

No technical rate limit. If someone spams overrides:
- Their mutations are signed (identified)
- Show UI warning
- Remove from group or fork
