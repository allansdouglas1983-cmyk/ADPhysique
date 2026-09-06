# 20 — GYM DIRECTORY BLUEPRINT (the build spec and the edit-gate spec)

Authority: founder brief 2026-09-06 (UK gym master database), standard
"Of course Volyume knows my gym", independent gyms included (test case:
Volt Gym, Burscough). Evidence `01`..`09`; synthesis `10`. Rulings GD-01..
GD-14 below. Every Section 2 inviolable of CLAUDE.md binds; no source is
imported whose licence is not in the USE column of `01`'s matrix or
confirmed in an acquisition record; no new npm dependency; Node and
Python 3 stdlib only in the pipeline; cloud migration additive and
WRITTEN, NOT APPLIED; agents STOP and report on ambiguity.

## Rulings
- **GD-01 The directory is infrastructure under Community**, not a
  profile field. It ships as its own cloud tables and RPCs, a versioned
  data asset in the repo, and a pipeline that can be re-run.
- **GD-02 Sources by role.** Canonical: Active Places (England), VOA
  rating list (England and Wales), Active Places NI, DataMapWales leisure
  centres, sportscotland Sports Facilities (once the founder's free
  account exists). Candidate signal: Companies House SIC 93130 and 93110
  (a company is not a venue until a premises-like address or another
  source confirms it). Verification and gap-fill: operator branch pages
  (provenance URL, polite fetch, facts only). Cross-check only: OSM by
  sampled tiles, Foursquare and Overture in a later run. Runtime only:
  Google, never stored. Not used: OS paid products.
- **GD-03 Classification rule.** `venue_type` is assigned by source
  evidence in this order: operator brand type (chain table) > VOA
  description or special category > Active Places facility and ownership
  > NI ownership and flags > name tokens (last resort). Types:
  `commercial_gym`, `independent_gym`, `health_club`, `leisure_centre`,
  `strength_gym`, `crossfit_functional`, `womens_gym`, `boutique_studio`,
  `university_gym`, `hotel_gym`, `martial_arts`, `other_fitness`,
  `excluded`. Core search returns the first ten; `other_fitness` appears
  under "Other fitness venues"; `excluded` (school-only sites, private
  residential, closed-access workplace gyms, records with no address)
  never appears. A leisure centre with a fitness suite is a core venue.
- **GD-04 Site, not facility.** One canonical row per physical venue.
  Active Places facilities collapse to their site; a site with several
  countable fitness facilities is one venue with `facility_count`.
- **GD-05 Brands are first-class.** `gym_brands` holds the chain or
  operator with aliases (Wikidata QID where it exists, our own alias
  list: "Pure Gym", "PureGym", "the gym" > The Gym Group, "JD", "J D
  Gyms"). A venue's `display_name` is brand + locality ("PureGym
  Motherwell"); an independent's display name is its own name.
- **GD-06 Deduplication is multi-signal.** Blocking on postcode unit,
  then on postcode sector plus a name token, then on a 250 m grid cell.
  Score: same brand 3; name similarity (token Jaccard after folding and
  brand stripping) 0.85 or above 3, 0.6 to 0.85 1; same postcode unit 2;
  same street number and street 2; within 100 m 2, within 150 m 1; same
  phone 2; same website host 2. Merge at 5 or more; hold for review
  between 3 and 5; distinct below 3. Different brands within 30 m are
  distinct unless the address is identical (a gym inside a leisure
  centre stays a separate venue with a `parent_venue_id`).
- **GD-07 History is kept.** Status `open` | `closed` | `merged` |
  `pending`; a merged row keeps `succeeded_by`; closures keep the row
  with `closed_at`; nothing is deleted; user associations survive.
- **GD-08 Location hierarchy from the postcode.** ONSPD gives country,
  region, local authority and coordinates for every postcode; the venue
  town comes from the source address, folded, with the postcode sector
  centroid as the fallback coordinate (flagged `coord_source`
  `source` | `postcode_sector`).
- **GD-09 Search without extensions.** Server: a folded token array per
  venue plus brand aliases and the postcode outward code, matched by
  prefix on tokens and by district on a recognised postcode, restricted
  by a bounding box when coordinates are supplied, limited to 40
  candidates; client: the app's existing fuzzy ranker over those
  candidates, ranking brand match first, then locality, then distance.
  Postcode input is recognised by the UK pattern and searched by
  outward code; a town name matches the town field and the ONSPD
  built-up area name.
- **GD-10 Near me.** Mile bands 1, 2, 5, 10, 25 on a bounding box plus
  haversine; results show display name, town, outward code and distance
  to one decimal. "Use my location" is offered only if the app already
  holds a location permission dependency; otherwise search by postcode
  or town (a founder decision to add the dependency is recorded, not
  taken here).
- **GD-11 User-created gyms.** "Can't find your gym? Add it": name,
  address line, town, postcode (validated against ONSPD), optional
  website and operator; duplicates checked at submission with GD-06 and
  offered back ("Did you mean PureGym Motherwell?"); a new submission is
  `pending`, immediately selectable by its submitter, visible to others
  after a second independent confirmation or a moderator's verification;
  rate 3 submissions a day.
- **GD-12 Corrections.** Reports: closed, wrong name, wrong location,
  duplicate of, not a gym, other; two independent reports of the same
  kind flag the row for review; a moderator applies the change; the
  history row records it.
- **GD-13 Privacy.** A person's gym is a chosen fact (primary gym plus
  up to three other gyms), shown only under the existing Community
  visibility rules; "people at this gym" counts and lists only people who
  chose it and are viewable; there is no inference from sessions, no
  check-ins, no live presence. Sessions are never associated with a
  venue in this build.
- **GD-14 Community integration.** The profile's free-text gym label is
  replaced by a picker over the directory; `gym_id` becomes the
  Community gym key (`gym:<id>`), with the label kept for display and for
  pending user-created venues; the gym dimension page keys on `gym_id`;
  Find people "At my gym" and the gym summary use it; core onboarding is
  untouched (a person who never opens Community never sees a gym
  picker).

## Data model (cloud, migration 162; global read for authenticated, rpc-only writes)
```
gym_brands(id uuid PK, key text UNIQUE, name text, aliases text[], wikidata_qid text, website text, kind text)
gym_venues(id uuid PK, display_name text, name text, brand_id uuid NULL, venue_type text, status text,
  address_line text, town text, town_key text, local_authority_code text, local_authority_name text,
  region_code text, region_name text, country text, postcode text, outward text, sector text,
  lat double precision, lng double precision, coord_source text, geocell text, website text, phone text,
  facility_count int, parent_venue_id uuid NULL, succeeded_by uuid NULL, verification_status text,
  source_count int, tokens text[], first_seen timestamptz, last_verified timestamptz, closed_at timestamptz,
  created_at, updated_at)
gym_venue_sources(id uuid PK, venue_id uuid, source text, source_record_id text, source_url text,
  source_name text, source_status text, source_updated_at timestamptz, retrieved_at timestamptz, payload jsonb)
gym_venue_history(id uuid PK, venue_id uuid, change text, before jsonb, after jsonb, actor text, created_at)
gym_submissions(id uuid PK, submitter_id uuid, name, address_line, town, postcode, website, operator,
  lat, lng, status text, duplicate_of uuid NULL, confirmations int, created_at, reviewed_at, reviewed_by uuid)
gym_reports(id uuid PK, venue_id uuid, reporter_id uuid, kind text, detail text, status text, created_at, resolved_at)
gym_postcode_sectors(sector text PK, lat, lng, count int, country, region_code, local_authority_code)
```
Indexes: `(lat, lng)`, `geocell`, `outward`, `town_key`, GIN on `tokens`,
`brand_id`. RPCs: `gyms_search(_q, _lat, _lng, _limit)`,
`gyms_near(_lat, _lng, _radius_m, _limit)`, `gyms_in_place(_town_key,
_limit)`, `gyms_get(_id)`, `gyms_suggest(_q, _lat, _lng)` (8 rows for
autocomplete), `gyms_submit(_p)`, `gyms_confirm_submission(_id)`,
`gyms_report(_venue_id, _kind, _detail)`, moderator: `gyms_review_submission
(_id, _action, _merge_into)`, `gyms_review_report(_id, _action)`.
Community: `community_profiles.gym_id uuid NULL`, `other_gym_ids uuid[]`,
`gym_key` derived as `gym:<id>` when set; `community_gym_summary` and
`community_find_people('gym')` key on it; `community_gym_suggest` is
replaced by `gyms_suggest`.

## Pipeline (`scripts/gyms/`, Node ESM, stdlib only)
`fetch-*.mjs` per source (writes raw to the scratch folder with a
manifest), `normalise.mjs` (one schema: name, brand guess, address,
town, postcode, lat, lng, coord_source, venue_type guess, status,
source, source_record_id, source_url, phone, website),
`geocode.mjs` (ONSPD sector centroids; postcode validation),
`classify.mjs` (GD-03), `dedupe.mjs` (GD-06, writes merge decisions and
the review queue), `build.mjs` (canonical JSONL `data/gyms/uk-gyms.v1.
jsonl` plus `data/gyms/brands.v1.json` and `data/gyms/postcode-sectors.
v1.csv`), `audit.mjs` (coverage by nation, operator, local authority,
postcode area; single-source rows; unresolved matches; the named test
cases), `seed-sql.mjs` (generates `supabase/seed_gyms_v1.sql`, applied
only on the founder's phrase). Every script is idempotent and logs
counts. Attribution strings are carried in `data/gyms/ATTRIBUTION.md`.

## App
`src/lib/gyms/` (transport through the same gates as Community: `search`,
`near`, `inPlace`, `get`, `suggest`, `submit`, `report`, plus pure
`postcode.js` (UK postcode recognition and outward code) and `rank.js`
(client ranking over candidates)); `src/components/community/GymPicker.js`
(search bar with debounce 250 ms, recognised postcode chip, results as
"display name / town · outward · distance", "Can't find your gym? Add
it"); `CommunityGymAddScreen` (GD-11); the profile editor and Join use the
picker; the gym dimension page and Find people use `gym_id`.

## Tests and records
Pipeline unit tests over fixtures (normalise, classify, dedupe
thresholds, postcode recognition, ranking on the human inputs from the
brief: "PureGym Motherwell", "Puregym", "Pure Gym", "Motherwell
PureGym", "the gym motherwell", "JD", "J D Gyms", "Motherwell gym",
"gym near ML1", "ML1 1AA", "Hamilton", "Glasgow", "Bannatyne Hamilton",
"David Lloyd Glasgow", and misspellings); the coverage report `30`;
rpc-only guard over 162; privacy guard over `src/lib/gyms`; device
checklist in `40`.
