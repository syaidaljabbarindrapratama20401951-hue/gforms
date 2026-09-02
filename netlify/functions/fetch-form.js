const TYPE_NAMES={0:'SHORT',1:'LONG',2:'RADIO',3:'DROPDOWN',4:'CHECKBOX',5:'UNSUPPORTED',7:'UNSUPPORTED',9:'UNSUPPORTED',10:'UNSUPPORTED'};

exports.handler=async(event)=>{try{
  if(event.httpMethod==='GET')return handleGet(event);
  if(event.httpMethod!=='POST')return reply(405,{error:'Metode tidak diizinkan.'});
  const body=JSON.parse(event.body||'{}');
  return body.action==='configure'?configureForm(body):inspectForm(body);
}catch(err){console.error('fetch-form:',err);return reply(err.status||500,{error:err.publicMessage||'Formulir gagal diproses. Pastikan formulir publik dan tautannya benar.'})}};

async function handleGet(event){
  const id=event.queryStringParameters?.id;if(!id)return reply(400,{error:'ID ujian tidak ditemukan.'});
  const payload=decodeExamId(id),record=await loadForm(payload.formId);
  record.config=normaliseConfig(payload.config);
  return reply(200,publicForm(record));
}

async function inspectForm(body){
  if(!body.url)throw userError('Tautan Google Form wajib diisi.');
  const resolved=await resolveGoogleFormUrl(body.url),formId=extractFormId(resolved),record=await loadForm(formId),config=normaliseConfig({});
  return reply(200,adminForm({...record,config},false));
}

async function configureForm(body){
  const payload=decodeExamId(body.id),record=await loadForm(payload.formId),config=normaliseConfig(body.config);
  if(!examQuestions(record).length)throw userError('Formulir harus memiliki minimal satu soal yang didukung.');
  const id=encodeExamId({formId:record.formId,config});
  return reply(200,{id,title:record.title,questionCount:examQuestions(record).length,config});
}

async function loadForm(formId){
  const html=await fetchHtml(canonicalViewUrl(formId)),parsed=parseGoogleForm(html,formId);
  if(!parsed.questions.length)throw userError('Tidak ada pertanyaan yang dapat dibaca. Pastikan tautan mengarah ke Google Form publik.');
  return {...parsed,sourceUrl:canonicalViewUrl(formId),updatedAt:new Date().toISOString()};
}

function adminForm(record,cached){return{id:encodeExamId({formId:record.formId,config:record.config}),title:record.title,description:record.description,questions:record.questions.map(q=>({entryId:q.entryId,title:q.title,type:q.type,required:q.required})),config:record.config,cached}}
function publicForm(record){return{id:encodeExamId({formId:record.formId,config:record.config}),title:record.title,description:record.description,config:record.config,updatedAt:record.updatedAt,questions:record.questions.map(q=>({...q,isIdentity:false}))}}
function examQuestions(record){return record.questions.filter(q=>q.type!=='UNSUPPORTED')}
function normaliseConfig(value={}){return{duration:clampNumber(value.duration,0,600,0),sessionName:clean(value.sessionName,80),subject:clean(value.subject,100),className:clean(value.className,80),examDate:/^\d{4}-\d{2}-\d{2}$/.test(value.examDate||'')?value.examDate:'',token:clean(value.token,40),theme:['exam','business','casual'].includes(value.theme)?value.theme:'exam',themeMode:value.themeMode==='dark'?'dark':'light',proofMode:value.proofMode==='summary'?'summary':'off',soundWarnings:Boolean(value.soundWarnings),shuffleOptions:Boolean(value.shuffleOptions),violationsEnabled:value.violationsEnabled!==false,violationLimit:clampNumber(value.violationLimit,1,10,3),instructions:clean(value.instructions,1200),identityEntryIds:[]}}

async function resolveGoogleFormUrl(input){let url;try{url=new URL(input)}catch{throw userError('Format tautan tidak valid.')}if(url.protocol!=='https:')throw userError('Tautan harus menggunakan HTTPS.');if(!['docs.google.com','forms.gle'].includes(url.hostname))throw userError('Gunakan tautan resmi Google Forms.');if(url.hostname==='forms.gle'){const r=await fetch(url,{redirect:'manual',headers:{'user-agent':'Mozilla/5.0'}}),next=r.headers.get('location');if(!next)throw userError('Tautan forms.gle tidak dapat dibuka.');return resolveGoogleFormUrl(new URL(next,url).href)}extractFormId(url.href);return url.href}
async function fetchHtml(url){const r=await fetch(url,{headers:{'user-agent':'Mozilla/5.0 (compatible; TKAFormRenderer/2.1)','accept-language':'id,en;q=.8'}});if(!r.ok)throw userError(`Google Form tidak dapat diakses (HTTP ${r.status}).`);const html=await r.text();if(/formulir ini tidak lagi menerima respons|this form is no longer accepting responses/i.test(html))throw userError('Google Form sudah tidak menerima respons.');return html}
function parseGoogleForm(html,formId){const marker='FB_PUBLIC_LOAD_DATA_',start=html.indexOf(marker);if(start<0)throw userError('Struktur Google Form tidak ditemukan. Form mungkin mewajibkan login atau tidak dipublikasikan.');const eq=html.indexOf('=',start),end=html.indexOf(';</script>',eq);if(eq<0||end<0)throw userError('Data Google Form tidak dapat dibaca.');let data;try{data=JSON.parse(html.slice(eq+1,end).trim())}catch{throw userError('Format internal Google Form berubah dan belum dapat diproses.')}const meta=data?.[1]||[],candidates=Array.isArray(meta?.[1])?meta[1]:(Array.isArray(meta?.[8])?meta[8]:[]),questions=[];let pendingImages=[];for(const q of candidates){if(!Array.isArray(q))continue;const embeddedImages=findImages(q),title=typeof q[1]==='string'?q[1]:'Pertanyaan tanpa judul',typeCode=Number.isInteger(q[3])?q[3]:-1,field=Array.isArray(q[4])?q[4][0]:null;if(!Array.isArray(field)||field[0]===null||field[0]===undefined){if(embeddedImages.length)pendingImages=uniqueImages([...pendingImages,...embeddedImages]);continue}const images=uniqueImages([...pendingImages,...embeddedImages]);pendingImages=[];questions.push({entryId:`entry.${field[0]}`,title,type:TYPE_NAMES[typeCode]||'UNSUPPORTED',required:Boolean(field[2]),options:extractOptions(field[1]),image:images[0]||null,images,unsupportedLabel:unsupportedLabel(typeCode)})}return{formId,title:extractDocumentTitle(html)||'Ujian',description:cleanText(meta?.[0]||''),questions,submitMetadata:extractSubmitMetadata(html,candidates)}}
function extractOptions(raw){if(!Array.isArray(raw))return[];return raw.map(x=>Array.isArray(x)?x[0]:x).filter(x=>typeof x==='string')}
function findImages(node){const found=[];(function walk(v){if(typeof v==='string'){const url=normaliseImageUrl(v);if(url)found.push(url)}else if(Array.isArray(v))v.forEach(walk);else if(v&&typeof v==='object')Object.values(v).forEach(walk)})(node);return uniqueImages(found)}
function normaliseImageUrl(value){let text=String(value).trim().replace(/&amp;/g,'&');const embedded=text.match(/(?:https?:)?\/\/[^"'<>\s]+/i);if(embedded)text=embedded[0];if(text.startsWith('//'))text='https:'+text;if(!/^https:\/\//i.test(text))return null;let url;try{url=new URL(text)}catch{return null}const host=url.hostname.toLowerCase(),path=url.pathname.toLowerCase(),allowed=host==='googleusercontent.com'||host.endsWith('.googleusercontent.com')||host==='ggpht.com'||host.endsWith('.ggpht.com')||(host==='drive.google.com'&&(path.includes('/uc')||path.includes('/thumbnail')))||(host==='docs.google.com'&&path.includes('/forms/'));return allowed?url.href:null}
function uniqueImages(values){return[...new Set(values.filter(Boolean))]}
function unsupportedLabel(code){return({5:'Skala linear',7:'Grid',9:'Tanggal',10:'Waktu'})[code]||'Tipe khusus'}
function extractFormId(url){const m=String(url).match(/\/forms\/d\/e\/([a-zA-Z0-9_-]+)/);if(!m)throw userError('Tautan harus berupa Google Form publik dengan format /forms/d/e/...');return m[1]}
function encodeExamId(payload){return Buffer.from(JSON.stringify({v:2,f:payload.formId,c:normaliseConfig(payload.config)})).toString('base64url')}
function decodeExamId(value){if(typeof value!=='string')throw userError('ID ujian tidak valid.');let decoded;try{decoded=Buffer.from(value,'base64url').toString('utf8')}catch{throw userError('ID ujian tidak valid.')}try{const p=JSON.parse(decoded);if(p?.v===2&&validFormId(p.f))return{formId:p.f,config:normaliseConfig(p.c)}}catch{}if(validFormId(decoded))return{formId:decoded,config:normaliseConfig({})};throw userError('ID ujian tidak valid.')}
function validFormId(id){return typeof id==='string'&&/^[a-zA-Z0-9_-]{20,}$/.test(id)}
function canonicalViewUrl(id){return`https://docs.google.com/forms/d/e/${id}/viewform`}
function cleanText(v){return typeof v==='string'?v:''}function clean(v,max){return typeof v==='string'?v.trim().slice(0,max):''}function clampNumber(v,min,max,fallback){const n=Math.round(Number(v));return Number.isFinite(n)?Math.max(min,Math.min(max,n)):fallback}
function extractDocumentTitle(html){const m=html.match(/<title[^>]*>([\s\S]*?)<\/title>/i);return m?decodeEntities(m[1].trim()):''}function decodeEntities(t){return t.replace(/&amp;/g,'&').replace(/&lt;/g,'<').replace(/&gt;/g,'>').replace(/&quot;/g,'"').replace(/&#39;/g,"'")}
function extractSubmitMetadata(html,rawItems=[]){const seed=html.match(/data-shuffle-seed=["'](-?\d+)["']/i)?.[1]||'',sections=1+rawItems.filter(item=>Array.isArray(item)&&item[3]===8).length,pageHistory=Array.from({length:sections},(_,i)=>i).join(',');return{fbzx:seed,pageHistory,fvv:'1',submissionTimestamp:'-1'}}
function userError(message,status=400){const e=new Error(message);e.publicMessage=message;e.status=status;return e}function reply(statusCode,body){return{statusCode,headers:{'content-type':'application/json; charset=utf-8','cache-control':'no-store'},body:JSON.stringify(body)}}

exports._test={parseGoogleForm,extractFormId,normaliseConfig,extractSubmitMetadata,decodeExamId,encodeExamId,canonicalViewUrl,fetchHtml,userError,findImages,normaliseImageUrl};
