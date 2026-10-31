# WP166 — Product-safety Article 9 field guard

The current product-safety intake now sends the user-facing summary,
product identification, risk description and injury flag through the same
server-side Article 9 default-deny guard. A possible medical or injury signal
in any one of those fields returns
`support_article9_server_authorization_required` before the support case
insert, event, audit or any forwarding step.

Neutral product-safety reports remain recordable. This is a current source
change only; it is not a Staging deployment or provider/legal authorization.
Historical WP158, WP165 and Play handoff observations remain unchanged.
