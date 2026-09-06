# Gym/fitness-venue data sources: England, OS, Google, OSM, permissive open datasets, postcode geography

Research date: 2026-09-06. Licensing/feasibility survey only, per CLAUDE.md
conservative posture — no import is authorised by this document. Anything
not directly fetched from a primary source is marked **unverified**.

---

## 1. Sport England Active Places / Active Places Power (England)

National database of English sports facilities (pools, pitches, courts,
gyms), maintained by Sport England + owner self-service editing on
`dataplatform.activeplacespower.com`; public front end at
`activeplacespower.com`.
[Active Places Power | Sport England](https://www.sportengland.org/how-we-can-help/facilities-and-planning/planning-for-sport/active-places-power)

**Scale (unverified — WebFetch got no body text from the About page, figure
from search synopsis only):** ~41,000 sites / ~115,000 facilities, ~15
facility types, 200+ attributes.
[About | Active Places Power](https://www.activeplacespower.com/pages/about)

**England only, confirmed by contrast.** Northern Ireland runs its own
separate "Active Places NI" database via `opendatani.gov.uk`/Sport Northern
Ireland.
[active places ni](https://admin.opendatani.gov.uk/fr/dataset/activity/active-places-ni-sports-facilities-database)
Scotland (`sportscotland` "Find a facility") and Wales (Sport Wales ArcGIS
tool) have their own separate, differently-schemed tools — **unverified**
whether compatible with Active Places' schema/licence.
[sportscotland](https://sportscotland.org.uk/facilities/find-a-facility) ·
[Sport Wales/Esri](https://resource.esriuk.com/esri-resources/sport-wales/)

**Access — three routes, three different licence answers:**
1. **Bulk open-data download** (CSV/KML/Zip/GeoJSON/GeoTIFF/PNG), no account,
   "published openly", "updated daily", licence file bundled in the CSV.
   [Data | Sport England](https://www.sportengland.org/research-and-data/data)
2. **OpenActive RPDE v0.2.3 feed** (`activeplaces.github.io`), updates
   "every minute", licensed **CC-BY v4.0**, attribution
   `Contains Data © Sport England`. The only route this session could fetch
   content from directly.
   [Active Places Open Data](https://activeplaces.github.io/)
3. **Sites/GeoServices/WMS/WFS "Active Places APIs"** via the registered
   Data Platform account — full JSON copy + incremental updates. Licence
   terms for this specific route **not retrievable** (JS-rendered pages
   returned no text to WebFetch); confirm on sign-up.
   [Downloads page](https://www.activeplacespower.com/pages/downloads) (unverified content)

A live downstream ArcGIS republication (Norfolk County Council) states the
source is **OGL v2.0**, `Contains Data © Sport England` (fetched directly
from ArcGIS REST metadata); Sport England's own site footer states **OGL
v3.0** generally; the GitHub feed states **CC-BY v4.0**.
[ArcGIS layer metadata](https://maps.norfolk.gov.uk/arcgis/rest/services/layers_ext/where_i_live/MapServer/2?f=pjson) ·
[data.gov.uk record](https://www.data.gov.uk/dataset/c39c69e5-5c80-4dad-a1d5-e9023a25f3da/active-places)
**Do not assume one licence applies uniformly — confirm the exact licence
file bundled with whichever route is actually used; CC-BY carries a
mandatory-attribution duty OGL does not.**

**Fields (54, verified via the same ArcGIS layer, names quoted verbatim):**
`Site_Name`, `Site_Id`, `Building_Name_or_Number`, `Thoroughfare`,
`Post_Town`, `Post_Code`, `Facility_Type`, `Facility_Sub_Type`,
`Facility_Id`, `Unit`, `Number_` (station/unit count), `Changing_Rooms`,
`Changing_Places_Toilets`, `Disability(_Details/_Notes)`, `Facility_Status`,
`Access_Type`, `Seasonality_Type/Start/End`, `Ownership_Type`,
`Management_Type`, `Year_Built(_Estimated_)`, `Refurbished`,
`Year_Refurbished`, `Closed_Date`, `Closure_Reason`, `Last_Updated_Date`,
`Last_Full_Audit_Date`, `UPRN`, `TOID`, `Output_Area_Code`,
`Lower/Middle_Super_Output_Area_Code`,
`Parliamentary_Constituency_Code/Name`, `Ward_Code/Name`,
`Local_Authority_Code/Name`, `County_Code/Name`, `CSP_Code/Name`,
`Region_Code/Name`, `Easting`, `Northing`, `Latitude`, `Longitude`, `Shape`.
[ArcGIS layer metadata (field list)](https://maps.norfolk.gov.uk/arcgis/rest/services/layers_ext/where_i_live/MapServer/2?f=pjson)
`Site_Id` (venue) and `Facility_Id` (activity space within it) are distinct
identifiers; `UPRN` joins to OS Open UPRN (Section 2); `TOID` is an OS
MasterMap ID.

**Facility classification (gym classes) — NOT confirmed.** No primary
source surfaced the exact code list (e.g. "Health and Fitness Gym" /
"Health and Fitness Suite"). `Number_` is consistent with a stations count.
**The single most important follow-up before build**: read the
lookup/codes sheet that ships inside the actual CSV/JSON download to
separate gym-class rows from halls/studios/pools.

**Commercial chain coverage (PureGym/Gym Group/David Lloyd) — unverified.**
Active Places' primary catchment is council/public/NGB facilities via
owner self-service; commercial-only operators may under-maintain their
listing — spot-check known addresses before relying on it.

**Update frequency.** OpenActive feed near-real-time ("every minute"); bulk
CSV/JSON "daily" per Sport England. Third-party republications (e.g.
Norfolk's layer, dated 2021-22 data despite a 2025 publish stamp) can lag
badly — use the primary Sport England route, not a council's cached copy.

---

## 2. Ordnance Survey

**(a) OS Points of Interest (POI).** Not on the self-serve OS Data Hub at
all — "accessed in a different way... existing systems to order"; separate
commercial ordering process. No public price found (**unverified**, needs
direct OS sales enquiry). Free only to PSGA public-sector members.
[Plans | OS Data Hub](https://osdatahub.os.uk/plans) ·
[PSGA Product Summary](https://docs.os.uk/os-downloads/resources/product-resources/psga-product-summary)

**(b) OS NGD Land Use Features.** Same PSGA gate — free for PSGA public
sector; commercial reuse is Premium Plan (£1,000/month free credit,
use-it-or-lose-it, then per-transaction billing). Gives land-use area
polygons (residential/education/greenspace/hospitals/transport) — context
only, not a venue-name source.
[OS NGD](https://www.ordnancesurvey.co.uk/products/os-ngd) ·
[Land Use Features](https://docs.os.uk/osngd/data-structure/land-use/land-use-features)

**(c) Free OS OpenData (OGL, unrestricted commercial reuse):** OS Open
Names (place-name gazetteer, not individual gym addresses); OS Open UPRN
(~40M GB addressable-location IDs — joins to Active Places' `UPRN` field);
Code-Point Open (one centroid per postcode unit, alternative/complement to
ONSPD/NSPL coordinates in Section 6); OS OpenMap Local (building outlines,
roads, greenspace, boundaries — background context only). All OGL-licensed
since Feb 2015; attribution `Contains OS data © Crown copyright and
database right [year]`.
[OS OpenData products](https://www.ordnancesurvey.co.uk/products/open-data) ·
[OS OpenData - OSM Wiki](https://wiki.openstreetmap.org/wiki/Ordnance_Survey_OpenData)

**(d) OS Places API / OS Names API.** Paid OS Data Hub Premium tier;
**OS Places API is explicitly excluded** from the £1,000/month free
Premium credit. Confirmed price: **£0.0182/transaction**, invoiced
quarterly upfront in blocks of 100 (12-month validity) plus ~£0.01/
transaction billed monthly. Free "development mode" exists, throttled to
50 transactions/minute, not for production.
[OS Data Hub Plans FAQ](https://osdatahub.os.uk/support/faqs/plans)

---

## 3. Google Places API

**Storage rules (fetched directly from Google's Policies page):** Place ID
is the sole exemption from the caching ban — "the place ID... is exempt
from the caching restrictions. You can therefore store place ID values
indefinitely" — usable as a runtime join key, NOT a way to import Google's
place content into a standing DB. Everything else is caching-restricted:
"You must not pre-fetch, cache, or store Places API content" beyond that
exception. A widely reported "coordinates cacheable 30 days" rule came from
secondary summaries, not this primary text — **unverified**; the "store
nothing but place ID" rule is the directly-verified one. Attribution is
mandatory whenever content is shown, on-map or off-map (Google Map + logo/
third-party-provider attribution). No clause found on combining with other
sources to build a database beyond the storage ban itself, which already
forecloses that use.
[Places API Policies](https://developers.google.com/maps/documentation/places/web-service/policies)

**Conclusion:** Google Places API may only be used for **runtime lookups
displayed live with Google attribution** (e.g. onboarding "search for your
gym" autocomplete) — never to seed/backfill Volyume's canonical gym table,
and never as that table's canonical ID (Place ID may be stored only as a
cross-reference pointer back to Google).

**Pricing (2026, indicative — from Google's billing page + third-party
breakdowns, not independently re-derived):** Autocomplete (New) sessions
are free when properly terminated with a Place Details/Address Validation
call; abandoned sessions revert to per-request billing (~$2.83/1,000
reported for one field-mask tier). Nearby Search via Place Details
(Preferred) SKU ~$0.04/request at Pro-tier fields. Cost depends heavily on
field mask requested.
[Usage and Billing](https://developers.google.com/maps/documentation/places/web-service/usage-and-billing) ·
[Session pricing](https://developers.google.com/maps/documentation/places/web-service/session-pricing)

---

## 4. OpenStreetMap (ODbL)

**Collective vs derivative database** (OSMF Community Guideline): combining
OSM with non-OSM data forms a **Collective Database** (share-alike applies
only to the OSM-derived slice) rather than a **Derivative Database**
(share-alike applies to the whole) **so long as each data type/region is
wholly OSM-sourced or wholly non-OSM-sourced within that "regional cut."**
Field-by-field merging of OSM content into a non-OSM row for the same
venue risks crossing into "derivative" and pulling the whole merged table
under ODbL share-alike.
[Collective Database Guideline](https://wiki.openstreetmap.org/wiki/Collective_Database_Guideline)

**Geocoding produces a "Produced Work"**, and share-alike does **not**
apply to Produced Works — the OSMF's Geocoding Guideline confirms
address↔coordinate lookups returning only the result are not required to
be ODbL-licensed.
[Geocoding Guideline](https://osmfoundation.org/wiki/Licence/Community_Guidelines/Geocoding_-_Guideline)

**Practical read for the three patterns asked about:** (a) copying OSM
venues wholesale into the canonical DB triggers ODbL share-alike on that
data — almost certainly unacceptable for a proprietary DB, **do not do this**
without a dedicated legal read; (b) using OSM only to detect gaps, then
independently sourcing/verifying elsewhere, copies no OSM content into the
shipped DB — clean, low-risk; (c) storing OSM IDs as a cross-reference
pointer (not as the source of stored facts) is analogous to a Google Place
ID — a **reasoned inference** from the collective/derivative distinction
above, not a verbatim OSMF ruling.

**Overpass API usage policy:** fair-use ~10,000 requests/day, ~1GB/day per
user; same-IP queries serialised, queued >15s → HTTP 429; heavy users
throttled first under load. No key/registration for the public instance;
sustained bulk extraction should use a periodic bulk/region extract or a
self-hosted instance instead.
[OSMF API Usage policy](https://operations.osmfoundation.org/policies/api/)

**Tags to query:** `leisure=fitness_centre` (preferred modern tag) and
`amenity=gym` (older, still used — OSM's own wiki notes ongoing disagreement,
query both), `sport=fitness`, `club=sport`, `brand:wikidata` (links to a
chain's Wikidata QID, e.g. `Q48815022` for The Gym Group), `operator`,
`name`, `addr:housenumber/street/postcode/city`, `opening_hours`,
`disused:*` prefix for closed venues.
[Tag:leisure=fitness_centre](https://wiki.openstreetmap.org/wiki/Tag:leisure=fitness_centre) ·
[Tag:amenity=gym](https://wiki.openstreetmap.org/wiki/Tag:amenity=gym)

**UK counts — not obtained.** Taginfo per-country counts were not directly
fetchable this session; get exact figures from
`taginfo.openstreetmap.org/tags/leisure=fitness_centre` and the `amenity=gym`
equivalent before relying on any OSM density estimate.

---

## 5. Permissively licensed open places datasets

**Overture Maps Places.** Licence is **mixed, per-row**: Foursquare-sourced
rows are Apache 2.0; all other rows are CDLA-Permissive-2.0 — check the
per-row source/licence field, no single blanket statement applies. Format:
GeoParquet on public AWS + Azure buckets, no account needed, queryable via
DuckDB httpfs (spatial + category filters, no Spark needed). ~60M+ global
point features. UK gym coverage / exact gym category string **not
independently confirmed** — pull the live category list before build.
[Places Guide](https://docs.overturemaps.org/guides/places/) ·
[AWS Registry](https://registry.opendata.aws/overture/)

**Foursquare Open Source (FSQ OS) Places.** **Apache 2.0**, unambiguous, no
share-alike, safe for a proprietary DB (notice-file preservation only, no
mandated public display). 100M+ global POIs, 22 core attributes, monthly
updates. Download: Parquet on S3 (~455MB/file, ~10.6GB total) or the
Foursquare Places Portal (free account + token, Iceberg-catalog query
layer) — filterable without heavy tooling via DuckDB or the portal. Has a
"fitness and recreation" category branch; exact gym category ID and UK
completeness **not independently confirmed**. Credible cross-check/gap-fill
source given the clean licence.
[FSQ OS Places announcement](https://simonwillison.net/2024/Nov/20/foursquare-open-source-places/) ·
[Access FSQ OS Places](https://docs.foursquare.com/data-products/docs/access-fsq-os-places) ·
[Places Notice](https://opensource.foursquare.com/places-notice-txt/)

**Wikidata.** **CC0** (public-domain-equivalent) for all structured data —
directly confirmed, no attribution legally required, no share-alike. Ideal
for **brand/chain entity** normalisation only (PureGym, The Gym Group as
QIDs; OSM's `brand:wikidata` tag links straight to this) — not a source of
venue addresses at any useful density.
[Wikidata:Licensing](https://www.wikidata.org/wiki/Wikidata:Licensing)

**Companies House.** Free API, no fee, covers the live public register
(company profile/officers/PSC/filing history/registered address); OGL-style
attribution good practice though it's a statutory public register, not a
licensed dataset. Use: resolving a gym operator's legal entity/registered
office — a **cross-check for operator legitimacy**, not a venue-location
source. Bulk full-register extracts exist separately from the (pagination-
capped) live API; bulk-data specifics **not independently confirmed**.
[Get started with the Companies House API](https://developer.company-information.service.gov.uk/get-started/)

---

## 6. UK postcode geography (ONSPD / NSPL)

**NSPL** (postcode → Output Area, for statistical rollups) and **ONSPD**
(postcode → administrative area of its geographic centre, for
mapping/service areas) — both cover the whole UK, both list current AND
terminated postcodes. **Licence**: "Information on the Great Britain
(non-BT) postcodes contained in the NSPL and ONSPD may be re-used under
the **Open Government Licence (OGL) v3**" — quoted directly from ONS's own
usage guidance.
[Using the NSPL and ONSPD - ONS](https://www.ons.gov.uk/aboutus/transparencyandgovernance/freedomofinformationfoi/usingthenationalstatisticspostcodelookupnsplandonspostcodedirectory)

**Fields for the location hierarchy**: postcode, grid ref/lat-lng (1m
resolution), Local Authority District code (e.g. `LAD25CD`), region,
country; companion ONS products add built-up area and Index of Place Names
(IPN) town/settlement names — giving the full postcode → town → local
authority → region → country chain, free and OGL-licensed.

**Access**: released quarterly (Feb/May/Aug/Nov), free download, no
account, via the ONS Open Geography Portal.
[ONSPD (Feb 2026)](https://geoportal.statistics.gov.uk/datasets/3080229224424c9cb53c0b48f5a64d27) ·
[Postcode products](https://www.ons.gov.uk/methodology/geography/geographicalproducts/postcodeproducts)

**Coordinate provenance caveat**: centroids derive from OS data
(Code-Point/AddressBase lineage), so the standard OS attribution alongside
ONS's own is the safe combined string — this joint wording is **inferred
convention, not found verbatim on the ONS page**; confirm the exact string
in the licence file bundled with whichever release is downloaded.

---

## Licence matrix

| Source | Licence | Commercial use | Redistribution in app DB | Attribution | Share-alike? | Storage limits | Verdict |
|---|---|---|---|---|---|---|---|
| Active Places — bulk CSV/GeoServices | OGL v2/v3 (varies by surface) | Yes | Yes | "Contains Data © Sport England" | No | None found | **USE** (confirm licence file + facility-type codes first) |
| Active Places — OpenActive/GitHub feed | CC-BY v4.0 | Yes | Yes, attribution mandatory | `Contains Data © Sport England` | No (attribution mandatory) | None found | **USE** for near-real-time updates |
| OS Points of Interest | Commercial/PSGA | Paid/PSGA only | Paid only | Per licence | No | Per licence | **DO NOT USE** without founder-approved paid licence |
| OS NGD Land Use Features | Commercial/PSGA | Paid Premium or PSGA | Paid only | Per licence | No | Per licence | **DO NOT USE** without founder-approved paid licence (context only) |
| OS Open Names/UPRN/Code-Point Open/OpenMap Local | OGL | Yes | Yes | `Contains OS data © Crown copyright and database right [year]` | No | None found | **USE** (join keys/context, not venue names) |
| OS Places API / OS Names API | Commercial (pay-per-txn) | Yes, paid | Yes, paid | Per licence | No | Per licence | **CROSS-CHECK ONLY** (founder spend decision) |
| Google Places API | Google Maps Platform Terms | Yes, paid, restricted | **No** (storage banned bar Place ID) | Google logo mandatory when displayed | N/A | Only Place ID indefinite; nothing else stored | **RUNTIME ONLY** |
| OSM — direct venue copy | ODbL 1.0 | Yes | Only if OSM-derived share offered under ODbL | `© OpenStreetMap contributors` | **Yes** on OSM-derived portion | None found | **DO NOT USE** without dedicated ODbL review |
| OSM — gap-detection signal only | ODbL 1.0 | Yes | N/A, no content stored | N/A | N/A | N/A | **CROSS-CHECK ONLY** |
| OSM IDs as cross-reference pointer | ODbL 1.0 | Yes (reasoned) | Low-risk pointer storage | `© OpenStreetMap contributors` recommended | No, if ID-only | None found | **CROSS-CHECK ONLY** pending legal read |
| Overture Maps Places | CDLA-Permissive-2.0 or Apache 2.0 (per-row) | Yes | Yes | Per-source, recommended | No | None found | **USE** (verify per-row licence field) |
| Foursquare OS Places | Apache 2.0 | Yes | Yes | Notice-file preservation | No | None found | **USE** (cross-check/gap-fill; UK gym completeness unverified) |
| Wikidata | CC0 | Yes | Yes | None required | No | None found | **USE** for brand/chain normalisation only |
| Companies House | Public register, OGL-style good practice | Yes | Yes | OGL-style recommended | No | None found | **CROSS-CHECK ONLY** (operator legitimacy) |
| ONSPD / NSPL | OGL v3 | Yes | Yes | ONS + OS joint (confirm exact string per release) | No | None found | **USE** for postcode → town/LA/region/country hierarchy |

---

## Data acquisition feasibility

**No account needed, scriptable today:** Active Places bulk CSV/JSON/GeoJSON
download; Active Places OpenActive RPDE feed (CC-BY attribution required);
OS Open Names/UPRN/Code-Point Open/OpenMap Local; OSM Overpass API (fair-use
ceiling in Section 4); Overture Maps Places (S3/Azure GeoParquet, DuckDB);
Wikidata (public SPARQL/dumps, CC0); ONSPD/NSPL (ONS Open Geography Portal).

**Needs registration (free or paid tier, no purchase to start):** Active
Places Data Platform/Sites API (free registration reported; licence terms
for this route unverified — confirm on sign-up); Companies House API (free
key, instant); Foursquare Places Portal (free account + token for the
Iceberg query layer — raw S3 files may be fetchable account-free,
**unverified**); OS Data Hub for any Premium API or OS NGD under the Public
Sector Plan (free registration, £1,000/month free Premium credit); Google
Places API (Cloud account + billing profile required even for free-tier
allowances — no meaningful free bulk tier, and bulk use would breach the
storage ban anyway).

**Needs payment / founder licensing decision before any use:** OS Points of
Interest (commercial/PSGA-gated, no public price found — direct OS
enquiry needed); OS NGD Land Use Features and OS Places/Names APIs beyond
the free Premium credit ceiling; Google Places API beyond incidental
runtime lookups (Section 3 pricing is indicative, not contractual); Active
Places APIs/Sites API IF its licence (once confirmed on sign-up) turns out
to require a fee — not established either way here.

No import decision is authorised by this document. Per CLAUDE.md's
conservative-posture and no-new-dependency rules, every source above needs
an explicit founder go before any data is pulled into Volyume's schema, and
any paid licence (OS commercial POI/NGD, Google Places API at scale) is a
founder-only decision.
