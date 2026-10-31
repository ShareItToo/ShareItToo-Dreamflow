# WP95 — Startup session-future stability

Status: **COMPLETE FOR CURRENT-SOURCE STARTUP STABILITY; NOT PHYSICAL-CANDIDATE
EVIDENCE.**

The startup root now owns one session-load future for its full mounted
lifetime. Inherited-widget and parent rebuilds therefore cannot issue a second
pending session read or replace the visible startup state with a fresh loader.
This is a source correction to an identified rebuild hazard, not a delay,
cache or timing workaround.

The new widget test holds the first session read, triggers an unrelated parent
rebuild, and proves that the loader was called exactly once. It disposes its
own test tree before the unrelated real first-launch timer can begin. The test
is part of complete technical regression.

WP95 changes no remote, account, session, provider, Pixel, OnePlus, Store,
Production, payment or merge state. It is a future-source correction and
cannot be transferred to the direct-APK Pixel candidate currently under
physical evidence.
