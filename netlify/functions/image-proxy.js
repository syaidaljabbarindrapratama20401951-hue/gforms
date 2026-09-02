const MAX_IMAGE_BYTES=8*1024*1024;

exports.handler=async event=>{
  if(event.httpMethod!=='GET')return json(405,'Metode tidak diizinkan.');
  const raw=event.queryStringParameters?.url;
  if(!raw)return json(400,'URL gambar tidak tersedia.');
  let url;
  try{url=new URL(raw)}catch{return json(400,'URL gambar tidak valid.');}
  if(url.protocol!=='https:'||url.hostname!=='docs.google.com'||!url.pathname.startsWith('/forms-images-rt/'))return json(403,'Sumber gambar tidak diizinkan.');
  try{
    const response=await fetch(url.href,{headers:{'user-agent':'Mozilla/5.0 (compatible; TKAFormRenderer/2.3)','accept':'image/avif,image/webp,image/apng,image/*,*/*;q=0.8','referer':'https://docs.google.com/forms/'},redirect:'follow'});
    if(!response.ok)return json(502,`Gambar Google tidak dapat diambil (HTTP ${response.status}).`);
    const contentType=(response.headers.get('content-type')||'').split(';')[0].trim().toLowerCase();
    if(!contentType.startsWith('image/'))return json(502,'Respons Google bukan berupa gambar.');
    const bytes=Buffer.from(await response.arrayBuffer());
    if(bytes.length>MAX_IMAGE_BYTES)return json(413,'Ukuran gambar terlalu besar.');
    return{statusCode:200,isBase64Encoded:true,headers:{'content-type':contentType,'cache-control':'public, max-age=3600, s-maxage=86400','x-content-type-options':'nosniff'},body:bytes.toString('base64')};
  }catch(error){console.error('image-proxy:',error);return json(502,'Gambar Google sementara tidak dapat diakses.');}
};

function json(statusCode,error){return{statusCode,headers:{'content-type':'application/json; charset=utf-8','cache-control':'no-store'},body:JSON.stringify({error})}}
