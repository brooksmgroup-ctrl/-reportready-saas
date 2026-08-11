# Cold Email Campaign Analytics — Aug 11, 2026

## Campaign State: PAUSED

**Decision:** 0 replies across 3 templates in ~365 sends. New initial sends stopped. In-flight follow-ups allowed to finish.

## Delivery Stats (from outreach_tracking.json)

| Metric | Count |
|--------|-------|
| Total sent (tracked) | 315 |
| Stage 1 (initial sent) | 200 |
| Stage 2 (follow-up 1 sent) | 100 |
| Stage 0 (unsent, now paused) | 15 |
| Bounced | 0 |
| Replies | 0 |

## Audience

- 863 agency leads (437 "Agency" + 426 "agency")
- 54 SaaS leads
- 917 total leads with email, 602 still in the bank (uncontacted)

## Templates Used

### Agency template ("The cheapest client retention tool you'll ever buy")
- Subject: `The cheapest client retention tool you'll ever buy`
- Hook: retention angle — every client starts leaving 90 days before they tell you
- Pitch: branded monthly AI-readiness reports, $99/mo unlimited, 14-day free trial
- Follow-up 1: `still thinking about your clients?`
- Follow-up 2: `one last thought`

### SaaS template ("{name} — your AI-readiness score: {s}/100")
- Subject: `{name} — your AI-readiness score: {s}/100`
- Hook: personalized score + audit results
- Pitch: most SaaS sites invisible to AI search
- Follow-up 1: `{name} — your competitors are already fixing this`
- Follow-up 2: `{name} — final check on this`

## Open Rate Analysis: PENDING

**Cannot run locally** — RESEND_API_KEY only exists in the Render production environment.

To complete the diagnosis, run on the production server:
```
cd server && node analyticsReport.js
```

This will pull per-template open/click rates from the Resend API and answer the key question:
- **Low opens?** → subject lines failed first impression (needs new subjects, not new body copy)
- **Normal opens, zero replies?** → message or audience mismatch (needs LinkedIn-proven message)

The analyticsReport.js script is committed alongside this report — ready to run on Render.
