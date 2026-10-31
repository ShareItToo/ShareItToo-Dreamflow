// Repository-owned defaults for unit-test module loading. CI and explicit
// integration environments retain authority because existing values are never
// overwritten.
process.env.JWT_SECRET ??= `local-test-only-${'x'.repeat(40)}`;
process.env.DATABASE_URL ??= 'postgresql://127.0.0.1:1/sit_test';
