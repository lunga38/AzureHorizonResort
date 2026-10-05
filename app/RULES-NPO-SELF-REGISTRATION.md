# Firestore rule change: NPO self-registration (UC34)

## Why

`src/pages/NpoApplicationPage.tsx` (web) lets an organisation apply for food-rescue
partner status instead of an administrator creating the record by hand. It calls the
existing `createNpoApplication()` service, which writes an `npo_partners` document with
`verificationStatus: 'pending'` and `createdBy: <applicant uid>`.

Until this rule is deployed the form fails with **permission-denied**: the current
rule only permits administrators to create partner records.

## Current rule (my-mobile-app/firestore.rules:493)

```
allow create: if isSignedIn() && isAdmin()
  && request.resource.data.verificationStatus == 'pending'
  && request.resource.data.organisationName is string
  && request.resource.data.email is string;
```

## Replace with

```
// Admins, OR any signed-in user applying on their own behalf.
// A self-application must: be pending, carry the applicant's own email and uid,
// and may not pre-approve itself (no verifiedBy/verifiedAt/lastDecision).
allow create: if isSignedIn()
  && (
    isAdmin()
    || (
      request.resource.data.verificationStatus == 'pending'
      && request.resource.data.createdBy == request.auth.uid
      && request.resource.data.email == request.auth.token.email
      && !request.resource.data.diff({}).affectedKeys().hasAny(
           ['verifiedBy', 'verifiedAt', 'lastDecision'])
      && request.resource.data.organisationName is string
      && request.resource.data.email is string
    )
  );
```

## Safety properties

| Property | How it is enforced |
|---|---|
| Cannot self-approve | `verificationStatus` must be `'pending'`; `verifiedBy` / `verifiedAt` / `lastDecision` must be absent |
| Cannot impersonate another applicant | `createdBy == request.auth.uid` and `email == request.auth.token.email` |
| Admin path unchanged | `isAdmin()` branch is identical to today's rule |
| Review flow unchanged | the existing `update` rules already restrict status transitions to `approved` / `rejected` / `under_review` and are admin-only |
| Nothing else loosened | `read`, `update`, `delete` and all other collections untouched |

## Deploy

Rules are deployed from the **mobile** repo (this file lives there, not in the web app):

```
cd my-mobile-app
npx firebase-tools deploy --only firestore:rules
```

I have not deployed this. Review the diff before you run it.

## Verify after deploying

1. Web app → signed-out landing page → **Apply as an NPO Partner**.
2. Sign in with a non-admin account (a guest account works), submit the form.
3. Admin → **NPO Verification Queue** → the application appears as `pending`.

---

# Firestore rule change: multi-slot open-shift claims (UC44)

## Why

Open shifts now record **how many employees are requested** (`requestedCount`)
and **who has taken a slot** (`assignees`). A shift requests 3 hands, each claimer
appends their uid, and the shift closes itself when the last slot is taken.

The current claim rule only permits `status: 'open' -> 'filled'`, so a second
claimer is rejected outright — a surge needing three people can only ever be
covered by one. Until this rule is deployed, publish every shift with
**Employees requested = 1**.

## Current rule (my-mobile-app/firestore.rules:720)

```
// Claim: workforce only (never guests/NPOs), self-attributed.
allow update: if isSignedIn() && isShiftClaimant()
  && resource.data.status == 'open'
  && request.resource.data.status == 'filled'
  && request.resource.data.claimedBy == request.auth.uid
  && request.resource.data.diff(resource.data).affectedKeys().hasOnly(
    ['status', 'claimedBy', 'claimedAt', 'updatedAt', 'lastDecision']);
```

## Replace with

```
// Claim a slot: workforce only (never guests/NPOs), self-attributed.
// A shift may need several employees: the claimer is appended to `assignees`,
// and the shift flips to 'filled' only when every requested slot is taken.
allow update: if isSignedIn() && isShiftClaimant()
  && resource.data.status == 'open'
  && request.resource.data.status in ['open', 'filled']
  && request.resource.data.assignees is list
  && request.resource.data.assignees.size()
       == resource.data.assignees.size() + 1
  && request.resource.data.assignees[-1] == request.auth.uid
  && !request.resource.data.assignees[0:request.resource.data.assignees.size() - 1]
       .hasAny(resource.data.assignees)
  && request.resource.data.claimedBy == resource.data.claimedBy
  && request.resource.data.diff(resource.data).affectedKeys().hasOnly(
    ['status', 'claimedBy', 'claimedAt', 'assignees', 'updatedAt', 'lastDecision']);
```

## Safety properties

| Property | How it is enforced |
|---|---|
| Cannot claim twice | list grows by exactly one **and** the new last element is your uid; the "no duplicates" check rejects a re-add |
| Cannot claim for someone else | the appended uid must be `request.auth.uid` |
| Cannot inflate the shift | size must increase by exactly 1 — no bulk writes |
| Cannot steal the first claimer | `claimedBy` must be unchanged; the service writes it only when the list was empty |
| Only closes when full | service sets `filled` only at the final slot; a partial claim keeps `status: 'open'` |
| Cannot edit shift details | `diff().affectedKeys().hasOnly(...)` — date, time, role and `requestedCount` are untouchable |
| Guests/NPOs excluded | `isShiftClaimant()` unchanged |

## Manager cancel (already permitted)

`cancelOpenShift` / `cancelOpenShiftMobile` set `status: 'cancelled'` plus
`cancelledAt` / `cancelledBy` / `cancelReason` / `lastDecision` / `updatedAt`.
The existing manager rule at `firestore.rules:711` already allows that
transition and does not restrict affected keys, so **no rule change is needed**
for removal.

Removal cancels rather than deletes on purpose: `open_shifts` has no `allow
delete`, and the claim history must stay auditable.

## Verify after deploying

1. Kitchen manager → Open shifts → publish with **Employees requested = 3**.
2. Sign in as three different staff and claim the same shift.
3. The first two claims keep it `open` and show `1/3`, `2/3` filled.
4. The third claim flips it to `filled` and it leaves the staff board.
5. A fourth claim is rejected with "Every requested slot on this shift is taken."