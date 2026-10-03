import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import vm from 'node:vm';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { runProbe, parseArgs, contract, toolchain, boundFiles, buildArguments, project,
  artifactDigest, validateArtifact, matrixPlan, validateMatrix, classifyAsset,
  classifyBlockedRequest, networkReasonKeys, validateNetworkDiagnostic, ownsBuildGroup,
  launchArgs, privilegeArgs, validateInventory, validateNetwork, validateCleanup,
  requireRenderedText, classifyTextObservation, validateTextDiagnostic, renderedSemanticsRect,
  isStaticTextLabel, resolveBrowserControl, requireControlPoint, readBrowserDom,
  loadBoundArtifactFiles } from '../support/mission_quorum_web_browser_v2.mjs';

function domTransport(label,{hidden=false,exception=false,extra=false}={}) {
  const calls=[];
  const node={isConnected:true,disabled:false,textContent:label,hasAttribute:()=>true,
    getAttribute:key=>key==='role'?'button':key==='aria-label'?label:null,
    getClientRects:()=>[{}],contains:()=>false,
    getBoundingClientRect:()=>({x:10,y:20,left:10,top:20,right:50,bottom:40,width:40,height:20})};
  const context=vm.createContext({innerWidth:390,innerHeight:844,document:{querySelectorAll:()=>[node],
    defaultView:{getComputedStyle:()=>({display:'block',visibility:hidden?'hidden':'visible',opacity:'1'})},
    elementFromPoint:()=>node,elementsFromPoint:()=>[node]}});
  const cdp=async(method,params,session)=>{
    calls.push({method,params,session});
    if(method==='Runtime.evaluate')return {result:{objectId:'synthetic-context'}};
    if(method==='Runtime.releaseObject')return {};
    assert.equal(method,'Runtime.callFunctionOn');
    if(exception)return {exceptionDetails:{text:'https://provider.invalid /private/browser-error'}};
    const fn=vm.runInContext('('+params.functionDeclaration+')',context);
    const value=JSON.parse(JSON.stringify(fn(...params.arguments.map(argument=>argument.value))));
    return {result:{value:extra?{...value,private:'https://provider.invalid /private/browser-error'}:value}};
  };
  return {cdp,calls,context};
}

test('DOM read code is invariant; injection strings travel only as structured CDP arguments',async()=>{
  const payloads=['normal',"');globalThis.injected=true;//",'";globalThis.injected=true;//',
    '</script>',String.raw`\\quotes`, 'line\u2028separator', 'https://provider.invalid /private/path'];
  for(const kind of ['point','text','control']){
    let declaration;
    for(const label of payloads){
      const t=domTransport(label);
      const result=await readBrowserDom({cdp:t.cdp,session:'synthetic-session',kind,label});
      assert.deepEqual(result,kind==='text'?{exactLine:true,rendered:true}:{x:30,y:30});
      assert.equal(t.context.injected,undefined);
      assert.deepEqual(t.calls.map(c=>c.method),['Runtime.evaluate','Runtime.callFunctionOn','Runtime.releaseObject']);
      assert.ok(t.calls.every(c=>c.session==='synthetic-session'));
      assert.deepEqual(t.calls[0].params,{expression:'globalThis',returnByValue:false});
      const params=t.calls[1].params;
      assert.deepEqual(params.arguments,[{value:label},{value:null}]);
      assert.equal(params.objectId,'synthetic-context');assert.equal(params.returnByValue,true);
      if(declaration===undefined)declaration=params.functionDeclaration;
      assert.equal(params.functionDeclaration,declaration);
      assert.deepEqual(t.calls[2].params,{objectId:'synthetic-context'});
      assert.doesNotMatch(JSON.stringify(result),/private|provider|injected/u);
    }
  }
});

test('structured DOM reads preserve visible static text, hidden rejection and component-zero hit tests',async()=>{
  const heading='Position 1 · Synthetischer Eigentümer 1';
  for(const hidden of [true,false]){
    const t=domTransport(heading,{hidden});
    assert.deepEqual(await readBrowserDom({cdp:t.cdp,session:'s',kind:'text',label:heading}),{exactLine:true,rendered:!hidden});
  }
  for(const label of ['Synthetische Belegdetails öffnen','Belegdetails schließen']){
    const t=domTransport(label);
    assert.deepEqual(await readBrowserDom({cdp:t.cdp,session:'s',kind:'control',label,componentIndex:0}),{x:30,y:30});
    const hidden=domTransport(label,{hidden:true});
    assert.equal(await readBrowserDom({cdp:hidden.cdp,session:'s',kind:'control',label,componentIndex:0}),null);
  }
});

test('DOM seam rejects invalid operations/arguments before CDP without coercion',async()=>{
  for(const fields of [{kind:'constructor'},{kind:'__proto__'},{label:null},{label:{}},{label:''},
    {label:'x'.repeat(513)},{componentIndex:1},{componentIndex:'0'},
    {kind:'text',componentIndex:0}]){
    let calls=0;
    await assert.rejects(readBrowserDom({cdp:async()=>{calls++;},session:'s',kind:'control',label:'normal',...fields}),{message:'p7_matrix'});
    assert.equal(calls,0);
  }
});

test('browser exceptions and unexpected fields are discarded and the remote object released',async()=>{
  for(const options of [{exception:true},{extra:true}]){
    const t=domTransport('normal',options);
    await assert.rejects(readBrowserDom({cdp:t.cdp,session:'s',kind:'point',label:'normal'}),{message:'p7_matrix'});
    assert.equal(t.calls.at(-1).method,'Runtime.releaseObject');
  }
});

for(const failure of ['Runtime.evaluate','Runtime.callFunctionOn','Runtime.releaseObject']){
  test(`DOM ${failure} failure has a fixed code and releases any acquired context`,async()=>{
    const calls=[];
    const cdp=async method=>{calls.push(method);if(method===failure)throw Error('https://provider.invalid /private/error');
      return method==='Runtime.evaluate'?{result:{objectId:'synthetic'}}:{result:{value:null}};};
    await assert.rejects(readBrowserDom({cdp,session:'s',kind:'point',label:'normal'}),{message:'p7_matrix'});
    assert.equal(calls.at(-1),failure==='Runtime.evaluate'?'Runtime.evaluate':'Runtime.releaseObject');
  });
}

test('context mismatch fails closed without stale-context retry; expression interpolation is absent',async()=>{
  const calls=[];
  const cdp=async method=>{calls.push(method);return {exceptionDetails:{text:'/private/context'},result:{objectId:'synthetic'}};};
  await assert.rejects(readBrowserDom({cdp,session:'s',kind:'text',label:'normal'}),{message:'p7_matrix'});
  assert.deepEqual(calls,['Runtime.evaluate','Runtime.releaseObject']);
  const source=fs.readFileSync('test/support/mission_quorum_web_browser_v2.mjs','utf8');
  assert.doesNotMatch(source,/JSON\.stringify\((?:label|componentIndex)\)/u);
  assert.match(source,/const staticPoint=label=>readBrowserDom/u);
  assert.match(source,/readDomEvidence:\(\)=>readBrowserDom/u);
  assert.match(source,/const controlPoint=\(label,componentIndex=null\)=>readBrowserDom/u);
});

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
test('asset server preload binds validated bytes and leaves request names outside filesystem reads',(t)=>{
  const root=fs.mkdtempSync(path.join(os.tmpdir(),'sit-p7-assets-'));t.after(()=>fs.rmSync(root,{recursive:true,force:true}));
  const contents={
    'flutter_bootstrap.js':Buffer.from('bootstrap'),
    'index.html':Buffer.from('index'),
    'main.dart.js':Buffer.from('main'),
  };
  for(const [name,bytes]of Object.entries(contents))fs.writeFileSync(path.join(root,name),bytes,{mode:0o600});
  const value=artifact();value.files=Object.entries(contents).sort().map(([file,bytes])=>({
    path:file,sha256:createHash('sha256').update(bytes).digest('hex'),bytes:bytes.length,
  }));value.artifactDigest=artifactDigest(value.files);
  const loaded=loadBoundArtifactFiles(root,value);
  assert.deepEqual([...loaded.keys()],[...Object.keys(contents)].sort());
  for(const [name,bytes]of Object.entries(contents))assert.deepEqual(loaded.get(name).bytes,bytes);
  assert.equal(loaded.get('../private'),undefined);
  const source=fs.readFileSync('test/support/mission_quorum_web_browser_v2.mjs','utf8');
  assert.doesNotMatch(source,/readFileSync\(path\.join\(webRoot,\s*name\)\)/u);
  assert.match(source,/const files = loadBoundArtifactFiles\(webRoot,artifact\)/u);
});
for(const variant of ['symlink','growth'])test(`asset preload rejects ${variant} after manifest binding`,(t)=>{
  const root=fs.mkdtempSync(path.join(os.tmpdir(),'sit-p7-assets-race-'));t.after(()=>fs.rmSync(root,{recursive:true,force:true}));
  const contents={
    'flutter_bootstrap.js':Buffer.from('bootstrap'),
    'index.html':Buffer.from('index'),
    'main.dart.js':Buffer.from('main'),
  };
  for(const [name,bytes]of Object.entries(contents))fs.writeFileSync(path.join(root,name),bytes,{mode:0o600});
  const value=artifact();value.files=Object.entries(contents).sort().map(([file,bytes])=>({
    path:file,sha256:createHash('sha256').update(bytes).digest('hex'),bytes:bytes.length,
  }));value.artifactDigest=artifactDigest(value.files);
  const target=path.join(root,'main.dart.js');
  if(variant==='symlink'){fs.rmSync(target);fs.symlinkSync(path.join(root,'index.html'),target);}
  else fs.appendFileSync(target,'growth');
  assert.throws(()=>loadBoundArtifactFiles(root,value),/p7_artifact/u);
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
  assert.match(s,/resolveBrowserControl\.toString\(\)/u);
  assert.match(s,/display-evidence-open-state/u);
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
test('heading diagnostics classify exact boundaries without emitting text or admitting uncorrelated flattening',async()=>{
  const label='Position 1 · Synthetischer Eigentümer 1';
  assert.deepEqual(classifyTextObservation(label,`other\n${label}\nPflichtkomponente`,false),
    {exact_ax_line:1,exact_dom_label_line:0,rendered_dom_label_line:0,flattened_ax_boundary_match:0,absent:0});
  assert.deepEqual(classifyTextObservation(label,`${label} Pflichtkomponente Verfügbarkeit: unbekannt`,true),
    {exact_ax_line:0,exact_dom_label_line:1,rendered_dom_label_line:0,flattened_ax_boundary_match:1,absent:0});
  for(const text of [`${label} private-tail Pflichtkomponente`,`prefix ${label} Pflichtkomponente`,
    'Position 11 · Synthetischer Eigentümer 1 Pflichtkomponente',`${label} Pflichtkomponente-private-tail`])
    assert.deepEqual(classifyTextObservation(label,text,false),
      {exact_ax_line:0,exact_dom_label_line:0,rendered_dom_label_line:0,flattened_ax_boundary_match:0,absent:1});
  let reads=0;let domReads=0;let scrolls=0;const diagnostics=[];
  await assert.rejects(requireRenderedText(label,{readText:async()=>{reads++;return `${label} Pflichtkomponente`;},
    scroll:async()=>{scrolls++;},safe:()=>{},readDomEvidence:async()=>{domReads++;return {exactLine:true,rendered:false};},
    onFailure:d=>diagnostics.push(d)}),/^Error: p7_matrix$/u);
  assert.equal(reads,18);assert.equal(domReads,18);assert.equal(scrolls,17);assert.equal(diagnostics.length,1);
  assert.deepEqual(diagnostics[0],{observations:18,exact_ax_line:0,exact_dom_label_line:18,rendered_dom_label_line:0,flattened_ax_boundary_match:18,absent:0});
  assert.doesNotMatch(JSON.stringify(diagnostics),/Position|private-tail|https:|nodeId|path/u);
  let observed=false;
  await requireRenderedText(label,{readText:async()=>label,scroll:async()=>{throw Error('unexpected');},safe:()=>{},
    readDomEvidence:async()=>{observed=true;return {exactLine:false,rendered:false};},onFailure:()=>{throw Error('unexpected');}});
  assert.equal(observed,false); // An already passing exact AX line is unchanged.
  const second='Position 2 · Synthetischer Eigentümer 2';
  assert.equal(classifyTextObservation(second,`${second} Optionale Komponente`,false).flattened_ax_boundary_match,1);
});
test('text diagnostic validator rejects extra keys, unsafe values and impossible count shapes',()=>{
  const good={observations:18,exact_ax_line:0,exact_dom_label_line:18,rendered_dom_label_line:0,flattened_ax_boundary_match:18,absent:0};
  assert.deepEqual(validateTextDiagnostic(good),good);
  for(const mutate of [d=>d.url='private',d=>delete d.absent,d=>d.exact_dom_label_line=-1,
    d=>d.rendered_dom_label_line=19,d=>d.rendered_dom_label_line=1,
    d=>d.absent=19,d=>d.observations=17,d=>d.exact_ax_line=1,d=>d.absent=0.5,
    d=>d.absent='0',d=>d.absent=true,d=>d.absent=NaN,d=>d.absent=Infinity,
    d=>{d.exact_dom_label_line=0;d.flattened_ax_boundary_match=0;}]){
    const d={...good};mutate(d);assert.throws(()=>validateTextDiagnostic(d),/^Error: probe_failure$/u);
  }
});
test('flattened headings require correlated exact DOM line and rendered geometry in the same observation',async()=>{
  const label='Position 1 · Synthetischer Eigentümer 1';let reads=0;
  await requireRenderedText(label,{readText:async()=>{reads++;return `${label} Pflichtkomponente Verfügbarkeit: unbekannt`;},
    readDomEvidence:async()=>({exactLine:true,rendered:true}),safe:()=>{},scroll:async()=>{throw Error('unexpected');}});
  assert.equal(reads,1);
  // DOM proof in observation 1 cannot combine with an AX match in observation 2.
  let observation=0;const diagnostics=[];
  await assert.rejects(requireRenderedText(label,{readText:async()=>++observation%2?'absent':`${label} Pflichtkomponente`,
    readDomEvidence:async()=>({exactLine:observation%2===1,rendered:observation%2===1}),
    safe:()=>{},scroll:async()=>{},onFailure:d=>diagnostics.push(d)}),/^Error: p7_matrix$/u);
  assert.equal(observation,18);assert.equal(diagnostics[0].rendered_dom_label_line,9);
  for(const evidence of [{exactLine:false,rendered:false},{exactLine:true,rendered:false}])
    await assert.rejects(requireRenderedText(label,{readText:async()=>`${label} Pflichtkomponente`,readDomEvidence:async()=>evidence,
      safe:()=>{},scroll:async()=>{},onFailure:()=>{}}),/^Error: p7_matrix$/u);
  for(const ax of ['absent',`${label} private-tail Pflichtkomponente`,`${label} Pflichtkomponente-private-tail`,`prefix ${label} Pflichtkomponente`])
    await assert.rejects(requireRenderedText(label,{readText:async()=>ax,readDomEvidence:async()=>({exactLine:true,rendered:true}),
      safe:()=>{},scroll:async()=>{},onFailure:()=>{}}),/^Error: p7_matrix$/u);
  await assert.rejects(requireRenderedText(label,{readText:async()=>`${label} Pflichtkomponente`,
    readDomEvidence:async()=>({exactLine:false,rendered:true}),safe:()=>{},scroll:async()=>{}}),/^Error: probe_failure$/u);
});
test('evidence counts correlate only exact segment/count and first-slot token boundaries',async()=>{
  for(const segment of ['Übergabe','Rückgabe'])for(const count of [0,1,2,3,4]){
    const label=`${segment}: ${count}/4 synthetische Foto-Slots`;
    assert.equal(isStaticTextLabel(label),true);
    for(const text of [label,`${label} Übersicht: fehlt`,`Passung: unbekannt ${label} Übersicht: synthetisch belegt Detail: fehlt`])
      await requireRenderedText(label,{readText:async()=>text,readDomEvidence:async()=>({exactLine:true,rendered:true}),
        safe:()=>{},scroll:async()=>{throw Error('unexpected');}});
  }
  for(const label of ['Übergabe: 5/4 synthetische Foto-Slots','Rückgabe: -1/4 synthetische Foto-Slots',
    'Übergabe: 04/4 synthetische Foto-Slots','Übergabe: 4/5 synthetische Foto-Slots',
    'Pickup: 4/4 synthetische Foto-Slots','private Übergabe: 4/4 synthetische Foto-Slots',
    'Übergabe: 4/4 synthetische Foto-Slots private']){
    assert.equal(isStaticTextLabel(label),false);
    await assert.rejects(requireRenderedText(label,{readText:async()=>label,safe:()=>{},scroll:async()=>{}}),/^Error: probe_failure$/u);
  }
  const label='Übergabe: 4/4 synthetische Foto-Slots';
  for(const text of [`private${label} Übersicht: fehlt`,`${label}private Übersicht: fehlt`,
    `${label} private Übersicht: fehlt`,`${label} Detail: fehlt`,`${label} Übersicht:private`,
    'Rückgabe: 4/4 synthetische Foto-Slots Übersicht: fehlt','Übergabe: 3/4 synthetische Foto-Slots Übersicht: fehlt'])
    await assert.rejects(requireRenderedText(label,{readText:async()=>text,readDomEvidence:async()=>({exactLine:true,rendered:true}),
      safe:()=>{},scroll:async()=>{},onFailure:()=>{}}),/^Error: p7_matrix$/u);
  let step=0;let diagnostic;
  await assert.rejects(requireRenderedText(label,{readText:async()=>++step%2?'absent':`${label} Übersicht: fehlt`,
    readDomEvidence:async()=>({exactLine:step%2===1,rendered:step%2===1}),safe:()=>{},scroll:async()=>{},
    onFailure:d=>{diagnostic=d;}}),/^Error: p7_matrix$/u);
  assert.equal(step,18);assert.equal(diagnostic.exact_dom_label_line,9);assert.equal(diagnostic.flattened_ax_boundary_match,9);
  for(const dom of [{exactLine:false,rendered:false},{exactLine:true,rendered:false}])
    await assert.rejects(requireRenderedText(label,{readText:async()=>`${label} Übersicht: fehlt`,readDomEvidence:async()=>dom,
      safe:()=>{},scroll:async()=>{},onFailure:()=>{}}),/^Error: p7_matrix$/u);
});
test('semantics rectangle proves finite nonzero container intersection, not heading pixels or hit testing',()=>{
  const rect={x:12,y:20,width:300,height:700};const viewport={width:390,height:844};
  assert.equal(renderedSemanticsRect(rect,viewport),true);
  assert.equal(renderedSemanticsRect({...rect,y:-10},viewport),true);
  for(const changed of [{width:0},{height:-1},{x:NaN},{y:Infinity},{x:390},{y:844},{x:-301},
    {x:Number.MAX_VALUE,width:Number.MAX_VALUE},{width:'300'},{extra:'private'}])
    assert.equal(renderedSemanticsRect({...rect,...changed},viewport),false);
  assert.equal(renderedSemanticsRect(rect,{width:0,height:844}),false);
  assert.equal(renderedSemanticsRect(rect,{width:390,height:NaN}),false);
  const source=fs.readFileSync('test/support/mission_quorum_web_browser_v2.mjs','utf8');
  assert.match(source,/e\.isConnected/u);assert.match(source,/getComputedStyle\(e\)/u);
  assert.match(source,/renderedSemanticsRect\.toString\(\)/u);
});
test('only a primary p7_matrix failure carries the one validated heading diagnostic',async()=>{
  const diagnostic={observations:18,exact_ax_line:0,exact_dom_label_line:0,rendered_dom_label_line:0,flattened_ax_boundary_match:0,absent:18};
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
  assert.match(source,/isStaticTextLabel\(label\)\?\{/u);
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
test('controls select exact role/name and fixed component zero before geometry or hit testing',()=>{
  const label='Synthetische Belegdetails öffnen';const viewport={width:390,height:844};
  const card=index=>({getAttribute:k=>k==='aria-label'?`Position ${index+1} · Synthetischer Eigentümer ${index+1}\nPflichtkomponente`:null,parentElement:null});
  const button=(index,overrides={})=>({isConnected:true,textContent:label,disabled:false,
    parentElement:card(index),getAttribute:k=>({role:'button','aria-label':label}[k]??null),
    hasAttribute:k=>k==='aria-label',getClientRects:()=>[{}],
    getBoundingClientRect:()=>({x:10,y:100,width:300,height:40}),contains:()=>false,...overrides});
  const a=button(0),b=button(1);let hit=a;let nodes=[a,b];
  const doc={querySelectorAll:q=>{assert.equal(q,'[role="button"]');return nodes;},
    elementFromPoint:()=>hit,elementsFromPoint:()=>[hit],defaultView:{getComputedStyle:()=>({display:'block',visibility:'visible',opacity:'1'})}};
  assert.deepEqual(resolveBrowserControl(doc,label,0,viewport),{x:160,y:120});
  assert.equal(resolveBrowserControl(doc,label,null,viewport),null); // Generic duplicate is never silently chosen.
  assert.equal(resolveBrowserControl(doc,label,1,viewport),null);
  hit=b;assert.equal(resolveBrowserControl(doc,label,0,viewport),null); // No visible-duplicate fallback.
  const clipped=button(0,{getBoundingClientRect:()=>({x:10,y:-100,width:300,height:40})});
  nodes=[clipped,b];assert.equal(resolveBrowserControl(doc,label,0,viewport),null); // Never pick the later visible duplicate.
  nodes=[a,b];hit={};assert.equal(resolveBrowserControl(doc,label,0,viewport),null);
  hit=a;
  assert.equal(resolveBrowserControl({...doc,elementsFromPoint:()=>[b,a]},label,0,viewport),null);
  nodes=[a,b,button(2)];assert.equal(resolveBrowserControl(doc,label,0,viewport),null);
  nodes=[a];assert.equal(resolveBrowserControl(doc,label,0,{width:Infinity,height:844}),null);
  for(const rect of [{x:10,y:-1,width:300,height:40},{x:10,y:100,width:0,height:40},
    {x:10,y:100,width:NaN,height:40},{x:380,y:100,width:20,height:40}]){
    const bad=button(0,{getBoundingClientRect:()=>rect});nodes=[bad,b];hit=bad;
    assert.equal(resolveBrowserControl(doc,label,0,viewport),null);
  }
  for(const value of [`private ${label}`,`${label} private`]){
    const bad=button(0,{getAttribute:k=>({role:'button','aria-label':value}[k]??null)});nodes=[bad];hit=bad;
    assert.equal(resolveBrowserControl(doc,label,0,viewport),null);
  }
  const staticText=button(0,{getAttribute:k=>({'aria-label':label,role:'group'}[k]??null)});nodes=[staticText];hit=staticText;
  assert.equal(resolveBrowserControl(doc,label,0,viewport),null);
  for(const override of [{isConnected:false},{disabled:true},{getClientRects:()=>[]}]){
    const bad=button(0,override);nodes=[bad];hit=bad;assert.equal(resolveBrowserControl(doc,label,0,viewport),null);
  }
  const close=button(0,{getAttribute:k=>({role:'button','aria-label':'Belegdetails schließen'}[k]??null)});
  nodes=[a];hit=a;assert.equal(resolveBrowserControl(doc,'Belegdetails schließen',0,viewport),null);
  nodes=[close];hit=close;assert.deepEqual(resolveBrowserControl(doc,'Belegdetails schließen',0,viewport),{x:160,y:120});
  nodes=[close,close];assert.equal(resolveBrowserControl(doc,'Belegdetails schließen',0,viewport),null);
  const child={};const parent=button(0,{contains:e=>e===child});nodes=[parent];hit=child;
  assert.deepEqual(resolveBrowserControl(doc,label,0,viewport),{x:160,y:120});
});
test('control state readback is bounded and cannot pass a missing transition',async()=>{
  let reads=0;let advances=0;
  assert.deepEqual(await requireControlPoint({read:async()=>++reads===3?{x:10,y:20}:null,
    advance:async()=>{advances++;},safe:()=>{}}),{x:10,y:20});
  assert.equal(reads,3);assert.equal(advances,2);
  reads=0;advances=0;
  await assert.rejects(requireControlPoint({read:async()=>{reads++;return null;},
    advance:async()=>{advances++;},safe:()=>{}}),/^Error: p7_matrix$/u);
  assert.equal(reads,18);assert.equal(advances,17);
  const source=fs.readFileSync('test/support/mission_quorum_web_browser_v2.mjs','utf8');
  assert.match(source,/click\('Synthetische Belegdetails öffnen',true,0\)/u);
  assert.match(source,/waitControlState\('Belegdetails schließen',0\)/u);
  assert.ok(source.indexOf("textStep('display-evidence-open-state'")<source.indexOf("textStep(name==='Übergabe'"));
  const view=fs.readFileSync('test/support/mission_quorum_web_preview_v2.dart','utf8');
  assert.match(view,/for \(var i = 0; i < components\.length; i\+\+\)/u);
  assert.match(view,/_expanded == i \? null : i/u);
  assert.match(view,/_segmentView\(_map\(details\[i\]\[segment\]\)/u);
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
