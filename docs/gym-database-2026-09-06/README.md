# UK gym master database / gym discovery infrastructure (2026-09-06)

Founder brief (in chat, 2026-09-06): a high-quality, location-aware,
continuously maintainable UK gym and fitness-venue directory that sits
UNDER Community and powers onboarding gym selection, primary and other
gyms, people at my gym, gyms near me, gyms in a town, gym pages, local
recommendations and training-partner matching. Standard: "Of course
Volyume knows my gym." Nothing is imported before its licence is resolved.

Document map (filled as the workstream runs):
- `01-sources-england-os-google-osm.md`   Active Places Power, OS products and licences, Google Places terms, OSM ODbL, Overture and Foursquare open places
- `02-sources-scotland-wales-ni.md`        sportscotland, Sport Wales / Welsh sources, Active Places NI
- `03-sources-operators-industry.md`       operator-by-operator branch data and terms; Hussle, ukactive, directories
- `04-design-precedents-dedup.md`          venue/site/facility models, chain and branch handling, POI matching practice, search UX
- `10-SYNTHESIS.md`                        lead synthesis: which sources are usable, under which licence, for what
- `20-BLUEPRINT.md`                        canonical model, classification rule, pipeline, search, submissions, corrections, privacy, Community integration (edit-gate spec)
- `30-COVERAGE-REPORT.md`                  measured coverage by nation, operator, geography; dedup and unresolved counts
- `40-VERIFICATION.md`                     tests and device checklist
- `50-FINAL-REPORT.md`
Recovery: Phase 1 agents are read-only; re-dispatch from the briefs
recorded in `docs/TASKBOARD.md`.

Founder standard (in chat, 2026-09-06): independent gyms, not just
groups. Named test case: "Volt Gym, Burscough" must be findable. Sources
that cover independents by construction: the VOA non-domestic rating
list (England and Wales, gyms are a rated category), Companies House
company data filtered to SIC 93130 (fitness facilities), Active Places
where operators registered, operator feeds for chains, user submissions
for the rest, OSM and open places as cross-checks.
