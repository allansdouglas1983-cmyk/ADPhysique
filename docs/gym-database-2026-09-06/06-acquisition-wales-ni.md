# Acquisition Report: Wales & Northern Ireland (2026-09-06)

## Files Written

**Northern Ireland:**
- `ni/active-places-ni.csv` (435 KB, 2,404 data rows)
- `ni/manifest.json`

**Wales:**
- `wales/leisure-centres-wales.geojson` (94 KB, 97 features)
- `wales/manifest.json`

Location: `/tmp/claude-0/.../scratchpad/gyms/raw/{ni,wales}/`

---

## Northern Ireland: Active Places NI

### Data Summary
- **Rows:** 2,404 venues
- **Columns (28):** VENUE_NAME, ADDRESS_LINE_1, POST_TOWN, COUNTY, POST_CODE, NEW_DISTRICT_COUNCIL, EASTING, NORTHING, TELEPHONE, OWNERSHIP_TYPE, ADVENTURE_SPORT, ATHLETICS, BOWLING, BOXING, CRICKET, FITNESS, GOLF, MOTORSPORT, SWIMMING, SQUASH_HANDBALL, TENNIS, SPORTS_HALL, WATERSPORTS, MOUNTAIN_BIKING, PITCHES_GRASS, PITCHES_WATER, PITCHES_THIRD_GEN, PITCHES_SAND

### Facility Flags (Venues with each sport/facility type)
- FITNESS: 242 (closest to gym venues)
- SPORTS_HALL: 1,129
- TENNIS: 214
- PITCHES_GRASS: 979
- BOWLING: 111
- GOLF: 113
- CRICKET: 92
- BOXING: 103
- SWIMMING: 81
- PITCHES_THIRD_GEN: 72
- WATERSPORTS: 70
- SQUASH_HANDBALL: 56
- ATHLETICS: 15
- MOTORSPORT: 16
- ADVENTURE_SPORT: 27
- MOUNTAIN_BIKING: 6
- PITCHES_WATER: 8

### Ownership Breakdown
- Education: 890
- Club: 693
- District Council: 465
- Private: 234
- Community: 93
- Other: 28
- (blank): 1

### Location Data
- **Coordinates:** EASTING/NORTHING (Irish Grid reference system, no Lat/Long)
- Both columns present in all records

### Licence
- **Type:** UK Open Government Licence (OGL)
- **Text:** Conditions at https://www.nationalarchives.gov.uk/doc/open-government-licence/version/3/
- **Attribution:** Sport Northern Ireland (contact: Stephen McIlveen, stephenmcilveen@sportni.net)
- **Last Updated:** Portal states "8 years ago" (2026-09-06 retrieval); metadata_modified 2017-11-17

---

## Wales: DataMapWales Leisure Centres

### Data Summary
- **Features:** 97 leisure centres
- **Properties (17):** uprn, name, type, type_cy, subtype, subtype_cy, access, access_cy, no_units, street, locality, town, org, postcode, status, status_cy, built

### Sample Records
1. Simply Gym Wrexham, WREXHAM, LL13 8DH, Status: Closed
2. Pembroke Leisure Centre, PEMBROKE, SA71 4RJ, Status: Operational
3. Rhondda Fach Sports Centre, FERNDALE, CF43 3HR, Status: Operational

### Property Notes
- Bilingual taxonomy fields (`type_cy`, `subtype_cy`, `access_cy`, `status_cy`)
- Address fields (street, town, postcode) are English-only, not bilingual
- UPRN present; status field indicates operational state

### Licence
- **Type:** Open Government Licence for Public Sector Information (OGL) v3
- **Text:** https://www.nationalarchives.gov.uk/doc/open-government-licence/version/3/
- **Attribution:** Welsh Government / DataMapWales
- **Last Updated:** 07 November 2022 (3.8 years stale as of 2026-09-06)

### Data Quality Note
Simply Gym Wrexham is listed as "Closed" — evidence of staleness beyond publication date.

---

## Retrieval Summary

| Region | Format | Size | Records | Coordinates | Licence | Currency |
|---|---|---|---|---|---|---|
| NI | CSV (latin-1 encoding) | 435 KB | 2,404 | Irish Grid (EASTING/NORTHING) | OGL | 8 years stale |
| Wales | GeoJSON | 94 KB | 97 | WGS84 (via WFS) | OGL v3 | 3.8 years stale |

**All retrievals completed 2026-09-06 without HTTP errors.** Both datasets are freely accessible without authentication.
