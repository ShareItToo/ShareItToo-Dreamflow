# ADR-061: Support-case semantic order and empty blocked filter

Status: accepted as a non-live technical control on 22.08.2026. It does not
authorize a signed candidate, Store submission, production or public use.

## Context

Drive scenarios `SUP-143` through `SUP-152` require understandable status and
decision text, prominent user action, screen-reader and keyboard usability,
large-text resilience, visible appeal/review information and no empty blocked
filter. The underlying canonical case and decision projections already exist;
the remaining gap is explicit, test-bound presentation behavior.

## Decision

- Preserve server-authoritative state and map only supported values to German
  user labels; do not expose raw fallback codes.
- Keep the waiting-user action/deadline and the five final-decision meanings as
  visually and semantically separate blocks.
- Use widget-order traversal for case cards, native button activation, one
  labelled card container and semantic headings for information sections.
- Exclude decorative icons and timeline dots while retaining textual status
  semantics so color never carries the state alone.
- Bind two-times text scaling, keyboard activation and a 48 logical-pixel
  minimum case-card target in widget tests.
- Keep `Blockiert` conditional on actual blocked users and normalize an empty
  stale selection back to the active view.

## Consequences

The same canonical case truth is easier to understand through touch, keyboard
and accessibility services without adding a parallel workflow or leaking
internal codes. Automated coverage guards the layout and semantics but cannot
prove physical-device TalkBack or VoiceOver quality. That manual evidence
remains a separate signed-device/release gate.
