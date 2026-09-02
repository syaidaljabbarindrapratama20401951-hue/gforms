const { connectLambda, getStore } = require('@netlify/blobs');

const STORE = 'google-form-cache';
const TYPE_NAMES = {0:'SHORT',1:'LONG',2:'RADIO',3:'DROPDOWN',4:'CHECKBOX',5:'UNSUPPORTED',7:'UNSUPPORTED',9:'UNSUPPORTED',10:'UNSUPPORTED'};
const IDENTITY_PATTERN = /(^|\b)(nama|name|kelas|class|nomor\s*(absen|peserta)|no\.?\s*(absen|peserta)|nisn?|sekolah|school|email|e-mail)(\b|$)/i;

exports.handler = async (event) => {
  try {
    connectLambda(event);
    if (event.httpMethod === 'GET') return handleGet(event);
    if (event.httpMethod !== 'POST') return reply(405,{error:'Metode tidak diizinkan.'});
    const body = JSON.parse(event.body||'{}');
    if (body.action === 'configure') return configureForm(body);
    return inspectForm(body);
  } catch (err) {
    console.error('fetch-form:',err);
    return reply(err.status||500,{error:err.publicMessage||'Formulir gagal diproses. Pastikan formulir publik dan tautannya benar.'});
  }
};

async function handleGet(event){
  const id=event.queryStringParameters?.id;
  if(!id)return reply(400,{error:'ID ujian tidak ditemukan.'});
  const formId=decodeId(id);
  const cached=await getStore(STORE).get(cacheKey(formId),{type:'json'});
  if(!cached)return reply(404,{error:'Data ujian belum tersedia. Minta guru melakukan Generate Ulang.'});
  return reply(200,publicForm(cached));
}

async function inspectForm(body){
  if(!body.url)throw userError('Tautan Google Form wajib diisi.');
  const resolved=await resolveGoogleFormUrl(body.url),formId=extractFormId(resolved),store=getStore(STORE),key=cacheKey(formId);
  const previous=await store.get(key,{type:'json'});
  let record=previous;
  if(!record||body.refresh){
    const html=await fetchHtml(resolved),parsed=parseGoogleForm(html,formId);
    if(!parsed.questions.length)throw userError('Tidak ada pertanyaan yang dapat dibaca. Pastikan tautan mengarah ke Google Form publik.');
    record={...parsed,sourceUrl:canonicalViewUrl(formId),config:normaliseConfig(previous?.config||legacyConfig(previous),parsed.questions),updatedAt:new Date().toISOString()};
    await store.setJSON(key,record);
  }else if(!record.config){
    record.config=normaliseConfig(legacyConfig(record),record.questions);
    await store.setJSON(key,record);
  }
  return reply(200,adminForm(record,Boolean(previous&&!body.refresh)));
}

async function configureForm(body){
  const formId=decodeId(body.id),store=getStore(STORE),key=cacheKey(formId);
  const record=await store.get(key,{type:'json'});
  if(!record)throw userError('Data formulir tidak ditemukan. Klik Baca Formulir kembali.',404);
  record.config=normaliseConfig(body.config,record.questions);
  if(!examQuestions(record).length)throw userError('Pilih identitas secukupnya. Formulir harus menyisakan minimal satu soal ujian.');
  record.updatedAt=new Date().toISOString();
  await store.setJSON(key,record);
  return reply(200,{id:encodeId(formId),title:record.title,questionCount:examQuestions(record).length,identityCount:record.config.identityEntryIds.length,config:record.config});
}

function adminForm(record,cached){
  return {id:encodeId(record.formId),title:record.title,description:record.description,questions:record.questions.map(q=>({entryId:q.entryId,title:q.title,type:q.type,required:q.required,suggestedIdentity:isIdentityCandidate(q)})),config:record.config,cached};
}
function publicForm(record){
  const config=normaliseConfig(record.config||legacyConfig(record),record.questions);
  return {id:encodeId(record.formId),title:record.title,description:record.description,config,updatedAt:record.updatedAt,questions:record.questions.map(q=>({...q,isIdentity:config.identityEntryIds.includes(q.entryId)}))};
}
function examQuestions(record){const ids=new Set(record.config?.identityEntryIds||[]);return record.questions.filter(q=>!ids.has(q.entryId)&&q.type!=='UNSUPPORTED')}
function isIdentityCandidate(q){return ['SHORT','LONG','RADIO','DROPDOWN'].includes(q.type)&&IDENTITY_PATTERN.test(q.title||'')}
function legacyConfig(record){return {duration:record?.duration||0}}
function normaliseConfig(value={},questions=[]){
  const validIdentity=new Set(questions.filter(q=>['SHORT','LONG','RADIO','DROPDOWN'].includes(q.type)).map(q=>q.entryId));
  const supplied=Array.isArray(value.identityEntryIds)?value.identityEntryIds:null;
  const detected=questions.filter(isIdentityCandidate).map(q=>q.entryId);
  return {
    duration:clampNumber(value.duration,0,600,0),
    sessionName:clean(value.sessionName,80),subject:clean(value.subject,100),className:clean(value.className,80),
    examDate:/^\d{4}-\d{2}-\d{2}$/.test(value.examDate||'')?value.examDate:'',token:clean(value.token,40),
    shuffleOptions:Boolean(value.shuffleOptions),violationsEnabled:value.violationsEnabled!==false,
    violationLimit:clampNumber(value.violationLimit,1,10,3),instructions:clean(value.instructions,1200),
    identityEntryIds:[...new Set((supplied||detected).filter(id=>validIdentity.has(id)))]
  };
}

async function resolveGoogleFormUrl(input){let url;try{url=new URL(input)}catch{throw userError('Format tautan tidak valid.');}if(url.protocol!=='https:')throw userError('Tautan harus menggunakan HTTPS.');if(!['docs.google.com','forms.gle'].includes(url.hostname))throw userError('Gunakan tautan resmi Google Forms.');if(url.hostname==='forms.gle'){const r=await fetch(url,{redirect:'manual',headers:{'user-agent':'Mozilla/5.0'}});const next=r.headers.get('location');if(!next)throw userError('Tautan forms.gle tidak dapat dibuka.');return resolveGoogleFormUrl(new URL(next,url).href)}extractFormId(url.href);return url.href}
async function fetchHtml(url){const r=await fetch(url,{headers:{'user-agent':'Mozilla/5.0 (compatible; TKAFormRenderer/2.0)','accept-language':'id,en;q=.8'}});if(!r.ok)throw userError(`Google Form tidak dapat diakses (HTTP ${r.status}).`);const html=await r.text();if(/formulir ini tidak lagi menerima respons|this form is no longer accepting responses/i.test(html))throw userError('Google Form sudah tidak menerima respons.');return html}
function parseGoogleForm(html,formId){const marker='FB_PUBLIC_LOAD_DATA_',start=html.indexOf(marker);if(start<0)throw userError('Struktur Google Form tidak ditemukan. Form mungkin mewajibkan login atau tidak dipublikasikan.');const eq=html.indexOf('=',start),end=html.indexOf(';</script>',eq);if(eq<0||end<0)throw userError('Data Google Form tidak dapat dibaca.');let data;try{data=JSON.parse(html.slice(eq+1,end).trim())}catch{throw userError('Format internal Google Form berubah dan belum dapat diproses.');}
  const meta=data?.[1]||[],candidates=Array.isArray(meta?.[1])?meta[1]:(Array.isArray(meta?.[8])?meta[8]:[]),questions=[];
  for(const q of candidates){if(!Array.isArray(q))continue;const title=typeof q[1]==='string'?q[1]:'Pertanyaan tanpa judul',typeCode=Number.isInteger(q[3])?q[3]:-1,field=Array.isArray(q[4])?q[4][0]:null;if(!Array.isArray(field)||field[0]===null||field[0]===undefined)continue;questions.push({entryId:`entry.${field[0]}`,title,type:TYPE_NAMES[typeCode]||'UNSUPPORTED',required:Boolean(field[2]),options:extractOptions(field[1]),image:findImage(q),unsupportedLabel:unsupportedLabel(typeCode)});}
  return {formId,title:extractDocumentTitle(html)||'Ujian',description:cleanText(meta?.[0]||''),questions};
}
function extractOptions(raw){if(!Array.isArray(raw))return[];return raw.map(x=>Array.isArray(x)?x[0]:x).filter(x=>typeof x==='string')}
function findImage(node){let found=null;(function walk(v){if(found)return;if(typeof v==='string'&&/^https:\/\/(?:lh\d+\.googleusercontent\.com|lh\d+\.ggpht\.com)\//.test(v))found=v;else if(Array.isArray(v))v.forEach(walk)})(node);return found}
function unsupportedLabel(code){return ({5:'Skala linear',7:'Grid',9:'Tanggal',10:'Waktu'})[code]||'Tipe khusus'}
function extractFormId(url){const m=String(url).match(/\/forms\/d\/e\/([a-zA-Z0-9_-]+)/);if(!m)throw userError('Tautan harus berupa Google Form publik dengan format /forms/d/e/...');return m[1]}
function encodeId(id){return Buffer.from(id).toString('base64url')}function decodeId(v){let id;try{id=Buffer.from(v,'base64url').toString('utf8')}catch{throw userError('ID ujian tidak valid.')}if(!/^[a-zA-Z0-9_-]{20,}$/.test(id))throw userError('ID ujian tidak valid.');return id}
function cacheKey(id){return `form-${id}`}function canonicalViewUrl(id){return `https://docs.google.com/forms/d/e/${id}/viewform`}function cleanText(v){return typeof v==='string'?v:''}
function clean(v,max){return typeof v==='string'?v.trim().slice(0,max):''}function clampNumber(v,min,max,fallback){const n=Math.round(Number(v));return Number.isFinite(n)?Math.max(min,Math.min(max,n)):fallback}
function extractDocumentTitle(html){const m=html.match(/<title[^>]*>([\s\S]*?)<\/title>/i);return m?decodeEntities(m[1].trim()):''}function decodeEntities(t){return t.replace(/&amp;/g,'&').replace(/&lt;/g,'<').replace(/&gt;/g,'>').replace(/&quot;/g,'"').replace(/&#39;/g,"'")}
function userError(message,status=400){const e=new Error(message);e.publicMessage=message;e.status=status;return e}
function reply(statusCode,body){return{statusCode,headers:{'content-type':'application/json; charset=utf-8','cache-control':'no-store'},body:JSON.stringify(body)}}

exports._test={parseGoogleForm,encodeId,decodeId,extractFormId,normaliseConfig,isIdentityCandidate};
