import fs from 'node:fs';import os from 'node:os';import path from 'node:path';import ts from 'typescript';import assert from 'node:assert/strict';
const dir=fs.mkdtempSync(path.join(os.tmpdir(),'surface-tryon-'));
const vars=fs.readFileSync('.dev.vars','utf8');process.env.OPENAI_API_KEY=vars.match(/^OPENAI_API_KEY=(.+)$/m)[1].trim().replace(/^["']|["']$/g,'');
fs.writeFileSync(path.join(dir,'catalog.mjs'),ts.transpileModule(fs.readFileSync('lib/catalog.ts','utf8'),{compilerOptions:{module:99,target:99}}).outputText);
let source=fs.readFileSync('app/api/try-on/route.ts','utf8').replace("import {env} from 'cloudflare:workers';","const env={};").replace("'@/lib/catalog'","'./catalog.mjs'");
fs.writeFileSync(path.join(dir,'route.mjs'),ts.transpileModule(source,{compilerOptions:{module:99,target:99}}).outputText);
const {POST}=await import(path.join(dir,'route.mjs'));
const bad=await POST(new Request('https://demo.test/api/try-on',{method:'POST',body:new FormData()}));assert.equal(bad.status,400);
console.log('PASS missing photo rejected');
if(process.argv.includes('--live')){
 const form=new FormData();form.append('productId','tee-2-1');form.append('person',new Blob([fs.readFileSync('public/products/levis.png')],{type:'image/png'}),'person.png');form.append('garment',new Blob([fs.readFileSync('public/products/adidas.png')],{type:'image/png'}),'garment.png');
 const result=await POST(new Request('https://demo.test/api/try-on',{method:'POST',body:form}));const data=await result.json();assert.equal(result.status,200,JSON.stringify(data));assert(data.image.startsWith('data:image/jpeg;base64,'));fs.writeFileSync('/tmp/surface-tryon-test.jpg',Buffer.from(data.image.split(',')[1],'base64'));console.log('PASS real image edit; generated fixture at /tmp/surface-tryon-test.jpg');
}
fs.rmSync(dir,{recursive:true});
