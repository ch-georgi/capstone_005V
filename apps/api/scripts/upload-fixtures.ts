import { PrismaClient } from '@prisma/client';
import { createHash,createHmac } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
// Explicit fixture upload; db:seed creates metadata, never claims remote existence.
const hash=(x:string|Buffer)=>createHash('sha256').update(x).digest('hex');
const hmac=(key:string|Buffer,text:string)=>createHmac('sha256',key).update(text).digest();
async function main() {
  const names=['S3_ENDPOINT','S3_BUCKET','S3_ACCESS_KEY_ID','S3_SECRET_ACCESS_KEY'];
  if(names.some(n=>!process.env[n])) throw new Error('Required variables: '+names.join(', '));
  const endpoint=new URL(process.env.S3_ENDPOINT!);
  if(endpoint.search || endpoint.pathname!=='/' || endpoint.hash) throw new Error('S3_ENDPOINT must be an origin, without path/query');
  const bucket=process.env.S3_BUCKET!,key=process.env.S3_ACCESS_KEY_ID!,secret=process.env.S3_SECRET_ACCESS_KEY!;
  const region=process.env.S3_REGION||'us-east-1';
  const data=await readFile(resolve(__dirname,'../../../database/fixtures/documento-demo.pdf'));
  const sha=hash(data),db=new PrismaClient();
  try {
    const versions=await db.examVersion.findMany({where:{originalFilename:'documento-demo.pdf',sha256:sha,sizeBytes:BigInt(data.length)}});
    for(const v of versions) {
      const url=new URL('/'+[bucket,...v.storageKey.split('/')].map(encodeURIComponent).join('/'),endpoint);
      const date=new Date().toISOString().replace(/[:-]|\.\d{3}/g,''),day=date.slice(0,8);
      const headers={'content-type':'application/pdf','host':url.host,'x-amz-content-sha256':sha,'x-amz-date':date};
      const signed='content-type;host;x-amz-content-sha256;x-amz-date';
      const canonical=['PUT',url.pathname,'',Object.entries(headers).map(([k,v])=>`${k}:${v}\n`).join(''),signed,sha].join('\n');
      const scope=`${day}/${region}/s3/aws4_request`;
      const signingKey=hmac(hmac(hmac(hmac('AWS4'+secret,day),region),'s3'),'aws4_request');
      const signature=createHmac('sha256',signingKey).update(['AWS4-HMAC-SHA256',date,scope,hash(canonical)].join('\n')).digest('hex');
      const authorization=`AWS4-HMAC-SHA256 Credential=${key}/${scope}, SignedHeaders=${signed}, Signature=${signature}`;
      const response=await fetch(url,{method:'PUT',headers:{...headers,authorization},body:data});
      if(!response.ok) throw new Error(`Fixture upload failed: HTTP ${response.status}`);
    }
    console.log(`Uploaded ${versions.length} verified synthetic PDF objects.`);
  } finally {await db.$disconnect();}
}
main().catch(e=>{console.error(e.message);process.exitCode=1});
