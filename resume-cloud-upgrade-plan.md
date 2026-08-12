# Resume Plan — General SWE + Cloud (Entry-Level)

**Goal:** make the resume read strong for both general SWE and cloud-focused entry-level roles, without adding a fifth project.

## Decision: upgrade RimRun, don't start a new project

RimRun is a live, shipped app (App Store, real users) — cloud infra on top of it has a believable "why," since interviewers can ask "why did you need that" and the answer is a real product constraint, not a resume exercise. Workspace Management (school capstone, lab bookings) would read as padding if cloud infra were bolted on after the fact.

Scope: ~1–2 weeks for one well-built decoupled feature, vs. 2–3 weeks for a standalone project.

## What to build

**1. Decouple one feature into a real AWS service** (don't just add cloud to the existing Supabase backend wholesale). Candidates:
- Court activity notifications — alert users when a saved court gets busy/active
- Submission moderation pipeline — if users can submit new courts/photos

Stack: API Gateway → Lambda → SQS/SNS, provisioned with Terraform. Mirrors the Pulse pattern but attached to a shipped product, which is a stronger story than Pulse alone ("decoupled it from the mobile release cycle so notification logic could ship independently").

**2. Redis cache in front of the geospatial hot path.** There's already a documented latency win (RPC → PostGIS: 950ms → 375ms) — caching frequently-queried areas (popular cities/regions) is a believable next optimization with a new number to quantify once built.

**What to skip:** Terraform/IaC on the existing Supabase-hosted core. Supabase is managed infra — "provisioning" language there won't survive questioning. Keep the IaC story scoped to whatever new AWS piece actually gets built.

**Constraint:** every claim must be defensible in an interview since it's a real app people can look at. Only add what can be explained end-to-end — why Lambda over a long-running service, why SQS over direct calls, what happens on failure/retry.

## Draft resume bullets (placeholders — replace bracketed metrics once built)

For the RimRun project block, add/swap in after building:

```
\resumeItem{Decoupled court activity notifications into a \textbf{serverless} pipeline (\textbf{API Gateway} $\to$ \textbf{Lambda} $\to$ \textbf{SQS}/\textbf{SNS}), shipping independently of the mobile release cycle.}
\resumeItem{Provisioned the notification service with \textbf{Terraform}, defining infra as code for Lambda, SQS, and IAM roles.}
\resumeItem{Fronted geospatial hot-path queries with \textbf{Redis} caching, cutting repeat-query latency for popular regions by [X]\%.}
```

Do not paste these into the resume until real numbers/behavior exist — placeholder metrics will get caught in an interview faster than a missing bullet.

## Open item: Workspace Management

Stays the weakest entry on the resume either way — this RimRun upgrade doesn't fix that, it just avoids a *sixth* project. Options, still undecided:
1. Cut it and run 3 strong projects instead of 4
2. Replace it with a new project later
3. Leave it in for now, revisit after the RimRun cloud feature ships

No action taken on this yet — flagging so it doesn't get lost.

## Next steps
- [ ] Pick notification vs. moderation pipeline as the decoupled feature
- [ ] Build Lambda + SQS/SNS + API Gateway, provision with Terraform
- [ ] Add Redis cache to geospatial query path, benchmark before/after
- [ ] Replace placeholder bullets above with real numbers
- [ ] Decide on Workspace Management (cut / replace / keep for now)
