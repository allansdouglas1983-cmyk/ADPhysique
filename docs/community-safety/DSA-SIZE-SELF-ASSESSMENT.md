# DSA Size Self-Assessment: Volyume Community

**EU Digital Services Act, micro/small enterprise self-assessment and
notice-and-action mechanism description.**

- Service assessed: **Volyume Community** (the user-to-user layer;
  Volyume overall is an intermediary/hosting service to the extent it
  stores and disseminates Community content to the public or to accepted
  followers at a user's request).
- Date of this assessment: **6 September 2026**.
- Accountable person: **the founder**.
- Review date: **6 September 2027**, or immediately if Volyume's
  employee count, balance sheet, or EU average monthly active user count
  changes materially.
- Authority: `docs/social-discovery-2026-09-06/30-BLUEPRINT.md` §§3, 11;
  `40-DECISIONS.md` SD-11, SD-14; `docs/social-discovery-2026-09-06/
  70-DISCOVERY-BLUEPRINT.md` §2; `40-DECISIONS.md` SD-21; sourced findings
  in `docs/social-discovery-2026-09-06/13-research-policy-safety-coldstart.md`
  §3.

---

## 1. Size self-assessment

Under the EU definition used by the DSA (Recommendation 2003/361), a
**micro enterprise** has fewer than 10 employees and annual turnover or
balance sheet total of €2 million or less; a **small enterprise** has
fewer than 50 employees and €10 million or less.

Volyume is a solo-founder operation: one person, no employees, hosted on
Supabase (EU-Dublin) with no venture-scale funding or revenue at the scale
those thresholds describe, and the product is fully free (founder decision
2026-09-03, D137; no subscription revenue is currently taken at all).
**Volyume self-assesses as a micro enterprise** under the DSA definition,
by a wide margin on every threshold.

## 2. What this does and does not exempt

The DSA's obligations that apply regardless of size (Article 16
notice-and-action, Article 14 terms-of-service transparency, and the
baseline transparency reporting duty for intermediary services) apply to
Volyume in full. The micro/small enterprise carve-out (Article 19) reduces
certain **online-platform-specific** duties that would otherwise sit on
top of the baseline: for example the more elaborate internal
complaint-handling system (Article 20) and out-of-court dispute
settlement designation (Article 21) that larger platforms must offer.
Volyume still provides an equivalent notice-and-action and appeal route in
substance (Section 3 below); the carve-out means it is not obliged to
build the heavier, platform-scale versions of those mechanisms.

**Very Large Online Platform (VLOP) obligations do not apply at all**,
regardless of size self-assessment: those duties (systemic risk
assessment, independent audits, advertising repository, researcher data
access, crisis-response protocols) attach only to platforms formally
designated by the European Commission on reaching 45 million average
monthly active EU users. Volyume is not remotely close to that threshold
and this is not a size-carve-out question; VLOP status is a separate,
much higher bar that simply does not arise here.

## 3. Notice-and-action mechanism (Article 16)

Volyume provides the electronic reporting mechanism Article 16 requires,
built to satisfy the same common denominator as Apple's Guideline 1.2 and
Google Play's UGC policy at once (`13-research-policy-safety-coldstart.md`
§3):

- **In-app report flow** on every profile, post, comment and programme,
  with a **fixed reason enum** (spam, harassment, impersonation, harmful
  body or eating content, inappropriate, other-with-detail) rather than
  free text alone, so a report is always categorised.
- A report reaching **three distinct open reports** on the same item
  auto-hides it immediately, pending review; content is taken down from
  general view without waiting for a moderator to act first.
- Every report lands in a **moderator queue** (open/actioned/dismissed)
  with an internal **24-hour target** for a first action, which is
  tighter than Apple's informal expectation and satisfies Play's
  "promptly" and the DSA's own "without undue delay" language by being the
  strictest of the three.
- Every moderator action (dismiss, hide, unhide, delete, restrict
  account, suspend account, and their reverses) is written to a
  **moderator audit log** recording who, when, what action, against which
  report: the record-keeping the DSA and OSA both expect.
- Reports are accepted from any signed-in user against any Community
  content; a reporter's identity is retained on the report row but is set
  to null if that reporter later deletes their account, so reporting
  never becomes a reason data outlives its owner.

## 4. Statement of reasons and appeal

The audit log records the reason for every moderation action taken. What
is **not yet built** is an automated in-app notification telling the
affected content's author the specific reason their content was
actioned (an Article 17 "statement of reasons"). At Volyume's size this
is not itself a missing legal requirement the carve-out lifts entirely,
but it is honestly recorded here as a gap rather than assumed covered:
today, an actioned user who wants to know why can reach the same
published contact address as everyone else (Section 5) and receive an
explanation by email, which stands in as the appeal route the DSA
expects a service this size to offer (`13-research-policy-safety-
coldstart.md` §5: "email is sufficient at this scale"). A dedicated
in-app statement-of-reasons notice is a candidate future improvement, not
claimed as built here.

## 5. Terms of service transparency (Article 14)

Volyume's Community rules (`COMMUNITY-RULES.md`, shown and accepted before
a profile is created) state in plain language what content is and is not
allowed, how reporting and blocking work, what moderators can do, and how
to contact Volyume. This is the terms-of-service surface Article 14
requires be "easily accessible" and in "clear, plain, intelligible,
user-friendly and unambiguous language"; it is written in exactly that
register, matching Volyume's house voice.

## 6. Interpersonal communication service note (one-to-one messaging)

Community added one-to-one messaging between mutually connected people
(`70-DISCOVERY-BLUEPRINT.md` §2, SD-21). Private, one-to-one messaging of
this kind is generally treated as falling outside the DSA's "hosting
service" and "online platform" categories: it is not content stored and
disseminated to the public, or to a wider audience than the sender chose,
at the sender's request in the sense Article 3(g) of the DSA and its
recitals describe, but a direct exchange between two specific people, the
kind of function the EU's own regulatory scheme separately treats as
"interpersonal communication" rather than platform hosting. On that
reading, message content itself sits outside the scope of the DSA's
hosting-service and platform obligations assessed above (Sections 2 to 5),
including the size-tiered ones.

This does not narrow Volyume's own report path. The notice-and-action
mechanism described in Section 3 was built once, uniformly, across every
Community content type, and messages are one of those types by design:
every message is individually reportable (target kind `message`), feeds
the same moderator queue with the same 24-hour target, and is covered by
the same audit log. So even where DSA hosting-service scope may not
technically reach message content, Volyume's actual moderation coverage
does, and a person reporting a message gets the identical mechanism as a
person reporting a post, comment or programme. This note records the
scope question honestly rather than either claiming messaging sits fully
inside DSA hosting-service duties or using the scope question as a reason
to moderate messages any less than everything else.

## 7. Contact

The published contact address for all of the above is
**support@volyume.app** (`public/support/index.html` §9, the app's live
support page).

## 8. Conclusion

Volyume self-assesses as a DSA micro enterprise. Its notice-and-action
mechanism, moderator audit log, and terms-of-service transparency satisfy
the DSA obligations that apply to a service of this size. No VLOP
obligation applies. The one honestly recorded gap (an automated
statement-of-reasons notice to the actioned user, beyond the existing
email-contact appeal route) is noted for future improvement rather than
claimed as already built.
