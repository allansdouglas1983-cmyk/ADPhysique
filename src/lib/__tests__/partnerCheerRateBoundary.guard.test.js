// What this pins and why.
//
// The Partners feature was RETIRED on 2026-09-06 (SD-03,
// docs/social-discovery-2026-09-06/30-BLUEPRINT.md section 9): the client
// surface, its sync handler and the `insertCheerDirectly` fallback that used
// to stamp a LOCAL date are all deleted. What is deliberately NOT deleted is
// the server side: the `partner-cheer` Edge Function and cloud migration 155,
// which are still deployed (155 written, not yet applied) and still serve
// older builds that are already on people's phones.
//
// So this suite reads ONLY the two server artefacts and pins the daily-rate
// boundary that protects them: `sent_on` is stamped by the SERVER's UTC clock
// and can never be chosen by the caller. Any client-side assertions it once
// carried are gone with the client. Do not point this file at src/ again.

const fs = require('fs');
const path = require('path');

const EDGE = fs.readFileSync(path.resolve(__dirname, '../../../supabase/functions/partner-cheer/index.ts'), 'utf8');
const MIGRATION = fs.readFileSync(path.resolve(__dirname, '../../../supabase/migrate_155_partner_cheer_server_date.sql'), 'utf8');

describe('partner cheer daily rate boundary', () => {
  test('the Edge Function never derives sent_on from request JSON', () => {
    expect(EDGE).toMatch(/const sentOn = new Date\(\)\.toISOString\(\)\.slice\(0, 10\)/);
    expect(EDGE).not.toMatch(/body\.sentOn/);
    expect(EDGE).toMatch(/valid pairId is required/);
  });

  test('direct authenticated inserts are restricted to the same server day', () => {
    expect(MIGRATION).toMatch(/FOR INSERT TO authenticated/);
    expect(MIGRATION).toMatch(/sent_on = \(now\(\) AT TIME ZONE 'UTC'\)::date/);
    expect(MIGRATION).toMatch(/auth\.uid\(\) = sender_id/);
    expect(MIGRATION).toMatch(/p\.status = 'active'/);
  });
});
