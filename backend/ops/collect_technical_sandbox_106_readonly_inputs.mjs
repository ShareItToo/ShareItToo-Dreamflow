#!/usr/bin/env node
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { execFile } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { privateDirectory, recheckDirectory } from './green_staging_98_106_evidence.mjs';
import { readCanonicalGreenRuntime } from './materialize_technical_sandbox_106_evidence.mjs';

const fail=code=>{const error=new Error(code);error.code=code;throw error;};
const digest=bytes=>crypto.createHash('sha256').update(bytes).digest('hex');
const outsideRepo=file=>path.isAbsolute(file)&&path.normalize(file)===file&&file!==path.resolve(import.meta.dirname,'../..')
  &&!file.startsWith(`${path.resolve(import.meta.dirname,'../..')}${path.sep}`);
const requiredEnv=['TECHNICAL_SANDBOX_AUTHORIZATION_ID','TECHNICAL_SANDBOX_AUTHORIZATION_ISSUED_AT',
  'TECHNICAL_SANDBOX_AUTHORIZATION_EXPIRES_AT','TECHNICAL_SANDBOX_ACCOUNT_ID','TECHNICAL_SANDBOX_USER_IDS',
  'TECHNICAL_SANDBOX_SECRET_KEY_FILE','TECHNICAL_SANDBOX_WEBHOOK_SECRET_FILE'];
const fileNames={ownerAuthorization:'technical-sandbox-owner-authorization.json',stripeReadback:'technical-sandbox-stripe-test-readback.json',
  rollback:'technical-sandbox-rollback-proof.json'};

export function readRootAuthorizationEnv(filename,{afterRead=()=>{},now=Date.now,fsOps={}}={}){
  if(!outsideRepo(filename))fail('sandbox106_authorization_env_path');
  const lstatSync=fsOps.lstatSync??fs.lstatSync,fstatSync=fsOps.fstatSync??fs.fstatSync,openSync=fsOps.openSync??fs.openSync,
    readSync=fsOps.readSync??fs.readSync,closeSync=fsOps.closeSync??fs.closeSync;
  const pathStat=lstatSync(filename,{bigint:true});let fd;let bytes;
  try{
    if(!pathStat.isFile()||pathStat.nlink!==1n||pathStat.uid!==0n||pathStat.gid!==0n||(pathStat.mode&0o7777n)!==0o600n
        ||pathStat.size<2n||pathStat.size>65536n)fail('sandbox106_authorization_env_metadata');
    fd=openSync(filename,fs.constants.O_RDONLY|fs.constants.O_NOFOLLOW|fs.constants.O_CLOEXEC);
    const before=fstatSync(fd,{bigint:true});
    if(!before.isFile()||before.dev!==pathStat.dev||before.ino!==pathStat.ino||before.nlink!==1n||before.uid!==0n||before.gid!==0n
        ||(before.mode&0o7777n)!==0o600n||before.size!==pathStat.size)fail('sandbox106_authorization_env_metadata');
    bytes=Buffer.alloc(Number(before.size));let offset=0;
    while(offset<bytes.length){const n=readSync(fd,bytes,offset,bytes.length-offset,offset);if(n<=0)fail('sandbox106_authorization_env_read');offset+=n;}
    afterRead();
    const after=fstatSync(fd,{bigint:true}),link=lstatSync(filename,{bigint:true});
    if(['dev','ino','mode','uid','gid','nlink','size','mtimeNs','ctimeNs'].some(k=>before[k]!==after[k]||after[k]!==link[k]))fail('sandbox106_authorization_env_changed');
    let text;try{text=new TextDecoder('utf-8',{fatal:true}).decode(bytes);}catch{fail('sandbox106_authorization_env_encoding');}
    const values=Object.create(null);
    for(const [index,line] of text.split(/\r?\n/u).entries()){
      if(!line||/^\s*#/u.test(line))continue;
      const match=/^([A-Z][A-Z0-9_]*)=([^\r\n]*)$/u.exec(line);
      if(!match){fail('sandbox106_authorization_env_syntax');}
      const [,key,value]=match;
      if(!requiredEnv.includes(key))fail('sandbox106_authorization_env_unexpected_key');
      if(Object.hasOwn(values,key)||!value||/["'`$\\]/u.test(value))fail('sandbox106_authorization_env_value');values[key]=value;
    }
    if(requiredEnv.some(key=>!values[key]))fail('sandbox106_authorization_env_missing');
    const userIds=values.TECHNICAL_SANDBOX_USER_IDS.split(',');
    const issued=Date.parse(values.TECHNICAL_SANDBOX_AUTHORIZATION_ISSUED_AT),expires=Date.parse(values.TECHNICAL_SANDBOX_AUTHORIZATION_EXPIRES_AT);
    const observedNow=now();
    if(!/^[A-Za-z0-9][A-Za-z0-9._:-]{7,159}$/u.test(values.TECHNICAL_SANDBOX_AUTHORIZATION_ID)
      ||!/^acct_[A-Za-z0-9]+$/u.test(values.TECHNICAL_SANDBOX_ACCOUNT_ID)
      ||userIds.length!==2||new Set(userIds).size!==2||userIds.some(id=>!/^synthetic_sandbox_user_[A-Za-z0-9_-]{4,100}$/u.test(id))
      ||!Number.isFinite(issued)||issued>observedNow||observedNow-issued>86400000||!Number.isFinite(expires)||expires<=observedNow||expires-issued>86400000
      ||!outsideRepo(values.TECHNICAL_SANDBOX_SECRET_KEY_FILE)||!outsideRepo(values.TECHNICAL_SANDBOX_WEBHOOK_SECRET_FILE)
      ||values.TECHNICAL_SANDBOX_SECRET_KEY_FILE===values.TECHNICAL_SANDBOX_WEBHOOK_SECRET_FILE)fail('sandbox106_authorization_invalid');
    return Object.freeze({authorization:{id:values.TECHNICAL_SANDBOX_AUTHORIZATION_ID,
      issuedAt:new Date(issued).toISOString(),expiresAt:new Date(expires).toISOString(),
      scope:'stripe-technical-sandbox-1eur-staging',userIds:Object.freeze(userIds)},
      accountId:values.TECHNICAL_SANDBOX_ACCOUNT_ID,secretKeyPath:values.TECHNICAL_SANDBOX_SECRET_KEY_FILE,
      webhookPath:values.TECHNICAL_SANDBOX_WEBHOOK_SECRET_FILE});
  }finally{bytes?.fill(0);if(fd!==undefined)closeSync(fd);}
}

export function readRestrictedSecret(filename,kind,{afterRead=()=>{},fsOps={}}={}){
  if(!outsideRepo(filename))fail('sandbox106_secret_path');
  const lstatSync=fsOps.lstatSync??fs.lstatSync,fstatSync=fsOps.fstatSync??fs.fstatSync,openSync=fsOps.openSync??fs.openSync,
    readSync=fsOps.readSync??fs.readSync,closeSync=fsOps.closeSync??fs.closeSync;
  const beforePath=lstatSync(filename,{bigint:true});let fd;let scratch;const chunks=[];let length=0;
  try{
    if(!beforePath.isFile()||beforePath.nlink!==1n||beforePath.uid!==100n||beforePath.gid!==101n||(beforePath.mode&0o7777n)!==0o600n
        ||beforePath.size<16n||beforePath.size>16384n)fail('sandbox106_secret_metadata');
    fd=openSync(filename,fs.constants.O_RDONLY|fs.constants.O_NOFOLLOW|fs.constants.O_CLOEXEC);
    const before=fstatSync(fd,{bigint:true});
    if(!before.isFile()||before.dev!==beforePath.dev||before.ino!==beforePath.ino||before.nlink!==1n||before.uid!==100n||before.gid!==101n
        ||(before.mode&0o7777n)!==0o600n||before.size!==beforePath.size)fail('sandbox106_secret_metadata');
    scratch=Buffer.alloc(4096);
    while(true){const n=readSync(fd,scratch,0,scratch.length,null);if(n<=0)break;length+=n;if(length>16384)fail('sandbox106_secret_size');chunks.push(Buffer.from(scratch.subarray(0,n)));}
    afterRead();
    const after=fstatSync(fd,{bigint:true}),link=lstatSync(filename,{bigint:true});
    if(['dev','ino','mode','uid','gid','nlink','size','mtimeNs','ctimeNs'].some(k=>before[k]!==after[k]||after[k]!==link[k])||BigInt(length)!==before.size)fail('sandbox106_secret_changed');
    const bytes=Buffer.concat(chunks);let value;
    try{value=new TextDecoder('utf-8',{fatal:true}).decode(bytes);}finally{bytes.fill(0);}
    if(/[\r\n\u0000]/u.test(value)||(kind==='restricted_test_key'?!/^rk_test_[A-Za-z0-9]+$/u.test(value):kind==='webhook_secret'?!/^whsec_[A-Za-z0-9]+$/u.test(value):true))fail('sandbox106_secret_format');
    return value;
  }finally{scratch?.fill(0);for(const chunk of chunks)chunk.fill(0);if(fd!==undefined)closeSync(fd);}
}

async function responseBytes(response,limit=32768){
  const reader=response.body?.getReader?.();if(!reader){const bytes=Buffer.from(await response.arrayBuffer());if(bytes.length>limit){bytes.fill(0);fail('sandbox106_stripe_body_size');}return bytes;}
  const chunks=[];let size=0;while(true){const {done,value}=await reader.read();if(done)break;size+=value.byteLength;if(size>limit){await reader.cancel();for(const c of chunks)c.fill(0);fail('sandbox106_stripe_body_size');}chunks.push(Buffer.from(value));}
  const result=Buffer.concat(chunks,size);for(const chunk of chunks)chunk.fill(0);return result;
}

export async function readStripeTestAccountReadback({secretKey,expectedAccountId,fetchImpl=fetch,now=Date.now,timeoutMs=5000}={}){
  if(!/^rk_test_[A-Za-z0-9]+$/u.test(secretKey??'')||!/^acct_[A-Za-z0-9]+$/u.test(expectedAccountId??'')||timeoutMs<1||timeoutMs>5000)fail('sandbox106_stripe_arguments');
  const reads=[];
  for(const [route,expectedObject] of [['/v1/account','account'],['/v1/balance','balance']]){
    const url=new URL(route,'https://api.stripe.com');if(url.origin!=='https://api.stripe.com'||url.pathname!==route||url.search||url.hash)fail('sandbox106_stripe_url');
    const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),timeoutMs);let response;let bytes;
    try{
      response=await fetchImpl(url,{method:'GET',redirect:'manual',signal:controller.signal,
        headers:{authorization:`Bearer ${secretKey}`,accept:'application/json'}});
      if(response.status===401||response.status===403)fail('sandbox106_stripe_auth_rejected');
      if(response.status>=300&&response.status<400)fail('sandbox106_stripe_redirect');
      if(response.status!==200)fail('sandbox106_stripe_status');
      bytes=await responseBytes(response);let body;try{body=JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(bytes));}catch{fail('sandbox106_stripe_json');}
      if(body?.object!==expectedObject)fail('sandbox106_stripe_shape');
      if(route==='/v1/account'&&body.id!==expectedAccountId)fail('sandbox106_stripe_account_mismatch');
      if(route==='/v1/account'&&body.livemode===true)fail('sandbox106_stripe_live_mode');
      if(route==='/v1/balance'&&body.livemode!==false)fail('sandbox106_stripe_live_mode');
      reads.push(digest(bytes));
    }catch(error){if(error?.code?.startsWith?.('sandbox106_'))throw error;fail(error?.name==='AbortError'?'sandbox106_stripe_timeout':'sandbox106_stripe_network');}
    finally{clearTimeout(timer);bytes?.fill(0);}
  }
  return Object.freeze({readback:Object.freeze({authenticated:true,accountId:expectedAccountId,accountMode:'test',livemode:false,
    readAt:new Date(now()).toISOString()}),providerResponseSha256:Object.freeze(reads)});
}

export async function readStagingDisabledMemoryGateway({expectedCommit,fetchImpl=fetch,timeoutMs=5000}={}){
  if(!/^[a-f0-9]{40}$/u.test(expectedCommit??'')||timeoutMs<1||timeoutMs>5000)fail('sandbox106_gateway_arguments');
  const hashes={};
  for(const [key,route] of [['version','/api/version'],['health','/api/health/ready']]){
    const url=new URL(route,'https://staging.shareittoo.com');if(url.origin!=='https://staging.shareittoo.com'||url.pathname!==route||url.search||url.hash)fail('sandbox106_gateway_url');
    const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),timeoutMs);let bytes;
    try{
      const response=await fetchImpl(url,{method:'GET',redirect:'manual',signal:controller.signal,headers:{accept:'application/json'}});
      if(response.status===401||response.status===403)fail('sandbox106_gateway_auth_rejected');
      if(response.status>=300&&response.status<400)fail('sandbox106_gateway_redirect');
      if(response.status!==200)fail('sandbox106_gateway_status');
      bytes=await responseBytes(response);let body;try{body=JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(bytes));}catch{fail('sandbox106_gateway_json');}
      if(key==='version'){
        if(body?.commit!==expectedCommit)fail('sandbox106_gateway_commit');
      }else{
        const checks=body?.checks;
        if(body?.status!=='ok'||body?.release?.commit!==expectedCommit||checks?.paymentProvider?.provider!=='memory'
          ||checks.paymentProvider.mode!=='unavailable'||checks.paymentProvider.status!=='disabled'||checks.paymentProvider.credentialSource!=='none'
          ||checks.technicalSandbox?.available!==false||checks.technicalSandbox.mode!=='disabled')fail('sandbox106_gateway_boundary');
      }
      hashes[key]=digest(bytes);
    }catch(error){if(error?.code?.startsWith?.('sandbox106_'))throw error;fail(error?.name==='AbortError'?'sandbox106_gateway_timeout':'sandbox106_gateway_network');}
    finally{clearTimeout(timer);bytes?.fill(0);}
  }
  const gatewayReadbackSha256=digest(Buffer.from(JSON.stringify({version:hashes.version,health:hashes.health,commit:expectedCommit})));
  return Object.freeze({gatewayReadbackSha256,versionSha256:hashes.version,healthSha256:hashes.health,
    verifiedAt:new Date().toISOString(),paymentTransport:'memory',technicalSandboxDisabled:true});
}

function writeNoClobberSet(directoryPath,entries){
  const directory=privateDirectory(directoryPath);recheckDirectory(directory);
  assertReadonlyOutputVacant(directoryPath);
  const staged=[];const linked=[];const temporaryPaths=[];
  try{
    for(const [key,value] of Object.entries(entries)){
      const name=fileNames[key];if(!name)fail('sandbox106_output_kind');
      const bytes=Buffer.from(`${JSON.stringify(value,null,2)}\n`),temp=`.${name}.${crypto.randomBytes(16).toString('hex')}.tmp`;
      const filename=path.join(directory.directory,temp);const fd=fs.openSync(filename,fs.constants.O_WRONLY|fs.constants.O_CREAT|fs.constants.O_EXCL|fs.constants.O_NOFOLLOW,0o600);
      temporaryPaths.push(filename);
      try{fs.writeFileSync(fd,bytes);fs.fsyncSync(fd);const stat=fs.fstatSync(fd,{bigint:true});
        if(!stat.isFile()||stat.nlink!==1n||stat.uid!==BigInt(process.getuid())||(stat.mode&0o7777n)!==0o600n||stat.size!==BigInt(bytes.length))fail('sandbox106_output_metadata');
        staged.push({key,name,filename,target:path.join(directory.directory,name),dev:stat.dev,ino:stat.ino,bytes,rawSha256:digest(bytes)});
      }catch(error){bytes.fill(0);throw error;}finally{fs.closeSync(fd);}
    }
    for(const item of staged){fs.linkSync(item.filename,item.target);const stat=fs.lstatSync(item.target,{bigint:true});
      if(stat.dev!==item.dev||stat.ino!==item.ino)fail('sandbox106_output_link_changed');linked.push(item);}
    for(const item of staged)fs.unlinkSync(item.filename);
    const dirfd=fs.openSync(directory.directory,fs.constants.O_RDONLY|fs.constants.O_DIRECTORY);try{fs.fsyncSync(dirfd);}finally{fs.closeSync(dirfd);}
    for(const item of staged){const fd=fs.openSync(item.target,fs.constants.O_RDONLY|fs.constants.O_NOFOLLOW|fs.constants.O_CLOEXEC);try{
      const stat=fs.fstatSync(fd,{bigint:true});if(!stat.isFile()||stat.dev!==item.dev||stat.ino!==item.ino||stat.nlink!==1n||stat.uid!==BigInt(process.getuid())||(stat.mode&0o7777n)!==0o600n||stat.size!==BigInt(item.bytes.length))fail('sandbox106_output_readback');
      const bytes=Buffer.alloc(item.bytes.length);let offset=0;while(offset<bytes.length){const n=fs.readSync(fd,bytes,offset,bytes.length-offset,offset);if(n<=0)fail('sandbox106_output_readback');offset+=n;}
      if(digest(bytes)!==item.rawSha256)fail('sandbox106_output_digest');bytes.fill(0);
    }finally{fs.closeSync(fd);}}
    return Object.freeze(staged.map(({key,name,target,rawSha256})=>Object.freeze({kind:key,path:target,name,rawSha256})));
  }catch(error){for(const filename of temporaryPaths){try{fs.unlinkSync(filename);}catch{}}
    for(const item of linked){try{const stat=fs.lstatSync(item.target,{bigint:true});if(stat.dev===item.dev&&stat.ino===item.ino)fs.unlinkSync(item.target);}catch{}}
    throw error;
  }finally{for(const item of staged)item.bytes.fill(0);}
}

export function assertReadonlyOutputVacant(directoryPath){
  const directory=privateDirectory(directoryPath);recheckDirectory(directory);
  for(const name of Object.values(fileNames)){try{fs.lstatSync(path.join(directory.directory,name));fail('sandbox106_output_exists');}catch(error){if(error?.code!=='ENOENT')throw error;}}
  return true;
}

export async function collectTechnicalSandbox106ReadonlyInputs({authorizationEnvPath,outputDirectory,command,fetchImpl=fetch,now=Date.now,
  afterAuthorizationRead,afterSecretRead,authorizationReader=readRootAuthorizationEnv,secretReader=readRestrictedSecret,
  runtimeReader=readCanonicalGreenRuntime,gatewayReader=readStagingDisabledMemoryGateway,writer=writeNoClobberSet}={}){
  if(!outsideRepo(outputDirectory))fail('sandbox106_output_directory');
  const directory=privateDirectory(outputDirectory);recheckDirectory(directory);
  const authorizationEnv=authorizationReader(authorizationEnvPath,{afterRead:afterAuthorizationRead,now});
  const ownerAuth=authorizationEnv.authorization;
  const runtime=await runtimeReader({command,expectedCommit:undefined});
  if(runtime.secretMountsRemoved!==true||runtime.technicalSandboxDisabled!==true||runtime.paymentTransport!=='memory')fail('sandbox106_rollback_runtime');
  let key,webhook;
  try{
    key=secretReader(authorizationEnv.secretKeyPath,'restricted_test_key',{afterRead:afterSecretRead});
    webhook=secretReader(authorizationEnv.webhookPath,'webhook_secret');
    assertReadonlyOutputVacant(outputDirectory);
    const stripe=await readStripeTestAccountReadback({secretKey:key,expectedAccountId:authorizationEnv.accountId,fetchImpl,now});
    const gateway=await gatewayReader({expectedCommit:runtime.commit,fetchImpl});
    const finalRuntime=await runtimeReader({command,expectedCommit:runtime.commit});
    if(finalRuntime.canonicalContainerId!==runtime.canonicalContainerId||finalRuntime.commit!==runtime.commit
        ||finalRuntime.imageDigest!==runtime.imageDigest||finalRuntime.promotionRunId!==runtime.promotionRunId||finalRuntime.secretMountsRemoved!==true
        ||finalRuntime.technicalSandboxDisabled!==true||finalRuntime.paymentTransport!=='memory')fail('sandbox106_runtime_changed_during_readback');
    if(Date.parse(ownerAuth.expiresAt)<=now()||now()-Date.parse(ownerAuth.issuedAt)>86400000)fail('sandbox106_authorization_expired_during_readback');
    const rollback={target:runtime.commit,canonicalContainerId:runtime.canonicalContainerId,imageDigest:runtime.imageDigest,
      gatewayReadbackSha256:gateway.gatewayReadbackSha256,verifiedAt:new Date(now()).toISOString(),mockPaymentTransport:true,
      technicalSandboxDisabled:true,secretMountsRemoved:true};
    const files=writer(outputDirectory,{ownerAuthorization:ownerAuth,stripeReadback:stripe.readback,rollback});
    return Object.freeze({status:'readonly_inputs_collected',files,runtime:Object.freeze({canonicalContainerId:runtime.canonicalContainerId,
      commit:runtime.commit,imageDigest:runtime.imageDigest}),accountId:stripe.readback.accountId,
      gatewayReadbackSha256:gateway.gatewayReadbackSha256,providerReadOnlyRequestCount:2,paymentProcessingPerformed:false});
  }finally{key=undefined;webhook=undefined;}
}

export function parseReadonlyCollectorArgs(args){
  if(args.length!==4||args[0]!=='--authorization-env'||args[2]!=='--output-directory'||!outsideRepo(args[1])||!outsideRepo(args[3]))fail('sandbox106_arguments');
  return Object.freeze({authorizationEnvPath:args[1],outputDirectory:args[3]});
}

if(process.argv[1]&&fs.realpathSync(process.argv[1])===fileURLToPath(import.meta.url)){
  try{const options=parseReadonlyCollectorArgs(process.argv.slice(2));collectTechnicalSandbox106ReadonlyInputs(options)
    .then(result=>process.stdout.write(`${JSON.stringify(result)}\n`))
    .catch(error=>{process.stderr.write(`${error?.code??'sandbox106_collector_rejected'}\n`);process.exitCode=2;});}
  catch(error){process.stderr.write(`${error?.code??'sandbox106_arguments'}\n`);process.exitCode=2;}
}
