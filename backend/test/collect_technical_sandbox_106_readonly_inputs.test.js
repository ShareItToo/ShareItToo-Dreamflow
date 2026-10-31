import assert from 'node:assert/strict';
import { chmodSync, fstatSync, lstatSync, mkdtempSync, readFileSync, readdirSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { collectTechnicalSandbox106ReadonlyInputs, parseReadonlyCollectorArgs, readRestrictedSecret,
  readRootAuthorizationEnv, readStagingDisabledMemoryGateway, readStripeTestAccountReadback } from '../ops/collect_technical_sandbox_106_readonly_inputs.mjs';

const fixtureDir=()=>{const d=mkdtempSync(path.join(realpathSync(os.tmpdir()),'sit-readonly-106-'));chmodSync(d,0o700);return d;};
const asOwner=(stat,uid,gid)=>Object.assign(stat,{uid:BigInt(uid),gid:BigInt(gid)});
const adjustedStats=(uid,gid)=>({lstatSync:(file,opts)=>asOwner(lstatSync(file,opts),uid,gid),fstatSync:(fd,opts)=>asOwner(fstatSync(fd,opts),uid,gid)});
const token=()=>['rk','test','ReadonlyFixture'].join('_');
const webhook=()=>['whsec','ReadonlyFixture'].join('_');
const accountId='acct_synthetic1234';
const stripeResponse=(path,status=200,overrides={})=>new Response(JSON.stringify(path==='/v1/account'
  ?{object:'account',id:accountId,...overrides}:{object:'balance',livemode:false,available:[],pending:[],...overrides}),{status});
function authEnv(directory){const file=path.join(directory,'authorization.env');const timestamp=Date.now();
  const text=[`TECHNICAL_SANDBOX_AUTHORIZATION_ID=owner-auth-technical-sandbox-1`,
    `TECHNICAL_SANDBOX_AUTHORIZATION_ISSUED_AT=${new Date(timestamp-60000).toISOString()}`,
    `TECHNICAL_SANDBOX_AUTHORIZATION_EXPIRES_AT=${new Date(timestamp+3600000).toISOString()}`,
    `TECHNICAL_SANDBOX_ACCOUNT_ID=${accountId}`,
    'TECHNICAL_SANDBOX_USER_IDS=synthetic_sandbox_user_owner,synthetic_sandbox_user_renter',
    `TECHNICAL_SANDBOX_SECRET_KEY_FILE=${path.join(directory,'key')}`,
    `TECHNICAL_SANDBOX_WEBHOOK_SECRET_FILE=${path.join(directory,'webhook')}`].join('\n')+'\n';
  writeFileSync(file,text,{mode:0o600});chmodSync(file,0o600);return file;}
function secrets(directory){const key=path.join(directory,'key'),web=path.join(directory,'webhook');
  writeFileSync(key,token(),{mode:0o600});chmodSync(key,0o600);writeFileSync(web,webhook(),{mode:0o600});chmodSync(web,0o600);return {key,web};}

test('authorization env is exact scope-bound, root:root 0600 and race-checked without exposing values',()=>{
  const directory=fixtureDir();try{const file=authEnv(directory),stats=adjustedStats(0,0),now=Date.now();
    const parsed=readRootAuthorizationEnv(file,{fsOps:stats,now:()=>now});
    assert.equal(parsed.accountId,accountId);assert.equal(parsed.authorization.userIds.length,2);
    assert.equal(JSON.stringify(parsed).includes(token()),false);
    assert.throws(()=>readRootAuthorizationEnv(file,{now:()=>now}),/sandbox106_authorization_env_metadata/u);
    assert.throws(()=>readRootAuthorizationEnv(file,{fsOps:stats,now:()=>now,afterRead:()=>writeFileSync(file,'replace') }),/sandbox106_authorization_env_changed/u);
  }finally{rmSync(directory,{recursive:true,force:true});}
});

test('secret inputs use nofollow descriptors, exact runtime owner/mode, format and race check',()=>{
  const directory=fixtureDir();try{const {key}=secrets(directory),ops=adjustedStats(100,101);
    assert.equal(readRestrictedSecret(key,'restricted_test_key',{fsOps:ops}),token());
    assert.throws(()=>readRestrictedSecret(key,'restricted_test_key'),/sandbox106_secret_metadata/u);
    assert.throws(()=>readRestrictedSecret(key,'restricted_test_key',{fsOps:ops,afterRead:()=>writeFileSync(key,'changed-secret-data')}),/sandbox106_secret_changed/u);
  }finally{rmSync(directory,{recursive:true,force:true});}
});

test('Stripe collector uses only fixed bounded GETs and binds exact test account; no mutation methods',async()=>{
  const calls=[];const result=await readStripeTestAccountReadback({secretKey:token(),expectedAccountId:accountId,fetchImpl:async(url,options)=>{
    calls.push({url:String(url),options});return stripeResponse(url.pathname);}});
  assert.deepEqual(calls.map(c=>c.url),['https://api.stripe.com/v1/account','https://api.stripe.com/v1/balance']);
  for(const call of calls){assert.equal(call.options.method,'GET');assert.equal(call.options.redirect,'manual');
    assert.equal(call.options.headers.authorization,`Bearer ${token()}`);}
  assert.equal(result.readback.authenticated,true);assert.equal(result.readback.accountId,accountId);
  assert.equal(result.readback.accountMode,'test');assert.equal(result.readback.livemode,false);
  assert.equal(Object.keys(result.readback).some(key=>/amount|payment|balance/i.test(key)),false);
  assert.equal(JSON.stringify(result).includes(token()),false);
});

test('protected secrets allow exactly one terminal LF and reject whitespace, size and mode drift',()=>{
  const directory=fixtureDir();try{const {key}=secrets(directory),ops=adjustedStats(100,101);
    for(const [kind,value] of [['restricted_test_key',token()],['webhook_secret',webhook()]]){
      for(const suffix of ['', '\n']){
        writeFileSync(key,value+suffix);assert.equal(readRestrictedSecret(key,kind,{fsOps:ops}),value);
      }
      for(const invalid of ['', '\n', value+'\n\n', value+'\r\n', value+'\r', ' '+value, value+' ', value+'\t', value.slice(0,8)+'\n'+value.slice(8), 'x'.repeat(16385)]){
        writeFileSync(key,invalid);assert.throws(()=>readRestrictedSecret(key,kind,{fsOps:ops}),/sandbox106_secret_(format|metadata)/u);
      }
      writeFileSync(key,value+'\n');chmodSync(key,0o640);
      assert.throws(()=>readRestrictedSecret(key,kind,{fsOps:ops}),/sandbox106_secret_metadata/u);chmodSync(key,0o600);
    }
  }finally{rmSync(directory,{recursive:true,force:true});}
});

test('Stripe collector rejects redirects, permission failure, live mode and account drift without retry',async()=>{
  for(const scenario of ['redirect','403','live','account']){let calls=0;
    await assert.rejects(()=>readStripeTestAccountReadback({secretKey:token(),expectedAccountId:accountId,fetchImpl:async url=>{
      calls++;if(scenario==='redirect')return stripeResponse(url.pathname,302);
      if(scenario==='403')return stripeResponse(url.pathname,403);
      if(scenario==='live')return stripeResponse(url.pathname,200,{livemode:true});
      return stripeResponse(url.pathname,200,{id:'acct_other'});
    }}),/sandbox106_stripe_/u);
    assert.equal(calls,scenario==='account'?1:1);
  }
});

test('rollback gateway readback binds exact runtime commit to disabled sandbox and memory payments',async()=>{
  const requests=[];const result=await readStagingDisabledMemoryGateway({expectedCommit:'b'.repeat(40),fetchImpl:async(url,options)=>{
    requests.push({url:String(url),options});return new Response(JSON.stringify(url.pathname==='/api/version'?{commit:'b'.repeat(40)}:
      {status:'ok',release:{commit:'b'.repeat(40)},checks:{paymentProvider:{provider:'memory',status:'disabled',mode:'unavailable',credentialSource:'none'},
        technicalSandbox:{available:false,mode:'disabled'}}}),{status:200});}});
  assert.deepEqual(requests.map(r=>r.url),['https://staging.shareittoo.com/api/version','https://staging.shareittoo.com/api/health/ready']);
  for(const request of requests){assert.equal(request.options.method,'GET');assert.equal(request.options.redirect,'manual');}
  assert.equal(result.technicalSandboxDisabled,true);assert.equal(result.paymentTransport,'memory');
  assert.match(result.gatewayReadbackSha256,/^[a-f0-9]{64}$/u);
  for(const bad of [url=>new Response('redirect',{status:302}),url=>new Response('{}',{status:403}),
    url=>new Response(JSON.stringify(url.pathname==='/api/version'?{commit:'c'.repeat(40)}:
      {status:'ok',release:{commit:'b'.repeat(40)},checks:{paymentProvider:{provider:'stripe',status:'enabled',mode:'test',credentialSource:'private_file'},technicalSandbox:{available:true,mode:'test'}}}),{status:200})]){
    await assert.rejects(()=>readStagingDisabledMemoryGateway({expectedCommit:'b'.repeat(40),fetchImpl:async url=>bad(url)}),/sandbox106_gateway_/u);
  }
  await assert.rejects(()=>readStagingDisabledMemoryGateway({expectedCommit:'b'.repeat(40),timeoutMs:5,
    fetchImpl:(_url,{signal})=>new Promise((_,reject)=>signal.addEventListener('abort',()=>reject(Object.assign(new Error('timeout'),{name:'AbortError'}),{once:true})))}),/sandbox106_gateway_timeout/u);
});

test('collector rejects canonical runtime drift across Stripe and gateway reads before writing receipts',async()=>{
  const directory=fixtureDir();try{const authorization={authorization:{id:'owner-auth-technical-sandbox-1',issuedAt:new Date(Date.now()-60000).toISOString(),
      expiresAt:new Date(Date.now()+3600000).toISOString(),scope:'stripe-technical-sandbox-1eur-staging',userIds:['synthetic_sandbox_user_owner','synthetic_sandbox_user_renter']},
      accountId,secretKeyPath:path.join(directory,'key'),webhookPath:path.join(directory,'webhook')};let runtimeReads=0;
    await assert.rejects(()=>collectTechnicalSandbox106ReadonlyInputs({authorizationEnvPath:'/private/auth.env',outputDirectory:directory,
      authorizationReader:()=>authorization,secretReader:(file,kind)=>kind==='restricted_test_key'?token():webhook(),
      runtimeReader:async()=>{runtimeReads++;return {canonicalContainerId:'a'.repeat(64),commit:'b'.repeat(40),imageDigest:`sha256:${runtimeReads===1?'c'.repeat(64):'d'.repeat(64)}`,
        promotionRunId:'green-run-001',secretMountsRemoved:true,technicalSandboxDisabled:true,paymentTransport:'memory'};},
      gatewayReader:async()=>({gatewayReadbackSha256:'e'.repeat(64)}),fetchImpl:async url=>stripeResponse(url.pathname)}),/sandbox106_runtime_changed_during_readback/u);
    assert.deepEqual(readdirSync(directory),[]);assert.equal(runtimeReads,2);
  }finally{rmSync(directory,{recursive:true,force:true});}
});

test('collector creates three protected JSON receipts from current readbacks with no-clobber output',async()=>{
  const directory=fixtureDir();try{secrets(directory);const auth=authEnv(directory),now=Date.now(),
    authorization=readRootAuthorizationEnv(auth,{fsOps:adjustedStats(0,0),now:()=>now});
    const calls=[];let runtimeReads=0;const result=await collectTechnicalSandbox106ReadonlyInputs({authorizationEnvPath:auth,outputDirectory:directory,now:()=>now,
      authorizationReader:()=>authorization,secretReader:(file,kind)=>kind==='restricted_test_key'?token():webhook(),
      runtimeReader:async()=>{runtimeReads++;return {canonicalContainerId:'a'.repeat(64),commit:'b'.repeat(40),imageDigest:`sha256:${'c'.repeat(64)}`,
        secretMountsRemoved:true,technicalSandboxDisabled:true,paymentTransport:'memory'};},
      gatewayReader:async()=>({gatewayReadbackSha256:'d'.repeat(64),verifiedAt:new Date(now).toISOString(),paymentTransport:'memory',technicalSandboxDisabled:true}),
      fetchImpl:async(url,options)=>{calls.push({url:String(url),options});return stripeResponse(url.pathname);}});
    assert.equal(result.files.length,3);assert.equal(result.runtime.commit,'b'.repeat(40));assert.equal(result.accountId,accountId);
    assert.equal(calls.length,2);assert.ok(result.files.every(file=>/^[a-f0-9]{64}$/u.test(file.rawSha256)));
    const docs=Object.fromEntries(result.files.map(file=>[file.kind,JSON.parse(readFileSync(file.path,'utf8'))]));
    assert.equal(docs.ownerAuthorization.scope,'stripe-technical-sandbox-1eur-staging');
    assert.equal(docs.stripeReadback.livemode,false);assert.equal(docs.rollback.mockPaymentTransport,true);
    assert.equal(docs.rollback.canonicalContainerId,'a'.repeat(64));assert.equal(docs.rollback.gatewayReadbackSha256,'d'.repeat(64));
    for(const entry of result.files){assert.equal(requireMode(entry.path),0o600);assert.equal(JSON.stringify(entry).includes(token()),false);}
    await assert.rejects(()=>collectTechnicalSandbox106ReadonlyInputs({authorizationEnvPath:auth,outputDirectory:directory,
      authorizationReader:()=>authorization,secretReader:(file,kind)=>kind==='restricted_test_key'?token():webhook(),
      runtimeReader:async()=>{runtimeReads++;return {secretMountsRemoved:true,technicalSandboxDisabled:true,paymentTransport:'memory'};},
      gatewayReader:async()=>({gatewayReadbackSha256:'d'.repeat(64),verifiedAt:new Date(now).toISOString(),paymentTransport:'memory',technicalSandboxDisabled:true}),
      fetchImpl:async url=>stripeResponse(url.pathname)}),/sandbox106_output_exists/u);
    assert.equal(calls.length,2);assert.equal(runtimeReads,3);
  }finally{rmSync(directory,{recursive:true,force:true});}
});

test('collector CLI accepts only explicit external authorization and output paths',()=>{
  assert.equal(parseReadonlyCollectorArgs(['--authorization-env','/private/auth.env','--output-directory','/private/out']).outputDirectory,'/private/out');
  assert.throws(()=>parseReadonlyCollectorArgs(['--authorization-env','/private/auth.env','--output-directory','relative']),/sandbox106_arguments/u);
});

function requireMode(file){return (lstatSync(file).mode&0o777);}
