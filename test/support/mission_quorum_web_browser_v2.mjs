// Isolated synthetic V2 browser proof. No product/AppRoot/provider/PG or deployment evidence.
// Reviewed Linux ownership/CDP mechanics copied without modifying the D6 contracts.
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import net from 'node:net';
import { createHash } from 'node:crypto';
import { spawn, execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

// Official inventory, accessed 2026-10-03; runner labels alone are not immutable.
// https://github.com/actions/runner-images/blob/db776964592d0362a6bed85f90bc4e2980250e49/images/ubuntu/Ubuntu2404-Readme.md
export const contract = Object.freeze({ inventoryCommit: 'db776964592d0362a6bed85f90bc4e2980250e49',
  imageOS: 'ubuntu24', imageVersion: '20260927.320.1', arch: 'x64', node: '22.23.3', chrome: '154.0.8037.57' });
const self = fileURLToPath(import.meta.url);
const chrome = '/opt/google/chrome/chrome';
const mode = 'synthetic-v2-browser';
export const inventoryPhases = Object.freeze(['environment', 'chrome-version', 'git-identity', 'git-status', 'binary-check', 'byte-hash']);
const phases = ['inventory', 'prepare', 'launch', 'cdp-connect', 'Browser.getVersion', 'Target.getTargets',
  'Target.attachToTarget', 'Page.enable', 'Runtime.enable', 'Runtime.evaluate', 'Runtime.callFunctionOn', 'Runtime.releaseObject', 'SystemInfo.getProcessInfo',
  'build', 'locked-dependencies', 'flutter-build', 'asset-server', 'Network.enable', 'Fetch.enable', 'Fetch.requestPaused', 'Fetch.fulfillRequest', 'Fetch.failRequest', 'Page.navigate', 'Page.reload', 'Page.captureScreenshot', 'Emulation.setDeviceMetricsOverride', 'Input.dispatchKeyEvent', 'Accessibility.enable', 'Accessibility.getFullAXTree', 'Input.dispatchMouseEvent', 'display-matrix', 'display-cases', 'network', 'Browser.close', 'observe', 'terminate', 'cleanup', ...inventoryPhases];
const codes = new Set(['probe_arguments', 'probe_inventory', 'probe_network', 'probe_targets', 'probe_sandbox',
  'p7_matrix', 'p7_render', 'p7_artifact', 'p7_source', 'p7_toolchain', 'p7_build', 'p7_network', 'probe_version', 'probe_cleanup', 'probe_timeout', 'probe_aborted', 'probe_failure', 'probe_test_hooks']);
const check = (ok, code) => { if (!ok) throw Error(code); };
const exact = (v, keys) => v && Object.getPrototypeOf(v) === Object.prototype
  && Reflect.ownKeys(v).length === keys.length && keys.every(k => {
    const d = Object.getOwnPropertyDescriptor(v, k); return d && Object.hasOwn(d, 'value') && d.enumerable;
  });
const digest = bytes => createHash('sha256').update(bytes).digest('hex');
const hex = value => typeof value === 'string' && /^[a-f0-9]{64}$/u.test(value);
export const toolchain = Object.freeze({ flutter: '3.41.7', dart: '3.11.5',
  framework: 'cc0734ac716fbb8b90f3f9db8020958b1553afa7', engine: '59aa584fdf100e6c78c785d8a5b565d1de4b48ab' });
export const boundFiles = Object.freeze([
  'backend/src/mission_quorum_projection_v2.js', 'backend/src/mission_need_workflow.js',
  'backend/src/booking_group_handover_domain.js', 'backend/test/support/mission_quorum_web_fixture_v2.js',
  'backend/test/mission_quorum_projection_v2.test.js',
  'backend/test/mission_quorum_web_envelope_v2.test.js', 'test/support/mission_quorum_web_preview_v2.dart',
  'test/support/mission_quorum_web_golden_v2.dart', 'test/mission_quorum_web_view_v2_test.dart',
  'test/tool/mission_quorum_web_preview_v2_contract.test.mjs', 'test/support/mission_quorum_web_browser_v2.mjs',
  'test/tool/mission_quorum_web_browser_v2.test.mjs', '.github/workflows/mission-quorum-web-v2-proof.yml',
  'assets/fonts/Roboto-Regular.ttf', 'assets/fonts/Roboto-Bold.ttf', 'pubspec.lock', 'pubspec.yaml',
]);
export const buildArguments = Object.freeze(['build', 'web', '--release', '--no-pub', '--no-web-resources-cdn', '--pwa-strategy=none']);
const cases = ['unavailable', 'complete', 'partial', 'rejected', 'timeout', 'optional_conflict', 'released', 'deviation'];
const expectedCase = Object.freeze({
  unavailable: ['unavailable', 0, 0, false, false, false, 'unknown', 'not_bound'],
  complete: ['incomplete', 4, 4, true, true, false, 'none', 'accepted'],
  partial: ['incomplete', 3, 0, false, false, false, 'none', 'accepted'],
  rejected: ['incomplete', 0, 0, false, false, false, 'none', 'rejected'],
  timeout: ['readback_required', 0, 0, false, false, false, 'none', 'timeout'],
  optional_conflict: ['needs_clarification', 4, 4, true, true, true, 'open', 'accepted'],
  released: ['incomplete', 0, 0, false, false, false, 'unknown', 'not_bound'],
  deviation: ['needs_clarification', 4, 4, true, true, false, 'none', 'accepted'],
});
export const matrixPlan = Object.freeze([
  ['unavailable',390,844], ['complete',390,844], ['complete',768,1024], ['complete',1920,1080], ['complete',3840,2160],
  ...cases.slice(2).map(s => [s,390,844]),
].map(([scenario,width,height],step) => {
  const [status,pickup,returnCount,qr,fallback,reason,dispute,acceptance] = expectedCase[scenario];
  return Object.freeze({step,scenario,width,height,status,pickup,returnCount,qr,fallback,reason,dispute,acceptance});
}));
phases.push(...matrixPlan.map(r => `display-row-${r.step}`));
phases.push('display-component-first', 'display-component-second', 'display-evidence-click', 'display-evidence-open-state', 'display-pickup-count', 'display-return-count');
export function validateMatrix(rows) {
  check(Array.isArray(rows) && rows.length === matrixPlan.length, 'p7_matrix');
  check(new Set(rows.map(r=>r.screenshotSha256)).size === rows.length, 'p7_matrix');
  rows.forEach((r,i) => {
    const plan=matrixPlan[i]; check(exact(r,[...Object.keys(plan),'disclosure','geometry','keyboard','reset','screenshotSha256'])
      && Object.entries(plan).every(([k,v])=>r[k]===v) && r.disclosure === (r.scenario !== 'unavailable')
      && r.geometry === true && r.keyboard === (r.scenario === 'unavailable' ? 'not_applicable' : true)
      && r.reset === (r.scenario === 'unavailable' ? 'not_applicable' : true) && hex(r.screenshotSha256), 'p7_matrix');
  });
  return structuredClone(rows);
}
export const artifactDigest = value => digest(JSON.stringify(value));
export function validateArtifact(a) {
  check(exact(a,['schemaVersion','sourceHead','sourceHashes','sourceDigest','lockSha256','projectDigest','toolchain','files','artifactDigest'])
    && a.schemaVersion===1 && /^[a-f0-9]{40}$/u.test(a.sourceHead) && exact(a.sourceHashes,boundFiles)
    && Object.values(a.sourceHashes).every(hex) && a.sourceDigest===artifactDigest(a.sourceHashes)
    && hex(a.lockSha256) && hex(a.projectDigest) && JSON.stringify(a.toolchain)===JSON.stringify(toolchain)
    && Array.isArray(a.files) && a.files.length>2 && a.files.length<10000, 'p7_artifact');
  let last='';
  for(const f of a.files) {
    check(exact(f,['path','sha256','bytes']) && typeof f.path==='string' && /^[a-zA-Z0-9_.\-/]+$/u.test(f.path)
      && !f.path.split('/').some(p=>!p||p==='.'||p==='..') && f.path>last && hex(f.sha256)
      && Number.isSafeInteger(f.bytes) && f.bytes>=0, 'p7_artifact'); last=f.path;
  }
  check(['index.html','main.dart.js','flutter_bootstrap.js'].every(p=>a.files.some(f=>f.path===p))
    && artifactDigest(a.files)===a.artifactDigest, 'p7_artifact');
  return a;
}
const origin = 'https://p7-synthetic.invalid/';
export function classifyAsset(url,type,files) {
  if(type==='Document') return url===origin && files.has('index.html')?'index.html':null;
  if(!['Script','Stylesheet','Font','Image','Fetch','XHR','Other'].includes(type)
    || typeof url!=='string' || !url.startsWith(origin)) return null;
  const p=url.slice(origin.length);
  return /^[a-zA-Z0-9_.\-/]+$/u.test(p) && !p.split('/').some(v=>!v||v==='.'||v==='..')
    && !/service_worker/iu.test(p) && files.has(p) ? p:null;
}
export const networkReasonKeys=Object.freeze(['non_get','response_stage','unsupported_type','non_https_scheme',
  'flutter_canvaskit_cdn','flutter_font_fallback_cdn','google_identity_script','firebase_js_cdn',
  'other_foreign_origin','query_or_fragment','unsafe_path','untracked_asset','websocket']);
export function classifyBlockedRequest({method,url,type,responseStatusCode},files) {
  if(method!=='GET')return 'non_get'; if(responseStatusCode)return 'response_stage';
  if(type==='WebSocket')return 'websocket';
  if(!['Document','Script','Stylesheet','Font','Image','Fetch','XHR','Other'].includes(type))return 'unsupported_type';
  if(typeof url!=='string'||!url.startsWith('https://'))return 'non_https_scheme';
  if(!url.startsWith(origin)) {
    if(url.startsWith('https://www.gstatic.com/flutter-canvaskit/'))return 'flutter_canvaskit_cdn';
    if(url.startsWith('https://fonts.gstatic.com/s/'))return 'flutter_font_fallback_cdn';
    if(/^https:\/\/accounts\.google\.com\/gsi\/client(?:[?#]|$)/u.test(url))return 'google_identity_script';
    if(url.startsWith('https://www.gstatic.com/firebasejs/'))return 'firebase_js_cdn';
    return 'other_foreign_origin';
  }
  if(/[?#]/u.test(url))return 'query_or_fragment'; const p=url.slice(origin.length);
  if(type==='Document' && p!=='')return 'unsafe_path';
  if(p!==''&&(!/^[a-zA-Z0-9_.\-/]+$/u.test(p)||p.split('/').some(v=>!v||v==='.'||v==='..')))return 'unsafe_path';
  return classifyAsset(url,type,files)?null:'untracked_asset';
}
export function validateNetworkDiagnostic(v,previous) {
  check(exact(v,networkReasonKeys)&&Object.values(v).every(n=>Number.isSafeInteger(n)&&n>=0&&n<=4096), 'probe_failure');
  const total=x=>Object.values(x).reduce((a,b)=>a+b,0); check(total(v)<=4096,'probe_failure');
  if(previous!==undefined){validateNetworkDiagnostic(previous);check(networkReasonKeys.every(k=>v[k]>=previous[k])
    &&total(v)===total(previous)+1,'probe_failure');}
  return Object.fromEntries(networkReasonKeys.map(k=>[k,v[k]]));
}
export function inventoryTree(root) {
  const files=[];const walk=p=>{for(const name of fs.readdirSync(path.join(root,p)).sort()) {
    const relative=p?`${p}/${name}`:name;const file=path.join(root,relative);const stat=fs.lstatSync(file);
    check(!stat.isSymbolicLink(),'p7_artifact');if(stat.isDirectory())walk(relative);
    else{check(stat.isFile()&&stat.nlink===1,'p7_artifact');files.push({path:relative,sha256:hash(file),bytes:stat.size});}
  }};walk('');return files.sort((a,b)=>a.path<b.path?-1:1);
}
export function project(proof) {
  const sourceLock=proof.bytes['pubspec.lock'].toString();
  const names=['characters','collection','crypto','flutter','material_color_utilities','meta','sky_engine','typed_data','vector_math'];
  const blocks=names.map(n=>{const b=sourceLock.match(new RegExp(`^  ${n}:\\n[\\s\\S]*?(?=^  [a-z_]+:|^sdks:)`,'m'))?.[0];check(b,'p7_build');return b;});
  const cryptoVersion=blocks[2].match(/version: "([0-9.]+)"/u)?.[1];check(cryptoVersion,'p7_build');
  const lock=`packages:\n${blocks.join('')}${sourceLock.slice(sourceLock.indexOf('\nsdks:')+1)}`;
  return {
    'pubspec.yaml':`name: sit_p7_v2_ephemeral\npublish_to: none\nenvironment:\n  sdk: '>=3.10.0 <4.0.0'\ndependencies:\n  flutter:\n    sdk: flutter\n  crypto: ${cryptoVersion}\nflutter:\n  uses-material-design: true\n  fonts:\n    - family: Roboto\n      fonts:\n        - asset: assets/fonts/Roboto-Regular.ttf\n        - asset: assets/fonts/Roboto-Bold.ttf\n          weight: 700\n`,
    'pubspec.lock':lock,
    'lib/mission_quorum_web_preview_v2.dart':proof.bytes['test/support/mission_quorum_web_preview_v2.dart'],
    'lib/mission_quorum_web_golden_v2.dart':proof.bytes['test/support/mission_quorum_web_golden_v2.dart'],
    'assets/fonts/Roboto-Regular.ttf':proof.bytes['assets/fonts/Roboto-Regular.ttf'],
    'assets/fonts/Roboto-Bold.ttf':proof.bytes['assets/fonts/Roboto-Bold.ttf'],
    'web/index.html':'<!doctype html><html lang="de"><head><base href="/"><meta charset="UTF-8"><link rel="icon" href="data:,"><meta name="viewport" content="width=device-width, initial-scale=1"></head><body><script src="flutter_bootstrap.js" defer></script></body></html>',
    'web/flutter_bootstrap.js':'{{flutter_js}}\n{{flutter_build_config}}\n_flutter.loader.load({config:{canvasKitBaseUrl:"canvaskit/"}});\n',
    'lib/main.dart':`// Ephemeral test harness only. No application bootstrap or product hook.
import 'dart:convert';
import 'package:flutter/material.dart';
import 'mission_quorum_web_preview_v2.dart';
import 'mission_quorum_web_golden_v2.dart';
final renderFailed = ValueNotifier(false);
void main() {
  WidgetsFlutterBinding.ensureInitialized(); WidgetsBinding.instance.ensureSemantics();
  FlutterError.onError = (_) { Future.microtask(() => renderFailed.value = true); };
  runApp(MaterialApp(theme: ThemeData(fontFamily: 'Roboto'), home: const Harness()));
}
class Harness extends StatefulWidget { const Harness({super.key});
  @override State<Harness> createState() => _HarnessState(); }
class _HarnessState extends State<Harness> {
  String selected = 'unavailable';
  final catalog = jsonDecode(p7V2DisplayCatalogJson) as Map<String,dynamic>;
  @override Widget build(BuildContext context) => ValueListenableBuilder<bool>(
    valueListenable: renderFailed, builder: (context, failed, _) {
      if (failed) return const Scaffold(body: Text('P7 render failure'));
      final raw = catalog[selected];
      return Scaffold(body: SafeArea(child: Column(children: [
        Wrap(children: [for(final name in const ${JSON.stringify(cases)})
          TextButton(onPressed: () => setState(() => selected=name), child: Text('P7 case '+name))]),
        Text('P7 selected '+selected),
        Expanded(child: selected=='unavailable' ? const P7V2WebPreview()
          : P7V2WebPreviewHarness.open(flag:true,raw:raw,
            expectedDigest:raw['digest'],expectedPrincipal:p7V2DisplayGoldenPrincipal))
      ])));
    });
}
`,
  };
}
async function buildArtifact(directory,sourceHead,emit,signal,ownGroup) {
  const root=path.resolve(import.meta.dirname,'../..');const flutterRoot=process.env.FLUTTER_ROOT;
  check(typeof flutterRoot==='string'&&path.isAbsolute(flutterRoot),'p7_toolchain');
  const v=JSON.parse(fs.readFileSync(path.join(flutterRoot,'bin/cache/flutter.version.json'),'utf8'));
  check(v.frameworkVersion===toolchain.flutter&&v.dartSdkVersion===toolchain.dart
    &&v.frameworkRevision===toolchain.framework&&v.engineRevision===toolchain.engine,'p7_toolchain');
  const git=(...args)=>command('/usr/bin/git',args,{cwd:root,timeout:15000,maxBuffer:4*1024*1024});
  check(git('rev-parse','HEAD')===sourceHead&&git('status','--porcelain','--untracked-files=all')==='','p7_source');
  const bytes={};const sourceHashes={};
  for(const p of boundFiles){git('ls-files','--error-unmatch','--',p); const file=path.join(root,p);
    const fd=fs.openSync(file,fs.constants.O_RDONLY|fs.constants.O_NOFOLLOW);
    try{const st=fs.fstatSync(fd);check(st.isFile()&&st.nlink===1,'p7_source');bytes[p]=fs.readFileSync(fd);}
    finally{fs.closeSync(fd);}sourceHashes[p]=digest(bytes[p]);
    check(bytes[p].equals(execFileSync('/usr/bin/git',['show',`${sourceHead}:${p}`],{cwd:root,maxBuffer:4*1024*1024,timeout:3000,stdio:['ignore','pipe','pipe']})),'p7_source');
  }
  const contents=project({bytes});const checkout=path.join(directory,'checkout');fs.mkdirSync(checkout,{mode:0o700});
  for(const [p,b]of Object.entries(contents)){fs.mkdirSync(path.dirname(path.join(checkout,p)),{recursive:true});fs.writeFileSync(path.join(checkout,p),b,{flag:'wx',mode:0o600});}
  // Offline resolution is a prerequisite, not permission to download on cache miss.
  const cache=process.env.PUB_CACHE??path.join(process.env.HOME??'', '.pub-cache');
  check(path.isAbsolute(cache)&&fs.statSync(cache).isDirectory(),'p7_build');
  const env={PATH:`${flutterRoot}/bin:/usr/bin:/bin`,HOME:directory,PUB_CACHE:cache,LANG:'C.UTF-8',CI:'true',FLUTTER_SUPPRESS_ANALYTICS:'true'};
  const run=(args,phase)=>new Promise((resolve,reject)=>{
    emit(phase,'begin');const child=spawn(path.join(flutterRoot,'bin/flutter'),['--suppress-analytics','--no-version-check',...args],
      {cwd:checkout,env,detached:true,stdio:'ignore'});
    let stop;try{if(child.pid)stop=ownGroup(child.pid);}catch{child.kill('SIGKILL');reject(Error('p7_build'));return;}
    let expired=false;const abort=()=>{expired=true;try{stop?.();}catch{reject(Error('probe_cleanup'));}};
    const timer=setTimeout(abort,180000);signal?.addEventListener('abort',abort,{once:true});
    const finish=(ok)=>{clearTimeout(timer);signal?.removeEventListener('abort',abort);emit(phase,ok?'confirmed':'failed');
      ok?resolve():reject(Error(expired?'probe_timeout':'p7_build'));};
    child.once('error',()=>finish(false));child.once('exit',(code,sig)=>finish(code===0&&!sig&&!expired));
  });
  await run(['pub','get','--offline','--enforce-lockfile'],'locked-dependencies');
  const lock=fs.readFileSync(path.join(checkout,'pubspec.lock'));
  const packageSection=text=>text.slice(text.indexOf('packages:'),text.lastIndexOf('\nsdks:')).trim();
  check(packageSection(lock.toString())===packageSection(contents['pubspec.lock']),'p7_build');
  contents['pubspec.lock']=lock;
  await run(buildArguments,'flutter-build');
  for(const [p,b]of Object.entries(contents))check(fs.readFileSync(path.join(checkout,p)).equals(Buffer.from(b)),'p7_source');
  for(const p of boundFiles)check(hash(path.join(root,p))===sourceHashes[p],'p7_source');
  check(git('status','--porcelain','--untracked-files=all')==='','p7_source');
  const files=inventoryTree(path.join(checkout,'build/web'));
  const a=validateArtifact({schemaVersion:1,sourceHead,sourceHashes,sourceDigest:artifactDigest(sourceHashes),
    lockSha256:digest(lock),projectDigest:artifactDigest(Object.entries(contents).map(([p,b])=>[p,digest(b)])),
    toolchain:{...toolchain},files,artifactDigest:artifactDigest(files)});
  fs.writeFileSync(path.join(directory,'artifact.json'),JSON.stringify(a),{flag:'wx',mode:0o600});return a;
}
const delay = ms => new Promise(resolve => setTimeout(resolve, ms));
export function classifyCommandFailure(error) {
  return error?.code === 'ETIMEDOUT' || error?.killed === true || ['SIGTERM', 'SIGKILL'].includes(error?.signal)
    ? 'probe_timeout' : 'probe_failure';
}
export function runInventoryPhases(emit, operations) {
  for (const name of inventoryPhases) {
    emit(name, 'begin');
    try { operations[name](); emit(name, 'confirmed'); }
    catch (error) { emit(name, 'failed'); throw Error(codes.has(error?.message) ? error.message : classifyCommandFailure(error)); }
  }
}
const command = (bin, args, options = {}) => {
  try { return execFileSync(bin, args, { encoding: 'utf8', timeout: 3000,
    maxBuffer: 1024 * 1024, stdio: ['pipe', 'pipe', 'pipe'], ...options }).trim(); }
  catch (error) { throw Error(classifyCommandFailure(error)); }
};
const rootCommand = (bin, args, options) => command('/usr/bin/sudo', ['-n', '--', bin, ...args], options);
const hash = file => createHash('sha256').update(fs.readFileSync(file)).digest('hex');
const fail = (code, diagnostic) => ({ schemaVersion: 1, mode, status: 'fail', code: codes.has(code) ? code : 'probe_failure',
  ...(diagnostic ? { diagnostic } : {}) });
const targetClasses = ['pageBlank', 'pageOther', 'browserUi', 'extension', 'serviceWorker', 'other'];
const cleanupFields = ['processesAbsent', 'groupAbsent', 'namespaceRemoved', 'resolverRemoved', 'portClosed', 'profileRemoved'];
export function validateTargetDiagnostic(value) {
  check(value && typeof value === 'object' && !Array.isArray(value)
    && Reflect.ownKeys(value).length === targetClasses.length
    && targetClasses.every(key => Object.hasOwn(value, key) && Number.isInteger(value[key]) && value[key] >= 0 && value[key] <= 256)
    && targetClasses.reduce((sum, key) => sum + value[key], 0) <= 256, 'probe_failure');
  return Object.fromEntries(targetClasses.map(key => [key, value[key]]));
}
export function summarizeTargets(targets) {
  check(Array.isArray(targets) && targets.length <= 256, 'probe_failure');
  const summary = Object.fromEntries(targetClasses.map(key => [key, 0]));
  for (const target of targets) {
    const key = typeof target?.url === 'string' && target.url.startsWith('chrome-extension:') ? 'extension'
      : target?.type === 'page' ? (target.url === 'about:blank' ? 'pageBlank' : 'pageOther')
        : target?.type === 'browser_ui' ? 'browserUi' : target?.type === 'service_worker' ? 'serviceWorker' : 'other';
    summary[key]++;
  }
  return validateTargetDiagnostic(summary);
}
export function validateTargetInventory(value) {
  const counts = validateTargetDiagnostic(value);
  // Exact sanitized vector observed in CI run 37102625787; no other target classes.
  const expected = { pageBlank: 1, pageOther: 0, browserUi: 2, extension: 0, serviceWorker: 0, other: 0 };
  check(targetClasses.every(key => counts[key] === expected[key]), 'probe_targets');
}
export function selectBlankTarget(targets) {
  validateTargetInventory(summarizeTargets(targets));
  const blank = targets.find(target => target.type === 'page' && target.url === 'about:blank');
  check(typeof blank?.targetId === 'string' && blank.targetId.length > 0, 'probe_targets');
  return blank;
}
function cleanupDiagnostic(value) {
  return { ...Object.fromEntries(cleanupFields.map(key => [key, value?.[key] === true])),
    exitClass: value?.exitSignal ? 'signal' : value?.exitCode === 0 ? 'normal'
      : Number.isInteger(value?.exitCode) && value.exitCode > 0 ? 'nonzero' : 'unknown' };
}
export function parseArgs(args) {
  check(args.length === 3 && args[0] === '--synthetic-v2-browser' && args[1] === '--source-head'
    && /^[a-f0-9]{40}$/u.test(args[2]), 'probe_arguments'); return args[2];
}
export function privilegeArgs(uid, gid) {
  check(Number.isSafeInteger(uid) && uid > 0 && Number.isSafeInteger(gid) && gid > 0, 'probe_sandbox');
  return [`--reuid=${uid}`, `--regid=${gid}`, '--clear-groups', '--inh-caps=-all', '--ambient-caps=-all',
    '--bounding-set=-all', '--no-new-privs'];
}
export function launchArgs(directory) {
  return ['--headless=new', '--no-first-run', '--no-default-browser-check', '--disable-background-networking',
    '--disable-component-update', '--disable-sync', '--disable-crash-reporter', '--disable-breakpad',
    '--disable-extensions', '--disable-component-extensions-with-background-pages', `--user-data-dir=${directory}`,
    '--remote-debugging-address=127.0.0.1', '--remote-debugging-port=0', 'about:blank'];
}
export function validateInventory(v, expectedHead) {
  check(v?.platform === 'linux' && v.arch === contract.arch && v.imageOS === contract.imageOS
    && v.imageVersion === contract.imageVersion && v.node === contract.node && v.chrome === contract.chrome
    && v.head === expectedHead && v.clean === true, 'probe_inventory'); privilegeArgs(v.uid, v.gid);
  const names = ['runnerSha256', 'chromeSha256', 'nodeSha256'];
  check(v.digests && typeof v.digests === 'object' && !Array.isArray(v.digests)
    && Reflect.ownKeys(v.digests).length === names.length
    && names.every(name => Object.hasOwn(v.digests, name) && typeof v.digests[name] === 'string'
      && /^[a-f0-9]{64}$/u.test(v.digests[name])), 'probe_inventory');
}
export function validateNetwork(v) {
  check(JSON.stringify(v?.links) === '["lo"]' && Array.isArray(v.routes4) && v.routes4.length === 0
    && Array.isArray(v.routes6) && v.routes6.length === 0 && v.resolverEmpty === true, 'probe_network');
}
export function validateObservation(v, inventory, artifact) {
  check(v?.artifactDigest === artifact.artifactDigest && v.sourceDigest === artifact.sourceDigest
    && v.sourceHead === artifact.sourceHead, 'p7_artifact');
  check(v?.browser === `Chrome/${contract.chrome}` && v.protocol === '1.3' && v.httpStatus === 200, 'probe_version');
  validateTargetInventory(v.targetCounts);
  check(v.evaluated === true && v.workerPrivileges === true && v.renderers?.length > 0, 'probe_sandbox');
  for (const r of v.renderers) check(r.uid === inventory.uid && r.gid === inventory.gid && r.seccomp === 2
    && r.filters >= 1 && r.noNewPrivs === 1 && r.capabilities === '0000000000000000'
    && r.nestedPidNamespace === true && r.forbiddenFlags === false, 'probe_sandbox');
  validateMatrix(v.matrix); check(v.reloadReset === true && v.blockedUnexpected === 0
    && Object.values(validateNetworkDiagnostic(v.networkCounts)).every(count => count === 0), 'p7_network');
  check(v.externalTcp === 'ENETUNREACH' && v.loopback === 200, 'probe_network');
}
export function validateCleanup(v, requireNormalExit = true) {
  check(cleanupFields.every(key => v?.[key] === true)
    && (!requireNormalExit || (v.exitCode === 0 && v.exitSignal === null)), 'probe_cleanup');
}
export async function runProbe({ expectedHead, adapter, journal = () => {}, signal } = {}) {
  if (adapter && !process.env.NODE_TEST_CONTEXT) return fail('probe_test_hooks');
  let proofMatrix; let sequence = 0; let code; let inventory; let artifact; let activeStage; let diagnostic; let networkDiagnostic;
  const emit = (phase, result) => {
    check(phases.includes(phase) && ['begin', 'confirmed', 'failed'].includes(result), 'probe_failure');
    journal(Object.freeze({ sequence: ++sequence, phase, result }));
  };
  const active = adapter ?? realAdapter(expectedHead, emit, signal);
  const abort = () => check(!signal?.aborted, 'probe_aborted');
  try {
    for (const stage of ['inventory', 'build', 'prepare', 'observe']) {
      abort(); activeStage = stage; emit(stage, 'begin');
      if (stage === 'inventory') { inventory = await active.inventory(); validateInventory(inventory, expectedHead); }
      if (stage === 'build') { artifact = validateArtifact(await active.build()); check(artifact.sourceHead === expectedHead, 'p7_source'); }
      if (stage === 'prepare') validateNetwork(await active.prepare());
      if (stage === 'observe') { const observation = await active.observe(); validateObservation(observation, inventory, artifact); proofMatrix = structuredClone(observation.matrix); }
      abort(); emit(stage, 'confirmed');
    }
  } catch (error) {
    code = codes.has(error?.message) ? error.message : 'probe_failure'; if (activeStage) emit(activeStage, 'failed');
    if (code === 'probe_targets') {
      try { diagnostic = validateTargetDiagnostic(active.targetDiagnostic?.()); }
      catch { code = 'probe_failure'; }
    }
    if (code === 'p7_network') {
      try { networkDiagnostic = validateNetworkDiagnostic(active.networkDiagnostic?.()); }
      catch { code = 'probe_failure'; }
    }
    if (code === 'p7_matrix') {
      try {
        const value=active.textDiagnostic?.();
        if(value!==undefined)diagnostic=validateTextDiagnostic(value);
      } catch { code='probe_failure'; diagnostic=undefined; }
    }
  }
  finally {
    emit('cleanup', 'begin');
    let readback;
    try {
      readback = await active.cleanup(); validateCleanup(readback, false); emit('cleanup', 'confirmed');
      // A nonzero/signalled exit after a primary failure is not a resource leak.
      if (!code) { try { validateCleanup(readback); } catch { code = 'probe_cleanup'; } }
    } catch {
      code = 'probe_cleanup'; emit('cleanup', 'failed');
      try { diagnostic = cleanupDiagnostic(readback ?? active.cleanupReadback?.()); }
      catch { diagnostic = cleanupDiagnostic(); }
    }
  }
  if (signal?.aborted && !code) code = 'probe_aborted';
  if (code) return fail(code, code === 'p7_network' ? networkDiagnostic : diagnostic);
  return { schemaVersion: 1, mode, status: 'pass', sourceHead: expectedHead, inventory: { ...contract, digests: { ...inventory.digests } },
    evidenceClass: 'isolated-synthetic-v2-browser-proof',
    boundaries: { product: false, AppRoot: false, auth: false, storage: false, PG: false, deployment: false },
    artifact: { sourceDigest: artifact.sourceDigest, sourceHashes: artifact.sourceHashes, lockSha256: artifact.lockSha256,
      projectDigest: artifact.projectDigest, toolchain: artifact.toolchain, artifactDigest: artifact.artifactDigest, fileCount: artifact.files.length },
    proof: { rendererSandbox: true, loopback: true, externalTcp: 'ENETUNREACH',
      matrix: validateMatrix(proofMatrix), reloadReset: true },
    cleanup: { processesAbsent: true, groupAbsent: true, namespaceRemoved: true, resolverRemoved: true,
      portClosed: true, profileRemoved: true, exitCode: 0, exitSignal: null } };
}

function statusFields(text) { return Object.fromEntries(text.trim().split('\n').map(line => {
  const index = line.indexOf(':'); return [line.slice(0, index), line.slice(index + 1).trim()];
})); }
function procStat(pid) {
  const text = fs.readFileSync(`/proc/${pid}/stat`, 'utf8');
  const fields = text.slice(text.lastIndexOf(')') + 2).split(' ');
  return { parent: Number(fields[1]), group: Number(fields[2]), start: fields[19] };
}
// Numeric PGIDs alone are not ownership. A live, previously observed start
// identity anchors surviving descendants after the original leader exits.
export function ownsBuildGroup(identity, members) {
  if (!identity || !Number.isSafeInteger(identity.id) || identity.id <= 1
    || !Array.isArray(identity.known) || !Array.isArray(members) || !members.length
    || members.some(p => p.group !== identity.id)) return false;
  const leader = members.find(p => p.pid === identity.id);
  if (leader && leader.start !== identity.start) return false;
  return members.some(p => identity.known.some(k => k.pid === p.pid && k.start === p.start));
}
function realAdapter(expectedHead, emit, signal) {
  let directory; let identity; let namespace; let namespaceIdentity; let resolver; let created = false; let resolverCreated = false; let resolverBaseCreated = false;
  let artifact; const buildGroups = [];
  const ownsBuildRoot = () => {
    if (!directory || !identity) return false;
    const current = fs.lstatSync(directory);
    return current.isDirectory() && !current.isSymbolicLink() && current.ino === identity.ino
      && current.dev === identity.dev && current.uid === process.getuid() && path.dirname(directory) === '/tmp';
  };
  const buildMembers = id => fs.readdirSync('/proc').filter(v => /^\d+$/u.test(v)).flatMap(v => {
    try { const info = procStat(Number(v)); return info.group === id ? [{ pid: Number(v), ...info }] : []; }
    catch (error) { if (['ENOENT', 'ESRCH'].includes(error.code)) return []; throw Error('probe_cleanup'); }
  });
  const ownBuildGroup = id => {
    check(ownsBuildRoot(), 'p7_build');
    const leader = procStat(id); check(leader.group === id, 'p7_build');
    const identity = { id, start: leader.start, known: [{ pid: id, start: leader.start }] };
    const observe = () => {
      const members = buildMembers(id);
      if (ownsBuildGroup(identity, members)) for (const member of members) {
        if (!identity.known.some(k => k.pid === member.pid && k.start === member.start))
          identity.known.push({ pid: member.pid, start: member.start });
      }
      return members;
    };
    const record = { identity, observe, tracker: null, trackingFailed: false };
    record.tracker = setInterval(() => { try { observe(); } catch { record.trackingFailed = true; } }, 100);
    buildGroups.push(record);
    return () => {
      const members = observe(); if (!members.length) return;
      check(ownsBuildRoot() && !record.trackingFailed && ownsBuildGroup(identity, members), 'probe_cleanup');
      signalOwned('-KILL', -id, () => ownsBuildRoot() && ownsBuildGroup(identity, observe()));
    };
  };
  let child; let group; let workerIdentity; let childExit; let proof; let port; let inventory; let closing; let targetSummary;
  let networkSummary = Object.fromEntries(networkReasonKeys.map(key => [key, 0]));
  let textSummary;
  let resourceReadback = Object.fromEntries(cleanupFields.map(key => [key, false]));
  const ip = args => rootCommand('/usr/sbin/ip', args);
  const ownsNamespace = () => {
    if (!created || !ownsBuildRoot()) return false;
    const current = fs.statSync(`/run/netns/${namespace}`);
    return current.ino === namespaceIdentity.ino && current.dev === namespaceIdentity.dev;
  };
  const groupMembers = () => fs.readdirSync('/proc').filter(name => /^\d+$/u.test(name)).filter(name => {
    try { return group && procStat(Number(name)).group === group; } catch { return false; }
  }).map(Number);
  const signalOwned = (signalName, target, stillPresent) => {
    if (!stillPresent()) return;
    try { rootCommand('/bin/kill', [signalName, '--', String(target)]); }
    catch { check(!stillPresent(), 'probe_cleanup'); }
  };
  const profileProcessRefs = () => !directory ? [] : fs.readdirSync('/proc').filter(name => /^\d+$/u.test(name)).filter(name => {
    try { return fs.readFileSync(`/proc/${name}/cmdline`, 'utf8').includes(directory); }
    catch (error) { check(['ENOENT', 'ESRCH'].includes(error.code), 'probe_cleanup'); return false; }
  });
  // Only kernel-created local loopback routes are exempt, never another routing table.
  const loopbackRoute = r => r.dev === 'lo' && r.table === 'local' && r.protocol === 'kernel'
    && ['local', 'broadcast'].includes(r.type) && ['127.0.0.0/8', '127.0.0.1', '127.255.255.255', '::1'].includes(r.dst);
  const snapshot = () => ({ links: JSON.parse(ip(['-n', namespace, '-j', 'link'])).map(v => v.ifname).sort(),
    routes4: JSON.parse(ip(['-n', namespace, '-j', '-4', 'route', 'show', 'table', 'all'])).filter(r => !loopbackRoute(r)),
    routes6: JSON.parse(ip(['-n', namespace, '-j', '-6', 'route', 'show', 'table', 'all'])).filter(r => !loopbackRoute(r)),
    resolverEmpty: rootCommand('/usr/bin/stat', ['-c', '%s', `${resolver}/resolv.conf`]) === '0' });
  return {
    targetDiagnostic: () => targetSummary,
    networkDiagnostic: () => networkSummary,
    textDiagnostic: () => textSummary,
    cleanupReadback: () => resourceReadback,
    async inventory() {
      runInventoryPhases(emit, {
        environment: () => {
          check(process.platform === 'linux' && process.env.GITHUB_ACTIONS === 'true' && !process.env.NODE_TEST_CONTEXT, 'probe_inventory');
          inventory = { platform: process.platform, arch: process.arch, imageOS: process.env.ImageOS,
            imageVersion: process.env.ImageVersion, node: process.versions.node, uid: process.getuid(), gid: process.getgid() };
        },
        'chrome-version': () => {
          inventory.chrome = command(chrome, ['--version'], { timeout: 10000 }).match(/\b(\d+\.\d+\.\d+\.\d+)\b/u)?.[1];
        },
        'git-identity': () => {
          inventory.head = command('/usr/bin/git', ['rev-parse', 'HEAD']);
          command('/usr/bin/git', ['ls-files', '--error-unmatch', self]);
        },
        'git-status': () => {
          inventory.clean = command('/usr/bin/git', ['status', '--porcelain', '--untracked-files=all'], { timeout: 15000 }) === '';
        },
        'binary-check': () => {
          for (const executable of [chrome, process.execPath, '/usr/bin/setpriv', '/usr/sbin/ip', '/usr/bin/ss'])
            check(fs.statSync(executable).isFile(), 'probe_inventory');
        },
        'byte-hash': () => {
          // Byte provenance is verified before and after execution; no source or binary download.
          inventory.bytes = [self, chrome, process.execPath].map(file => ({ file, digest: hash(file) }));
          inventory.digests = { runnerSha256: inventory.bytes[0].digest, chromeSha256: inventory.bytes[1].digest,
            nodeSha256: inventory.bytes[2].digest };
        },
      });
      validateInventory(inventory, expectedHead);
      return inventory;
    },
    async build() {
      directory = fs.mkdtempSync('/tmp/sit-p7-v2-browser-'); fs.chmodSync(directory, 0o700); identity = fs.lstatSync(directory);
      artifact = await buildArtifact(directory, expectedHead, emit, signal, ownBuildGroup);
      return artifact;
    },
    async prepare() {
      namespace = path.basename(directory); check(/^sit-p7-v2-browser-[a-zA-Z0-9]{6}$/u.test(namespace), 'probe_inventory');
      resolver = `/etc/netns/${namespace}`;
      check(!fs.existsSync(`/run/netns/${namespace}`) && !fs.existsSync(resolver), 'probe_inventory');
      ip(['netns', 'add', namespace]); created = true;
      namespaceIdentity = fs.statSync(`/run/netns/${namespace}`);
      if (!fs.existsSync('/etc/netns')) {
        rootCommand('/usr/bin/mkdir', ['-m', '755', '/etc/netns']); resolverBaseCreated = true;
      }
      check(fs.lstatSync('/etc/netns').isDirectory() && !fs.lstatSync('/etc/netns').isSymbolicLink(), 'probe_inventory');
      rootCommand('/usr/bin/mkdir', ['-m', '700', resolver]); resolverCreated = true;
      rootCommand('/usr/bin/install', ['-m', '644', '/dev/null', `${resolver}/resolv.conf`]);
      ip(['-n', namespace, 'link', 'set', 'lo', 'up']);
      return snapshot();
    },
    async observe() {
      emit('launch', 'begin');
      const args = ['-n', '--', '/usr/sbin/ip', 'netns', 'exec', namespace, '/usr/bin/setpriv',
        ...privilegeArgs(inventory.uid, inventory.gid), '/usr/bin/env', '-i', 'PATH=/usr/bin:/bin',
        `HOME=${directory}`, `TMPDIR=${directory}`, 'LANG=C.UTF-8', 'SIT_P7_V2_BROWSER_WORKER=1',
        process.execPath, self, '--worker', directory];
      child = spawn('/usr/bin/sudo', args, { detached: true, stdio: ['pipe', 'pipe', 'ignore'], env: { PATH: '/usr/bin:/bin' } });
      child.stdin.on('error', () => {});
      child.once('exit', (code, signal) => { childExit = { code, signal }; });
      if (child.pid) ownBuildGroup(child.pid);
      const result = await new Promise((resolve, reject) => {
        let bytes = ''; let size = 0;
        const finish = (error, value) => { clearTimeout(timer); signal?.removeEventListener('abort', aborted); error ? reject(error) : resolve(value); };
        const aborted = () => finish(Error('probe_aborted'));
        const timer = setTimeout(() => finish(Error('probe_timeout')), 60000);
        signal?.addEventListener('abort', aborted, { once: true });
        child.once('error', () => { if (!child.pid) childExit = { code: null, signal: null }; finish(Error('probe_failure')); });
        child.once('exit', code => finish(code === 0 && proof ? null : Error('probe_failure'), proof));
        child.stdout.on('data', data => {
          try {
            size += data.length; check(size < 524288, 'probe_failure'); bytes += data;
            while (bytes.includes('\n')) {
              const end = bytes.indexOf('\n'); const row = JSON.parse(bytes.slice(0, end)); bytes = bytes.slice(end + 1);
              if (row.event === 'owned') {
                check(!workerIdentity && Number.isInteger(row.pid) && row.pid > 1, 'probe_failure');
                workerIdentity = { pid: row.pid, ...procStat(row.pid) }; group = workerIdentity.group;
                check(group !== procStat(process.pid).group && group > 1, 'probe_failure');
                check(fs.readFileSync(`/proc/${row.pid}/cmdline`, 'utf8').includes(directory), 'probe_failure');
                if (group !== child.pid) ownBuildGroup(group);
                emit('launch', 'confirmed');
              } else if (row.event === 'phase') emit(row.phase, row.result);
              else if (row.event === 'targets') {
                check(!targetSummary && Object.keys(row).length === 2, 'probe_failure');
                targetSummary = validateTargetDiagnostic(row.value);
              }
              else if (row.event === 'network') {
                check(Object.keys(row).length === 2, 'probe_failure');
                networkSummary = validateNetworkDiagnostic(row.value, networkSummary);
              }
              else if (row.event === 'text-diagnostic') {
                check(textSummary===undefined && exact(row,['event','value']), 'probe_failure');
                textSummary=validateTextDiagnostic(row.value);
              }
              else if (row.event === 'port') { check(Number.isInteger(row.port) && row.port > 0 && row.port < 65536, 'probe_failure'); port = row.port; }
              else if (row.event === 'observation') {
                check(!proof && Array.isArray(row.pids) && row.pids.length > 0, 'probe_sandbox');
                row.value.renderers = row.pids.map(pid => {
                  check(Number.isInteger(pid) && pid > 1 && procStat(pid).group === group, 'probe_sandbox');
                  const s = statusFields(rootCommand('/usr/bin/cat', [`/proc/${pid}/status`]));
                  const cmd = rootCommand('/usr/bin/cat', [`/proc/${pid}/cmdline`]);
                  check(cmd.includes('--type=renderer'), 'probe_sandbox');
                  return { uid: Number(s.Uid?.split(/\s+/u)[0]), gid: Number(s.Gid?.split(/\s+/u)[0]),
                    seccomp: Number(s.Seccomp), filters: Number(s.Seccomp_filters), noNewPrivs: Number(s.NoNewPrivs),
                    capabilities: s.CapEff, nestedPidNamespace: s.NSpid?.split(/\s+/u).length >= 2,
                    forbiddenFlags: /--(?:no-sandbox|disable-\S*sandbox|ignore-certificate-errors)/u.test(cmd) };
                });
                check(Object.values(networkSummary).every(count => count === 0), 'p7_network');
                validateObservation(row.value, inventory, artifact); proof = row.value;
                // Keep renderers alive until the external controller verified /proc.
                child.stdin.end('verified\n');
              } else if (row.event === 'failure') {
                check(codes.has(row.code), 'probe_failure'); finish(Error(row.code));
              } else check(false, 'probe_failure');
            }
          } catch (error) { finish(Error(codes.has(error?.message) ? error.message : 'probe_failure')); }
        });
      });
      validateNetwork(snapshot());
      for (const item of inventory.bytes) check(hash(item.file) === item.digest, 'probe_inventory');
      return result;
    },
    cleanup() {
      return closing ??= (async () => {
        emit('terminate', 'begin');
        for (const record of buildGroups) clearInterval(record.tracker);
        for (const record of buildGroups) {
          const { identity, observe } = record;
          const members = observe();
          if (members.length) {
            check(ownsBuildRoot() && !record.trackingFailed && ownsBuildGroup(identity, members), 'probe_cleanup');
            signalOwned('-KILL', -identity.id, () => ownsBuildRoot() && ownsBuildGroup(identity, observe()));
          }
          for (let i = 0; i < 20 && observe().length; i++) await delay(100);
          check(observe().length === 0, 'probe_cleanup');
        }
        // The launcher and worker groups above are start-identity bound, never
        // authorized by numeric PGID alone. Namespace-only stragglers also
        // require the exact owned namespace and a fresh process start identity.
        if (created) {
          check(ownsNamespace(), 'probe_cleanup');
          const pids = ip(['netns', 'pids', namespace]).split(/\s+/u).filter(Boolean);
          for (const pid of pids) {
            check(/^\d+$/u.test(pid) && Number(pid) > 1, 'probe_cleanup');
            let start;
            try { start = procStat(Number(pid)).start; } catch (error) { if (error.code === 'ENOENT') continue; throw error; }
            signalOwned('-KILL', pid, () => ownsNamespace()
              && ip(['netns', 'pids', namespace]).split(/\s+/u).includes(pid)
              && procStat(Number(pid)).start === start);
          }
          for (let i = 0; i < 20 && ip(['netns', 'pids', namespace]); i++) await delay(100);
        }
        const launcherAbsent = !child?.pid || !fs.readdirSync('/proc').filter(name => /^\d+$/u.test(name)).some(name => {
          try { return procStat(Number(name)).group === child.pid; } catch { return false; }
        });
        const groupAbsent = (!group || groupMembers().length === 0) && (!child || Boolean(childExit)) && launcherAbsent;
        const processesAbsent = (!created || ip(['netns', 'pids', namespace]) === '') && profileProcessRefs().length === 0;
        let portClosed = !port;
        if (created) portClosed = ip(['netns', 'exec', namespace, '/usr/bin/ss', '-ltnH']) === '';
        Object.assign(resourceReadback, { groupAbsent, processesAbsent, portClosed,
          exitCode: !child ? 0 : childExit?.code ?? null, exitSignal: childExit?.signal ?? null });
        check(groupAbsent && processesAbsent && portClosed, 'probe_cleanup'); emit('terminate', 'confirmed');
        if (created) { check(ownsNamespace(), 'probe_cleanup'); ip(['netns', 'delete', namespace]); }
        resourceReadback.namespaceRemoved = !namespace || !fs.existsSync(`/run/netns/${namespace}`);
        if (resolverCreated) {
          // An interrupted install may leave only the newly-owned empty directory.
          if (rootCommand('/usr/bin/find', [resolver, '-mindepth', '1', '-maxdepth', '1', '-name', 'resolv.conf']))
            rootCommand('/usr/bin/unlink', [`${resolver}/resolv.conf`]);
          rootCommand('/usr/bin/rmdir', [resolver]);
        }
        if (resolverBaseCreated) rootCommand('/usr/bin/rmdir', ['/etc/netns']);
        resourceReadback.resolverRemoved = !resolver || !fs.existsSync(resolver);
        if (directory) {
          const current = fs.lstatSync(directory);
          check(current.isDirectory() && !current.isSymbolicLink() && current.ino === identity.ino
            && current.dev === identity.dev && current.uid === process.getuid() && path.dirname(directory) === '/tmp', 'probe_cleanup');
          fs.rmSync(directory, { recursive: true });
        }
        resourceReadback.profileRemoved = !directory || !fs.existsSync(directory);
        return { ...resourceReadback };
      })();
    },
  };
}

// Static Flutter text may share a merged semantics label and has no clickable
// DOM rectangle for each line. Keep standalone exact AX lines, or correlate
// an exact DOM aria-label line and the known flattened AX boundary in ONE read
// iteration. Neither signal alone admits static text; controls remain hit-tested.
const componentHeadings=['Position 1 · Synthetischer Eigentümer 1','Position 2 · Synthetischer Eigentümer 2'];
export const isStaticTextLabel=label=>typeof label==='string'&&(componentHeadings.includes(label)
  ||/^(?:Übergabe|Rückgabe): [0-4]\/4 synthetische Foto-Slots$/u.test(label));
const textDiagnosticKeys=['observations','exact_ax_line','exact_dom_label_line','rendered_dom_label_line','flattened_ax_boundary_match','absent'];
// Geometry proves only that the connected labelled semantics CONTAINER has a
// finite nonzero rectangle intersecting the current viewport. It does not
// prove individual heading pixels, lack of occlusion, or control hit testing.
export function renderedSemanticsRect(rect,viewport) {
  const shape=(v,keys)=>v&&Object.getPrototypeOf(v)===Object.prototype&&Reflect.ownKeys(v).length===keys.length
    &&keys.every(k=>{const d=Object.getOwnPropertyDescriptor(v,k);return d&&Object.hasOwn(d,'value')&&Number.isFinite(d.value);});
  if(!shape(rect,['x','y','width','height'])||!shape(viewport,['width','height'])
    ||rect.width<=0||rect.height<=0||viewport.width<=0||viewport.height<=0)return false;
  const right=rect.x+rect.width;const bottom=rect.y+rect.height;
  return Number.isFinite(right)&&Number.isFinite(bottom)
    &&Math.max(rect.x,0)<Math.min(right,viewport.width)&&Math.max(rect.y,0)<Math.min(bottom,viewport.height);
}
export function classifyTextObservation(label,text,domExact,domRendered=false) {
  check(isStaticTextLabel(label)&&typeof text==='string'&&typeof domExact==='boolean'
    &&typeof domRendered==='boolean'&&(!domRendered||domExact),'probe_failure');
  const lines=text.split('\n');
  const ax=lines.includes(label);
  // Headings keep their existing closed necessity boundary. Evidence counts
  // can occur inside a merged AX line, but only as complete space-delimited
  // tokens followed immediately by the fixed first slot label, never a loose
  // substring. The same observation still needs the exact DOM line + geometry.
  const flat=componentHeadings.includes(label)?lines.some(line=>['Pflichtkomponente','Optionale Komponente'].some(next=>{
    const prefix=`${label} ${next}`;return line===prefix||line.startsWith(`${prefix} `);
  })):lines.some(line=>{
    const boundary=`${label} Übersicht:`;
    return line===boundary||line.startsWith(`${boundary} `)||line.endsWith(` ${boundary}`)||line.includes(` ${boundary} `);
  });
  return {exact_ax_line:Number(ax),exact_dom_label_line:Number(domExact),rendered_dom_label_line:Number(domRendered),
    flattened_ax_boundary_match:Number(flat),absent:Number(!ax&&!domExact&&!flat)};
}
export function validateTextDiagnostic(value) {
  check(exact(value,textDiagnosticKeys)&&Object.values(value).every(n=>Number.isInteger(n)&&n>=0&&n<=18)
    && value.observations===18&&value.exact_ax_line===0
    && value.rendered_dom_label_line<=value.exact_dom_label_line
    && value.absent+value.rendered_dom_label_line+value.flattened_ax_boundary_match<=18
    && value.absent+Math.max(value.exact_dom_label_line,value.flattened_ax_boundary_match)<=18
    && value.absent+value.exact_dom_label_line+value.flattened_ax_boundary_match>=18,'probe_failure');
  return Object.fromEntries(textDiagnosticKeys.map(key=>[key,value[key]]));
}
export async function requireRenderedText(label,{readText,scroll,safe,readDomEvidence,onFailure}) {
  check(isStaticTextLabel(label),'probe_failure');
  const diagnostic=readDomEvidence?Object.fromEntries(textDiagnosticKeys.map(key=>[key,0])):null;
  for(let attempt=0;attempt<18;attempt++) {
    safe();
    const text=await readText();
    if(text.split('\n').includes(label))return;
    if(diagnostic){
      const dom=await readDomEvidence();
      check(exact(dom,['exactLine','rendered']),'probe_failure');
      const observation=classifyTextObservation(label,text,dom.exactLine,dom.rendered);
      safe();
      if(observation.exact_dom_label_line===1&&observation.rendered_dom_label_line===1
        &&observation.flattened_ax_boundary_match===1)return;
      diagnostic.observations++;
      for(const [key,count]of Object.entries(observation))diagnostic[key]+=count;
    }
    if(attempt<17)await scroll();
  }
  if(diagnostic)onFailure(validateTextDiagnostic(diagnostic));
  throw Error('p7_matrix');
}

// Unlike static semantics-container geometry, controls require a fully visible
// finite rectangle and both browser hit-test APIs to identify that control (or
// its descendant). Select DOM occurrence BEFORE geometry, never a visible
// duplicate. Occurrence zero is the source-order binding to the view's first
// component; it is not an inferred DOM ancestor/component identity.
export function resolveBrowserControl(document,label,componentIndex,viewport) {
  if(typeof label!=='string'||!viewport||!Number.isFinite(viewport.width)||!Number.isFinite(viewport.height)
    ||viewport.width<=0||viewport.height<=0)return null;
  if(componentIndex!==null&&(componentIndex!==0||!['Synthetische Belegdetails öffnen','Belegdetails schließen'].includes(label)))return null;
  const candidates=[...document.querySelectorAll('[role="button"]')].filter(e=>e.getAttribute('role')==='button'
    &&(e.hasAttribute('aria-label')?e.getAttribute('aria-label'):e.textContent)===label);
  if(componentIndex===null?candidates.length!==1:candidates.length<1||candidates.length>2)return null;
  // The unchanged view owns one expanded index, so two close controls are
  // contradictory, not interchangeable evidence of a successful transition.
  if(label==='Belegdetails schließen'&&candidates.length!==1)return null;
  const e=candidates[0];
  if(!e.isConnected||e.disabled||e.getAttribute('aria-disabled')==='true'||e.getClientRects().length===0)return null;
  const style=document.defaultView.getComputedStyle(e);
  if(style.display==='none'||style.visibility!=='visible'||!(Number(style.opacity)>0))return null;
  const r=e.getBoundingClientRect();
  if(![r.x,r.y,r.width,r.height].every(Number.isFinite)||r.width<=0||r.height<=0||r.x<0||r.y<0
    ||!Number.isFinite(r.x+r.width)||!Number.isFinite(r.y+r.height)
    ||r.x+r.width>viewport.width||r.y+r.height>viewport.height)return null;
  const p={x:r.x+r.width/2,y:r.y+r.height/2};
  const related=hit=>Boolean(hit&&(hit===e||e.contains(hit)));
  if(!related(document.elementFromPoint(p.x,p.y))||!related(document.elementsFromPoint(p.x,p.y)[0]))return null;
  return p;
}
export async function requireControlPoint({read,advance,safe}) {
  for(let attempt=0;attempt<18;attempt++){
    safe();const p=await read();safe();
    if(p!==null){check(exact(p,['x','y'])&&Number.isFinite(p.x)&&Number.isFinite(p.y)&&p.x>=0&&p.y>=0,'p7_matrix');return p;}
    if(attempt<17)await advance();
  }
  throw Error('p7_matrix');
}

function resolveStaticBrowserPoint(document,label,viewport) {
  const es=[...document.querySelectorAll('flt-semantics,[role="button"]')];
  for(const e of es){if(e.getAttribute('aria-label')!==label&&e.textContent!==label)continue;
    const r=e.getBoundingClientRect();if(r.width>0&&r.height>0&&r.left>=0&&r.right<=viewport.width&&r.top>=0&&r.bottom<=viewport.height)
      return {x:r.x+r.width/2,y:r.y+r.height/2};}return null;
}
function resolveBrowserText(document,label,viewport,geometry) {
  const elements=[...document.querySelectorAll('flt-semantics[aria-label]')]
    .filter(e=>e.getAttribute('aria-label').split('\n').includes(label));
  const rendered=elements.some(e=>{
    if(!e.isConnected||e.getClientRects().length===0)return false;
    const style=document.defaultView.getComputedStyle(e);
    if(style.display==='none'||style.visibility!=='visible'||!(Number(style.opacity)>0))return false;
    const r=e.getBoundingClientRect();
    return geometry({x:r.x,y:r.y,width:r.width,height:r.height},viewport);
  });return {exactLine:elements.length>0,rendered};
}
// Only module-owned function source is code. Labels and occurrence selection
// travel as CDP CallArgument.value, never interpolated/escaped into JavaScript.
const browserDomFunctions=Object.freeze({
  point:`function(label){return (${resolveStaticBrowserPoint.toString()})(document,label,{width:innerWidth,height:innerHeight});}`,
  text:`function(label){return (${resolveBrowserText.toString()})(document,label,{width:innerWidth,height:innerHeight},${renderedSemanticsRect.toString()});}`,
  control:`function(label,index){return (${resolveBrowserControl.toString()})(document,label,index,{width:innerWidth,height:innerHeight});}`,
});
export async function readBrowserDom({cdp,session,kind,label,componentIndex=null}) {
  check(typeof kind==='string'&&Object.hasOwn(browserDomFunctions,kind)&&typeof label==='string'&&label.length>0&&label.length<=512
    &&(componentIndex===null||(kind==='control'&&componentIndex===0)),'p7_matrix');
  let objectId;
  try {
    const context=await cdp('Runtime.evaluate',{expression:'globalThis',returnByValue:false},session);
    const candidate=context?.result?.objectId;
    if(typeof candidate==='string'&&candidate.length>0&&candidate.length<=512)objectId=candidate;
    check(!context?.exceptionDetails&&objectId!==undefined,'p7_matrix');
    const result=await cdp('Runtime.callFunctionOn',{objectId,functionDeclaration:browserDomFunctions[kind],
      arguments:[{value:label},{value:componentIndex}],returnByValue:true,awaitPromise:true},session);
    check(!result?.exceptionDetails,'p7_matrix');
    const value=result?.result?.value;
    check(kind==='text'?exact(value,['exactLine','rendered'])&&typeof value.exactLine==='boolean'&&typeof value.rendered==='boolean'
      :value===null||(exact(value,['x','y'])&&Number.isFinite(value.x)&&Number.isFinite(value.y)&&value.x>=0&&value.y>=0),'p7_matrix');
    return value;
  } catch {throw Error('p7_matrix');}
  finally {if(objectId!==undefined){try{await cdp('Runtime.releaseObject',{objectId},session);}catch{throw Error('p7_matrix');}}}
}

async function observeDisplayMatrix({cdp,evaluate,session,safe,emit,onTextDiagnostic}) {
  const call=(method,params={})=>cdp(method,params,session);
  const disclosure='Synthetischer Test – keine authentischen Fotos, keine vertragliche oder finanzielle Wirkung. Keine echte Miete. D1–D4 offen.';
  const labels={incomplete:'unvollständig',readback_required:'Ergebnis muss geprüft werden',needs_clarification:'Klärung erforderlich',
    accepted:'synthetisch angenommen',not_bound:'nicht gebunden',rejected:'abgelehnt',timeout:'Zeitüberschreitung',
    none:'kein Ereignis belegt',open:'offen',unknown:'unbekannt'};
  const text=async()=>{safe();const a=await call('Accessibility.getFullAXTree');
    const names=(a.nodes??[]).map(n=>n.name?.value).filter(v=>typeof v==='string');
    const t=names.join('\n');check(!t.includes('P7 render failure'),'p7_render');
    check(!/p7v2-synthetic-|[a-f0-9]{64}/u.test(t),'p7_matrix');return t;};
  const staticPoint=label=>readBrowserDom({cdp,session,kind:'point',label});
  const wheel=async(delta)=>{const size=await evaluate('({width:innerWidth,height:innerHeight})');
    await call('Input.dispatchMouseEvent',{type:'mouseWheel',x:size.width/2,y:size.height-80,deltaX:0,deltaY:delta});await delay(80);};
  const renderedText=label=>requireRenderedText(label,{readText:text,scroll: ()=>wheel(250),safe,
    ...(isStaticTextLabel(label)?{
      readDomEvidence:()=>readBrowserDom({cdp,session,kind:'text',label}),
      onFailure:onTextDiagnostic,
    }:{})});
  const textStep=async(name,action)=>{
    emit(name,'begin');
    try{await action();emit(name,'confirmed');}
    catch(error){emit(name,'failed');throw error;}
  };
  const controlPoint=(label,componentIndex=null)=>readBrowserDom({cdp,session,kind:'control',label,componentIndex});
  const visibleControl=(label,componentIndex)=>requireControlPoint({read:()=>controlPoint(label,componentIndex),advance:()=>wheel(250),safe});
  const waitControlState=(label,componentIndex)=>requireControlPoint({read:()=>controlPoint(label,componentIndex),advance:()=>delay(80),safe});
  const click=async(label,scroll=false,componentIndex=null)=>{const p=scroll?await visibleControl(label,componentIndex):await controlPoint(label,componentIndex);check(p,'p7_matrix');
    for(const type of ['mousePressed','mouseReleased'])await call('Input.dispatchMouseEvent',{type,...p,button:'left',clickCount:1});await delay(100);};
  const waitText=async(label)=>{for(let i=0;i<60;i++){if((await text()).includes(label))return;await delay(100);}throw Error('p7_matrix');};
  const keyboardActivate=async()=>{for(const type of ['keyDown','keyUp'])await call('Input.dispatchKeyEvent',
    {type,key:'Enter',code:'Enter',windowsVirtualKeyCode:13,nativeVirtualKeyCode:13});await delay(100);};
  await call('Page.navigate',{url:origin});await waitText('Synthetische Testansicht nicht freigegeben');
  const matrix=[];
  for(const plan of matrixPlan){
    emit(`display-row-${plan.step}`,'begin');
    try {
      await call('Emulation.setDeviceMetricsOverride',{width:plan.width,height:plan.height,deviceScaleFactor:1,mobile:false});
      await delay(100); await click(`P7 case ${plan.scenario}`);await waitText(`P7 selected ${plan.scenario}`);
      if(plan.scenario==='unavailable'){
        const t=await text();check(t.includes('Synthetische Testansicht nicht freigegeben')&&!t.includes(disclosure),'p7_matrix');
      }else{
        await waitText(`Mission: ${labels[plan.status]}`);check((await text()).includes(disclosure),'p7_matrix');
        check(await staticPoint(disclosure),'p7_matrix');
        // Lazy ListView children must actually render independently; duplicate
        // axis labels are not proof that both separate components were shown.
        for(const [phase,heading] of [
          ['display-component-first','Position 1 · Synthetischer Eigentümer 1'],
          ['display-component-second','Position 2 · Synthetischer Eigentümer 2']]) {
          await textStep(phase,async()=>{await renderedText(heading);});
        }
        await wheel(-10000);
        // All eleven axis labels must exist in this real rendered component.
        for(const label of ['Verfügbarkeit:','Passung:','Freigabe:','Annahme:','Vertrag:','Zahlung:',
          'Übergabe:','Rückgabe:','Erstattung:','Auszahlung:','Klärungsfall:']){
          for(let i=0;i<12&&!(await text()).includes(label);i++)await wheel(180);
          check((await text()).includes(label),'p7_matrix');
        }
        check((await text()).includes(`Annahme: ${labels[plan.acceptance]}`),'p7_matrix');
        check((await text()).includes(`Klärungsfall: ${labels[plan.dispute]}`),'p7_matrix');
        if(plan.reason)check((await text()).includes('Rückgabe-Klärungsgrund (synthetisch): widersprüchlicher Rückgabe-/Prüffallstatus.'),'p7_matrix');
        if(plan.scenario==='released')check((await text()).includes('Freigabe: freigegeben'),'p7_matrix');
        await wheel(-10000);
        await textStep('display-evidence-click',()=>click('Synthetische Belegdetails öffnen',true,0));
        await textStep('display-evidence-open-state',()=>waitControlState('Belegdetails schließen',0));
        for(const [name,count]of [['Übergabe',plan.pickup],['Rückgabe',plan.returnCount]]) {
          await textStep(name==='Übergabe'?'display-pickup-count':'display-return-count',async()=>{
            await renderedText(`${name}: ${count}/4 synthetische Foto-Slots`);
          });
        }
        const t=await text();check(t.includes('QR-v3: synthetischer Verifizierungsbeleg')===plan.qr
          &&t.includes('Fallback: exakt 6 Ziffern, synthetischer Verifizierungsbeleg')===plan.fallback,'p7_matrix');
        for(const label of ['Übersicht:','Detail:','Zubehör:','Kritischer Bereich:'])check(t.includes(label),'p7_matrix');
        // Keyboard uses the focus retained by the actually clicked local action.
        await wheel(-10000); await click('Belegdetails schließen',true,0);
        await waitControlState('Synthetische Belegdetails öffnen',0);await keyboardActivate();
        await waitControlState('Belegdetails schließen',0);
        check((await text()).includes('synthetische Foto-Slots'),'p7_matrix');
        await wheel(-10000);await click('Testansicht zurücksetzen',true);
        check(!(await text()).includes('synthetische Foto-Slots'),'p7_matrix');
        check(await staticPoint(disclosure),'p7_matrix');
      }
      const geometry=await evaluate('document.documentElement.scrollWidth<=innerWidth&&document.documentElement.scrollHeight<=innerHeight');
      check(geometry===true,'p7_matrix');
      const shot=await call('Page.captureScreenshot',{format:'png',captureBeyondViewport:false});
      check(typeof shot.data==='string'&&shot.data.length>100&&shot.data.length<8*1024*1024,'p7_matrix');
      matrix.push({...plan,disclosure:plan.scenario!=='unavailable',geometry:true,
        keyboard:plan.scenario==='unavailable'?'not_applicable':true,reset:plan.scenario==='unavailable'?'not_applicable':true,
        screenshotSha256:digest(Buffer.from(shot.data,'base64'))});
      emit(`display-row-${plan.step}`,'confirmed');
    }catch(error){emit(`display-row-${plan.step}`,'failed');throw error;}
  }
  await call('Page.reload',{ignoreCache:true});await waitText('Synthetische Testansicht nicht freigegeben');
  check((await text()).includes('P7 selected unavailable'),'p7_matrix');
  return {matrix,reloadReset:true};
}

async function worker(directory) {
  const send = value => process.stdout.write(JSON.stringify(value) + '\n');
  const phase = (name, result) => send({ event: 'phase', phase: name, result });
  check(process.platform === 'linux' && process.env.SIT_P7_V2_BROWSER_WORKER === '1'
    && /^\/tmp\/sit-p7-v2-browser-[a-zA-Z0-9]{6}$/u.test(directory), 'probe_arguments');
  const s = statusFields(fs.readFileSync('/proc/self/status', 'utf8'));
  const workerPrivileges = process.getuid() > 0 && process.getgid() > 0 && s.Groups === ''
    && s.NoNewPrivs === '1' && ['CapInh', 'CapPrm', 'CapEff', 'CapBnd', 'CapAmb'].every(key => s[key] === '0000000000000000');
  check(workerPrivileges && fs.readFileSync('/etc/resolv.conf', 'utf8') === '', 'probe_sandbox');
  send({ event: 'owned', pid: process.pid });
  let acknowledge; let rejectAcknowledgement;
  const acknowledgement = new Promise((resolve, reject) => { acknowledge = resolve; rejectAcknowledgement = reject; });
  // Attach rejection handling before any read; no raw control bytes are logged.
  acknowledgement.catch(() => {});
  let control = '';
  process.stdin.on('data', data => { control += data; if (control.length > 32) rejectAcknowledgement(Error('probe_failure')); });
  process.stdin.on('end', () => control === 'verified\n' ? acknowledge() : rejectAcknowledgement(Error('probe_failure')));
  process.stdin.on('error', () => rejectAcknowledgement(Error('probe_failure')));
  let assetServer; let browser; let socket; let exited; let port; let nextId = 0;
  let onEvent = () => {}; let failedRequest = false; let renderFailure = false; let blockedUnexpected = 0; const pending = new Map();
  const networkCounts = Object.fromEntries(networkReasonKeys.map(key => [key, 0]));
  const recordBlock = reason => {
    check(networkReasonKeys.includes(reason), 'probe_failure');
    networkCounts[reason]++; blockedUnexpected++; failedRequest = true;
    send({ event: 'network', value: validateNetworkDiagnostic(networkCounts) });
  };
  const watchdog = setTimeout(() => { process.exitCode = 1; rejectAcknowledgement(Error('probe_timeout')); browser?.kill('SIGKILL'); socket?.close(); }, 50000);
  try {
    browser = spawn(chrome, launchArgs(directory), { stdio: ['ignore', 'ignore', 'ignore'], env: process.env });
    browser.once('error', () => { exited = { code: null, signal: null }; });
    browser.once('exit', (code, signal) => { exited = { code, signal }; for (const entry of pending.values()) entry.reject(Error('probe_failure')); });
    for (let i = 0; i < 100 && !exited; i++) {
      const file = path.join(directory, 'DevToolsActivePort');
      if (fs.existsSync(file)) { const data = fs.readFileSync(file, 'utf8').split('\n')[0]; check(/^\d{1,5}$/u.test(data), 'probe_version'); port = Number(data); break; }
      await delay(100);
    }
    check(port > 0 && port < 65536 && !exited, 'probe_timeout'); send({ event: 'port', port });
    phase('cdp-connect', 'begin');
    const response = await fetch(`http://127.0.0.1:${port}/json/version`, { signal: AbortSignal.timeout(3000), redirect: 'error' });
    check(response.status === 200, 'probe_version'); const data = await response.json();
    check(data.Browser === `Chrome/${contract.chrome}` && data['Protocol-Version'] === '1.3', 'probe_version');
    const url = new URL(data.webSocketDebuggerUrl);
    check(url.protocol === 'ws:' && url.hostname === '127.0.0.1' && url.port === String(port)
      && /^\/devtools\/browser\/[\w-]+$/u.test(url.pathname) && !url.username && !url.password && !url.search && !url.hash, 'probe_version');
    socket = new WebSocket(url);
    socket.addEventListener('message', event => {
      try { check(typeof event.data === 'string' && event.data.length < 8 * 1024 * 1024, 'probe_failure');
        const value = JSON.parse(event.data); const entry = pending.get(value.id); if (!entry) { onEvent(value); return; }
        pending.delete(value.id); value.error ? entry.reject(Error('probe_failure')) : entry.resolve(value.result);
      } catch { for (const entry of pending.values()) entry.reject(Error('probe_failure')); }
    });
    socket.addEventListener('error', () => { for (const entry of pending.values()) entry.reject(Error('probe_failure')); });
    await new Promise((resolve, reject) => { const timer = setTimeout(() => reject(Error('probe_timeout')), 3000);
      socket.addEventListener('open', () => { clearTimeout(timer); resolve(); }, { once: true }); });
    phase('cdp-connect', 'confirmed');
    const cdp = async (method, params = {}, sessionId) => {
      phase(method, 'begin'); const id = ++nextId;
      let value;
      try { value = await new Promise((resolve, reject) => {
        const timer = setTimeout(() => { pending.delete(id); reject(Error('probe_timeout')); }, 3000);
        pending.set(id, { resolve: v => { clearTimeout(timer); resolve(v); }, reject: e => { clearTimeout(timer); reject(e); } });
        socket.send(JSON.stringify({ id, method, params, ...(sessionId ? { sessionId } : {}) }));
      }); } catch (error) { phase(method, 'failed'); throw error; }
      phase(method, 'confirmed'); return value;
    };
    const version = await cdp('Browser.getVersion');
    const targets = (await cdp('Target.getTargets')).targetInfos;
    send({ event: 'targets', value: summarizeTargets(targets) });
    const blankTarget = selectBlankTarget(targets);
    const session = (await cdp('Target.attachToTarget', { targetId: blankTarget.targetId, flatten: true })).sessionId;
    await cdp('Page.enable', {}, session); await cdp('Runtime.enable', {}, session);
    await cdp('Accessibility.enable', {}, session);
    const artifact = validateArtifact(JSON.parse(fs.readFileSync(path.join(directory, 'artifact.json'), 'utf8')));
    const webRoot = path.join(directory, 'checkout/build/web');
    check(artifactDigest(inventoryTree(webRoot)) === artifact.artifactDigest, 'p7_artifact');
    const files = new Map(artifact.files.map(file => [file.path, file]));
    const mime = { html: 'text/html; charset=utf-8', js: 'text/javascript', json: 'application/json',
      wasm: 'application/wasm', ttf: 'font/ttf', otf: 'font/otf', png: 'image/png', bin: 'application/octet-stream' };
    phase('asset-server', 'begin');
    assetServer = http.createServer((request, response) => {
      const name = request.url?.slice(1); const file = files.get(name);
      if (request.method !== 'GET' || !file) { response.writeHead(404); response.end(); failedRequest = true; return; }
      try {
        const bytes = fs.readFileSync(path.join(webRoot, name));
        check(createHash('sha256').update(bytes).digest('hex') === file.sha256, 'p7_artifact');
        response.writeHead(200, { 'Content-Type': mime[name.split('.').at(-1)] ?? 'application/octet-stream', 'Cache-Control': 'no-store' });
        response.end(bytes);
      } catch { failedRequest = true; response.writeHead(500); response.end(); }
    });
    await new Promise((resolve, reject) => { assetServer.once('error', () => reject(Error('p7_network'))); assetServer.listen(0, '127.0.0.1', resolve); });
    const assetPort = assetServer.address().port;
    const local = await fetch(`http://127.0.0.1:${assetPort}/index.html`, { redirect: 'error', signal: AbortSignal.timeout(3000) });
    check(local.status === 200, 'p7_network'); await local.arrayBuffer(); phase('asset-server', 'confirmed');
    const requests = new Set();
    onEvent = event => {
      if (event.method === 'Runtime.exceptionThrown') renderFailure = true;
      if (event.method === 'Network.webSocketCreated') recordBlock('websocket');
      if (event.method !== 'Fetch.requestPaused') return;
      const fulfill = async () => {
        phase('Fetch.requestPaused', 'begin');
        const request = event.params; const name = classifyAsset(request.request?.url, request.resourceType, new Set(files.keys()));
        if (!name || request.request?.method !== 'GET' || request.responseStatusCode) {
          recordBlock(classifyBlockedRequest({ method: request.request?.method, url: request.request?.url,
            type: request.resourceType, responseStatusCode: request.responseStatusCode }, new Set(files.keys())));
          await cdp('Fetch.failRequest', { requestId: request.requestId, errorReason: 'BlockedByClient' }, session);
        } else {
          const response = await fetch(`http://127.0.0.1:${assetPort}/${name}`, { redirect: 'error', signal: AbortSignal.timeout(3000) });
          check(response.status === 200, 'p7_network'); const bytes = Buffer.from(await response.arrayBuffer());
          check(createHash('sha256').update(bytes).digest('hex') === files.get(name).sha256, 'p7_artifact');
          await cdp('Fetch.fulfillRequest', { requestId: request.requestId, responseCode: 200,
            responseHeaders: [{ name: 'Content-Type', value: mime[name.split('.').at(-1)] ?? 'application/octet-stream' },
              { name: 'Cache-Control', value: 'no-store' }], body: bytes.toString('base64') }, session);
        }
        phase('Fetch.requestPaused', 'confirmed');
      };
      const operation = fulfill().catch(() => { failedRequest = true; phase('Fetch.requestPaused', 'failed'); });
      requests.add(operation); operation.finally(() => requests.delete(operation));
    };
    await cdp('Network.enable', {}, session);
    await cdp('Fetch.enable', { patterns: [{ urlPattern: '*', requestStage: 'Request' }] }, session);
    const evaluate = async expression => {
      const result = await cdp('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true }, session);
      check(!result.exceptionDetails, 'p7_matrix'); return result.result?.value;
    };
    phase('display-matrix', 'begin');
    const { matrix, reloadReset } = await observeDisplayMatrix({ cdp, evaluate, session,
      safe: () => { check(!failedRequest, 'p7_network'); check(!renderFailure, 'p7_render'); }, emit: phase,
      onTextDiagnostic:value=>send({event:'text-diagnostic',value:validateTextDiagnostic(value)}) });
    await Promise.all(requests); check(!failedRequest, 'p7_network'); validateMatrix(matrix);
    check(artifactDigest(inventoryTree(webRoot)) === artifact.artifactDigest, 'p7_artifact');
    const finalTargets = (await cdp('Target.getTargets')).targetInfos;
    const finalCounts = summarizeTargets(finalTargets);
    check(JSON.stringify(finalCounts) === JSON.stringify({ pageBlank: 0, pageOther: 1, browserUi: 2,
      extension: 0, serviceWorker: 0, other: 0 }) && finalTargets.some(t => t.targetId === blankTarget.targetId
        && t.type === 'page' && t.url === 'https://p7-synthetic.invalid/'), 'probe_targets');
    phase('display-matrix', 'confirmed');
    const result = await cdp('Runtime.evaluate', { expression: '1+1', returnByValue: true }, session);
    const processes = await cdp('SystemInfo.getProcessInfo');
    phase('network', 'begin');
    const externalTcp = await new Promise(resolve => {
      const connection = net.connect({ host: '192.0.2.1', port: 443 });
      const done = value => { connection.destroy(); resolve(value); };
      connection.once('connect', () => done('connected')); connection.once('error', e => done(e.code === 'ENETUNREACH' ? e.code : 'other'));
      connection.setTimeout(1000, () => done('timeout'));
    }); phase('network', 'confirmed');
    send({ event: 'observation', pids: processes.processInfo.filter(p => p.type === 'renderer').map(p => p.id),
      value: { browser: version.product, protocol: version.protocolVersion, httpStatus: response.status,
        targetCounts: summarizeTargets(targets), evaluated: result.result?.value === 2,
        workerPrivileges, externalTcp, loopback: response.status, matrix, reloadReset, blockedUnexpected,
        artifactDigest: artifact.artifactDigest, sourceDigest: artifact.sourceDigest, sourceHead: artifact.sourceHead,
        networkCounts } });
    await acknowledgement;
    await cdp('Browser.close');
    for (let i = 0; i < 30 && !exited; i++) await delay(100);
    check(exited?.code === 0 && exited?.signal === null, 'probe_cleanup');
  } finally { clearTimeout(watchdog); if (assetServer) await new Promise(resolve => { assetServer.closeAllConnections(); assetServer.close(resolve); }); socket?.close(); if (!exited) browser?.kill('SIGTERM'); }
}

if (process.argv[1] && path.resolve(process.argv[1]) === self) {
  if (process.argv.length === 4 && process.argv[2] === '--worker' && process.env.SIT_P7_V2_BROWSER_WORKER === '1') {
    try { await worker(process.argv[3]); } catch (error) {
      process.stdout.write(JSON.stringify({ event: 'failure', code: codes.has(error?.message) ? error.message : 'probe_failure' }) + '\n');
      process.exitCode = 1;
    }
  } else {
    const controller = new AbortController(); const abort = () => controller.abort();
    process.once('SIGTERM', abort); process.once('SIGINT', abort);
    let result;
    try { const expectedHead = parseArgs(process.argv.slice(2)); result = await runProbe({ expectedHead, signal: controller.signal,
      journal: row => process.stderr.write(JSON.stringify(row) + '\n') }); }
    catch (error) { result = fail(error?.message); }
    finally { process.removeListener('SIGTERM', abort); process.removeListener('SIGINT', abort); }
    process.stdout.write(JSON.stringify(result) + '\n'); process.exitCode = result.status === 'pass' ? 0 : 1;
  }
}
