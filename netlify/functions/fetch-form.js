const { getStore } = require('@netlify/blobs');

const STORE = 'google-form-cache';
const TYPE_NAMES = {0:'SHORT',1:'LONG',2:'RADIO',3:'DROPDOWN',4:'CHECKBOX',5:'UNSUPPORTED',7:'UNSUPPORTED',9:'UNSUPPORTED',10:'UNSUPPORTED'};

exports.handler = async (event) => {
  try {
    if (event.httpMethod === 'GET') {
      const id = event.queryStringParameters?.id;
      if (!id) return reply(400,{error:'ID ujian tidak ditemukan.'});
      const formId = decodeId(id);
      const cached = await getStore(STORE).get(cacheKey(formId),{type:'json'});
      if (!cached) return reply(404,{error:'Data ujian belum tersedia atau cache telah kedaluwarsa. Minta guru melakukan Generate Ulang.'});
      return reply(200,publicForm(cached));
    }
    if (event.httpMethod !== 'POST') return reply(405,{error:'Metode tidak diizinkan.'});
    const body = JSON.parse(event.body||'{}');
    if (!body.url) return reply(400,{error:'Tautan Google Form wajib diisi.'});
    const duration = Math.max(0,Math.min(600,Number(body.duration)||0));
    const resolved = await resolveGoogleFormUrl(body.url);
    const formId = extractFormId(resolved);
    const store = getStore(STORE), key = cacheKey(formId);
    if (!body.refresh) {
      const existing = await store.get(key,{type:'json'});
      if (existing) {
        if (existing.duration !== duration) { existing.duration=duration; existing.updatedAt=new Date().toISOString(); await store.setJSON(key,existing); }
        return reply(200,{id:encodeId(formId),title:existing.title,questionCount:existing.questions.length,cached:true});
      }
    }
    const html = await fetchHtml(resolved);
    const parsed = parseGoogleForm(html,formId);
    if (!parsed.questions.length) throw userError('Tidak ada pertanyaan yang dapat dibaca. Pastikan tautan mengarah ke Google Form publik.');
    const record={...parsed,duration,sourceUrl:canonicalViewUrl(formId),updatedAt:new Date().toISOString()};
    await store.setJSON(key,record);
    return reply(200,{id:encodeId(formId),title:record.title,questionCount:record.questions.length,cached:false});
  } catch (err) {
    console.error('fetch-form:',err);
    return reply(err.status||500,{error:err.publicMessage||'Formulir gagal diproses. Pastikan formulir publik dan tautannya benar.'});
  }
};

async function resolveGoogleFormUrl(input){let url;try{url=new URL(input)}catch{throw userError('Format tautan tidak valid.');}if(url.protocol!=='https:')throw userError('Tautan harus menggunakan HTTPS.');const allowed=['docs.google.com','forms.gle'];if(!allowed.includes(url.hostname))throw userError('Gunakan tautan resmi Google Forms.');if(url.hostname==='forms.gle'){const r=await fetch(url,{redirect:'manual',headers:{'user-agent':'Mozilla/5.0'}});const next=r.headers.get('location');if(!next)throw userError('Tautan forms.gle tidak dapat dibuka.');return resolveGoogleFormUrl(new URL(next,url).href)}extractFormId(url.href);return url.href}
async function fetchHtml(url){const r=await fetch(url,{headers:{'user-agent':'Mozilla/5.0 (compatible; TKAFormRenderer/1.0)','accept-language':'id,en;q=.8'}});if(!r.ok)throw userError(`Google Form tidak dapat diakses (HTTP ${r.status}).`);const html=await r.text();if(/formulir ini tidak lagi menerima respons|this form is no longer accepting responses/i.test(html))throw userError('Google Form sudah tidak menerima respons.');return html}
function parseGoogleForm(html,formId){const marker='FB_PUBLIC_LOAD_DATA_';const start=html.indexOf(marker);if(start<0)throw userError('Struktur Google Form tidak ditemukan. Form mungkin mewajibkan login atau tidak dipublikasikan.');const eq=html.indexOf('=',start),end=html.indexOf(';</script>',eq);if(eq<0||end<0)throw userError('Data Google Form tidak dapat dibaca.');let data;try{data=JSON.parse(html.slice(eq+1,end).trim())}catch{throw userError('Format internal Google Form berubah dan belum dapat diproses.');}
  const meta=data?.[1]||[];const rawQuestions=meta?.[1]||meta?.[8]||[];const candidates=Array.isArray(rawQuestions)?rawQuestions:[];const questions=[];
  for(const q of candidates){if(!Array.isArray(q))continue;const title=typeof q[1]==='string'?q[1]:'Pertanyaan tanpa judul';const typeCode=Number.isInteger(q[3])?q[3]:-1;const field=Array.isArray(q[4])?q[4][0]:null;if(!Array.isArray(field))continue;const numericId=field[0];if(numericId===null||numericId===undefined)continue;const options=extractOptions(field[1]);const image=findImage(q);questions.push({entryId:`entry.${numericId}`,title,type:TYPE_NAMES[typeCode]||'UNSUPPORTED',required:Boolean(field[2]),options,image,unsupportedLabel:unsupportedLabel(typeCode)});}
  return {formId,title:cleanText(meta?.[8]||data?.[3]||'Ujian'),description:cleanText(meta?.[0]||''),questions};
}
function extractOptions(raw){if(!Array.isArray(raw))return[];return raw.map(x=>Array.isArray(x)?x[0]:x).filter(x=>typeof x==='string')}
function findImage(node){let found=null;(function walk(v){if(found)return;if(typeof v==='string'&&/^https:\/\/(?:lh\d+\.googleusercontent\.com|lh\d+\.ggpht\.com)\//.test(v))found=v;else if(Array.isArray(v))v.forEach(walk)})(node);return found}
function unsupportedLabel(code){return ({5:'Skala linear',7:'Grid',9:'Tanggal',10:'Waktu'})[code]||'Tipe khusus'}
function publicForm(v){return {id:encodeId(v.formId),title:v.title,description:v.description,duration:v.duration||0,updatedAt:v.updatedAt,questions:v.questions}}
function extractFormId(url){const m=String(url).match(/\/forms\/d\/e\/([a-zA-Z0-9_-]+)/);if(!m)throw userError('Tautan harus berupa Google Form publik dengan format /forms/d/e/...');return m[1]}
function encodeId(id){return Buffer.from(id).toString('base64url')}function decodeId(v){let id;try{id=Buffer.from(v,'base64url').toString('utf8')}catch{throw userError('ID ujian tidak valid.')}if(!/^[a-zA-Z0-9_-]{20,}$/.test(id))throw userError('ID ujian tidak valid.');return id}
function cacheKey(id){return `form-${id}`}function canonicalViewUrl(id){return `https://docs.google.com/forms/d/e/${id}/viewform`}function cleanText(v){return typeof v==='string'?v:''}
function userError(message,status=400){const e=new Error(message);e.publicMessage=message;e.status=status;return e}
function reply(statusCode,body){return{statusCode,headers:{'content-type':'application/json; charset=utf-8','cache-control':'no-store','access-control-allow-origin':'*'},body:JSON.stringify(body)}}

exports._test={parseGoogleForm,encodeId,decodeId,extractFormId};
