# Community Rules: Volyume Community

**In-app rules text, version 2.** Shown on the Join screen before a
profile is created, and reachable any time from Community settings and
from the Community Rules screen. Written in Volyume's house voice: calm,
plain, no shame, no guilt, no clipped commands.

Authority: `docs/social-discovery-2026-09-06/30-BLUEPRINT.md` §§2, 6;
`40-DECISIONS.md` SD-04, SD-11; `docs/social-discovery-2026-09-06/
70-DISCOVERY-BLUEPRINT.md` §§1, 2, 3, 6; `40-DECISIONS.md` SD-20, SD-21,
SD-22, SD-25. `COMMUNITY_RULES_VERSION = 2`.

Version 2 adds rules for messages, meeting a training partner in person,
and an explanation of the training profile under "what stays private".
The in-app `COMMUNITY_RULES_VERSION` constant must move to 2 in step with
this document; that code change is for the screens lane to make, not this
update.

---

## Welcome to Community

Community is where you share your training, follow people you rate, and
use or adapt the programmes other lifters have built. It works best when
it stays about training. Here is what that means in practice.

## The rules

1. **Training talk only.** Posts and comments are about training: what
   you did, how it went, what you built. Keep it there.
2. **Be decent to people.** Disagree if you like, but no harassment,
   threats, hate or targeting anyone.
3. **No body-shaming, no diet or calorie talk.** Nothing about anyone's
   body, weight or appearance, and nothing about calories, restriction or
   dieting. This applies to your own body too, not just other people's.
4. **Report what breaks this.** If you see something that shouldn't be
   here, report it. That is how we keep Community working for everyone.
5. **Messages.** Messages are between people who both said yes. Keep them
   about training. Report anything that is not.
6. **Meeting people.** If you arrange to train with someone you met here,
   meet at the gym, tell someone, and keep the first sessions public.

## What stays private

Community only ever shows what you choose to put there: a handle, a
display name, a bio, up to three training styles, a goal, a training
setting, and (if you want) an area or gym label. Training-story posts show
what you post and nothing more.

The following never appear in Community, in any form, however you share:

- Your bodyweight and body composition
- Your Progress Scan
- Your nutrition and food diary
- Your injuries and limitations
- Anything your coach or plan adjustments have said
- Your check-ins
- Your progress photos
- Your first name, date of birth, email, height or age

If you post a personal best, the weight and reps on that specific lift are
shown because you chose to share that result. Programmes you publish
share their structure (days, exercises, sets, reps, rest) and never a
weight.

Your training profile works the same way. If you choose to share it, only
the bands you have switched on are ever shown, and never anything more
detailed: never a time of day more precise than morning, midday,
afternoon, evening or late, and never where you are right now.

## Reporting and blocking

Every profile, post, comment and programme has a Report option with a
short list of reasons to choose from, including a dedicated reason for
harmful body or eating content. Reports go straight to a moderator queue.

You can also block anyone. Blocking is two-way: once you block someone,
neither of you can see the other's profile, posts, programmes or
comments, and any follow between you is removed. You can unblock at any
time. Muting is quieter: you stop seeing someone's posts, and they are
never told.

If a post, comment or programme gets reported by three different people,
it is hidden automatically while a moderator looks at it.

## What moderators can do

A moderator can dismiss a report, hide or delete content, or restrict or
suspend an account. Every action a moderator takes is recorded, including
who did it and why, so it can always be checked.

## Contact

Questions about these rules, or anything Community-related you would
rather raise directly: **support@volyume.app**.

## Rules version

Community rules version **2**, published **6 September 2026**. Any future
change to these rules is a new version, and you will be asked to accept it
before you can keep using Community.

---

```js
// src/lib/community/rulesText.js
// Community Rules v2, paste-ready for CommunityRulesScreen.
// Keep this file's content in step with docs/community-safety/COMMUNITY-RULES.md.

export const COMMUNITY_RULES_VERSION = 2;

export const COMMUNITY_RULES_TEXT = {
  title: 'Community rules',
  intro:
    "Community is where you share your training, follow people you rate, " +
    "and use or adapt the programmes other lifters have built. It works " +
    "best when it stays about training. Here is what that means in " +
    "practice.",
  rules: [
    {
      heading: 'Training talk only.',
      body: 'Posts and comments are about training: what you did, how it went, what you built. Keep it there.',
    },
    {
      heading: 'Be decent to people.',
      body: 'Disagree if you like, but no harassment, threats, hate or targeting anyone.',
    },
    {
      heading: 'No body-shaming, no diet or calorie talk.',
      body:
        "Nothing about anyone's body, weight or appearance, and nothing " +
        "about calories, restriction or dieting. This applies to your own " +
        "body too, not just other people's.",
    },
    {
      heading: 'Report what breaks this.',
      body: 'If you see something that shouldn’t be here, report it. That is how we keep Community working for everyone.',
    },
    {
      heading: 'Messages.',
      body: 'Messages are between people who both said yes. Keep them about training. Report anything that is not.',
    },
    {
      heading: 'Meeting people.',
      body: 'If you arrange to train with someone you met here, meet at the gym, tell someone, and keep the first sessions public.',
    },
  ],
  privacy: {
    heading: 'What stays private',
    intro:
      'Community only ever shows what you choose to put there: a handle, ' +
      'a display name, a bio, up to three training styles, a goal, a ' +
      'training setting, and (if you want) an area or gym label. ' +
      'Training-story posts show what you post and nothing more.',
    neverShown: [
      'Your bodyweight and body composition',
      'Your Progress Scan',
      'Your nutrition and food diary',
      'Your injuries and limitations',
      'Anything your coach or plan adjustments have said',
      'Your check-ins',
      'Your progress photos',
      'Your first name, date of birth, email, height or age',
    ],
    note:
      'If you post a personal best, the weight and reps on that specific ' +
      'lift are shown because you chose to share that result. Programmes ' +
      'you publish share their structure (days, exercises, sets, reps, ' +
      'rest) and never a weight.',
    trainingProfileNote:
      'Your training profile works the same way. If you choose to share ' +
      'it, only the bands you have switched on are ever shown, and never ' +
      'anything more detailed: never a time of day more precise than ' +
      'morning, midday, afternoon, evening or late, and never where you ' +
      'are right now.',
  },
  reporting: {
    heading: 'Reporting and blocking',
    body:
      'Every profile, post, comment and programme has a Report option ' +
      'with a short list of reasons to choose from, including a ' +
      'dedicated reason for harmful body or eating content. Reports go ' +
      'straight to a moderator queue.\n\n' +
      'You can also block anyone. Blocking is two-way: once you block ' +
      'someone, neither of you can see the other’s profile, posts, ' +
      'programmes or comments, and any follow between you is removed. ' +
      'You can unblock at any time. Muting is quieter: you stop seeing ' +
      'someone’s posts, and they are never told.\n\n' +
      'If a post, comment or programme gets reported by three different ' +
      'people, it is hidden automatically while a moderator looks at it.',
  },
  moderatorActions: {
    heading: 'What moderators can do',
    body:
      'A moderator can dismiss a report, hide or delete content, or ' +
      'restrict or suspend an account. Every action a moderator takes is ' +
      'recorded, including who did it and why, so it can always be ' +
      'checked.',
  },
  contact: {
    heading: 'Contact',
    body:
      'Questions about these rules, or anything Community-related you ' +
      'would rather raise directly:',
    email: 'support@volyume.app',
  },
  version: {
    number: COMMUNITY_RULES_VERSION,
    publishedDate: '2026-09-06',
    label: 'Community rules version 2, published 6 September 2026.',
    changeNote:
      'Any future change to these rules is a new version, and you will ' +
      'be asked to accept it before you can keep using Community.',
  },
};
```
