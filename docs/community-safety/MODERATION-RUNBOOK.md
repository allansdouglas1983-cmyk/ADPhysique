# Moderation Runbook: Volyume Community

**For the founder.** How reports arrive, what to do with each reason, and
how the audit trail works.

Authority: `docs/social-discovery-2026-09-06/30-BLUEPRINT.md` §§3, 6, 11;
`40-DECISIONS.md` SD-11. Every Section 2 CLAUDE.md inviolable (ED-safety,
data minimisation) binds moderation action, same as everywhere else in the
app.

---

## 1. How reports arrive

A user reports a profile, post, comment or programme from its `...` menu
or its Report sheet. This writes a row to `community_reports` with a
reason, an optional detail, and (for post/comment/programme) the content's
owner. It appears in the in-app **moderation queue**
(`CommunityModerationScreen`, visible only to accounts listed in
`community_moderators`), tabbed Open | Actioned, newest first, with the
report count against that same target visible so you can see at a glance
whether it is a single complaint or several people flagging the same
thing. The audit log is reachable from the same screen.

## 2. The 24-hour target

Every open report gets a first look inside **24 hours**. This is
Volyume's own internal target, set as the tightest of Apple's informal
expectation, Google Play's "promptly," and the DSA's "without undue
delay," so meeting it satisfies all three at once
(`13-research-policy-safety-coldstart.md` §3, §5). It is a target to work
to, not an automated enforcement window; nothing in the app currently
escalates or pages anyone if it slips, so treat checking the queue as a
daily habit while Community is small.

## 3. The six report reasons and the default action

| Reason | What it usually means | Default action |
|---|---|---|
| `spam` | Repetitive, promotional, or clearly automated content | Hide the content; if the account shows a pattern across multiple items, restrict it |
| `harassment` | Targeting, threats, hate directed at a person | Hide the content; restrict the account on a first confirmed instance, suspend on repeat |
| `impersonation` | Claiming to be Volyume, a moderator, or another real person | See Section 5 below |
| `harmful_body_or_eating_content` | Body-shaming, diet/calorie talk, restriction-encouraging content | See Section 4 below, always first |
| `inappropriate` | Off-topic, sexual, or otherwise against the rules but not one of the above | Hide the content; use judgement on the account |
| `other` | Anything not covered above, with the reporter's free-text detail | Read the detail first; there is no safe default, judge the specific case |

"Hide" here means the `hide_content` moderation action (sets the item's
status to hidden; it stops appearing to anyone but stays in the database
and the audit trail). "Delete" (`delete_content`) is for content you are
confident should not exist in any form (e.g. spam, confirmed harassment)
rather than a borderline call worth keeping a record of.

## 4. Harmful body or eating content: priority handling

This reason is flagged `priority = true` automatically the moment it is
filed, so it sorts to the top of the queue on its own, ahead of the
24-hour target for everything else. Handle it as follows, in order:

1. **Hide first.** If the report is against a post or comment and it has
   not already auto-hidden (three reports), hide it immediately on your
   own judgement, before doing anything else. Do not leave body or diet
   content up while you think it over.
2. **Review calmly.** Read the content and the reporter's detail. Confirm
   it matches the reason (body-shaming, diet/calorie talk, restriction
   encouragement) rather than being a mis-tagged report of something else.
3. **Never reply with diet advice.** Whatever the content said, your
   moderator action is content-only: hide, delete, restrict or suspend.
   Never post a reply, in the app or by email, that engages with calories,
   weight, or diet as if correcting or advising on it. If the affected
   user (reporter or the person actioned) needs support, the existing
   in-app and support-page Beat UK signposting is the answer, not a
   moderator's own comment on food or weight.
4. Repeat or clearly deliberate posting of this kind of content is a
   restrict-then-suspend escalation (Section 6), not a per-post-only
   response, since the ED-safety cost of leaving a pattern up is higher
   than for most other reasons.

## 5. Impersonation

Check the handle and display name against the account being impersonated
(Volyume itself, a moderator, or another real user). Reserved words
(volyume, admin, support, help, moderator, official, staff, team,
community, coach, beat, nhs, and the app's route words) should already be
blocked at signup; a confirmed impersonation report despite that means
either a close variant slipped through or the impersonation is of a real
person outside that reserved list.

- If the profile is clearly and only imitating someone: hide the profile,
  restrict the account, and ask the reporter (or the impersonated person,
  if they can be identified and reached) to confirm by email
  (support@volyume.app) if there is any doubt.
- If confirmed and deliberate: suspend the account.
- Log your reasoning in the moderation note either way; impersonation
  disputes are exactly the kind of case someone may later ask you to
  justify.

## 6. Restriction vs suspension

Both are account-level actions (`restrict_account`/`unrestrict_account`,
`suspend_account`/`unsuspend_account`), and both are yours to apply by
judgement; use this as your working distinction:

- **Restrict.** A warning-level step for a first offence that is real but
  not severe, or where an account is showing an early pattern (repeated
  spam, one confirmed harassment incident, a body-content post that looks
  like a one-off lapse rather than a habit). The account stays visible;
  you are marking it as one strike, and future reports against it should
  be read in that light.
- **Suspend.** For anything severe on its own (deliberate impersonation,
  targeted harassment, a clear pattern of harmful body or eating content)
  or anything that repeats after a restriction. Treat suspension as the
  action you take when you no longer trust the account to self-correct.

Neither action is reversible by the user themselves; both have an
`unrestrict`/`unsuspend` counterpart for you to use once you are satisfied
the concern has passed (an appeal by email, a mistaken action on your
part, or time served on a lighter case).

## 7. Undoing a mistaken auto-hide

Three distinct reports auto-hide a post, comment or programme before any
moderator has looked at it, which will sometimes catch something that
did not deserve it (a pile-on report, a joke misread by three people at
once). To undo it: open the report in the queue, use `unhide_content`,
and either dismiss the report (if it was simply wrong) or actioned-and-
dismiss with a note explaining why it was restored. The unhide is logged
exactly like every other action, so the record shows both that it was
hidden and that you put it back, with your reasoning.

## 8. The audit log

Every moderation action (dismiss, hide, unhide, delete, restrict,
unrestrict, suspend, unsuspend) writes a row to
`community_moderation_log`: who did it, when, what action, against which
report and target, and your note. It is reachable from the moderation
queue screen. There is no separate export or admin dashboard for it
today; treat the in-app log itself as the record.

## 9. Monthly review

Once a month, look back over the queue and the log together and check
for: any report reason trending upward (a signal the risk assessment's
category ratings may need revisiting, see
`ILLEGAL-CONTENT-RISK-ASSESSMENT.md` §6), repeat reporters or repeat
offenders worth a pattern note, and whether the shared keyword filter
needs a term added given what has actually been reported. This monthly
look is also the natural moment to notice if any of the risk assessment's
review triggers have been hit early.
