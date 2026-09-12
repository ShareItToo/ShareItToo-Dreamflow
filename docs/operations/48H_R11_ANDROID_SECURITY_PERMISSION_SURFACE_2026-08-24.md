# 48H R11 Android security and permission surface

Status: **VERIFIED — EXACT GITHUB REGRESSION, CODEQL AND CODE SCANNING PASSED**

R11 audits the actual merged Android debug APK produced by the unchanged full
technical gate. It parses the compiled binary manifest and resources through
Android build-tools `aapt`; it does not infer the result from the source
manifest alone. The retained artifact is bound to implementation head
`9ec9c62c7ca806e16ab5beb354e4872b3f513e13`, application
`com.shareittoo.app`, version `1.0.0+2026082302`, compile/target SDK 35 and
minSdk 24.

The surface contains exactly 14 reviewed permissions. Camera, coarse/fine
location and notifications remain runtime permissions. Broad Android 13+
media access is absent; legacy read access is capped at API 32 and legacy write
access at API 28. Background location, contacts, call log, phone, SMS,
microphone, all-packages, usage statistics, advertising ID and Privacy Sandbox
permissions are absent.

The merged manifest contains 12 activities, 13 services, seven receivers and
eight providers. Exactly eight components are exported. Firebase messaging and
instance-ID receivers, Google revocation service and the profile installer are
protected by their platform/vendor permissions. The remaining exported
activities are the reviewed app launcher/deep-link activity and the Firebase/
Facebook authentication return activities. Every provider is non-exported.

All seven Browsable routes are inventory-hash bound: three verified HTTPS app
link hosts under exact `/api/v1/open/` prefixes, the SIT custom scheme, two
Firebase authentication return schemes and the Facebook custom-tab return.
The FCM notification click action discovered during R11 is now package-scoped
end to end as `com.shareittoo.app.SIT_NOTIFICATION_CLICK` instead of the former
global action name.

The three URI-granting FileProviders are non-exported, package-authority bound
and tied to their exact compiled path XML. Share and printing use dedicated
cache subpaths. Image picker retains its dependency-owned app-cache scope for
camera capture, but it is non-exported and grants only explicit URI access.
Package visibility is limited to PROCESS_TEXT `text/plain`, GET_CONTENT `*/*`
and the Facebook app package; QUERY_ALL_PACKAGES is absent.

Backup is disabled and both legacy and Android 12+ rules exclude root, files,
databases, shared preferences and external app storage. Cleartext is disabled,
legacy external storage is absent and no custom network-security configuration
weakens the platform default. `debuggable=true` is expected only because this
is the non-installed Stage-A test artifact; R11 makes no signed-release claim.

Firebase Messaging, Authentication and Crashlytics SDK components are present,
while Messaging auto-init, Analytics collection and Crashlytics collection are
all default-off. No Analytics SDK registrar/marker or OpenAI API origin is in
the compiled runtime payload. The production backend default string remains
compiled for the existing release configuration but is inactive in this debug
artifact; backend activation defaults false. External AI, real payment, public
G3/G4/G5 and Support evidence scanner/upload remain disabled. Support evidence
intake defaults false, is forbidden in Production, and has scanner transport
`none`.

The auditor and validator are wired into every complete technical regression.
Any permission, component, intent, FileProvider path, package-visibility,
backup/network, Firebase or disabled Stage-A surface drift now fails. No APK was
installed, retained for delivery, uploaded or published; no Production, VPS,
Cloud, Firebase console, Store, payment, credential, account or PR-merge action
occurred. Exact verified head
`edf6a0a4ebcdcdfb2af8dae12cbdf0d24e82586f` passed Regression
`32770744048`, including PostgreSQL, Backend, Flutter and the isolated clean
R10 reproducibility job, CodeQL workflow `32770744022` and Code Scanning check
`97570928981` with zero new alerts. Signed-candidate, parallel-stress and API
publication remained skipped; PR #7 stayed Draft, open and unmerged. The
separate GitGuardian result remains the documented pre-existing 250-commit
history finding; no credential detail was inspected. R11 is closed and R12
follows.
