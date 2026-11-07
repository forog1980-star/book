# Security Specification: Ephemeral WebRTC Signaling Only

## 1. Data Invariants
1. **Zero Library Content in Cloud**: Firestore MUST NEVER store books, martyrs, research links, shelf locations, backups, or any user content. Only the `/webrtc_signaling_sessions/{sessionId}` path is permitted, and its fields are strictly constrained by `hasOnly(...)` to SDP/ICE signaling properties.
2. **No Session Enumeration (`allow list: if false`)**: No client can ever list or query `/webrtc_signaling_sessions`. Access is restricted to `get`, `create`, `update`, and `delete` on an exact, unguessable `sessionId` (`12..64` chars matching `^[A-Za-z0-9_\-]{12,64}$`).
3. **Mandatory Expiration Window**: Every signaling session must specify `expiresAtMs > createdAtMs` and `expiresAtMs <= createdAtMs + 600000` (maximum 10 minutes TTL).
4. **Immutable Session Identity**: `sessionId`, `pairingCodeDigest`, `hostDeviceRole`, and `createdAtMs` cannot be altered after creation.

## 2. The "Dirty Dozen" Payloads (All Must Return `PERMISSION_DENIED`)
1. **Library Book Injection**: `{ sessionId: "SESSION_123456", bookTitle: "کتاب تست", auditRecords: {} }` -> Rejected by strict `keys().hasOnly(...)`.
2. **Martyr Data Injection**: `{ sessionId: "SESSION_123456", martyrs: [{ fullName: "..." }] }` -> Rejected by strict `keys().hasOnly(...)`.
3. **Collection Enumeration**: `getDocs(collection(db, "webrtc_signaling_sessions"))` -> Rejected because `allow list: if false;`.
4. **Short/Guessable Session ID**: `doc(db, "webrtc_signaling_sessions", "1234")` -> Rejected by `isValidSessionId(sessionId)` requiring 12–64 chars.
5. **Path Poisoning / Oversized ID**: 2KB string in `{sessionId}` -> Rejected by `isValidSessionId`.
6. **Denial-of-Wallet Oversized SDP**: `offerSdp` of 500KB -> Rejected by `offerSdp.size() <= 24000`.
7. **Infinite TTL Session**: `expiresAtMs: createdAtMs + 86400000` -> Rejected by `expiresAtMs <= createdAtMs + 600000`.
8. **Invalid Status Value**: `status: "hacked"` -> Rejected by enum check `status in ['waiting-for-peer', 'offer-ready', 'answer-ready', 'connected', 'closed', 'expired']`.
9. **Mutating Immutable `createdAtMs` on Update**: Changing `createdAtMs` -> Rejected by `incoming().createdAtMs == existing().createdAtMs`.
10. **Mutating `pairingCodeDigest` on Update**: Changing `pairingCodeDigest` -> Rejected by `incoming().pairingCodeDigest == existing().pairingCodeDigest`.
11. **Writing to Arbitrary Collection (`/books/1` or `/users/1`)**: Rejected by global default-deny `match /{document=**} { allow read, write: if false; }`.
12. **Type Poisoning (`offerSdp: 12345`)**: Rejected by `data.offerSdp is string`.
