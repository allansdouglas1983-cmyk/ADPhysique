# Children's Access Assessment: Volyume Community

**UK Online Safety Act 2023, children's access assessment duty, assessed
against Ofcom's published guidance for a small user-to-user service.**

- Service assessed: **Volyume Community** (see
  `ILLEGAL-CONTENT-RISK-ASSESSMENT.md` §1 for the full feature description).
- Date of this assessment: **6 September 2026**.
- Accountable person: **the founder**.
- Review date: **6 September 2027**, or immediately if age assurance,
  onboarding, or any Community feature changes in a way that could change
  the conclusion below.
- Authority: `docs/social-discovery-2026-09-06/30-BLUEPRINT.md` §§1, 2, 6;
  `40-DECISIONS.md` SD-05; `docs/social-discovery-2026-09-06/
  70-DISCOVERY-BLUEPRINT.md` §§1, 2, 3, 6; `40-DECISIONS.md` SD-32;
  sourced findings in `docs/social-discovery-2026-09-06/
  13-research-policy-safety-coldstart.md` §3.

---

## 1. Why this assessment exists

Ofcom's guidance is explicit that every in-scope service must assess and
**record** whether it is likely to be accessed by children, and that a
stated age gate (a self-declared "13+" onboarding field) does **not**, by
itself, entitle a service to conclude "no". This is a recorded outcome,
not a compliance checkbox met by having an age field.

## 2. Truth field

**REAL-USER-AGE-VERIFICATION = NO.** Volyume asks for a date of birth at
onboarding (age must fall between 13 and 100) and uses it to compute
`is_minor` server-side wherever it matters for Community. There is no
verification of that date of birth against any external source (no ID
check, no third-party age-estimation service, no parental verification).
A user can misstate their age. This is stated plainly and will not be
allowed to drift into a claim of verified age anywhere in the app, the
App Store/Play listings, or any future document.

## 3. Evidence considered

- Onboarding enforces a date-of-birth field before any progression is
  possible (no default, no tap-through; this is a regression-guarded
  invariant of the app, unrelated to Community).
- There is no anonymous mode (`docs/IDENTITY_AND_OWNERSHIP_LOCKED.md`):
  every user is a real, authenticated account (Apple/Google OAuth or
  email/password), which rules out throwaway or untraceable child
  accounts but does not verify the age claimed.
- Volyume is a general strength-training app with no content-based age
  gate (no age rating restricting install), listed on Google Play and via
  TestFlight without an 18+ store-level restriction.
- Nothing in Volyume's marketing, store listing, or onboarding flow is
  targeted at children, but nothing about the product (a training and
  nutrition-adjacent app) is inherently adult-only either: it is the kind
  of product a 13-17 year old could plausibly and legitimately use.

## 4. Conclusion

**Likely to be accessed by children.** Given self-declared-only age with
no verification, a general-audience product with no adult-only content
gate, and no technical barrier stopping a user under 18 from completing
onboarding honestly (which the app both permits and expects, since 13 is
the stated minimum), the honest, conservative conclusion is that children are
likely to access Volyume, and therefore likely to access Community once
they do. This mirrors the research finding recorded in evidence document
13 (`13-research-policy-safety-coldstart.md` §3): "the honest documented
answer is almost certainly 'possibly accessed by children' unless a
harder age gate is added."

## 5. Measures already in place for under-18 users of Community

Because this assessment concludes likely access, Community shipped with
the following measures for any profile whose `is_minor` flag is true
(computed server-side from the user's own onboarding date of birth, never
self-reported a second time in Community):

- **Forced followers-only visibility.** A minor's profile, posts and
  programmes are never public; only accepted followers can see them.
- **Excluded from discovery.** A minor's profile never appears in search
  results, in "people you may want to follow" suggestions, in any
  dimension list (style, gym, area, programme), in Discover, or in the
  public web pages (`community-public` edge function excludes non-public,
  non-active, or minor authors from every response).
- **No location feature exists at all** for any user, minor or adult:
  there is no map, no radius search, no "at the gym now" signal, and the
  optional "area" label a minor sets is itself excluded from the
  area-dimension list that would otherwise surface it to strangers.
- **No image upload** anywhere in Community, regardless of age: the
  feature most guidance treats as the primary route for illegal
  image-based harm is simply absent from the product for everyone.
- **No connection requests, in either direction.** A minor's account can
  neither send nor receive a connection request; the second campaign's
  Connect tier (`70-DISCOVERY-BLUEPRINT.md` §1, SD-32) is server-enforced
  as unavailable to any account flagged `is_minor`, whichever side of the
  request they would be on.
- **No messaging.** Since messaging is only ever possible between two
  people who are mutually Connected, and a minor can never be part of a
  connection, a minor's account can neither send nor receive a message.
  This is the primary route most guidance treats as the way an adult
  privately contacts or grooms a minor, and it is simply unreachable here.
- **No training profile age band.** A minor's account is never asked to
  share, and never computes, the `tp_age_band` field; it is adult-only by
  design (`70-DISCOVERY-BLUEPRINT.md` §3).
- **Never listed in any Find people door.** A minor's profile is excluded
  from every door on the Find people screen ("at my gym", "near me",
  "train like me", "on my programme", "open to training together",
  "people you might know") and from search, on the same basis as the
  existing discovery exclusion below; the training partner flag is not
  offered to a minor's account at all.
- A minor can still share their own profile link directly with someone
  they choose (e.g. a training partner they already know), and that
  recipient can request to follow; the same followers-only gate applies.
  A follow is the only relationship a minor's account can ever be part of.
- The Join screen shows a specific line to a user assessed as a minor:
  "Under 18: your profile is followers-only and does not appear in
  search," so the restriction is disclosed, not silent.

## 6. Next step

This access assessment concludes likely access, which under Ofcom's
process means a **full children's risk assessment** (assessing each
kind of harmful-but-not-illegal content against the Children's Codes of
Practice, in force since 25 July 2025) is the required next document.
That full assessment is **not** this document and has not been produced
here; it is recorded as an outstanding item for the founder to prioritise,
alongside the measures already built above which anticipate its likely
conclusions (followers-only, discovery exclusion from every Find people
door, no location, no connections or messaging for minors, no images).
Producing it does not require any additional feature to ship
first; it can proceed against the feature set as already built.
