import assert from 'node:assert/strict';
import { chmodSync, closeSync, constants, fstatSync, lstatSync, mkdtempSync, openSync, readFileSync, readSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { buildTechnicalSandbox106Evidence, parseMaterializerArgs, readCanonicalGreenRuntime, writeTechnicalSandboxEvidenceNoClobber } from '../ops/materialize_technical_sandbox_106_evidence.mjs';
import { validateTechnicalSandbox106Evidence } from '../ops/technical_sandbox_106_activation.mjs';
import crypto from 'node:crypto';

const now=Date.parse('2026-10-25T10:00:00.000Z'), h=value=>crypto.createHash('sha256').update(value).digest('hex');
const commit='b'.repeat(40), imageDigest=`sha256:${'c'.repeat(64)}`, containerId='a'.repeat(64), runId='green-run-001';
function receipt(){return {status:'promoted_owner_smoke_pending',schemaVersion:2,kind:'sit-green-staging-106-106-promotion',candidateId:containerId,
  sourceId:'d'.repeat(64),runtimeCommit:commit,opsCommit:'e'.repeat(40),rehearsalSha256:'1'.repeat(64),backupSha256:'2'.repeat(64),
  ownerSmokePassed:false,publicReleaseComplete:false,oldImageRestarted:false,lockRetained:true,intentionalProviderCalls:0,gatewayVerified:true,
  gatewayVersionSha256:'3'.repeat(64),gatewayReadbackSha256:'4'.repeat(64),visibilityBoundary:'captured_id_rename',renameReconciled:false,
  canonicalRestartPolicy:'unless-stopped',canonicalRestartPolicyVerified:true,hostRebootVerified:false};}
function inputs(){return {promotionReceipt:receipt(),promotionReceiptSha256:'5'.repeat(64),promotedAt:'2026-10-25T09:00:00.000Z',
 runtime:{canonicalContainerId:containerId,commit,imageDigest,promotionRunId:runId,observedAt:'2026-10-25T09:59:00.000Z'},ownerAuthorization:{id:'owner-auth-technical-sandbox-1',issuedAt:'2026-10-25T09:00:00.000Z',expiresAt:'2026-10-25T12:00:00.000Z',scope:'stripe-technical-sandbox-1eur-staging',userIds:['synthetic_sandbox_user_owner','synthetic_sandbox_user_renter']},ownerAuthorizationSha256:'6'.repeat(64),
 credentials:{secretKey:{kind:'restricted_test_key',path:'/private/test-key',sha256:'7'.repeat(64),mode:'0600',uid:100,gid:101,regular:true,symlink:false,outsideRepository:true,mountReadOnly:true},webhookSecret:{kind:'webhook_signing_secret',path:'/private/webhook',sha256:'8'.repeat(64),mode:'0600',uid:100,gid:101,regular:true,symlink:false,outsideRepository:true,mountReadOnly:true}},
 stripeReadback:{authenticated:true,accountId:'acct_synthetic1234',accountMode:'test',livemode:false,readAt:'2026-10-25T09:30:00.000Z'},stripeReadbackSha256:'9'.repeat(64),
 rollback:{target:commit,canonicalContainerId:containerId,imageDigest,gatewayReadbackSha256:'b'.repeat(64),
  verifiedAt:'2026-10-25T09:40:00.000Z',mockPaymentTransport:true,technicalSandboxDisabled:true,secretMountsRemoved:true},rollbackSha256:'a'.repeat(64),now:()=>now,validateSecrets:()=>true};}
function readStable(file){
  const fd=openSync(file,constants.O_RDONLY|constants.O_NOFOLLOW|constants.O_CLOEXEC);
  try{
    const before=fstatSync(fd,{bigint:true});assert.equal(before.isFile(),true);
    const keys=['dev','ino','mode','uid','gid','nlink','size','mtimeNs','ctimeNs'];
    const pathBefore=lstatSync(file,{bigint:true});assert.deepEqual(keys.map(k=>pathBefore[k]),keys.map(k=>before[k]));
    const bytes=Buffer.alloc(Number(before.size));let offset=0;
    while(offset<bytes.length){const n=readSync(fd,bytes,offset,bytes.length-offset,offset);assert.ok(n>0);offset+=n;}
    const after=fstatSync(fd,{bigint:true}),pathAfter=lstatSync(file,{bigint:true});
    assert.deepEqual(keys.map(k=>pathAfter[k]),keys.map(k=>after[k]));
    return {bytes,stat:before};
  }finally{closeSync(fd);}
}

test('materializes only exact fresh Green, runtime, test-only Stripe, authorization, secret and rollback evidence',()=>{
  const evidence=buildTechnicalSandbox106Evidence(inputs());
  const binding=validateTechnicalSandbox106Evidence(evidence,{now});
  assert.equal(evidence.promotion.runId,runId);assert.equal(evidence.runtime.imageDigest,imageDigest);
  assert.equal(evidence.stripeReadback.livemode,false);assert.equal(evidence.boundaries.amountMinor,100);assert.equal(binding.imageDigest,imageDigest);
  for(const mutate of [v=>v.promotionReceipt.candidateId='f'.repeat(64),v=>v.stripeReadback.livemode=true,
    v=>v.rollback.secretMountsRemoved=false,v=>v.rollback.imageDigest=`sha256:${'0'.repeat(64)}`,
    v=>v.promotionReceiptSha256='z'.repeat(64),v=>v.promotedAt='2026-10-23T00:00:00.000Z']){
    const v=inputs();mutate(v);assert.throws(()=>buildTechnicalSandbox106Evidence(v));
  }
});

test('direct Docker readback binds exact canonical ID, disabled runtime, Green label and immutable digest',async()=>{
  const imageId=`sha256:${'d'.repeat(64)}`;const container={Id:containerId,Name:'/shareittoo-staging-api',Image:imageId,State:{Running:true,Paused:false},
    Mounts:[],Config:{Env:[`APP_COMMIT=${commit}`,'DEPLOYMENT_ENVIRONMENT=test','SIT_STAGING_PILOT_ID=heilbronn_wave0','PAYMENT_TRANSPORT=memory','STRIPE_LIVEMODE=false','TECHNICAL_SANDBOX_ENABLED=0','TECHNICAL_SANDBOX_KILL_SWITCH=1'],
      Labels:{'com.shareittoo.sit.green':'true','com.shareittoo.sit.green.run_id':'green-run-001','com.shareittoo.green.106_106.promotion':runId}}};
  const result=await readCanonicalGreenRuntime({expectedCommit:commit,command:async args=>args[0]==='ps'?`${containerId}\n`:args[0]==='inspect'?JSON.stringify([container]):JSON.stringify([{Id:imageId,
    RepoDigests:[`ghcr.io/shareittoo/shareittoo-api@${imageDigest}`],Config:{Labels:{'org.opencontainers.image.revision':commit}}}])});
  assert.equal(result.canonicalContainerId,containerId);assert.equal(result.imageDigest,imageDigest);
  await assert.rejects(()=>readCanonicalGreenRuntime({expectedCommit:commit,command:async args=>args[0]==='ps'?`${containerId}\n`:args[0]==='inspect'?JSON.stringify([{...container,State:{Running:false,Paused:false}}]):'[]'}),/sandbox106_runtime_identity/u);
});

test('writes protected evidence atomically with no clobber and returns raw SHA only',()=>{
  const directory=mkdtempSync(path.join(realpathSync(os.tmpdir()),'sit-materialize-106-'));chmodSync(directory,0o700);
  try{
    const output=path.join(directory,'evidence.json');const result=writeTechnicalSandboxEvidenceNoClobber(output,buildTechnicalSandbox106Evidence(inputs()));
    const read=readStable(output),bytes=read.bytes;assert.equal(result.rawSha256,h(bytes));assert.equal(Number(read.stat.mode&0o777n),0o600);
    assert.throws(()=>writeTechnicalSandboxEvidenceNoClobber(output,buildTechnicalSandbox106Evidence(inputs())),/EEXIST/u);
    const after=readStable(output);assert.equal(after.stat.dev,read.stat.dev);assert.equal(after.stat.ino,read.stat.ino);assert.equal(after.bytes.toString(),bytes.toString());
  }finally{rmSync(directory,{recursive:true,force:true});}
});

test('materializer CLI requires every protected evidence path and raw digest',()=>{
  const args=['--promotion-receipt','/private/p.json','--promotion-receipt-sha256','1'.repeat(64),
    '--owner-authorization','/private/a.json','--owner-authorization-sha256','2'.repeat(64),
    '--stripe-readback','/private/s.json','--stripe-readback-sha256','3'.repeat(64),
    '--rollback-proof','/private/r.json','--rollback-proof-sha256','4'.repeat(64),
    '--secret-key','/private/key','--webhook-secret','/private/webhook','--output','/private/evidence.json'];
  assert.equal(parseMaterializerArgs(args).output,'/private/evidence.json');
  assert.throws(()=>parseMaterializerArgs(args.slice(0,-2)),/sandbox106_arguments/u);
  assert.throws(()=>parseMaterializerArgs(args.map((v,i)=>i===3?'not-a-sha256':v)),/sandbox106_arguments/u);
});
