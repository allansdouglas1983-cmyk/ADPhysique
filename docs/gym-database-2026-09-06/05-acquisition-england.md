# England — Sport England Active Places Power acquisition (2026-09-06)

Read-only research/acquisition run. No data imported into the app. Raw files
written under scratchpad only (not in repo):
`/tmp/claude-0/-home-user-ADPhysique/8a1da388-bf6f-50f3-8ac9-99853301c7d5/scratchpad/gyms/raw/england/`.

## Discovery
The two Hub app ids from the brief (`78d9a582...`, `c88ccbeb...`) both 403
(`GWM_0003`, no permission) via `sharing/rest/content/items/<id>?f=json` — not
pursued further. The Hub site's own `/api/v3/datasets` returned an unrelated
19 MB generic feed (not scoped to this org) — abandoned. Working route:
`https://www.arcgis.com/sharing/rest/search?f=json&q=Active%20Places%20Power`
→ 1,612 hits, org `SportEngArena` / orgId `s9MgJChYyPlPX2Nk` / orgTitle
"Sport England", hub site `active-places-power-sportengarena.hub.arcgis.com`.

## Services (all public, no account needed)
- **Sites**: `.../s9MgJChYyPlPX2Nk/arcgis/rest/services/GIS_Active_Places_Power_Sites/FeatureServer/0` (layer "Site"), maxRecordCount 1000.
- **Facility (all types)**: `.../GIS_Active_Places_Power_Facility/FeatureServer/1` ("Facility_Spatial").
- **Health and Fitness**: `.../GIS_Active_Places_Power_Health_and_Fitness/FeatureServer/7` ("HealthAndFitnessGym_Facility_Spatial") — Sport England's own pre-filtered service, 100% `facilitytype`=`facilitysubtype`="Health and Fitness Gym" (verified by groupBy).
- Metadata service (`Active_Places_Power_Metadata`) only holds a "Service Metadata" table — no facility-type coded-value domain exists anywhere (`domain:null` on both `facilitytype`/`facilitysubtype`).

## Fields (compact)
- **Site** (79 fields): id `siteid`, `sitename`, address (`buildingname/number`, `thoroughfarename`, `posttown`, `postcode`), geography codes (`countycode/name`, `localauthoritycode/name`, `wardcode/name`, `parliamentaryconstituencycode/name`, `regioncode/name`, `outputareacode`, `lowersuperoutputarea`, `middlesuperoutputarea`, `toid`, `uprn`), owner/manager (`ownertypestr`, `managementtypestr`, `operatorname`), contact (`email`,`telnumber`,`website`,`facebook`,`twitter`), amenity flags (`carparkflag`,`bikehireflag`,`disability*` x10, `changingplacestoiletsflag`), coords `lat`/`long`/`easting`/`northing`. No coded domains except small flag fields (e.g. `bikehireflag` → `YesNoUnknown`).
- **Facility / Health-and-Fitness** (44-45 fields, HF adds `stations`): `siteid`, `facilityid`, `facilitytype`, `facilitysubtype`, `facstatus`, `operatorname`, `accessibilitytypestr`, `managementtypestr`, disability flags (Yes/No strings), `yearbuilt`, `refurbflag`/`yearrefurbished`, `seasonalitytype`, `meetsapcriteria`, `easting`/`northing`/`lat`/`long`.

## Counts (all verified against `returnCountOnly=true`)
- Sites total: **43,671** (downloaded in full: 43,671)
- Facilities total (all types): **126,129** (not bulk-downloaded — see below)
- Health-and-fitness facilities: **10,767** (downloaded in full: 10,767)

## Facility-type frequency (full table, 16 types, sums to 126,129)
```
60,883 Grass Pitches        8,311 Outdoor Tennis Courts   434 Indoor Tennis Centre
14,465 Sports Hall          6,811 Artificial Grass Pitch  389 Indoor Bowls
10,767 Health and Fitness Gym 6,598 Swimming Pool          140 Ski Slopes
 9,663 Studio               3,383 Golf                     53 Ice Rinks
                             2,464 Squash Courts
                               797 Padel
                               514 Athletics
                               457 Cycling
```
Filter used: `facilitytype = 'Health and Fitness Gym'` (exact field/value,
confirmed via `groupByFieldsForStatistics`). "Studio" (9,663; classes/dance,
not gym-floor) was NOT included — flag if the founder wants it added.
Only the Health-and-Fitness facility set was bulk-downloaded, via Sport
England's own pre-filtered service; the unfiltered 126k Facility layer was
queried for the frequency table only, not paged in full (per task's "if
filtering is unclear, download all" — filtering here was clear).

## Files written (scratchpad only)
- `sites.ndjson` — 43,671 lines, 96 MB
- `health_and_fitness_facilities.ndjson` — 10,767 lines, 15 MB
- `facilitytype_freq.json` — 16-row frequency table
- `manifest.json` — sources, licence, attribution, timestamps, counts, join keys
- `layer_*.json`, `svc_*.json`, `item_*.json`, `search_appower.json` — raw metadata evidence

## Join keys
`siteid` (Site PK, FK on Facility/HF) joins Sites ↔ Facilities. `facilityid`
is the facility's own PK (activity-space level, distinct from the site).

## Account/access notes
No account needed for any route actually used. The two Hub app ids named in
the brief returned 403 without one; not investigated further since the
underlying public FeatureServers were found directly. Bulk CSV/GeoJSON export
link on Hub item pages not probed (those pages were the 403'd ones); the
FeatureServer query endpoint accepts `f=geojson` directly as an alternative.

## Attribution (verbatim, from the licenceInfo field of the live ArcGIS items)
CC BY 4.0. Mandatory attribution string: **"Contains Data © Sport England"**.
