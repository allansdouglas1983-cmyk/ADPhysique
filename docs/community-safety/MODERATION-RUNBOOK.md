# Moderation Runbook: Volyume Community

**For the founder.** How reports arrive, what to do with each reason, and
how the audit trail works.

Authority: `docs/social-discovery-2026-09-06/30-BLUEPRINT.md` §§3, 6, 11;
`40-DECISIONS.md` SD-11; `docs/social-discovery-2026-09-06/
70-DISCOVERY-BLUEPRINT.md` §§2, 6, 11; `40-DECISIONS.md` SD-21, SD-25.
Every Section 2 CLAUDE.md inviolable (ED-safety, data minimisation) binds
moderation action, same as everywhere else in the app.

---

## 1. How reports arrive

A user reports a profile, post, comment, programme or **message** from
its `...` menu or its Report sheet. This writes a row to
`community_reports` with a reason, an optional detail, and (for
post/comment/programme/message) the content's owner. It appears in the
in-app **moderation queue**
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
| `spam` | Repetitive, promotional, or clearly automated content, including a stream of connection requests sent to many strangers with the same or near-identical note | Hide the content; if the account shows a pattern across multiple items **or across multiple connection request notes**, restrict it |
| `harassment` | Targeting, threats, hate directed at a person, in a comment, a caption, or now a message | Hide the content; restrict the account on a first confirmed instance, suspend on repeat (Section 5 covers messages specifically) |
| `impersonation` | Claiming to be Volyume, a moderator, or another real person | See Section 7 below |
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
   restrict-then-suspend escalation (Section 8), not a per-post-only
   response, since the ED-safety cost of leaving a pattern up is higher
   than for most other reasons.

## 5. Message reports

Reports against a message write to `community_reports` with target kind
`message`. Because a message can be hard-deleted by its sender at any
time, the moderation queue must show enough of the conversation at the
moment the report was filed to make sense of it, not just the one line.

**What you see for a message report:**
- The reported message itself, in full.
- Its conversation context: the five messages either side of it (up to
  five before, up to five after, fewer if the conversation is shorter),
  so you can read the exchange rather than one line out of context.
- Both participants' handles, so you can see who sent what.

**Default action.** Read the message and its context together before
acting; a single line rarely tells the whole story in a conversation.
Hide the reported message (`hide_content`) if it breaches the rules on
its own reading. If the surrounding context shows a pattern rather than a
one-off, treat the account under the harassment escalation below rather
than acting on the single message alone.

**Harassment escalation for messages.** The same restrict-then-suspend
distinction in Section 8 applies, with one addition specific to a private
channel: because a person can also block or remove the connection
themselves the moment a message troubles them (which closes the
conversation instantly, for both people, without waiting on you), your
job is the account-level pattern, not emergency triage of a single
message. Restrict on a first confirmed instance of message-based
harassment; suspend on repeat, or immediately if the content is severe on
its own (threats, targeted abuse, anything that would suspend on sight in
any other content type).

## 6. Meet-up harm reports

Some reports, most often reason `other` with a free-text detail, or
`harassment`, describe harm connected to meeting someone in person after
finding them through Community (a connection, a message exchange, or the
training partner flag). There is no separate reason code for this in the
report enum; watch the detail text on any report, whichever reason box
was ticked, for language describing a meeting, not just online content.

**Treat any such report as priority, alongside harmful body or eating
content (Section 4):** it sorts to the top of your own attention even
though the system does not auto-flag it as `priority` the way Section 4
is flagged. Read the detail first. Because the underlying harm happened
outside the app, your moderator action is still content-and-account only
(hide the offending messages or posts, restrict or suspend the account);
it does not extend to anything you cannot see or control off-platform.
If the report describes something that may be a crime, the existing
"never provide diet or clinical advice" discipline from Section 4 point 3
extends here too: never advise the reporter on how to handle it
yourself; the published contact (support@volyume.app) and, if the
reporter needs it, the police, are the right next step for them, not a
moderator opinion in the app.

## 7. Impersonation

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

## 8. Restriction vs suspension

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

## 9. Undoing a mistaken auto-hide

Three distinct reports auto-hide a post, comment or programme before any
moderator has looked at it, which will sometimes catch something that
did not deserve it (a pile-on report, a joke misread by three people at
once). To undo it: open the report in the queue, use `unhide_content`,
and either dismiss the report (if it was simply wrong) or actioned-and-
dismiss with a note explaining why it was restored. The unhide is logged
exactly like every other action, so the record shows both that it was
hidden and that you put it back, with your reasoning.

## 10. The audit log

Every moderation action (dismiss, hide, unhide, delete, restrict,
unrestrict, suspend, unsuspend) writes a row to
`community_moderation_log`: who did it, when, what action, against which
report and target, and your note. It is reachable from the moderation
queue screen. There is no separate export or admin dashboard for it
today; treat the in-app log itself as the record.

## 11. Monthly review

Once a month, look back over the queue and the log together and check
for: any report reason trending upward (a signal the risk assessment's
category ratings may need revisiting, see
`ILLEGAL-CONTENT-RISK-ASSESSMENT.md` §6), repeat reporters or repeat
offenders worth a pattern note, whether the shared keyword filter needs a
term added given what has actually been reported, and, now that
connections and messaging exist, whether connection-request abuse
(spam-pattern notes, repeated requests to strangers) or message reports
are trending, which is itself a review trigger for
`ILLEGAL-CONTENT-RISK-ASSESSMENT.md` §6. This monthly look is also the
natural moment to notice if any of the risk assessment's review triggers
have been hit early.
