# Gym Database — Sources: Operators & Industry (2026-09-06)

Research pass for the national canonical gym database. Every branch-count /
feed claim below is sourced with a URL; figures pulled from AI-search
summaries (not the primary page itself) are marked **(unverified, secondary)**.
Robots.txt and sitemap checks were run live against the operator's own
domain on 2026-09-06 (`curl` against `https://<domain>/robots.txt` and any
declared `Sitemap:`); full website Terms of Use (as opposed to robots.txt)
were fetched for only two operators (PureGym, attempted Gym Group) —
**no operator's full ToU was confirmed to contain an explicit
scraping/data-mining prohibition or permission; treat all reuse rights as
UNVERIFIED and default to the conservative posture: read-only, low-rate,
attribute, no bulk redistribution of scraped content, unless a named page
below states otherwise.**

Verdict key: **OFFICIAL FEED** = a JSON/XML/API surface exists and is
crawl-permitted; **SITEMAP LIST** = no API, but the sitemap enumerates
individual branch-page URLs (weaker than a feed, still machine-readable);
**PAGE ONLY** = branch pages exist, no enumerable feed found; **BLOCKED** =
bot-protection (Cloudflare/Incapsula challenge) intercepts even robots.txt;
**TERMS FORBID** = an explicit reuse prohibition was found; **UNKNOWN** = not
checked live (time-boxed out of this pass).

---

## 1. Operators

| Operator | Find-a-gym URL | Machine-readable list | UK branches (approx, source) | Fields exposed on branch page | robots.txt / access stance | Verdict |
|---|---|---|---|---|---|---|
| PureGym | puregym.com/gyms/ | Sitemap index → `sitemap-0.xml`; ~15 static top-level `/gyms/city/`-style URLs, NOT one row per branch (branch list is client-rendered under `/gyms/`) | 450+ own-site claim; 362–400+ range across sources ([Wikipedia](https://en.wikipedia.org/wiki/PureGym), [puregym.com/gyms/](https://www.puregym.com/gyms/)) | Name, address, postcode (via page), opening hours, 24-hr flag, phone | robots.txt: `Disallow: /cdn-cgi/`, `/_server-islands/` only — crawling of `/gyms/` is permitted. Full site ToU not confirmed to restrict reuse (checked membership T&Cs only — no scraping clause found there) | PAGE ONLY (crawl-permitted, no enumerable per-branch feed found this pass) |
| The Gym Group | thegymgroup.com/find-a-gym/ | `sitemap.xml` lists `/find-a-gym/<city>-gyms/` pages | 264 as of H1 2026, on track for ~284 by year-end ([tggplc.com press release](https://www.tggplc.com/news-and-media/press-releases/seven-sites-opening-in-december-for-the-gym-group-with-further-expansion-in-2026/), [LBC](https://www.lbc.co.uk/article/66dab903c1b24a459022f51610a1fcdf-5HjddLf_2/)) | Name, address, postcode, opening hours, facilities list | robots.txt allows `/find-a-gym/` except two named test pages (`stellas-local`, `no1-croydon-office`); sitemap openly declared | SITEMAP LIST (city hub pages, not one URL per branch — still usable to enumerate cities then branches) |
| JD Gyms | jdgyms.co.uk/gym-finder/ | `sitemap.xml` — confirmed **114** distinct `/gym/<name>/` URLs by direct count on 2026-09-06 | 100+ sites, targeting 115 by end 2026 ([Property Week / PAF Media via search summary](https://www.paf-media.co.uk/jd-gyms-pushes-ahead-with-rapid-uk-expansion)) — sitemap count (114) is the more reliable figure | Name, address (per branch page), classes, opening-hours page | robots.txt: `Allow: /`, only `/api/` and `/faq/search` disallowed; sitemap fully open | **SITEMAP LIST — best of the budget-chain feeds** (one clean URL per branch, no crawl restriction) |
| Nuffield Health | nuffieldhealth.com/gyms | Not checked for a sitemap URL; site uses `/gyms` + per-club subpages | ~109–111 fitness & wellbeing centres (site copy; range across pages) ([nuffieldhealth.com/gyms](https://www.nuffieldhealth.com/gyms)) | Name, address, postcode, phone, opening hours | robots.txt is notable: it does **not** block `*` broadly, but explicitly names and blocks `SemrushBot`, `SemrushBot-SA`, `AlphaSeoBot`, `AlphaSeoBot-SA`, and **`Screaming Frog SEO Spider`** — i.e. Nuffield deliberately blocks known SEO/crawling tools by name while leaving generic `User-agent: *` unrestricted. General-purpose fetching of individual pages is not blocked, but this is a clear signal of an anti-bulk-scraping posture | PAGE ONLY |
| David Lloyd | davidlloyd.co.uk/clubs/ | `sitemap-index.xml` declared | 114 UK clubs / 149 UK+Europe (secondary aggregator sites, not the operator's own page) **(unverified, secondary)** ([davidlmembershipcost.uk](https://davidlmembershipcost.uk/david-lloyd-locations/)) | Name, address, facilities (pools, courts) | robots.txt disallows `/*.json`, `/*.pdf`, admin paths (`/typo3/`), but general pages and sitemap are open | PAGE ONLY |
| Better (GLL) | better.org.uk/leisure-centres/centre-locator | `sitemap.xml` declared at gll.org (corporate site; consumer site is better.org.uk — sitemap not separately checked) | 240 public sports/leisure sites (consumer "Better" brand) + 120 libraries etc under GLL overall, per GLL's own copy ([gll.org](https://www.gll.org/services-and-impact/community-leisure-services)) | Name, address, postcode, opening hours, classes, pool/gym facility flags | gll.org robots.txt: `Allow: /`, sitemap declared, fully open | PAGE ONLY (locator likely client-rendered against an internal API; not confirmed as public) |
| Everyone Active (SLM) | everyoneactive.com | Not reachable this pass | 240+ managed sites, 65+ local authorities (own copy, via search) ([leisureopportunities.co.uk](https://www.leisureopportunities.co.uk/news/Everyone-Active-wins-contract-for-management-of-eight-major-sport-and-cultural-facilities/350016)) | Not observed | Site is behind a **Cloudflare "Attention Required" challenge** even for a plain `robots.txt` GET — normal automated fetching is blocked at the network layer | BLOCKED |
| Fitness First | fitnessfirst.co.uk | No sitemap declared in robots.txt | ~39 clubs, down from a much larger historical estate (they sold 67 clubs in a restructuring) ([healthclubmanagement.co.uk](https://www.healthclubmanagement.co.uk/health-club-management-news/latest-news/301235)) | Not observed | robots.txt blocks parameterised URLs (`?tag=`, `?club=`, `?category=`, `/search*`) and `/umbraco/` (CMS admin) but not plain branch pages | PAGE ONLY |
| Virgin Active | virginactive.co.uk/clubs | `sitemap.xml` declared | ~43 clubs (secondary/search-summary figure, one source also cites 31 "Social Wellness Clubs" as a subset) **(unverified, secondary)** ([Wikipedia](https://en.wikipedia.org/wiki/Virgin_Active)) | Name, address, facilities (pools, spa, padel) | robots.txt blocks only `/sitefinity/` (CMS); sitemap open | PAGE ONLY |
| Bannatyne | bannatyne.co.uk/health-club | `sitemap.xml` declared | 68–72 clubs depending on source; own site says "over 60" ([bannatyne.co.uk](https://www.bannatyne.co.uk/health-club)) | Name, address, spa flag | robots.txt: `Disallow:` (blank = allow everything), sitemap declared | PAGE ONLY |
| énergie Fitness | energiefitnessclubs.com | Unknown — site is behind Cloudflare's JS challenge, robots.txt itself returned a challenge page | 60–70+ clubs UK & Ireland (franchise-directory figures) **(unverified, secondary)** ([whichfranchise.com](https://www.whichfranchise.com/franchisorPage.cfm?companyId=4373)) | Not observed | Domain fully gated behind a Cloudflare managed challenge (JS + cookie required) even for `robots.txt` | BLOCKED |
| Snap Fitness | snapfitness.com/uk | `sitemap.xml` declared at snapfitness.com/uk | 100–111 clubs UK & Ireland, passed 100th-club milestone ([snapfitness.com news](https://www.snapfitness.com/uk/franchise-news/snap-fitness-reaches-100th-uk-club-landmark)) | Name, address (per franchise page) | robots.txt disallows only T&C/policy/offer pages; sitemap declared and open | PAGE ONLY |
| Anytime Fitness | anytimefitness.co.uk | Unknown | 185–190 clubs UK & Ireland, 200k+ members ([Statista/ScrapeHero via search summary](https://www.scrapehero.com/location-reports/Anytime%20Fitness-UK/)) **(unverified, secondary)** | Not observed | Domain sits behind **Incapsula** bot-mitigation; robots.txt request itself returns an Incapsula challenge script | BLOCKED |
| Xercise4Less | — (brand retired) | n/a | Status: **acquired by JD Gyms (JD Sports) in 2020** and absorbed into the JD Gyms estate/brand; not a standalone operator any more ([search summary of Tracxn/HCM reporting](https://www.healthclubmanagement.co.uk/health-club-management-news/Exclusive-Xercise4Less-deal-to-be-completed-when-gyms-open/345755)) | n/a | n/a | n/a | RETIRED BRAND — fold into JD Gyms |
| Village Gyms (Village Hotels) | villagegym.co.uk/locations/ | Not checked for sitemap | 33 UK gyms/health clubs, own site's location list ([villagegym.co.uk/locations/](https://www.villagegym.co.uk/locations/)) | Name, address (per location page), pool/facility flags | Not checked | PAGE ONLY |
| Total Fitness | totalfitness.co.uk | Not checked for sitemap; robots.txt fetch returned empty | 15 clubs, North of England & Wales (own "About" copy) ([totalfitness.co.uk/about/](https://www.totalfitness.co.uk/about/)) | Not observed | Not checked | UNKNOWN |
| Gymbox | gymbox.com/gyms/ | Not checked (site blocked) | 10 London locations (own site listing) ([gymbox.com/gyms/](https://gymbox.com/gyms/)) | Name, address (per gym page) | Domain is behind a **Cloudflare managed challenge** — even `robots.txt` returns a JS challenge page, not the file | BLOCKED |
| Third Space | thirdspace.london/clubs/ | `sitemap_index.xml` declared, robots.txt fully open (`/wp-admin/` only disallowed) | 13–16 London clubs, several more opening through 2026–2027 ([healthclubmanagement.co.uk](https://www.healthclubmanagement.co.uk/health-club-management-news/Third-Space-keeps-the-bar-high-with-The-Whiteley-launch/361824)) | Name, address, facility highlights | robots.txt open, WordPress-standard | PAGE ONLY |
| 1Rebel | 1rebel.com | `sitemap.xml` declared, robots.txt: `Allow: /` | ~10–13 London studios (own Instagram/press count, no static "all locations" list found) **(unverified, secondary)** | Not observed in detail | Fully open robots.txt | PAGE ONLY |
| F45 UK | f45training.com/uk/find-a-studio/ | Not checked for sitemap | ~46 UK studios (own site framing via search summary) ([f45training.com/uk/find-a-studio/](https://f45training.com/uk/find-a-studio/)) | Name, address, class timetable per studio | Not checked | UNKNOWN |
| CrossFit affiliate map | crossfit.com/map | Official interactive map exists; no public bulk API found this pass | ~10,000–12,000 affiliates globally (CrossFit HQ figures via search summary); no isolated UK figure retrieved | Box name, address, coordinates on the map UI | Not checked; CrossFit HQ historically restricts scraping of the affiliate map in its site terms (reputationally known, not independently quoted here — **UNVERIFIED**, flag for a dedicated ToU fetch before any scraping) | UNKNOWN / treat as TERMS-SENSITIVE until ToU is read directly |
| Places Leisure | places-leisure.org | Not checked | 67 sites with pools (Leisure DB swimming-operator ranking, not a full-estate count) **(unverified, secondary)** ([healthclubmanagement.co.uk](https://www.healthclubmanagement.co.uk/health-club-management-news/LeisureDBs-annual-swimming-report-is-now-live/356522)) | Not observed | Not checked | UNKNOWN |
| Parkwood Leisure | parkwoodleisure.co.uk | Not checked | 44 sites with pools per the same ranking; "more than 80 facilities... 31 local authorities" per own copy — the two figures measure different things (pools-only vs all facilities) ([parkwoodleisure.co.uk](https://www.parkwoodleisure.co.uk/)) | Not observed | Not checked | UNKNOWN |
| Freedom Leisure | freedom-leisure.co.uk | Not checked | 73 sites with pools, same ranking **(unverified, secondary)** | Not observed | Not checked | UNKNOWN |
| Serco Leisure | serco.com/uk/sector-expertise/community-services/leisure-services | Not checked | 34 sites with pools, same ranking **(unverified, secondary)** | Not observed | Not checked | UNKNOWN |
| Active Nation | activenation.org.uk | Not checked | Not established this pass | Not observed | Not checked | UNKNOWN |
| Fusion Lifestyle | fusion-lifestyle.org | Not checked | Operated centres from Wales to Newcastle; **entered administration 1 April 2026** per press reporting, with contracts (e.g. Oxford) transferring to Serco Leisure — treat Fusion as a wind-down operator, verify each site's current operator before recording ([Oxford Magazine](https://theoxfordmagazine.com/news/serco-leisure-to-take-over-running-of-oxfords-leisure-centres-from-fusion-lifestyle/), [Kent Online](https://www.kentonline.co.uk/canterbury/news/no-impact-on-three-kent-leisure-centres-after-collapse-of-338702/)) | Not observed | Not checked | UNKNOWN — operator in administration, sites transferring |
| Sports Direct Fitness / Everlast Gyms+ | everlastgyms.com | Not checked | ~60 UK & Ireland locations, formed 2020 from the DW Sports Fitness administration (46 clubs + 31 retail units bought by Frasers Group for £37m) ([Wikipedia — Everlast Gyms](https://en.wikipedia.org/wiki/Everlast_Gyms)) | Not observed | Not checked | UNKNOWN |
| Ultimate Fitness | — | Not checked | Not clearly identified as a distinct current UK chain this pass — likely conflated with "Ultimate Fitness Group" or franchise listings; **could not verify a standalone find-a-gym surface** | n/a | Not checked | UNKNOWN — name did not resolve to a clear single operator |
| UFC Gym UK | ufcgym.co.uk | Not checked | Very early UK footprint: first two sites (Nottingham opened first, described as "Europe's first UFC Gym"; London/City Road opened 2026); a 105-site 10-year plan is announced, not built | Not observed | Not checked | UNKNOWN — pre-scale operator, count is effectively 2 sites live |
| Trainmore | trainmore.nl / trainmore brand (Urban Gym Group) | Not checked | Netherlands-headquartered brand under Urban Gym Group; **no confirmed standalone UK estate found** this pass — do not assume UK presence without direct confirmation | n/a | Not checked | UNKNOWN — likely non-UK or negligible UK footprint |
| Sweat! | — (brand defunct) | n/a | **Status: closed.** Debenhams-linked budget women's-fitness chain (6 sites) went into voluntary liquidation after a rejected CVA ([healthclubmanagement.co.uk](https://www.healthclubmanagement.co.uk/health-club-management-news/Debenhams-linked-budget-fitness-chain-Sweat!-shuts-its-doors/341974)) | n/a | n/a | RETIRED — exclude from active database, keep as a historical/closed record only |
| 24/7 Fitness | 247fitness.co | Not checked | Small independent 24-hour operator; still trading per Trustpilot presence, no branch count found ([247fitness.co](https://247fitness.co/)) | Not observed | Not checked | UNKNOWN |
| Simply Gym | simplygym.co.uk/map/ | `/map/` page exists — worth checking for an embedded JSON/geo feed in a follow-up pass | 9 sites, Midlands-focused; **acquired by JD Gyms in 2024**, targeting 100 combined locations with JD ([healthclubmanagement.co.uk](https://www.healthclubmanagement.co.uk/health-club-management-news/JD-Gyms-acquires-Simply-Gym-Alun-Peacock/353286)) | Name, address (per location page) | Not checked | PAGE ONLY — and functionally merging into the JD Gyms estate |
| Truegym | — | Not checked | Could not confirm a live, distinct UK "Truegym" brand this pass — do not record without direct confirmation | n/a | Not checked | UNKNOWN — likely defunct/rebranded or not UK-present |
| Nuffield/university gyms | (various university sport-centre sites) | n/a | Note only, per brief — university sports centres are a distinct category from Nuffield Health (unrelated branding coincidence in the name); not researched as a category this pass | n/a | n/a | NOTE ONLY, not researched |
| Council leisure trusts (category) | communityleisureuk.org | CLUK member list page exists on their site | ~96 CLUK members (England/Wales/Scotland) as of Feb 2026, collectively 46,000+ staff, £2bn turnover, per CLUK's own copy ([communityleisureuk.org](https://communityleisureuk.org/)) | Trust name, region, contact — not branch-level; each trust's own facilities need separate enumeration | Not checked | PAGE ONLY (member-list level, not facility level) |

---

## 2. Industry bodies & directories

- **ukactive — 2026 State of the UK Fitness Industry Report.** Headline figures reported: **5,842 health & fitness clubs in the UK**, up 4.2% since 2024; **12.2 million members** (record high); **18% penetration of the population**; total sector revenue **£6.5bn** (up from £5.7bn). Report methodology note found via search summary: sample coverage of "74% of private operators, 85% of public operators and 88% of independent operators" — implying the 5,842 figure is a report estimate/extrapolation, not a raw census, and a private/public numeric split was not retrieved this pass (would require the full report PDF/flippingbook, not just the press release). ([ukactive.com](https://ukactive.com/news/uk-health-and-fitness-market-report-2026-reveals-visits-to-health-and-fitness-clubs-up-10-and-18-of-the-population-now-members/), [leisureopportunities.co.uk](https://www.leisureopportunities.co.uk/news/UK-Active-report-shows-the-fitness-sector-has-achieved-record-growth/362767)) ukactive's own member directory/data-licensing route was not located this pass — worth a direct follow-up to ukactive.com to check for a partner/licensing programme.
- **Hussle** (formerly PayAsUGym, acquired by EGYM in 2024) — describes itself as "the largest network of fitness venues in the UK," citing **1,500+ venues** on its marketing pages, vs an older PayAsUGym figure of **2,800+ venues / 2,000+ gyms**; the discrepancy is unexplained and likely reflects different counting rules (unique venues vs bookable products) — **treat both figures as unverified marketing claims**, not a count. Its venue list is exposed only through its own search/booking UI; no bulk feed identified. Terms of use not fetched. ([hussle.com](https://www.hussle.com/gyms-in-uk))
- **Wellhub (formerly Gympass)** — global corporate-wellness network, cites 50,000+ gyms across 13 countries; no UK-specific venue count retrieved. Access to in-person venues is gated by corporate-employer subscription; venue directory not designed as a public dataset. Terms not fetched.
- **ClassPass** — not directly researched this pass; treat as UNKNOWN, same caution as Wellhub (subscription-gated directory, unlikely to permit bulk reuse).
- **Independent directories:**
  - **gymdirectory.co.uk** — presents itself as a UK-wide gym finder; A–Z listing page exists. Not verified for accuracy, freshness, or terms.
  - **corelist.co.uk** — claims a database of **7,138 gyms and health clubs** across UK counties/regions — by far the largest count surfaced this pass, but it is a third-party aggregator of unstated provenance and unverified accuracy; **do not treat as a source of truth**, only as a possible cross-check/seed list.
  - **independentgyms.co.uk / findgyms.co.uk** — membership platforms for independently-run gyms; useful category coverage (independents are undercounted by the big-chain-focused pages above) but not verified for completeness.
  - "gymlist.co.uk", "ukgyms", "findmygym" (as literally named in the brief) did **not** resolve to identifiable, distinct live sites in this search pass — the closest matches found were gymdirectory.co.uk, corelist.co.uk, findgyms.co.uk and independentgyms.co.uk. Flag this as a naming/discovery gap rather than "these sites don't exist."
- **Google Business Profile category counts** — not queried this pass (would need the Google Places API or manual category search per city; out of scope for a search-only pass). Flag for a follow-up with API access.
- **Yelp / Foursquare category coverage** — not queried this pass; same flag as above.
- **British Powerlifting** — runs an official "Approved Club" programme with a published **Coach and Club Finder** list at britishpowerlifting.org/coach-and-club-finder, plus a downloadable regional PDF finder (seen: a Scotland-region PDF). Home Countries (England via englishpowerlifting.co.uk, EPA) run their own affiliated-club lists. This is a genuine **PAGE ONLY / document-based list** — usable as a specialist verification source for powerlifting-specific gyms, not a bulk feed. ([britishpowerlifting.org](https://www.britishpowerlifting.org/coach-and-club-finder))
- **British Drug Free Powerlifting Association (BDFPA)** — separate federation, also publishes an affiliated-clubs list at bdfpa.co.uk/affiliated-clubs — a second specialist source, likely with different/overlapping membership to British Powerlifting.
- **CrossFit affiliate map** (crossfit.com/map) — official, interactive, global; no bulk export identified. CrossFit HQ is known industry-wide for tightly controlling affiliate-map reuse (trademark-licensing reasons — a "box" only appears on the map while its affiliate agreement is active), so this is flagged **TERMS-SENSITIVE**: read the actual CrossFit.com terms of use before any scraping, rather than relying on the map being "just a locator."
- **Women-only gyms, strongman gyms** — no dedicated national directory found this pass; these remain a gap to fill from the general chain/independent listings plus manual curation.

---

## 3. Operator summary table

| Operator | Branches (approx) | Feed verdict | Terms verdict |
|---|---:|---|---|
| PureGym | 400–450+ | PAGE ONLY | UNVERIFIED (robots permissive; full ToU not confirmed) |
| The Gym Group | 264+ | SITEMAP LIST | UNVERIFIED |
| JD Gyms | 114 (sitemap count) | **SITEMAP LIST (cleanest budget-chain feed)** | UNVERIFIED |
| Nuffield Health | ~109–111 | PAGE ONLY | UNVERIFIED, but named bot-blocking signals a cautious posture |
| David Lloyd | ~114 UK (secondary) | PAGE ONLY | UNVERIFIED |
| Better (GLL) | ~240 (Better brand) | PAGE ONLY | UNVERIFIED |
| Everyone Active (SLM) | 240+ sites | BLOCKED | UNKNOWN (site inaccessible to plain fetch) |
| Fitness First | ~39 | PAGE ONLY | UNVERIFIED |
| Virgin Active | ~43 (secondary) | PAGE ONLY | UNVERIFIED |
| Bannatyne | 68–72 | PAGE ONLY | UNVERIFIED |
| énergie Fitness | 60–70+ | BLOCKED | UNKNOWN |
| Snap Fitness | 100–111 | PAGE ONLY | UNVERIFIED |
| Anytime Fitness | 185–190 (secondary) | BLOCKED | UNKNOWN |
| Xercise4Less | — (retired brand → JD Gyms) | n/a | n/a |
| Village Gyms | 33 | PAGE ONLY | UNKNOWN |
| Total Fitness | 15 | UNKNOWN | UNKNOWN |
| Gymbox | 10 | BLOCKED | UNKNOWN |
| Third Space | 13–16 | PAGE ONLY | UNVERIFIED |
| 1Rebel | ~10–13 (secondary) | PAGE ONLY | UNVERIFIED |
| F45 UK | ~46 | UNKNOWN | UNKNOWN |
| CrossFit UK affiliates | not isolated from global count | PAGE ONLY (official map) | TERMS-SENSITIVE, unread |
| Places Leisure | 67 (pools only) | UNKNOWN | UNKNOWN |
| Parkwood Leisure | 44 (pools) / 80+ (all sites) | UNKNOWN | UNKNOWN |
| Freedom Leisure | 73 (pools) | UNKNOWN | UNKNOWN |
| Serco Leisure | 34 (pools) | UNKNOWN | UNKNOWN |
| Active Nation | not established | UNKNOWN | UNKNOWN |
| Fusion Lifestyle | in administration, sites transferring | UNKNOWN | UNKNOWN |
| Everlast Gyms (Sports Direct) | ~60 | UNKNOWN | UNKNOWN |
| Ultimate Fitness | not clearly identified | UNKNOWN | UNKNOWN |
| UFC Gym UK | ~2 live | UNKNOWN | UNKNOWN |
| Trainmore | UK presence unconfirmed | UNKNOWN | UNKNOWN |
| Sweat! | 0 (closed/liquidated) | n/a | n/a |
| 24/7 Fitness | not established | UNKNOWN | UNKNOWN |
| Simply Gym | 9 (merging into JD Gyms) | PAGE ONLY | UNVERIFIED |
| Truegym | not confirmed live in UK | UNKNOWN | UNKNOWN |
| Council leisure trusts (CLUK, category) | ~96 member trusts | PAGE ONLY (member list, not facility list) | UNVERIFIED |

---

## 4. Best available UK total-gym estimate

- **Whole-market estimate: ~5,842 health & fitness clubs UK-wide (ukactive, 2026 State of the UK Fitness Industry Report)**, up 4.2% on 2024, against 12.2m members and 18% population penetration. This is the only industry-wide, named, dated total found this pass. ([ukactive.com](https://ukactive.com/news/uk-health-and-fitness-market-report-2026-reveals-visits-to-health-and-fitness-clubs-up-10-and-18-of-the-population-now-members/))
- **No nation-level (England/Scotland/Wales/NI) breakdown was retrieved this pass** — the report's own press coverage gives a single UK figure. Getting the nation split, and the private-vs-public split implied by ukactive's "74%/85%/88% sample coverage" note, requires reading the full report (a flippingbook document was located: [online.flippingbook.com/view/55959561](https://online.flippingbook.com/view/55959561)) rather than press summaries — flag as the highest-value single follow-up fetch for this workstream.
- **Sanity-check from chain arithmetic** (sum of the named-chain branch counts above, most from the operator's own current copy): PureGym (~450) + Gym Group (264) + JD Gyms (114) + Nuffield (110) + David Lloyd (~114) + Better/GLL (~240) + Everyone Active (~240) + Fitness First (39) + Virgin Active (~43) + Bannatyne (~70) + énergie (~65) + Snap Fitness (~106) + Anytime Fitness (~188) + Village Gyms (33) + Total Fitness (15) + Gymbox (10) + Third Space (~15) + 1Rebel (~12) + F45 (~46) + Everlast (~60) + Simply Gym (9) + council-trust facilities (unknown multiple per ~96 trusts, likely several hundred to 1,000+ sites) ≈ **2,200–2,300 branded/large-operator sites before council-trust facilities and independents are added.** Adding a plausible council-trust facility count (CLUK's ~96 trusts each running multiple sites — commonly cited elsewhere as several hundred to ~1,000 public leisure centres) and the large "independent gym" long tail (corelist.co.uk's unverified 7,138 figure suggests independents dwarf the branded chains) is consistent with ukactive's 5,842 total sitting mostly in public-sector and independent facilities rather than the big private chains — **this is directional reasoning, not a verified reconciliation**, and should not be presented to the founder as a checked total.
- **Recommendation for the database's own coverage KPI:** use ukactive's 5,842 as the denominator with an explicit caveat about its sample-based methodology and lack of nation/sector breakdown in the press version, and treat the sum of named-operator branch counts above (~2,200-2,300) as the "large-chain-only" floor that a first build of the database should aim to match before tackling council trusts and independents.

---

## 5. Verification sources ranked (cleanest → weakest for branch existence/name/status)

1. **JD Gyms** — sitemap enumerates exactly 114 individual `/gym/<name>/` URLs, crawl-permitted (`Allow: /`), each URL is a real branch page. Best-in-class for this pass.
2. **The Gym Group** — sitemap lists per-city `/find-a-gym/<city>-gyms/` hub pages, crawl-permitted, backed by a public plc with quarterly press releases giving an exact, dated branch-count (264 at H1 2026) — strong for cross-checking a total even though the sitemap isn't per-branch.
3. **PureGym** — largest UK chain, own site states its branch count, sitemap and robots.txt are open, but the branch list itself is not enumerable as static URLs in the sitemap (likely client-rendered/API-backed) — good for spot-checking a branch, weaker for bulk enumeration without further investigation of the underlying API PureGym's own `/gyms/` page calls.
4. **Third Space / 1Rebel / Snap Fitness / Bannatyne / Virgin Active** — all have open robots.txt and declared sitemaps; smaller estates so lower priority but low-friction to use.
5. **British Powerlifting / BDFPA / englishpowerlifting.co.uk** — good specialist truth sources for the powerlifting-club category specifically; document/list-based rather than a feed.
6. **David Lloyd, Nuffield Health, Better/GLL, Fitness First** — page-only, crawl-permitted with minor path exclusions; usable but requires page-by-page confirmation, no bulk list found.
7. **Community Leisure UK member list** — good for verifying which trust operates in which local authority, but is one level removed from individual facility data; each trust then needs its own site checked.
8. **Everyone Active, Anytime Fitness, énergie Fitness, Gymbox** — actively bot-blocked (Cloudflare/Incapsula challenges intercept even `robots.txt`); do not attempt automated fetching against these without a manual/API arrangement — use manual spot-checks or a licensed data source instead.
9. **corelist.co.uk and other third-party aggregators** — useful only as a rough seed/cross-check list; provenance and freshness unverified, never treat as ground truth for name/status.
