# 10 — Lead synthesis: what can build the UK gym directory, and under which licence

Evidence: `01`..`04` (research), `06` (NI, Wales acquisition), `05`, `07`,
`08`, `09` (acquisition records, filled as they land). Rulings are GD-nn in
`20-BLUEPRINT.md`.

## What the evidence settles

1. **There is no single national source.** England has Active Places
   (CC BY 4.0, attribution "Contains Data © Sport England", daily updated,
   site and facility split, but skewed to public and registered operators
   and with unverified chain coverage). Scotland has sportscotland's
   Sports Facilities (OGL v3, quarterly, but behind a free account login,
   so unreachable from this container until the founder registers).
   Northern Ireland has Active Places NI (OGL, 2,404 rows, 242 with a
   fitness flag, Irish Grid coordinates, last updated eight years ago).
   Wales has nothing equivalent: the one open layer holds 97 leisure
   centres from 2022 and lists closed commercial gyms as closed.
2. **Independents need premises data, not sports registers.** Every
   trading gym occupies rated premises and nearly all are registered
   companies, so the VOA rating list (England and Wales, gym category)
   and Companies House (SIC 93130) are the sources that reach a Volt Gym
   in Burscough; Active Places reaches it only if the operator registered.
   Scotland's and NI's valuation rolls are the equivalents (bulk access to
   be established).
3. **Chains come from their own feeds** where those are enumerable and
   politely fetchable (JD Gyms and The Gym Group are clean; PureGym is
   partial; Everyone Active, Anytime Fitness, énergie and Gymbox block
   automated access and are not attempted), used as verification and
   gap-fill for branch existence, name, address and status, with the
   branch page as provenance. Their terms of use are unconfirmed, so the
   posture stays conservative: low rate, robots respected, facts only,
   never bulk redistributed as an operator list.
4. **Licences that decide the architecture.** Google is runtime-only
   (place id is the only storable field). OSM is share-alike: no OSM
   venue is copied into the canonical store; OSM is a gap detector only,
   and from this container only by sampled tiles because every Overpass
   mirror is blocked. OS Points of Interest and Land Use Features are paid
   products: not used unless the founder buys a licence. ONSPD is OGL and
   supplies the whole postcode hierarchy (country, region, local
   authority, coordinates). Wikidata (CC0) names the brands. Foursquare
   and Overture are permissive but ship as Parquet, which this container
   cannot read without a new tool, so they are recorded as cross-checks
   for a later run, not used now.
5. **Mechanics have precedent.** Site versus facility (Active Places),
   brand as its own entity with aliases (OSM's Name Suggestion Index),
   multi-signal matching (Overture: name, address, phone, website,
   category, geometry; never one signal), SCD-style history with a
   `succeeded_by` pointer for rebrands and closures, bounding-box plus
   haversine search without PostGIS, two-stage fuzzy search (cheap
   candidate retrieval, then client-side scoring), and pending-to-verified
   submission states with duplicate checks at submission time.
6. **The measure of completeness** is ukactive's 5,842 UK health and
   fitness clubs (2026), against which the canonical count is reported
   by nation and by operator, with the single-source and unresolved
   counts stated rather than hidden.

## What this means for the build
- Canonical venues are built from open, redistributable sources (Active
  Places, VOA, Active Places NI, DataMapWales, Companies House as a
  candidate signal), verified and gap-filled from operator pages with
  provenance, located by source coordinates or ONSPD postcode centroids,
  classified by a documented rule, deduplicated by multi-signal matching,
  and corrected by users through moderated submissions and reports.
- Scotland's open register needs the founder's free sportscotland
  account before it can be pulled; until then Scotland relies on operator
  feeds, Companies House and user submissions, and the coverage report
  says so.
- Distance search and "near me" work on stored coordinates; "use my
  location" needs the device location permission, which is a separate
  founder decision if the app does not already hold the dependency.
