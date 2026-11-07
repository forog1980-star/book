# Security Specification: Ephemeral WebRTC Signaling Only (v3 — Laptop Initiator & Phone Approver)

## 1. Data & Security Invariants
1. **Zero Library Content in Cloud**: Firestore MUST NEVER store books, martyrs, research links, shelf locations, backups, or any user content. Only `/webrtc_signaling_sessions/{sessionId}` is permitted, constrained by `keys().hasOnly(...)` exclusively to SDP/ICE signaling properties.
2. **Cryptographically Random `sessionId` Independent of Confirmation Code**:
   - `sessionId` is generated via CSPRNG (`generateRandomSessionId()`: 24 random bytes -> `^SESS_[0-9a-f]{48}$`, 53 chars total) and is completely independent of the short 12-char confirmation code (`pairingCode`).
   - The Laptop encodes `GOLZAR_P2P_V2:<sessionId>:<pairingCode>:<laptopDeviceId>` into its single-use, short-TTL QR Code.
3. **Definitive Connection Pattern (Laptop Initiator -> Phone Approver)**:
   - Laptop (`pc-companion`) creates the ephemeral session and displays the QR Code (no camera required on Laptop).
   - Phone (`phone-primary`) scans the QR Code, inspects the requesting Laptop's metadata (`laptopDeviceId`, `pairingCode`, `sessionId`), and requires **explicit user approval on the Phone** before any WebRTC handshake completes.
   - If the Phone rejects the request, `rejectSignalingSession` immediately sets `status: 'closed'` and deletes the session document, terminating the Laptop's waiting session.
4. **Mandatory Anonymous Authentication & Session Ownership (`hostUid` / `peerUid`)**:
   - Every signaling operation strictly requires `request.auth != null` (Anonymous Authentication) with zero unauthenticated fallback.
   - `create` binds `hostUid == request.auth.uid`.
   - The Phone peer locks `peerUid == request.auth.uid`. Once `peerUid` and `answerSdp` are set, no third party can read, overwrite, or hijack the session.
   - `offerSdp` and `offerType` are strictly immutable after creation.
   - `delete` is restricted solely to `hostUid` or `peerUid`.
5. **Server-Side Expiration Enforcement & No Enumeration**:
   - `create`, `get`, and `update` all validate `request.time.toMillis() < expiresAtMs`, and `expiresAtMs <= createdAtMs + 600000` (max 10 minutes).
   - `allow list: if false` prevents enumerating active pairing sessions.

## 2. Deployment & Console Prerequisite
To activate `request.auth` enforcement in production:
1. Enable **Anonymous Authentication** in Firebase Console -> Authentication -> Sign-in method -> Anonymous.
2. Deploy the updated `firestore.rules` to the Firebase project (`analog-market-8lvvl`).
*(Per engineering directive constraints, cloud console settings and `firestore.rules` are NOT deployed automatically.)*
