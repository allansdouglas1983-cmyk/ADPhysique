# Sources: Scotland, Wales, Northern Ireland (2026-09-06)

Read-only research. Every claim carries a URL. Claims not verified against
a fetched page/endpoint are marked **[UNVERIFIED]**. No import before
licence is resolved (per README). For each candidate I fetched the actual
landing page and, where the endpoint was open, the data itself (WFS/CSV)
to get real field names and row counts, not just the marketing blurb.

---

## 1. Scotland — sportscotland Sports Facilities (Spatial Hub)

- **Dataset**: "Sports Facilities - Scotland", published via the Spatial
  Hub (Improvement Service, on behalf of Scottish local authorities).
  - Landing page: https://data.spatialhub.scot/dataset/sports_facilities-unknown
  - Metadata (GeoNetwork, UUID `6571a242-7345-4e2f-88d7-97f99046dc0d`):
    https://spatialdata.gov.scot/geonetwork/srv/api/records/6571a242-7345-4e2f-88d7-97f99046dc0d?language=all
  - Mirror: https://www.data.gov.uk/dataset/f13873a2-e78c-4f2b-a1af-cfb8f9895330/sports-facilities-scotland
- **Structure**: NOT one dataset — 11 themed WFS layers, confirmed from
  schema links embedded in the landing page: Fitness Suites
  (`ext_spf:pub_spffs`), Sports Halls incl. gyms (`pub_spfsh`), Squash
  Courts (`pub_spfsc`), Ice Rinks (`pub_spfir`), Athletics Tracks
  (`pub_spfat`), Swimming Pools (`pub_spfsp`), Bowling Greens
  (`pub_spfbg`), Outdoor/Indoor Tennis (`pub_spfotc`/`pub_spfitc`),
  Pitches (`pub_spfp`), Golf Courses (`pub_spfgc`). Endpoint pattern:
  `https://geo.spatialhub.scot/geoserver/ext_spf/wfs?service=wfs&typeName=ext_spf:pub_spffs`.
- **Access is gated**: an unauthenticated `GetFeature` against that
  endpoint returned HTTP 403 (tested live, 2026-09-06), including a
  `resultType=hits` count request. Per the Spatial Hub FAQ
  (https://data.spatialhub.scot/faq), this sits in the **"National Open
  Datasets"** tier: "shared under an Open Government Licence. After
  creating and logging into a free Spatial Hub user account, anyone can
  access these datasets as file downloads or web service connections." So
  the data is OGL but not fetchable anonymously — a free registration is
  required before any endpoint call succeeds, which blocks a no-login
  pipeline until an account/authkey is provisioned.
- **Licence**: Open Government Licence v3 (stated on the landing page).
  **Attribution**: Improvement Service (Spatial Hub custodian); metadata
  contact for corrections is sportscotland, `facilities@sportscotland.org.uk`.
- **Update cadence**: GeoNetwork record says "as needed"; the FAQ
  describes the underlying pipeline as **quarterly** ("Every three months,
  the collected data updates are quality assessed, cleaned, standardised,
  and amalgamated into national datasets").
- **Data-quality notes (from metadata)**: facilities are points "captured
  against Google Maps"; "manual lookups of appropriate coordinates have
  been made" for facilities with missing coordinates; a "judgement has
  been made to delete some provided facilities where they appear to no
  longer exist." Same record: "information provided is provided by third
  parties and therefore accuracy is not guaranteed."
- **Fields**: **[UNVERIFIED]** — the auth wall blocked a
  `DescribeFeatureType`/sample-feature call, so the attribute schema
  (name/address/postcode/LA/easting-northing/operator/status) could not
  be confirmed. CRSs ARE confirmed: EPSG:4258, EPSG:27700, EPSG:3857.
- **Commercial gym inclusion**: **[UNVERIFIED]**. Compiled through local-
  authority data custodians, suggesting a public/community bias, but no
  page states explicitly whether commercial chains (PureGym, The Gym
  Group) are included. Confirm via a logged-in schema/sample check before
  assuming either way.
- **Counts**: not stated anywhere found, and not obtainable without
  registration.

## 2. Wales — no national equivalent; DataMapWales "Leisure Centres" is thin

- **Sport Wales does not publish an open facility database.** No "Active
  Places Wales" exists. Sport Wales' facility-finding page tells clubs to
  check "local schools, churches, community centres, local councils...
  universities, colleges and larger community clubs" — no dataset or map:
  https://www.sport.wales/grants-and-funding/club-support/club-facilities/looking-for-a-facility/.
  An Esri UK case study reportedly describes Sport Wales using internal
  ArcGIS for facility planning, but the URL 404'd on direct fetch
  (2026-09-06) — **[UNVERIFIED]**, found only via search snippet, and
  nothing suggests that internal data is published as open data.
- **Active Places Power is explicitly England-only.** Confirmed by
  fetching the catalogue record: "List of sites and sports facilities for
  **England**"; publisher Sport England
  (https://www.data.gov.uk/dataset/c39c69e5-5c80-4dad-a1d5-e9023a25f3da/active-places).
  Cannot be used for Wales/Scotland/NI coverage.
- **The one real Welsh dataset found: DataMapWales "Leisure Centres"**
  (`geonode:leisure_centres_wales`) — Welsh Government's shared GIS
  portal. Landing page: https://datamap.gov.wales/layers/geonode:leisure_centres_wales.
  Description as published: "Leisure centre locations in Wales. Locations
  derived from OS Addressbase and SportWales data." Licence: **OGL
  v3.0**. Last updated **7 November 2022** — over 3.5 years stale.
  - **Live WFS fetched directly** (2026-09-06):
    `https://datamap.gov.wales/geoserver/geonode/wfs?service=WFS&version=2.0.0&request=GetFeature&typeNames=geonode:leisure_centres_wales&resultType=hits`
    → `numberMatched="97"`. **97 records for the whole of Wales** — a
    measured number, not an estimate.
  - **Real field names**, from a live GetFeature (GeoJSON) sample:
    `uprn`, `name`, `type`, `type_cy`, `subtype`, `subtype_cy`, `access`,
    `access_cy`, `no_units`, `street`, `locality`, `town`, `org`,
    `postcode`, `status`, `status_cy`, `built`. The `_cy` fields are
    genuine parallel Welsh strings, e.g. `type`: "Studio,Swimming
    Pool,Health and Fitness Suite" / `type_cy`: "Stiwdio,Pwll Nofio,
    Ystafell Iechyd a Ffitrwydd." **Street/town/postcode are NOT
    bilingual** in this sample — only the facility-type/subtype/
    access/status taxonomy is. Model bilingual fields on taxonomy, not on
    every address string.
  - **Data-quality evidence found directly**: one returned record is
    "Simply Gym Wrexham" (a commercial chain, so commercial gyms ARE
    sometimes present) with `status: "Closed"` — a permanently closed
    commercial gym is still live in the data, a concrete staleness signal
    beyond the 2022 update date.
  - Download formats confirmed on the layer page: CSV, DXF, Excel,
    GeoJSON, GML 2.0/3.1.1, OGC GeoPackage, zipped Shapefile — all
    reachable without login (unlike Scotland's Spatial Hub).
- **Verdict groundwork**: Wales has NO authoritative national gym dataset
  comparable to Scotland's Spatial Hub or NI's Active Places NI. The only
  open layer covers under 100 sites nationwide and is stale. Usable Wales
  coverage needs: (a) this DataMapWales layer as a small seed/cross-check
  list, (b) OpenStreetMap `leisure=fitness_centre`/`amenity=gym`/
  `leisure=sports_centre` extracts (ODbL — attribution + share-alike on
  the geodata; https://wiki.openstreetmap.org/wiki/Tag:leisure=fitness_centre),
  (c) direct operator data (see doc 03), and (d) user submissions through
  Volyume's own edit-gate. This is the headline finding of this document:
  **Wales is a GAP, not a SUPPLEMENT.**
- **Local authority / Public Health Wales**: no dedicated open facility
  dataset found under either. StatsWales publishes aggregate
  visit/participation stats, not a venue-level dataset; Digital Health and
  Care Wales's open data portal (https://dhcw.nhs.wales/data/statistical-publications-data-products-and-open-data/open-data/)
  carries no leisure-facilities layer; Open Data Wales
  (https://www.opendata.wales/) is a directory pointing at individual
  council portals, not one facilities dataset — **[UNVERIFIED]** whether
  any specific council portal has a venue list; not checked per-council in
  this pass (flag for doc 03/30 if wanted).

## 3. Northern Ireland — Active Places NI (Sport NI)

- **Dataset**: "Active Places NI - Sports Facilities Database", Sport NI's
  register, published through OpenDataNI.
  https://www.opendatani.gov.uk/dataset/active-places-ni-sports-facilities-database
  (mirror: https://www.data.gov.uk/dataset/c889255d-38e7-4a28-8dd5-0b8f16493cd1/active-places-ni-sports-facilities-database).
- **Licence**: UK Open Government Licence (OGL), stated on the portal
  page. **Access**: no login required — the CSV resource was fetched
  live (2026-09-06) via a redirect from admin.opendatani.gov.uk to a
  signed R2/Cloudflare storage URL.
- **Real row count and fields, from the fetched CSV**: **2,404 data
  rows**. Header (verbatim): `VENUE_NAME, ADDRESS_LINE_1, POST_TOWN,
  COUNTY, POST_CODE, NEW_DISTRICT_COUNCIL, EASTING, NORTHING, TELEPHONE,
  OWNERSHIP_TYPE, ADVENTURE_SPORT, ATHLETICS, BOWLING, BOXING, CRICKET,
  FITNESS, GOLF, MOTORSPORT, SWIMMING, SQUASH_HANDBALL, TENNIS,
  SPORTS_HALL, WATERSPORTS, MOUNTAIN_BIKING, PITCHES_GRASS,
  PITCHES_WATER, PITCHES_THIRD_GEN, PITCHES_SAND`. Model: one row per
  venue, sport/facility presence as `Yes`/`No` flags across 18
  categories — no free-text facility list, unlike Scotland's per-type
  layers or Wales's comma-joined `type` string.
- **Location is grid-only**: `EASTING`/`NORTHING`, no lat/long column —
  NI records need an Irish Grid conversion before sharing a coordinate
  model with the GB nations.
- **Ownership-type breakdown (counted directly)**: Education 890, Club
  693, District Council 465, **Private 234**, Community 93, Other 28.
  "Private" is the closest bucket to commercial gyms; there's no separate
  "Commercial" label, so which of the 234 are actually gyms vs. other
  private operators is **[UNVERIFIED]** without a name-by-name check.
- **`FITNESS = Yes`: 242 venues** (counted directly). `SPORTS_HALL =
  Yes`: 1,129 venues.
- **Update cadence — stale.** The OpenDataNI portal states the resource
  was "Last updated 8 years ago" (fetched 2026-09-06). Treat this as a
  hard blocker on trusting "is this venue still open" — new gyms from the
  last several years are unlikely to appear, and closures will be
  stale-listed the same way as the Wrexham example above.
- **Identifiers**: no UPRN/unique ID column — venue identity would need
  to be derived (name + postcode, or name + grid ref).
- **Contact**: Stephen McIlveen, stephenmcilveen@sportni.net.
- **OpenDataNI complements**: the portal hosts other council-level
  datasets that could supplement this, but no single consolidated
  "leisure centres by council" layer was found — flag as a follow-up
  search, not a confirmed absence.

## 4. Postcode/address geography for a consistent UK location hierarchy

- **Scotland — Scottish Postcode Directory (NRS)**. NOT plain OGL: NRS
  states "Digital boundary products and reference maps (with the
  exception of Scottish Postcode Directory - postcode boundaries and grid
  references) are supplied under the Open Government Licence and Ordnance
  Survey OpenData Licence" — the Postcode Directory is carved OUT, and
  carries its own required notice: "Copyright National Records of
  Scotland, contains Ordnance Survey data © Crown copyright and database
  right" (https://www.nrscotland.gov.uk/statistics-and-data/geography/about-our-geography/licences).
  WFS: https://spatialdata.gov.scot/geonetwork/srv/api/records/9fe3612b-ebf6-4ee7-a47e-bbe12168b3ff.
  Current edition "Scottish Postcode Directory 2026/2":
  https://www.nrscotland.gov.uk/publications/scottish-postcode-directory-20262/.
  Treat the attribution wording as a licence condition, not decoration.
- **Northern Ireland — Pointer (Land & Property Services / OSNI)**. NI's
  AddressBase equivalent, and **NOT free open data** — a licensed
  commercial product. Per nidirect (https://www.nidirect.gov.uk/articles/pointer)
  and the LPS product guide
  (https://support.spatialni.gov.uk/nima/DownloadDocs/Products/OSNI-Product-Guide-booklet.pdf):
  orders up to £3,000 direct; above that, a licence application; LPS
  Property Data products are sold under an **annual licence** with
  periodic update supply. Materially different posture from
  Scotland/Wales/England OGL address data — using Pointer needs a
  founder-level cost decision, matching the "never add
  dependencies/costs without asking" rule already in force.
- **Wales** has no devolved equivalent — Welsh addressing rides on the
  same GB-wide OS AddressBase / ONS Postcode Directory used for England
  (indirect confirmation: DataMapWales's Leisure Centres layer is itself
  sourced from "OS Addressbase", not a Welsh-specific address product).
  Wales's hierarchy can reuse whatever OS/ONS postcode geography doc 01
  establishes for England — no separate Welsh licence to resolve.
- **Community Leisure UK** — represents 96 charitable-trust members
  "across England, Scotland and Wales" per its own site, with country
  pages: Scotland (https://communityleisureuk.org/members-scotland/),
  Wales (https://communityleisureuk.org/find-your-nearest-trust-in-wales/),
  all (https://communityleisureuk.org/members/). HTML directory pages
  (trust name + council area), not a machine-readable dataset — useful as
  a manual cross-check/operator list for doc 03. **[UNVERIFIED]** whether
  any expose a CSV/API.

## 5. Comparison table

| Nation | Authoritative source | Licence | Formats | Gym coverage | Identifiers | Update cadence | Verdict |
|---|---|---|---|---|---|---|---|
| Scotland | sportscotland Sports Facilities, Spatial Hub (data.spatialhub.scot) | OGL v3, gated behind free account registration | WFS/WMS + download implied by portal; schema fetch blocked by 403, so exact formats **[UNVERIFIED]** | Public/community strong; commercial-gym inclusion **[UNVERIFIED]** | Per-layer WFS type name (e.g. `pub_spffs`) + GeoNetwork UUID; no per-facility ID confirmed | Quarterly per Spatial Hub FAQ | **SUPPLEMENT** — real data, but register an account and run a schema/sample check before any import decision |
| Wales | None national. Best available: DataMapWales "Leisure Centres" | OGL v3 | CSV/GeoJSON/GML/Shapefile via open WFS — confirmed working, no login | Mixed public + occasional commercial (e.g. Simply Gym Wrexham, listed Closed); only **97 records nationwide** (measured) | UPRN | Static since at least 7 Nov 2022, no confirmed refresh | **GAP** — must be supplemented with OSM extracts + operator data + user submissions; cannot stand alone |
| Northern Ireland | Active Places NI, Sport NI via OpenDataNI | OGL | CSV/XLS, confirmed working, no login | 2,404 venues; 242 flagged FITNESS; 234 "Private"-ownership (closest bucket to commercial, split unconfirmed) | None — no UPRN/unique ID column | **Stale** — portal states "last updated 8 years ago" | **SUPPLEMENT with caution** — good structural coverage but currency must be verified against OSM/operator data before trusting for new/closed venues |

**Bottom line for 10-SYNTHESIS.md**: Scotland's data is real and OGL but
needs a registered account before its schema/commercial-coverage can be
confirmed. Wales has no national dataset worth the name (97 records) —
plan OSM + operator + user-submission coverage for Wales from the start,
not as a fallback. Northern Ireland is the most immediately importable
open file of the three but is 8-years-stale per its own catalogue, so
pair it with a currency check before surfacing venues to users. None of
the three nations' address/postcode products are a simple drop-in OGL
layer the way GB-wide OS data might be for England: Scotland's Postcode
Directory carries its own copyright carve-out, and NI's Pointer is a
paid, licensed product requiring a founder decision, not an engineering
one.
