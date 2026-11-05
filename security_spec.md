# BloodSearch Bangladesh — Zero-Trust Firestore Security Specification

## 1. Data Invariants & Master Sources of Truth
1. **Global Default-Deny**: Any path not explicitly matched is unconditionally denied (`allow read, write: if false;`).
2. **Verified Identity Gate**: All writes require an authenticated user (`request.auth != null`) who is verified either via verified email (`request.auth.token.email_verified == true`) or verified SIM SMS OTP (`request.auth.token.firebase.sign_in_provider == 'phone'`).
3. **Exclusive Bootstrapped Super Owner & Cloud-Vaulted Admin Gate**:
   - Runtime owner `shamimrakib015@gmail.com` is the ONLY bootstrapped Super Admin, recognized strictly when `request.auth.token.email == 'shamimrakib015@gmail.com' && request.auth.token.email_verified == true` (prevents email spoofing).
   - Zero static admin secret codes or hashes exist in the client bundle or `firestore.rules`. Creating `/admins/{userId}` requires either `isBootstrappedSuperAdmin()` OR an active server-side `/adminInviteLocks/$(incoming().secretProofHash)` document (`active == true`) created exclusively by `shamimrakib015@gmail.com`.
4. **Anti-Self-Escalation (Atomic Role Sync)**:
   - A user creating `/users/{userId}` or `/donors/{donorId}` with `panelType == 'ADMIN'` MUST either already satisfy `isAdmin()` OR atomically create `/admins/$(request.auth.uid)` in the same batch (`existsAfter(/databases/$(database)/documents/admins/$(request.auth.uid))`).
5. **PII Split-Collection Isolation & Explicit Donor Contact Consent**:
   - Raw `email`, `phone`, `whatsappPhone`, and `facebookUrl` live strictly in `/users/{userId}` with `allow get: if isOwner(userId) || isAdmin()` and `allow list: if false`.
   - `/donors/{donorId}` contains only non-PII public fields (`maskedPhone` guaranteed to contain `**`), plus non-PII availability & consent flags (`availabilityStatus`, `availabilityConfirmedAt`, `shareDirectContact`, `contactVisibility`, `allowCall`, `allowWhatsApp`, `allowSms`, `emergencyAlertsOptIn`, `alertsPaused`).
   - `/donorDirectContacts/{donorId}` isolates opted-in direct contact phone/WhatsApp in a separate non-listable (`allow list: if false`) collection! Single-document `get` is permitted ONLY when:
     - `isOwner(donorId)` or `isAdmin()`, OR
     - `existing().shareDirectContact == true && existing().availabilityStatus != 'DND'` AND (`existing().contactVisibility == 'PUBLIC_OPT_IN'` OR (`existing().contactVisibility == 'VERIFIED_SEEKERS' && isVerifiedUser()`)).
     - If a donor switches to `REQUEST_ONLY`, `shareDirectContact == false`, or `DND`, non-owner `get` access is immediately denied by Firestore.
6. **Consent Contact Requests (`/contactRequests/{contactReqId}`)**:
   - Deterministic ID `seekerUid + '__' + donorUid` prevents duplicate spam.
   - Readable/listable strictly by `seekerUid == request.auth.uid || donorUid == request.auth.uid`.
   - Only `donorUid` can approve (`status == 'APPROVED'`) and attach `approvedPhone`/`approvedWhatsApp`.
7. **Concurrent Emergency Broadcast Alerts (`/requestAlerts/{alertId}`)**:
   - Deterministic ID `requestId + '__' + donorUid` guarantees zero duplicate spam per request/donor pair.
   - Created strictly by verified `authorUid` when parent `/requests/$(requestId)` exists, belongs to `authorUid`, and has `status == 'ACTIVE'`.
   - Readable/listable strictly via O(1) Query Enforcer `donorUid == request.auth.uid || authorUid == request.auth.uid` (zero `get()` inside `allow list`).
   - Terminal lock: once `deliveryState == 'STOPPED_RESOLVED'`, no further client mutations are allowed.
8. **Request Direct Contacts & Volunteer Responses (`/requestDirectContacts/{requestId}` & `/requestResponses/{responseId}`)**:
   - `/requestDirectContacts/{requestId}` isolates emergency hospital attendant callback numbers with `allow list: if false` (prevents bulk PII scraping). Single-doc `get` is permitted only while `shareDirectContact == true && status == 'ACTIVE'`, or to `authorUid` / `isAdmin()`. Validated against strict 11-digit Bangladesh mobile regex `^(\+?8801[3-9][0-9]{8}|01[3-9][0-9]{8})$`.
   - `/requestResponses/{responseId}` enforces canonical deterministic ID `requestId + '__' + request.auth.uid`, contains zero phone/email PII, forbids self-pledging (`authorUid != request.auth.uid`), and verifies parent `/requests/$(requestId)` exists and is `ACTIVE`.
9. **Live Donor-to-Hospital Trip Tracking (`/liveDonorTrips/{tripId}`)**:
   - Deterministic ID `requestId + '__' + request.auth.uid` prevents duplicate or spoofed tracking sessions.
   - Pair-isolated privacy: `allow get` and O(1) `allow list` (`resource.data.donorUid == request.auth.uid || resource.data.seekerUid == request.auth.uid`) restrict live GPS coordinates strictly to the traveling donor and the target patient's requester (`seekerUid`), blocking third-party location stalking.
   - Strict Bangladesh geographic bounds (`20.0 <= lat <= 27.0`, `87.5 <= lng <= 93.0`), parent `/requests/$(requestId)` relational ownership check, and terminal state locking once `tripStatus in ['COMPLETED', 'CANCELLED']`.
10. **Terminal State Locking**:
   - Once `/requests/{requestId}` reaches `status in ['FULFILLED', 'CANCELLED', 'EXPIRED']` or `/liveDonorTrips/{tripId}` reaches `tripStatus in ['COMPLETED', 'CANCELLED']`, non-admin users cannot mutate them further.
11. **Temporal & Immutable Integrity**:
   - `createdAt == request.time` on `create`; `updatedAt == request.time` on `update`; `uid`, `ownerUid`, `authorUid`, `seekerUid`, `donorUid`, `responderUid`, `participantOneUid`, `participantTwoUid`, and `createdAt` are immutable on `update`.

## 2. The "Dirty Dozen" Adversarial Payloads (Must Return PERMISSION_DENIED)
1. **Payload 1 (Privilege Escalation / Self-Admin)**: `POST /users/attacker1` with `{ ..., "panelType": "ADMIN" }` without `/admins/attacker1` existing.
2. **Payload 2 (Forged Admin Secret Proof)**: `POST /admins/attacker1` with `{ "uid": "attacker1", "secretProofHash": "0000...0000" }`.
3. **Payload 3 (Email Spoofing Attack)**: Unverified account (`email: "shamimrakib015@gmail.com"`, `email_verified: false`) attempting `GET /users/victim1`.
4. **Payload 4 (PII Cross-User Read & Foreign Live Trip Stalking)**: Authenticated user `uid: "userA"` attempting `GET /users/userB`, `GET /donorDirectContacts/privateDonor` where `shareDirectContact == false`, or `GET /liveDonorTrips/req1__donorB` when neither `seekerUid` nor `donorUid` equals `userA`.
5. **Payload 5 (PII Collection Scraping)**: Authenticated user attempting `LIST /users`, `LIST /donorDirectContacts`, `LIST /requestDirectContacts`, or unfiltered `LIST /liveDonorTrips`.
6. **Payload 6 (Shadow / Ghost Field Injection)**: `POST /donors/donor1` or `POST /liveDonorTrips/req1__donor1` with valid fields plus `"isSuperVerified": true`.
7. **Payload 7 (Identity & Canonical ID Spoofing on Create)**: Authenticated `uid: "userA"` creating `/contactRequests/fakeId`, `/requestAlerts/fakeId`, `/requestResponses/fakeId`, or `/liveDonorTrips/fakeId` not matching canonical `requestId__donorUid`.
8. **Payload 8 (ID Poisoning / Out-of-Bounds Coordinates)**: Creating `/requestDirectContacts/req1` with a truncated 10-digit local phone `+880174333969`, `/liveDonorTrips/req1__donor1` with `lat: 999`, or `/donors/../../bad$id`.
9. **Payload 9 (Value Poisoning on Update)**: Updating whitelisted field `available` on `/donors/donor1` with string `"yes"` instead of `bool`.
10. **Payload 10 (Self-Approving Contact Consent or Self-Tracking Own Request)**: Seeker `userA` attempting to update `/contactRequests/userA__donorB` to `status: "APPROVED"` or creating `/liveDonorTrips/req1__userA` where `seekerUid == "userA"`.
11. **Payload 11 (Terminal State Re-opening)**: Author attempting to change `/requests/req1` from `status: "CANCELLED"` back to `"ACTIVE"`, or donor attempting to change `/liveDonorTrips/req1__donor1` from `tripStatus: "COMPLETED"` back to `"ON_THE_WAY"`.
12. **Payload 12 (Client Timestamp Forgery)**: Creating `/requestAlerts/req1__donor1` or `/liveDonorTrips/req1__donor1` with a client `Timestamp` instead of `serverTimestamp()` (`request.time`).

## 3. Test Suite Reference
See `/firestore.rules.test.ts` and `/tests/emergencyContactSystem.test.ts` for executable verification.
