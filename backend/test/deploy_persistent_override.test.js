import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const deployScript = new URL('../ops/deploy_release.sh', import.meta.url);

test('deployment image overrides remain persistent, owner-restricted and nonsymlinked', () => {
  const source = readFileSync(deployScript, 'utf8');

  assert.match(source, /task_runtime_override_dir=''/u);
  assert.match(source, /task_backend_root\/\.runtime-overrides/u);
  assert.match(source, /Runtime override directory must be a regular directory/u);
  assert.match(source, /Runtime override directory is unsafe/u);
  assert.match(source, /install -d -m 700 "\$task_runtime_override_dir"/u);
  assert.match(source, /chmod 700 "\$task_runtime_override_dir"/u);
  assert.match(
    source,
    /mktemp "\$task_runtime_override_dir\/\$\{task_environment\}-\$\{task_commit:0:12\}-\$\{task_override_kind\}-XXXXXX\.yml"/u,
  );
  assert.equal((source.match(/chmod 600 "\$task_(?:deployment|rollback)_override"/gu) ?? []).length, 2);
  assert.match(source, /task_deployment_override_retained=true/u);
  assert.match(source, /task_rollback_override_retained=true/u);
  assert.match(
    source,
    /"\$task_deployment_override_retained" != true[\s\S]*rm -f -- "\$task_deployment_override"/u,
  );
  assert.match(
    source,
    /"\$task_rollback_override_retained" != true[\s\S]*rm -f -- "\$task_rollback_override"/u,
  );
  assert.doesNotMatch(source, /task_deployment_override="\$\(mktemp\)"/u);
  assert.doesNotMatch(source, /task_rollback_override="\$\(mktemp\)"/u);
});
