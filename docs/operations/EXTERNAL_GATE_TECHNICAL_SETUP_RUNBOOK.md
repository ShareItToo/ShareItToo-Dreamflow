# External gate technical setup runbook

Status: technically prepared, all external gates remain `HOLD` / `NO-GO`.

This runbook gathers the existing Legal, Operations, Device, Firebase, Support
Evidence Scanner/Upload Policy, PSP, Privacy/Retention, Store, Economics and
Pilot gates into one setup sequence. The cross-cutting active-provider
readiness also binds the existing Legal and Privacy/Retention gates to the
classified hosting and transactional-mail processors. It does not add a
twelfth top-level gate, replace a canonical runbook or authorize an external
change. The machine source is
`docs/evidence/external-gates/technical-setup-manifest.json`.

## Current preflight

From the repository root:

```sh
node tool/validate_external_gate_setup.mjs
```

Expected result: `prepared-hold`, eleven technically prepared gates, zero
externally ready gates, 167 mapped Support scenarios, 47 externally open
Support scenarios, eight open scanner/upload decisions, five classified active
processors, two newly explicit processor inventories, ten open active-provider
decisions and `hold-no-go`.

The cross-cutting provider preflight is also green only in prepared/HOLD mode:

```sh
node tool/validate_active_infrastructure_mail_provider_readiness.mjs
```

It must report five classified active processors, with Hostinger VPS and the
Google Workspace SMTP relay explicitly present in both the Privacy and
Retention inventories, and zero of ten external decisions complete.

The final check is intentionally red today:

```sh
node tool/validate_external_gate_setup.mjs --require-ready
node tool/validate_active_infrastructure_mail_provider_readiness.mjs --require-ready
```

Never weaken that failure. After authentic external evidence exists, update
the canonical gate artifact first, add only a sanitized evidence reference,
then update this manifest and its validator in a reviewed commit.

## Configuration sequence with Walid

1. **Legal, operator and active providers:** send the prepared 18-decision
   V5.2/G3 intake to an independent professional reviewer. Reconcile the ten
   hosting/SMTP decisions in
   `docs/operations/ACTIVE_INFRASTRUCTURE_AND_MAIL_PROVIDER_RUNBOOK.md`,
   including contract/DPA, seat/region, transfer, retention/deletion and
   incident/exit facts. Record no reviewer name, account identifier or contact
   data in Git. Final operator/imprint/provider facts, approved hashes and
   public text remain external evidence.
2. **Operations:** choose the authoritative company system, assign six primary
   roles and six distinct delegates, verify RBAC/MFA, then run four real
   72-hour absence tests. Git receives opaque evidence references only.
3. **Apple/iOS:** only after Walid explicitly accepts any membership cost,
   install/select full Xcode and CocoaPods, confirm Apple agreements/signing,
   create the app record and run a physical iPhone/TestFlight matrix. Android
   current-source direct-device evidence is already passed; Store installation
   remains separate.
4. **Firebase:** while Walid is present in the owner account, confirm current
   terms and the required FCM/APNs, deletion/retention and Maps-key controls.
   Never copy keys or account identifiers into chat or Git.
5. **Support Evidence Scanner/Upload Policy:** choose a reviewed managed or
   self-hosted malware scanner, approve provider/security/privacy facts, file
   size and MIME rules, Retention/Legal Hold, operator procedures and exact
   candidate/environment binding. Keep intake disabled and use only synthetic
   files until every decision passes the dedicated runbook.
6. **PSP:** select and contract a licensed marketplace product, obtain the DPA,
   region/transfer and professional checkout evidence, place test credentials
   only in an approved secret store, then run the existing eight sandbox
   scenarios. Sandbox is not real-money authorization.
7. **Privacy/Retention:** decide the six Privacy/form questions and ten
   retention/legal-hold periods using professional and owner evidence. Close
   the Hostinger VPS and Google Workspace SMTP relay provider facts only from
   authentic contract, region, transfer, retention and deletion evidence.
   Keep Store questionnaires draft until source, every active processor and
   final binary facts agree.
8. **Store:** Google Play account setup is already ready. Complete the real
   closed-test requirement, protected review-account fields, final binary and
   accessibility matrix. Apple remains blocked by step 3. Do not upload or
   submit merely because metadata validates.
9. **Economics:** enter authentic provider fees, VAT component, Cloud costs,
   founder hours/replacement rate and attribution evidence. An unavailable
   value is never zero and planning targets are never observed results.
10. **Pilot envelope:** only after the four P0B prerequisites are green, prepare
   the exact invited Spiegelberg Cat8 synthetic-payment roster and region
   configuration. Keep public registration, G3/G4/G5, live provider traffic
   and real money disabled.
11. **Activation:** Walid makes a separate explicit decision last. Technical
    readiness, account login or the existence of credentials is never that
    decision. The exact 47-scenario Public Launch and Real Money hold must also
    be zero before a release-ready claim.

## Data and cost boundary

Do not store names, emails, account IDs, device IDs, credentials, secrets,
payment details, tester rosters or private filesystem paths in the manifest.
Do not start a paid membership, subscription or contract without Walid's
specific cost approval. Do not change production, VPS, Cloud/DNS, Payment,
Store, pilot, public activation or real-money state while using this runbook.
