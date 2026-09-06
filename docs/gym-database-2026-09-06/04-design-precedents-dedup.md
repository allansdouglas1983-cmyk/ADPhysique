# Design precedents: venue models, dedup, geo search, name search, submissions, UK classification

Research-agent output for the UK gym master database workstream. Read-only
research; no repo changes made. Every claim carries a source URL; anything
not directly sourced is marked **[unverified]**. Researched 2026-09-06.

---

## 1. Venue / site / facility data models

- **Sport England Active Places Power**: relational "Sport Data Model."
  Open Data ships as `sites.csv`/`facilities.csv` joined by ID — one
  **site** (address/location) holds multiple **facilities** (gym, pool,
  sports hall as separate rows) — the nearest UK precedent for "one
  building, several sub-venues." API v2, rate-limited 120 req/60s.
  Field-level schema sits behind portal Help docs — **[unverified in
  detail; needs direct portal access, see doc 01]**.
  [SportsDataModel](https://www.activeplacespower.com/pages/sportsdatamodel),
  [Active Places Power](https://www.sportengland.org/how-we-can-help/facilities-and-planning/planning-for-sport/active-places-power).

- **Overture Maps Places**: `id` is a **GERS ID** (stable UUIDv4 since June
  2025), the join key across releases/changelog. A `brand` object
  (name + Wikidata ID) sits separate from the place's own `names`;
  `categories` uses the ~2,300-term OPC taxonomy with `primary`/`alternate`
  fields. Per-place `confidence` addresses existence-likelihood only, not
  duplicate-collapsing. [Places Guide](https://docs.overturemaps.org/guides/places/),
  [GERS intro](https://docs.overturemaps.org/blog/2025/06/25/getting-started-gers/).

- **Foursquare Places**: 1,244 categories, 6 levels, 11 top-level groups.
  Explicit chain table links a brand to its store list, queryable by chain
  name/ID. Multi-unit sites use `parent_id` + subvenue count — a shopping
  centre/leisure complex is the **parent venue**, individual units (e.g. a
  gym in a retail park) are **subvenues** pointing to it.
  [Categories](https://docs.foursquare.com/data-products/docs/categories),
  [Technical guide pt.2](https://foursquare.com/resources/blog/products/technical-guide-to-foursquare-places-part-2-how-does-foursquare-get-location-data-right/).

- **Google Places API**: one **primary type** per place from a filterable
  "Table A" list, plus broader non-filterable "Table B" types.
  [Place Types (New)](https://developers.google.com/maps/documentation/places/web-service/place-types).
  Parent/child relations exist only in the separate Business Profile API
  (`DEPARTMENT_OF`/`INDEPENDENT_ESTABLISHMENT_OF`). No public chain/brand
  object equivalent to Overture's `brand` was found in Places API v1 —
  **[unverified]**.

- **OSM tagging**: `name` = on-the-ground signage; `brand` = franchise/chain
  identity (McDonald's has many franchisee operators, so brand ≠ operator);
  `operator` = the entity running that unit day-to-day.
  [Key:brand](https://wiki.openstreetmap.org/wiki/Key:brand),
  [Key:operator](https://wiki.openstreetmap.org/wiki/Key:operator). The
  **Name Suggestion Index (NSI)** is a maintained canonical list of brand
  presets (name, tags, matching patterns, Wikidata) editors use to
  auto-suggest correct brand tagging — directly analogous to a chain-
  synonym table. [NSI repo](https://github.com/osmlab/name-suggestion-index).

- **Marketplace naming**: Hussle listings follow `<Brand> <Town/Area>
  <optional disambiguator>` — "PureGym London Hammersmith Palais",
  "PureGym Epsom" — a landmark disambiguator is added only when town alone
  is ambiguous. [Hussle listings](https://www.hussle.com/gyms-in-uk).
  ClassPass lists 41,500+ venues; Wellhub (ex-Gympass) syncs branch-level
  venues with ClassPass — no distinctive branch-naming convention beyond
  operator-supplied names was documented publicly.
  [ClassPass partners](https://classpass.com/partners/studio-fitness),
  [Wellhub](https://en.wikipedia.org/wiki/Wellhub). **[unverified in detail:
  inferred from listing pages, not a stated schema]**.

---

## 2. Deduplication of places

- **General method**: normalise names (case-fold, strip punctuation, drop
  stop-words, tokenise), score with edit-distance/token metrics —
  Jaro-Winkler is widely used for place names (weights common prefixes,
  tolerates abbreviation/spelling variance); geographic proximity gates the
  comparison (candidates pre-filtered within single-digit km, confirmed at
  metre scale). [Conflating POI data — systematic review (arXiv)](https://arxiv.org/pdf/2310.15320),
  [Jaro-Winkler for fuzzy matching](https://www.datablist.com/learn/data-cleaning/fuzzy-matching-jaro-winkler-distance).

- **Overture's cross-source matcher** decides "same real place" from names,
  addresses, websites, phone numbers, category, and point geometry
  together — multi-signal, not name- or distance-only; records missing
  several fields are harder to dedupe and more likely to persist as
  duplicates. [Analyzing Overture Places data](https://www.echo-analytics.com/blog/analyzing-overture-maps-foundations-places-data).

- **Placekey**: resolves name+address to a stable ID by (1) checking for an
  existing POI identifier, (2) else validating/normalising the address,
  (3) else geocoding and encoding location into Uber's H3 hex grid — two
  independent submissions for the same building resolve to the same key
  without a shared POI ID. [Address matching without a geocoder](https://www.placekey.io/tutorials/address-matching-without-a-geocoder).
  Cross-dataset joins (Foursquare↔Overture) are done by independently
  Placekey-ing each dataset then matching on the shared key.
  [Merging Foursquare + Overture via Placekey](https://www.placekey.io/blog/joining-foursquare-places-with-overture-places-using-placekey).

- **Concrete distance/brand thresholds** (e.g. "same brand within 150 m =
  same venue; different brand within 30 m = distinct") were asked for
  directly but **no public source with those exact figures was found**.
  Closest documented figure: a ~2–5 km "candidate area" used only as a
  *pre-filter* before name comparison, not a same-venue cutoff
  ([systematic review, arXiv](https://arxiv.org/pdf/2310.15320)). Numbers in
  the recommendation section below are this agent's synthesis from the
  matching literature plus domain reasoning about UK gym/retail-park
  density — **not a cited industry constant; founder-reviewable**.

- **Rebrands/relocations/closures**: the standard warehousing pattern is
  **SCD Type 2** — never overwrite a changed record; close the old row
  with `effective_to`, insert a new row with `effective_from`, preserving
  full history. [SCD overview](https://en.wikipedia.org/wiki/Slowly_changing_dimension).
  A `succeeded_by`/`merged_into` pointer between canonical IDs is a standard
  extension, but **no vendor-published field name for it was found —
  general data-modelling practice applied here, not a documented vendor
  field [unverified as a named field]**.

---

## 3. Geographic search without PostGIS

- **Bounding-box + haversine**: `BETWEEN` on indexed lat/lng columns
  (works unextended on SQLite/Postgres/MySQL) filters candidates cheaply;
  haversine (plain trig, any SQL dialect) then computes exact distance only
  on that pre-filtered set for sort/display.
  [Bounding Box Queries Without PostGIS](https://eka.weiyen.net/posts/bounding-box-queries/),
  [Fast SQL location finder via Haversine](https://www.plumislandmedia.net/mysql/haversine-mysql-nearest-loc/).

- **Geohash prefix search**: nearby points share a common string prefix, so
  a plain text-column index supports a cheap prefix-range scan before a
  precise distance check — same two-stage shape, using string indexing
  instead of numeric range. [How geohash works](https://medium.com/prepster/how-geohash-works-in-proximity-search-c56b8fc23a93).

- **Mile-band UX**: discrete radius filters (1/2/5/10/25 mi) are the norm
  in fitness-finder apps; UX testing on comparable apps found filter labels
  needed *more* explanatory text after users were confused about what the
  radius meant, and straight-line distance is seen as inferior to
  distance-plus-travel-time where available.
  [6 ways to filter location data](https://traveltime.com/blog/filter-location-data),
  [Gym finder app case study](https://medium.com/design-bootcamp/case-study-fitness-gym-finder-app-a431b4e6fc13).
  Rounding distance to one decimal mile plus a town/postcode-district
  qualifier for disambiguation was observed directly on Hussle's listing
  pages — **[direct UI observation, not a written spec]**.

- **ICO / location-permission UX**: the ICO has no single "location data"
  document; it applies general data-minimisation/transparency guidance.
  Commentary summarises the practical implication: prefer a
  **transactional, one-off** location grab ("use my location" per search)
  over persistent background access, and treat the OS permission prompt as
  *not* a substitute for a plain-language in-app statement of purpose,
  retention, and access. [Third-party ICO summary](https://proximateapp.co.uk/guides/ico-guidance-on-location-data/)
  — **[third-party summary, not ICO's own text; verify against ico.org.uk
  before citing as an ICO requirement]**. Google Play separately requires
  justification for persistent background location and favours
  foreground/on-demand access. [Play Console minimum scope](https://support.google.com/googleplay/android-developer/answer/17033915?hl=en).

---

## 4. Search over venue names with real human input

- **Chain synonyms**: OSM's NSI is the closest published precedent for a
  synonym/alias table mapping written/spoken variants ("Pure Gym",
  "PureGym", "the gym" → The Gym Group) to one canonical brand, with
  matching patterns per entry. [NSI repo](https://github.com/osmlab/name-suggestion-index).
  No public UK-fitness-specific synonym dictionary exists; this needs to be
  **Volyume's own curated table**.

- **UK postcode recognition**: outward code (area+district) is the leading
  2–4 characters, format `A(A)N(N|A)`; common validation regex:
  `^[A-Z]{1,2}[0-9][0-9A-Z]?\s?[0-9][ABD-HJLNP-UW-Z]{2}$` (excludes
  C/I/K/M/O/V from the inward unit). A lighter partial regex on just the
  outward-code shape can detect "this looks like a postcode" and route to a
  postcode/district search branch. [Regex for UK postcode validation](https://howtodoinjava.com/java/regex/uk-postcode-validation/),
  [UK postcode format explained](https://www.postcodeinsights.uk/blog/uk-postcode-format).

- **Town-then-brand ordering**: Hussle's convention is brand-first
  ("PureGym Epsom"); natural UK speech is often town-first ("Motherwell
  PureGym") — a parser needs to tokenise and match against town/locality
  and brand dictionaries independent of word order. **[No published source
  documents this ordering behaviour; addressed here as a parsing
  requirement, not a sourced UX pattern]**.

- **Typo tolerance without pg_trgm**: since the device DB is SQLite only
  (no Postgres extension client-side), the standard shape is two-stage —
  cheap candidate retrieval via a prefix/token index (FTS virtual table or
  `LIKE 'token%'`), then **client-side** fuzzy scoring (Levenshtein/Jaro-
  Winkler) only over that small candidate set, because full Levenshtein
  scans are documented as slow (O(m×n) per pair — "very slow even near the
  255-char limit" per Postgres' own `levenshtein()`). Double Metaphone
  (primary+alternate phonetic code) is the standard extra layer for
  "sounds like" matching. [Fuzzy search on PostgreSQL](https://medium.com/the-backlog-by-ecaresoft/dev-notes-fuzzy-search-on-postgresql-beaae7b11f45),
  [fuzzystrmatch reference](https://www.pgref.dev/functions/fuzzymatch).
  SQLite's FTS5 module supports a trigram tokenizer in recent builds —
  **[unverified against the exact build bundled by `expo-sqlite`; check
  FTS5 is compiled in before relying on it]**.

- **Ranking**: no single public formula found, but the consistent pattern
  across matching literature and marketplace search (Foursquare chain
  search, Google primary-type+locality) is a weighted blend — exact/near
  brand-token match scores highest, then locality/town match, then raw
  distance as tiebreaker — because pure proximity surfaces the nearest
  venue of the *wrong* brand when the user typed a specific chain name.

- **Autocomplete latency**: perceived latency **under ~200 ms** is the
  point autocomplete "becomes invisible-good"; debounce guidance clusters
  200–300 ms (Algolia recommends ~200 ms), between average human reaction
  time (~250 ms) and the point the UI feels laggy. Suggestion count: ≤10
  desktop, 4–8 mobile. [Baymard autocomplete patterns](https://baymard.com/blog/autocomplete-design),
  [200ms-or-don't-bother](https://www.vibeweek.ai/grow/search-autocomplete-typeahead-chat).

---

## 5. User-submitted venues and corrections

- **Google Maps**: edits go through moderation with three states —
  **Pending** (confirming), **Accepted** (published), **Not Accepted**
  (unverifiable). "Local Guides" can see and vote on others' pending edits
  ("Check the facts"); publication partly decided by reviewer majority
  vote. [Edit business info in Google Maps](https://support.google.com/maps/answer/7084895?hl=en).

- **OpenStreetMap**: no formal pre-publication gate — edits go live
  immediately — but a strong post-hoc community layer exists via
  **OSMCha** (lists every changeset, auto-flags suspicious edits by
  size/pattern/new-user heuristics, surfaces an explicit review-request
  tag). Bulk/automated imports introducing duplicates are a known, actively
  policed problem. [OSMCha wiki](https://wiki.openstreetmap.org/wiki/OSMCha),
  [Detecting suspicious OSM changesets](https://neis-one.org/2016/01/suspicious-osm/).

- **Strava** (closest precedent for user-generated geo-entities at scale):
  segments are fully user-created; one cleanup pass found **610,000
  duplicate segments** worldwide, now being removed with upstream
  duplicate-prevention added, alongside a star/hide up-down-vote mechanism
  and an auto-flagging system that cut "impossible efforts" on leaderboards
  by 33%. Clubs are self-moderated by owners/admins, abuse reportable
  directly to Strava. [Segment updates](https://support.strava.com/en-us/articles/15401612-segment-updates-verified-segments-decluttering-and-leaderboard),
  [Club moderation guidelines](https://support.strava.com/en-us/articles/15401625-club-moderation-guidelines-for-admins-and-owners).

- **Foursquare**: public docs on its own submission/moderation workflow
  were not found beyond the chain/parent-venue schema in §1 — **[gap]**.

- **Common pattern across all four**: (1) a pending/unverified state
  distinct from published/verified; (2) duplicate-detection attempted *at
  submission time* against the existing candidate set, not only after the
  fact; (3) community confirmation signals (votes, reviewer voting,
  star/hide) as a cheap secondary trust layer alongside or instead of full
  moderation; (4) closure reporting as its own lightweight flow (a
  "still open?" flag needing multiple independent confirmations) rather
  than a full duplicate/edit review.

---

## 6. UK-specific classification

- **Sport England / Active Places**: the SDM's facility-type taxonomy is
  the nearest official UK classification of built sports/fitness
  facilities, but the exact category list and per-category counts sit
  behind the portal's own documentation/downloads, not surfaced by general
  search — **[needs direct portal access; flagged for doc 01]**.

- **ukactive / Leisure DB "State of the UK Fitness Industry" report**: the
  industry's own annual classification/count exercise, referenced in 2025
  commentary as covering "7,000+ facilities across the UK," but **exact
  per-category counts were not retrievable from open web search** — the
  full report sits behind Leisure DB/ukactive's own distribution.
  [Report landing page](https://online.flippingbook.com/view/408285620).
  **[unverified: taxonomy and counts not confirmed from source; recommend a
  follow-up fetch of the report itself]**.

- **Generic gym-type taxonomy** (industry commentary, not an official
  count): commercial chain, independent/local-authority-or-trust-run,
  boutique (single-discipline — yoga, Pilates, spin, barre; smaller
  classes, premium pricing), CrossFit "boxes" (functional fitness,
  open-space, barbell/rig/kettlebell, group-class format), women-only
  (dedicated venues or sections within a co-ed gym), hotel/health-club,
  university/school, powerlifting/strongman-specific. Drawn from general
  fitness-industry blog content (Mindbody, Shopify, Gymdesk), which is
  marketing-adjacent, not a regulatory taxonomy.
  [Mindbody: 12 types of gyms](https://www.mindbodyonline.com/business/education/blog/12-types-gyms-guide-aspiring-gym-owners),
  [Gymdesk: 14 types of gyms](https://gymdesk.com/blog/gym-types).
  **[Marketing-blog taxonomies, usable as a checklist of category names,
  not as an "official" classification]**.

- No official published per-category counts (commercial/independent/local-
  authority-or-trust/boutique/CrossFit/powerlifting-strongman/women-only/
  hotel/university/school) were found in this pass. **Genuine gap** —
  closing it needs direct access to the ukactive/Leisure DB 2025 report or
  Active Places Power's facility-type breakdown, not further web search.

---

## Recommended mechanics for Volyume

- **Model**: two-level entity — `venue` (building/address, lat/lng,
  postcode, hours) containing 1..N `facility` rows when a site genuinely
  offers more than one countable facility (mirrors Active Places'
  site→facility split, Foursquare's parent/subvenue pattern). A separate
  `brand` entity (many venues → one brand) holds the canonical name plus an
  alias/synonym list (Volyume's own NSI-style table).
- **IDs**: a stable internal UUID per venue (Volyume's GERS-equivalent),
  never reused, so history/merges/closures always resolve back to one
  identity.
- **Dedup signals**: normalised name tokens + brand-aware comparison (brand
  match outweighs raw name-string similarity) + postcode-unit or close
  lat/lng + phone/website normalisation when available — never a single
  signal alone, per Overture's multi-signal matcher.
- **Dedup thresholds (this agent's synthesis, not a cited constant —
  founder-reviewable)**: same brand within ~100–150 m → same venue pending
  confirmation; different brand within ~30–50 m → distinct co-located
  venues (e.g. gym inside a leisure centre); beyond ~150 m always distinct.
  Borderline cases go to manual review, never auto-merge.
- **Rebrands/relocations/closures**: SCD Type 2 on the venue row — close
  the old version with `effective_to`, insert a new version, add a
  `succeeded_by` pointer so saved references ("my gym") keep resolving.
- **Geo search stack (no PostGIS, SQLite-first)**: bounding-box prefilter on
  indexed lat/lng, haversine on the pre-filtered set, distance rounded to
  0.1 mile for display; geohash prefix column optional only if bounding-box
  proves too coarse at scale. (Check PostGIS availability on Supabase
  separately; this targets device-local SQLite per `database.js`.)
- **Mile-band UX**: discrete radius chips (1/2/5/10/25 mi) in plain
  English, plus free-text town/postcode search as the alternative to
  "use my location"; one-off transactional location grab per search, never
  persistent background, with a plain-language purpose/retention line
  (Article 9 gate and EU-residency rules already govern data downstream).
- **Name search**: normalise input, detect a UK-postcode-shaped token first
  and branch to postcode/district search; otherwise tokenise and match
  independently against a brand-alias dictionary and a locality dictionary
  (no assumed word order); retrieve a small candidate set via a prefix/
  token index, then apply client-side fuzzy scoring only within it.
- **Ranking**: weighted blend — brand-token match highest, then locality
  match, then distance as tiebreak; never let raw proximity outrank an
  exact brand match the user typed.
- **Autocomplete**: debounce ~250 ms, target sub-200 ms perceived response,
  cap suggestions at ~8 on mobile.
- **Submission states**: `pending` → `verified`/`published` → optional
  `flagged`/`closed`; duplicate-detection at submission time against the
  existing candidate set (same signals as dedup above); community
  confirmation counts as a cheap secondary signal; full moderation only for
  contested or no-candidate-match submissions; closures need more than one
  independent confirmation before auto-hiding.
- **Classification rule**: count as a **core gym** anything offering
  general public strength/resistance training access (commercial chains,
  independent gyms, local-authority/leisure-trust gyms, boutique
  strength/CrossFit/powerlifting-strongman venues, women-only strength
  facilities); count as **other fitness venue** single-modality studios
  with no meaningful free-weight offer (pure yoga/Pilates/spin/barre,
  pools-only); **exclude** school-only and non-public hotel/residential
  gyms. This split is a product-scope decision layered on the undocumented
  industry category names in §6 — no authoritative UK source publishes a
  ready-made "core gym" definition, so confirm with the founder rather than
  treat it as an imported standard.
