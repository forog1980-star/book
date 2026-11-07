# Security Specification: Ephemeral WebRTC Signaling Only (v2 — Hardened)

## 1. Data & Security Invariants
1. **Zero Library Content in Cloud**: Firestore MUST NEVER store books, martyrs, research links, shelf locations, backups, or any user content. Only `/webrtc_signaling_sessions/{sessionId}` is permitted, constrained by `keys().hasOnly(...)` exclusively to SDP/ICE signaling properties.
2. **One-Way SHA-256 Session Identifier**: `sessionId` is derived via domain-separated `SHA-256("MARKAZ_ASNAD_SIGNAL_SESSION_V2:" + pairingCode)` (`^SESS_[0-9a-f]{48}$`). The pairing code is NEVER stored in plaintext inside `sessionId`.
3. **Authentication & Session Ownership (`hostUid` / `peerUid`)**:
   - Every signaling operation requires `request.auth != null` (Anonymous Authentication).
   - `create` binds `hostUid == request.auth.uid`.
   - The first peer to submit an answer locks `peerUid == request.auth.uid`. Once `peerUid` and `answerSdp` are set, no third party can read, overwrite, or hijack the session.
   - `offerSdp` and `offerType` are strictly immutable after creation (peer cannot tamper with host's SDP Offer).
   - `delete` is restricted solely to `hostUid` or `peerUid`.
4. **Server-Side Expiration Enforcement**:
   - `create`, `get`, and `update` all validate `request.time.toMillis() < expiresAtMs`, and `expiresAtMs <= createdAtMs + 600000` (max 10 minutes).
5. **No Session Enumeration (`allow list: if false`)**: No client can list or query `/webrtc_signaling_sessions`.

## 2. Deployment & Console Prerequisite (Rule 7)
To activate `request.auth` enforcement in production:
1. Enable **Anonymous Authentication** in Firebase Console -> Authentication -> Sign-in method -> Anonymous.
2. Deploy the updated `firestore.rules` to the Firebase project (`analog-market-8lvvl`).
*(Per Rule 6 & Rule 7 of the engineering directive, these cloud changes are NOT deployed automatically and await explicit owner approval.)*
