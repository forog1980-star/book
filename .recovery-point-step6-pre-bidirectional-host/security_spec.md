# Security Specification: Ephemeral WebRTC Signaling Only (v3.1 — Audited & Hardened)

## 1. Data & Security Invariants
1. **Zero Library Content in Cloud**: Firestore MUST NEVER store books, martyrs, research links, shelf locations, backups, or any user content. Only `/webrtc_signaling_sessions/{sessionId}` is permitted, constrained by `keys().hasOnly(...)` exclusively to SDP/ICE signaling properties.
2. **Cryptographically Random `sessionId` Independent of Confirmation Code**:
   - `sessionId` is generated via CSPRNG (`generateRandomSessionId()`: 24 random bytes / 192 bits of entropy -> `^SESS_[0-9a-f]{48}$`, 53 chars total) and is completely independent of the short 12-char confirmation code (`pairingCode`).
   - The Laptop encodes `GOLZAR_P2P_V2:<sessionId>:<pairingCode>:<laptopDeviceId>` into its single-use, short-TTL QR Code.
3. **Definitive Connection Pattern & Atomic `peerUid` Locking (Laptop Initiator -> Phone Approver)**:
   - Laptop (`pc-companion`) creates the ephemeral session (`hostUid == request.auth.uid`) and displays the QR Code (no camera required on Laptop).
   - Phone (`phone-primary`) scans the QR Code and executes `claimAndInspectSignalingSession` inside a **Firestore Transaction (`runTransaction`)**, which atomically verifies the SHA-256 digest and locks `peerUid = request.auth.uid` and `status = 'waiting-for-peer'` on the document before displaying the approval prompt.
   - Because `peerUid` is locked atomically upon scan, no third device can hijack the session while the Phone user inspects and approves the connection request.
   - If the Phone rejects the request, `rejectSignalingSession` immediately sets `status: 'closed'` and deletes the session document, terminating the Laptop's waiting session.
   - If the Phone approves, `submitSignalingAnswer` (also transactional) writes `answerSdp`.
   - The signaling document in Firestore is deleted only **after** `HELLO_HANDSHAKE` is received over the open `RTCDataChannel` (ensuring Offer, Answer, and ICE candidates have completed).
4. **Mandatory Anonymous Authentication & Write-Once Session Ownership (`hostUid` / `peerUid`)**:
   - Every signaling operation strictly requires `request.auth != null` (Anonymous Authentication) with zero unauthenticated fallback.
   - `create` binds `hostUid == request.auth.uid`.
   - `isAuthorizedPeerUpdate()` enforces write-once `peerUid`: once `peerUid` is set, it can never be changed to another UID, and once `answerSdp` is set, it cannot be overwritten.
   - `delete` is restricted solely to `hostUid` or `peerUid`.
5. **Server-Time Creation Window & Expiration Enforcement (`isValidCreationWindow` & `isNotExpired`)**:
   - `allow create` enforces `isValidCreationWindow(incoming())`: `createdAtMs` must be within $\pm 60\text{s}$ of real server clock `request.time.toMillis()`, and `expiresAtMs` must be $> \text{request.time.toMillis()}$ and $\le \text{request.time.toMillis()} + 600000$ (10 minutes). This prevents clients from spoofing future `createdAtMs` timestamps to bypass expiration.
   - `get` and `update` enforce `isNotExpired(existing())` against `request.time.toMillis()`.
   - `allow list: if false` prevents enumerating active pairing sessions.
6. **Data Integrity Checksum vs. Transport Encryption**:
   - `payloadChecksum` (SHA-256) on `SyncTransferPackage` and `changeId` on envelopes serve as data integrity checksums to detect corruption or incomplete transmission. Channel encryption and peer authentication are provided by WebRTC DTLS-SRTP and the authenticated signaling session lock.

## 2. Deployment & Console Prerequisite
To activate `request.auth` enforcement and the updated rules in production:
1. Enable **Anonymous Authentication** in Firebase Console -> Authentication -> Sign-in method -> Anonymous.
2. Publish/Deploy the updated `firestore.rules` to the Firebase project (`analog-market-8lvvl`).
*(Per engineering directive constraints, cloud console settings and `firestore.rules` are NOT deployed automatically.)*
