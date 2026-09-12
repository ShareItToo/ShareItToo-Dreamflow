# WP05 background-family contrast correction

## Outcome

The confirmed Pixel P1 is corrected at implementation commit
`833dfc1361cef532b1fe7394b79de581776377bb`. An explicit Dark 1/Dark 2
choice now selects the dark Material theme, and an explicit Light 1/Light 2
choice selects the light Material theme. The chosen image, scrim, foreground,
navigation and component colors therefore remain in the same contrast family.
A new full-width, 48 dp system-default action clears the persisted selection
and returns to `ThemeMode.system`.

The four supplied background assets are unchanged. The selector now exposes
exact button/selected semantics, current-theme borders and family-aware preview
labels with an opaque-enough backing surface. This is a bounded correction, not
a global theme redesign.

## Verification

Controller and widget tests pass 2/2. The combined background and established
accessibility-resilience lane passes 7 tests with one declared profile skip;
the relevant wiring/resilience tools pass 4/4. Focused analysis reports zero
issues, the diff check passes and the working-tree secret scan finds no
high-confidence secret.

The complete technical regression passes through the maintained private
version-2 Android build profile: the default Flutter suite and all mandatory
profiles pass, analyzer remains at zero issues, Web including Wasm dry run
builds, the loopback smoke passes, and Android debug reaches minSdk 24 while
the release-surface guard remains valid. Visible Gradle deprecation warnings
come from dependency-owned build files; no new SIT-owned Android warning was
introduced.

Machine-readable evidence is retained in
`docs/evidence/release-readiness/wp05-background-family-contrast-local-20260905.json`.

## Candidate boundary and next step

Signed candidate `1.0.0+2026090407` and all of its local, Pixel, FCM,
two-role and GitHub evidence remain immutable. It predates this correction and
must not be promoted as containing it.

Next, freeze one strictly newer Staging/internal Android candidate from the
corrected source. Run exact clean-checkout reproducibility and the matched
signed lifecycle, perform only a data-preserving Pixel update, and repeat the
private candidate-generic visual matrix in system light/dark and all four
background choices. GitHub Regression and CodeQL must then pass on that exact
successor source before its closure is claimed.

OnePlus, Google Play, production, public registration, Binding V5.2 activation,
provider configuration, live money and PR merge remain unchanged and outside
this correction.
