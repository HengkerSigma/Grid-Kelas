# Mentari forum parser — read-only audit

## Scope

This change adds a pure, read-only parser for the forum response shape observed in Mentari. It does not call Mentari, expose an HTTP route, persist response data, modify \`course_updates\`, write attendance, or change task-review status.

## Observed structure

- The lecturer's root post uses \`post_type: TOPIC\` and \`reply_level: 0\`.
- A student's direct contribution uses \`post_type: REPLY\`, \`reply_level: 1\`, and \`id_parent\` equal to the root topic ID.
- A nested conversation reply uses \`post_type: REPLY\`, \`reply_level: 2\` (or deeper), with \`id_parent\` pointing to the previous post.
- \`id_trx_course_sub_section\` identifies the section transaction in the observed payload; it did not distinguish individual chat threads in the 15-question example.

## Supported structural rules

- \`direct_replies\`: count unique level-1 student replies directly attached to the selected topic.
- \`distinct_questions\`: count those same direct posts as candidate questions, but do not claim that separate chat/thread requirements have been met unless a distinct chat identity is independently established.

The rule is supplied by a trusted caller/configuration. This module does not infer thresholds or attendance rules from free-form lecturer instructions.

## Safety behavior

- \`dataComplete\` defaults to \`false\`. The observed response did not expose pagination or completeness metadata, so a caller must establish completeness independently.
- Duplicate post IDs are counted once.
- Nested replies, lecturer posts without a student NIM, other topic parents, and mismatched section IDs are excluded from the direct-post count.
- The audit output omits post content, student names, email addresses, and phone numbers. NIM is retained only as the grouping key for the caller's per-student audit.
- Meeting a numeric count returns \`count_met_needs_review\`, not an attendance decision. Content relevance and lecturer acceptance cannot be determined from structure alone.
- A 15-post count with a separate-chat requirement returns \`chat_separation_unverified\` because no verified chat-identity field has been found.
- No output from this module may directly update attendance. Manual attendance remains outside this parser's scope.

## Verification

Run the focused tests with:

\`\`\`sh
node --test tests/mentari/forum-parser.test.js
\`\`\`
