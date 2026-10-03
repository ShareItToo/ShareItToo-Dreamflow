import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { runProbe, parseArgs, contract, toolchain, boundFiles, buildArguments, project,
  artifactDigest, validateArtifact, matrixPlan, validateMatrix, classifyAsset,
  classifyBlockedRequest, networkReasonKeys, validateNetworkDiagnostic, ownsBuildGroup,
  launchArgs, privilegeArgs, validateInventory, validateNetwork, validateCleanup,
  requireRenderedText, classifyTextObservation, validateTextDiagnostic } from '../support/mission_quorum_web_browser_v2.mjs';

const head = 'a'.repeat(40);
const sha = 'b'.repeat(64);
const counts = () => Object.fromEntries(networkReasonKeys.map(k => [k, 0]));
const matrix = () => matrixPlan.map(row => ({ ...row, disclosure: row.scenario !== 'unavailable',
  geometry: true, keyboard: row.scenario === 'unavailable' ? 'not_applicable' : true,
  reset: row.scenario === 'unavailable' ? 'not_applicable' : true,
  screenshotSha256: row.step.toString(16).padStart(64,'0') }));
const artifact = () => {
  const files = ['flutter_bootstrap.js', 'index.html', 'main.dart.js'].map(path => ({ path, sha256: sha, bytes: 1 }));
  const sourceHashes = Object.fromEntries(boundFiles.map(p => [p, sha]));
  return { schemaVersion: 1, sourceHead: head, sourceHashes, sourceDigest: artifactDigest(sourceHashes),
    lockSha256: sha, projectDigest: sha, toolchain: { ...toolchain }, files, artifactDigest: artifactDigest(files) };
};
const inventory = () => ({ platform:'linux', ...contract, head, clean:true, uid:1001, gid:1001,
  digests:{runnerSha256:sha,chromeSha256:sha,nodeSha256:sha} });
const cleanup = () => ({processesAbsent:true,groupAbsent:true,namespaceRemoved:true,resolverRemoved:true,
  portClosed:true,profileRemoved:true,exitCode:0,exitSignal:null});
const fake = overrides => ({ inventory: async()=>inventory(), build:async()=>artifact(),
  prepare:async()=>({links:['lo'],routes4:[],routes6:[],resolverEmpty:true}),
  observe:async()=>({browser:`Chrome/${contract.chrome}`,protocol:'1.3',httpStatus:200,
    artifactDigest:artifact().artifactDigest,sourceDigest:artifact().sourceDigest,sourceHead:head,
    targetCounts:{pageBlank:1,pageOther:0,browserUi:2,extension:0,serviceWorker:0,other:0},
    evaluated:true,workerPrivileges:true,externalTcp:'ENETUNREACH',loopback:200,
    renderers:[{uid:1001,gid:1001,seccomp:2,filters:1,noNewPrivs:1,capabilities:'0000000000000000',nestedPidNamespace:true,forbiddenFlags:false}],
    matrix:matrix(),reloadReset:true,networkCounts:counts(),blockedUnexpected:0}),
  cleanup:async()=>cleanup(), ...overrides });

test('one exact mode/head only; no arbitrary URL/profile/port/flags',()=>{
  assert.equal(parseArgs(['--synthetic-v2-browser','--source-head',head]),head);
  for(const args of [[],['--url','https://private.invalid'],['--synthetic-v2-browser','--source-head','HEAD'],
    ['--synthetic-v2-browser','--source-head',head,'--port','0']])assert.throws(()=>parseArgs(args));
});
test('success is exact scoped sanitized source/artifact evidence only after cleanup',async()=>{
  const journal=[]; const r=await runProbe({expectedHead:head,adapter:fake(),journal:r=>journal.push(r)});
  assert.equal(r.status,'pass');assert.equal(r.evidenceClass,'isolated-synthetic-v2-browser-proof');
  assert.deepEqual(r.boundaries,{product:false,AppRoot:false,auth:false,storage:false,PG:false,deployment:false});
  assert.equal(r.artifact.artifactDigest,artifact().artifactDigest);
  assert.deepEqual(journal.map(r=>r.sequence),journal.map((_,i)=>i+1));
  assert.deepEqual(journal.at(-1),{sequence:journal.length,phase:'cleanup',result:'confirmed'});
  assert.doesNotMatch(JSON.stringify(r),/private|\/tmp\/|pid|portNumber|requestId|https?:/iu);
  assert.deepEqual(Object.keys(r).sort(),['artifact','boundaries','cleanup','evidenceClass','inventory','mode','proof','schemaVersion','sourceHead','status'].sort());
});
test('matrix binds each case/viewport/axis/evidence/QR/fallback, keyboard, reset and screenshots',()=>{
  assert.doesNotThrow(()=>validateMatrix(matrix()));
  for(const mutate of [x=>x.pop(),x=>x.push(x[0]),x=>x[1].width++,x=>x[1].pickup=3,
    x=>x[1].qr=false,x=>x[1].keyboard=false,x=>x[1].reset=false,x=>x[1].geometry=false,
    x=>x[1].screenshotSha256='bad',x=>x.forEach(r=>r.screenshotSha256=sha),
    x=>x[1].screenshotSha256=x[0].screenshotSha256,x=>x[1].private='private',x=>x[0].disclosure=true]){
    const x=matrix();mutate(x);assert.throws(()=>validateMatrix(x));
  }
});
test('matrix expectations derive from exact V2 golden rather than relabelled complete fixtures',()=>{
  const source=fs.readFileSync('test/support/mission_quorum_web_golden_v2.dart','utf8');
  const catalog=JSON.parse(source.match(/r'''([\s\S]*?)'''/u)[1]);
  for(const row of matrixPlan.filter(r=>r.scenario!=='unavailable')){
    const {projection,details}=catalog[row.scenario].envelope;
    assert.equal(projection.status,row.status);
    assert.equal(projection.components[0].axes.acceptance,row.acceptance);
    assert.equal(projection.components[0].axes.dispute,row.dispute);
    assert.equal(details[0].pickup.slots.filter(s=>s.present).length,row.pickup);
    assert.equal(details[0].return.slots.filter(s=>s.present).length,row.returnCount);
    assert.equal(details[0].pickup.verification?.method==='qr_v3',row.qr);
    assert.equal(details[0].return.verification?.method==='six_digit_fallback',row.fallback);
    assert.equal(projection.components.length,2);
  }
});
test('artifact contract rejects drift, extra metadata, wrong SDK and unsafe inventory',()=>{
  assert.doesNotThrow(()=>validateArtifact(artifact()));
  for(const mutate of [x=>x.sourceHead='HEAD',x=>x.sourceHashes.extra=sha,x=>delete x.lockSha256,
    x=>x.toolchain.flutter='other',x=>x.files[0].path='../private',x=>x.files.push(x.files[0]),
    x=>x.files[0].sha256='bad',x=>x.artifactDigest='f'.repeat(64),x=>x.projectDigest='bad']){
    const x=artifact();mutate(x);assert.throws(()=>validateArtifact(x));
  }
});
test('asset admission stays exact local and all external failures have fixed actionable classes',()=>{
  const files=new Set(['index.html','main.dart.js']);
  assert.equal(classifyAsset('https://p7-synthetic.invalid/','Document',files),'index.html');
  assert.equal(classifyAsset('https://p7-synthetic.invalid/main.dart.js','Script',files),'main.dart.js');
  const samples=[['https://fonts.gstatic.com/s/private-tail','flutter_font_fallback_cdn'],
    ['https://accounts.google.com/gsi/client?private-tail','google_identity_script'],
    ['https://www.gstatic.com/firebasejs/private-tail','firebase_js_cdn'],
    ['https://www.gstatic.com/flutter-canvaskit/private-tail','flutter_canvaskit_cdn'],
    ['https://private.invalid/private-tail','other_foreign_origin'],
    ['https://p7-synthetic.invalid/api/private-tail','untracked_asset'],
    ['https://p7-synthetic.invalid/%2e/private-tail','unsafe_path'],
    ['https://p7-synthetic.invalid/main.dart.js?private-tail','query_or_fragment']];
  for(const [url,reason]of samples){assert.equal(classifyAsset(url,'Script',files),null);
    assert.equal(classifyBlockedRequest({method:'GET',url,type:'Script'},files),reason);}
  assert.equal(classifyBlockedRequest({method:'POST'},files),'non_get');
  assert.equal(classifyBlockedRequest({method:'GET',responseStatusCode:302},files),'response_stage');
  assert.equal(classifyBlockedRequest({method:'GET',type:'WebSocket'},files),'websocket');
});
test('diagnostics reject raw/extra/private fields, negative counts and nonmonotone updates',async()=>{
  for(const mutate of [x=>x.url='private-tail',x=>delete x.non_get,x=>x.non_get=-1,x=>x.non_get=1.5,x=>x.non_get=4097]){
    const x=counts();mutate(x);assert.throws(()=>validateNetworkDiagnostic(x));}
  const c=counts();c.google_identity_script=1;
  assert.doesNotThrow(()=>validateNetworkDiagnostic(c,counts()));
  assert.throws(()=>validateNetworkDiagnostic(counts(),c));
  const r=await runProbe({expectedHead:head,adapter:fake({observe:async()=>{throw Error('p7_network');},networkDiagnostic:()=>c})});
  assert.equal(r.code,'p7_network');assert.deepEqual(r.diagnostic,c);assert.doesNotMatch(JSON.stringify(r),/private-tail|url|requestId/u);
});
test('every failure cleans and remains actionable; failed resource cleanup wins over primary error',async()=>{
  for(const stage of ['inventory','build','prepare','observe']){
    let cleaned=0;const r=await runProbe({expectedHead:head,adapter:fake({[stage]:async()=>{throw Error('probe_timeout');},
      cleanup:async()=>{cleaned++;return{...cleanup(),exitCode:1};}})});
    assert.equal(r.code,'probe_timeout');assert.equal(cleaned,1);
  }
  const r=await runProbe({expectedHead:head,adapter:fake({observe:async()=>{throw Error('p7_matrix');},
    cleanup:async()=>({...cleanup(),profileRemoved:false})})});
  assert.equal(r.code,'probe_cleanup');assert.equal(r.diagnostic.profileRemoved,false);
});
test('inventory/network/privilege/normal-exit constraints remain closed',()=>{
  assert.doesNotThrow(()=>validateInventory(inventory(),head));
  for(const k of ['imageOS','imageVersion','node','chrome','arch']){const x=inventory();x[k]='other';assert.throws(()=>validateInventory(x,head));}
  assert.throws(()=>validateInventory({...inventory(),digests:{runnerSha256:sha}},head));
  assert.throws(()=>validateNetwork({links:['lo','eth0'],routes4:[],routes6:[],resolverEmpty:true}));
  assert.throws(()=>validateCleanup({...cleanup(),exitCode:1}));
  assert.doesNotThrow(()=>validateCleanup({...cleanup(),exitCode:1},false));
  assert.throws(()=>privilegeArgs(0,1));assert.ok(privilegeArgs(1,1).includes('--no-new-privs'));
  assert.doesNotMatch(launchArgs('/tmp/synthetic').join(' '),/--no-sandbox|disable-setuid|ignore-certificate|proxy|host-resolver/u);
});
test('PID/PGID reuse cannot authorize cleanup of another process group',()=>{
  const id={id:23,start:'101',known:[{pid:23,start:'101'},{pid:24,start:'102'}]};
  assert.equal(ownsBuildGroup(id,[{pid:23,group:23,start:'101'}]),true);
  assert.equal(ownsBuildGroup(id,[{pid:24,group:23,start:'102'}]),true);
  assert.equal(ownsBuildGroup(id,[{pid:23,group:23,start:'999'}]),false);
  assert.equal(ownsBuildGroup(id,[{pid:25,group:23,start:'999'}]),false);
  const source=fs.readFileSync('test/support/mission_quorum_web_browser_v2.mjs','utf8');
  assert.match(source,/ownBuildGroup\(child\.pid\)/u);
  assert.match(source,/ownBuildGroup\(group\)/u);
  assert.doesNotMatch(source,/process\.kill\(-child\.pid|signalOwned\('-TERM', -group/u);
});
test('minimal project copies V2 view/golden exactly and has only locked Flutter+crypto/fonts',()=>{
  const bytes=Object.fromEntries(boundFiles.map(p=>[p,fs.readFileSync(p)])); const p=project({bytes});
  assert.deepEqual(p['lib/mission_quorum_web_preview_v2.dart'],bytes['test/support/mission_quorum_web_preview_v2.dart']);
  assert.deepEqual(p['lib/mission_quorum_web_golden_v2.dart'],bytes['test/support/mission_quorum_web_golden_v2.dart']);
  assert.match(p['pubspec.yaml'],/family: Roboto/u);assert.match(p['pubspec.yaml'],/Roboto-Bold.ttf/u);
  assert.doesNotMatch(Object.values(p).filter(v=>typeof v==='string').join('\n'),/firebase|google_sign_in|package:lendify|SharedPreferences|http:/u);
  assert.ok(buildArguments.includes('--no-web-resources-cdn'));assert.ok(buildArguments.includes('--pwa-strategy=none'));
});
test('source locks cleanup, bounded phases and no runtime/provider wiring',()=>{
  const s=fs.readFileSync('test/support/mission_quorum_web_browser_v2.mjs','utf8');
  assert.match(s,/60000/u);assert.match(s,/no-new-privs/u);assert.match(s,/ownsBuildGroup/u);
  assert.match(s,/Fetch.failRequest/u);assert.doesNotMatch(s,/Fetch.continueRequest|ignore-certificate-errors'|--no-sandbox'/u);
  assert.match(s,/Emulation.setDeviceMetricsOverride/u);assert.match(s,/Input.dispatchKeyEvent/u);
  assert.match(s,/Accessibility.getFullAXTree/u);assert.match(s,/Page.captureScreenshot/u);
  for(const heading of ['Position 1 · Synthetischer Eigentümer 1','Position 2 · Synthetischer Eigentümer 2'])
    assert.ok(s.includes(heading));
  assert.match(s,/await renderedText\(heading\)/u);
  assert.match(s,/await renderedText\(`\$\{name\}: \$\{count\}\/4 synthetische Foto-Slots`\)/u);
  assert.doesNotMatch(s,/await visible\(heading\)|await visible\(`\$\{name\}: /u);
  assert.match(s,/scroll: \(\)=>wheel\(250\)/u);
  assert.match(s,/scroll\?await visible\(label\):await point\(label\)/u);
  assert.match(s,/--offline/u);assert.match(s,/--enforce-lockfile/u);assert.match(s,/Browser.close/u);
});
test('static AX text is read after bounded scroll, without requiring a clickable DOM node',async()=>{
  const label='Position 1 · Synthetischer Eigentümer 1';let reads=0;let wheels=0;let guards=0;
  await requireRenderedText(label,{readText:async()=>++reads<3?'other':`other\n${label}\naxis`,
    scroll:async()=>{wheels++;},safe:()=>{guards++;}});
  assert.equal(reads,3);assert.equal(wheels,2);assert.equal(guards,3);
  reads=0;wheels=0;
  await assert.rejects(requireRenderedText(label,{readText:async()=>{reads++;return `${label} private-tail`;},
    scroll:async()=>{wheels++;},safe:()=>{}}),/^Error: p7_matrix$/u);
  assert.equal(reads,18);assert.equal(wheels,17);
  for(const value of [`prefix ${label}`,`${label} suffix`,'Position 2 · Synthetischer Eigentümer 2'])
    await assert.rejects(requireRenderedText(label,{readText:async()=>value,scroll:async()=>{},safe:()=>{}}),/^Error: p7_matrix$/u);
  let scrolled=false;
  await assert.rejects(requireRenderedText(label,{readText:async()=>label,scroll:async()=>{scrolled=true;},
    safe:()=>{throw Error('p7_network');}}),/^Error: p7_network$/u);
  assert.equal(scrolled,false);
});
test('heading diagnostics classify exact boundaries without emitting text or admitting flattened labels',async()=>{
  const label='Position 1 · Synthetischer Eigentümer 1';
  assert.deepEqual(classifyTextObservation(label,`other\n${label}\nPflichtkomponente`,false),
    {exact_ax_line:1,exact_dom_label_line:0,flattened_ax_boundary_match:0,absent:0});
  assert.deepEqual(classifyTextObservation(label,`${label} Pflichtkomponente Verfügbarkeit: unbekannt`,true),
    {exact_ax_line:0,exact_dom_label_line:1,flattened_ax_boundary_match:1,absent:0});
  for(const text of [`${label} private-tail Pflichtkomponente`,`prefix ${label} Pflichtkomponente`,
    'Position 11 · Synthetischer Eigentümer 1 Pflichtkomponente',`${label} Pflichtkomponente-private-tail`])
    assert.deepEqual(classifyTextObservation(label,text,false),
      {exact_ax_line:0,exact_dom_label_line:0,flattened_ax_boundary_match:0,absent:1});
  let reads=0;let domReads=0;let scrolls=0;const diagnostics=[];
  await assert.rejects(requireRenderedText(label,{readText:async()=>{reads++;return `${label} Pflichtkomponente`;},
    scroll:async()=>{scrolls++;},safe:()=>{},readDomExact:async()=>{domReads++;return true;},
    onFailure:d=>diagnostics.push(d)}),/^Error: p7_matrix$/u);
  assert.equal(reads,18);assert.equal(domReads,18);assert.equal(scrolls,17);assert.equal(diagnostics.length,1);
  assert.deepEqual(diagnostics[0],{observations:18,exact_ax_line:0,exact_dom_label_line:18,flattened_ax_boundary_match:18,absent:0});
  assert.doesNotMatch(JSON.stringify(diagnostics),/Position|private-tail|https:|nodeId|path/u);
  let observed=false;
  await requireRenderedText(label,{readText:async()=>label,scroll:async()=>{throw Error('unexpected');},safe:()=>{},
    readDomExact:async()=>{observed=true;return false;},onFailure:()=>{throw Error('unexpected');}});
  assert.equal(observed,false); // An already passing exact AX line is unchanged.
  const second='Position 2 · Synthetischer Eigentümer 2';
  assert.equal(classifyTextObservation(second,`${second} Optionale Komponente`,false).flattened_ax_boundary_match,1);
});
test('text diagnostic validator rejects extra keys, unsafe values and impossible count shapes',()=>{
  const good={observations:18,exact_ax_line:0,exact_dom_label_line:18,flattened_ax_boundary_match:18,absent:0};
  assert.deepEqual(validateTextDiagnostic(good),good);
  for(const mutate of [d=>d.url='private',d=>delete d.absent,d=>d.exact_dom_label_line=-1,
    d=>d.absent=19,d=>d.observations=17,d=>d.exact_ax_line=1,d=>d.absent=0.5,
    d=>d.absent='0',d=>d.absent=true,d=>d.absent=NaN,d=>d.absent=Infinity,
    d=>{d.exact_dom_label_line=0;d.flattened_ax_boundary_match=0;}]){
    const d={...good};mutate(d);assert.throws(()=>validateTextDiagnostic(d),/^Error: probe_failure$/u);
  }
});
test('only a primary p7_matrix failure carries the one validated heading diagnostic',async()=>{
  const diagnostic={observations:18,exact_ax_line:0,exact_dom_label_line:0,flattened_ax_boundary_match:0,absent:18};
  const adapter=code=>fake({observe:async()=>{throw Error(code);},textDiagnostic:()=>diagnostic});
  const r=await runProbe({expectedHead:head,adapter:adapter('p7_matrix')});
  assert.equal(r.code,'p7_matrix');assert.deepEqual(r.diagnostic,diagnostic);
  assert.deepEqual(Object.keys(r).sort(),['schemaVersion','mode','status','code','diagnostic'].sort());
  const other=await runProbe({expectedHead:head,adapter:adapter('p7_render')});assert.equal(other.diagnostic,undefined);
  const invalid=await runProbe({expectedHead:head,adapter:{...adapter('p7_matrix'),textDiagnostic:()=>({...diagnostic,url:'private'})}});
  assert.equal(invalid.code,'probe_failure');assert.equal(invalid.diagnostic,undefined);
  const leaking=await runProbe({expectedHead:head,adapter:{...adapter('p7_matrix'),cleanup:async()=>({...cleanup(),profileRemoved:false})}});
  assert.equal(leaking.code,'probe_cleanup');assert.equal(leaking.diagnostic.observations,undefined);
  const source=fs.readFileSync('test/support/mission_quorum_web_browser_v2.mjs','utf8');
  assert.match(source,/textSummary===undefined && exact\(row,\['event','value'\]\)/u);
  assert.match(source,/componentHeadings\.includes\(label\)\?\{/u);
  assert.match(source,/if\(text\.split\('\\n'\)\.includes\(label\)\)return/u);
});
test('runner has only explicit test/workflow consumers, never runtime or product entrypoints',()=>{
  const allowed=new Set(['test/support/mission_quorum_web_browser_v2.mjs','test/tool/mission_quorum_web_browser_v2.test.mjs',
    '.github/workflows/mission-quorum-web-v2-proof.yml','test/tool/mission_quorum_web_preview_v2_contract.test.mjs',
    'backend/test/mission_quorum_projection_v2.test.js']);
  const files=execFileSync('/usr/bin/git',['ls-files','-co','--exclude-standard','lib','web','tool','scripts',
    'backend/src','backend/ops','backend/test','test','.github'],{encoding:'utf8'}).trim().split('\n');
  for(const p of new Set(files)){
    if(allowed.has(p)||! /\.(?:dart|js|mjs|json|html|ya?ml|sh)$/u.test(p))continue;
    assert.doesNotMatch(fs.readFileSync(p,'utf8'),/mission_quorum_web_browser_v2|isolated-synthetic-v2-browser-proof/u,p);
  }
});
test('workflow binds only exact PR head or dispatch source and uses a real file command',()=>{
  const y=fs.readFileSync('.github/workflows/mission-quorum-web-v2-proof.yml','utf8');
  assert.match(y,/contents: read/u);assert.match(y,/persist-credentials: false/u);
  assert.doesNotMatch(y,/pull_request_target|secrets\.|id-token:|upload-artifact|github\.sha|refs\/pull/u);
  assert.match(y,/PR_HEAD: \$\{\{ github\.event\.pull_request\.head\.sha \}\}/u);
  assert.match(y,/ref: \$\{\{ steps\.source\.outputs\.head \}\}/u);
  assert.match(y,/timeout-minutes: 10/u);assert.match(y,/cancel-in-progress: true/u);
  assert.match(y,/runs-on: ubuntu-24\.04/u);assert.match(y,/flutter-version: 3\.41\.7/u);
  assert.equal(y.match(/permissions:\n([\s\S]*?)\n\n/u)[1],'  contents: read');
  assert.deepEqual([...y.matchAll(/^      - '([^']+)'$/gmu)].map(m=>m[1]).sort(),[...boundFiles].sort());
  assert.match(y,/flutter pub get --enforce-lockfile\n          test -z "\$\(git status --porcelain --untracked-files=all\)"/u);
  assert.ok(y.indexOf('flutter pub get --enforce-lockfile')<y.indexOf('--synthetic-v2-browser'));
  assert.deepEqual([...y.matchAll(/^  ([a-z_]+):$/gmu)].map(m=>m[1]),['pull_request','workflow_dispatch']);
  const script=y.match(/run: \|\n([\s\S]*?)\n      - uses:/u)[1].split('\n').map(l=>l.slice(10)).join('\n');
  const dir=fs.mkdtempSync(path.join(os.tmpdir(),'p7-source-test-'));const output=path.join(dir,'output');
  try{
    for(const event of ['pull_request','workflow_dispatch','push']){
      fs.writeFileSync(output,''); const env={PATH:process.env.PATH,EVENT_NAME:event,PR_HEAD:head,DISPATCH_SOURCE:head,GITHUB_OUTPUT:output};
      if(event==='push')assert.throws(()=>execFileSync('/bin/bash',['-eu','-c',script],{env,stdio:'pipe'}));
      else execFileSync('/bin/bash',['-eu','-c',script],{env,stdio:'pipe'});
      assert.equal(fs.readFileSync(output,'utf8'),event==='push'?'':`head=${head}\n`);
    }
    for(const invalid of ['','HEAD',head.toUpperCase(),'refs/pull/1/merge',head+'\nprivate']){
      fs.writeFileSync(output,'');
      assert.throws(()=>execFileSync('/bin/bash',['-eu','-c',script],{env:{PATH:process.env.PATH,
        EVENT_NAME:'pull_request',PR_HEAD:invalid,DISPATCH_SOURCE:head,GITHUB_OUTPUT:output},stdio:'pipe'}));
      assert.equal(fs.readFileSync(output,'utf8'),'');
    }
    fs.writeFileSync(output,'');
    execFileSync('/bin/bash',['-eu','-c',script],{env:{PATH:process.env.PATH,EVENT_NAME:'pull_request',
      PR_HEAD:head,DISPATCH_SOURCE:'c'.repeat(40),GITHUB_OUTPUT:output},stdio:'pipe'});
    assert.equal(fs.readFileSync(output,'utf8'),`head=${head}\n`);
  }finally{fs.rmSync(dir,{recursive:true});}
});
