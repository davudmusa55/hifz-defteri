/* Hıfz Defteri çevrimdışı önbelleği. SURUM her derlemede dosyaların özetinden üretilir. */
const SURUM="hifz-2faeb4fd9beb",DOSYALAR=["alegreya-600-latin.woff2","alegreya-600-latin-ext.woff2","alegreyasans-400-latin.woff2","alegreyasans-400-latin-ext.woff2","alegreyasans-500-latin.woff2","alegreyasans-500-latin-ext.woff2","alegreyasans-700-latin.woff2","alegreyasans-700-latin-ext.woff2","alegreyasans-800-latin.woff2","alegreyasans-800-latin-ext.woff2","amiriquran-400-arabic.woff2","amiriquran-400-latin.woff2","diyanet-metin.json","ikon-180.png","ikon-192.png","ikon-32.png","ikon-512.png","index.html","manifest.webmanifest","meal-diyanet.json","quran.json","quran-simple.json","scheherazadenew-400-arabic.woff2","scheherazadenew-400-latin.woff2","scheherazadenew-400-latin-ext.woff2","scheherazadenew-500-arabic.woff2","scheherazadenew-500-latin.woff2","scheherazadenew-500-latin-ext.woff2","scheherazadenew-700-arabic.woff2","scheherazadenew-700-latin.woff2","scheherazadenew-700-latin-ext.woff2","storage.js","yazitipleri.css"],SES="ses-collak";
self.addEventListener("install",e=>e.waitUntil(
  caches.open(SURUM).then(c=>c.addAll(DOSYALAR.map(f=>new Request(f,{cache:"reload"})))).then(()=>self.skipWaiting())));
self.addEventListener("activate",e=>e.waitUntil(
  caches.keys().then(k=>Promise.all(k.filter(x=>x.startsWith("hifz-")&&x!==SURUM).map(x=>caches.delete(x)))).then(()=>self.clients.claim())));
/* İndirilmiş ses dosyasından istenen bayt aralığını verir (ileri-geri sarma için) */
function aralik(req,b){
  const r=req.headers.get("range"),tip={"Content-Type":"audio/mpeg","Accept-Ranges":"bytes"};
  if(!r)return new Response(b,{status:200,headers:Object.assign({"Content-Length":String(b.size)},tip)});
  const m=/bytes=(\d*)-(\d*)/.exec(r)||[];let s=m[1]?+m[1]:0,e=m[2]?+m[2]:b.size-1;
  if(!m[1]&&m[2]){s=Math.max(0,b.size-+m[2]);e=b.size-1}
  e=Math.min(e,b.size-1);
  if(s>e||s>=b.size)return new Response(null,{status:416,headers:{"Content-Range":`bytes */${b.size}`}});
  return new Response(b.slice(s,e+1),{status:206,headers:Object.assign({"Content-Range":`bytes ${s}-${e}/${b.size}`,"Content-Length":String(e-s+1)},tip)})}
self.addEventListener("fetch",e=>{
  const r=e.request,u=new URL(r.url);
  if(r.method!=="GET")return;
  const ses=u.pathname.match(/rabieaaa2015_yahoo_002132432\/(\d{3})\.mp3$/);
  if(ses){e.respondWith(caches.open(SES).then(c=>c.match("ses/"+ses[1]+".mp3")).then(x=>x?x.blob().then(b=>aralik(r,b)):fetch(r)));return}
  if((u.hostname==="webdosya.diyanet.gov.tr"&&/\.ttf$/.test(u.pathname))||(u.hostname==="cdnjs.cloudflare.com"&&u.pathname.includes("/pdf.js/"))){   // Diyanet yazı tipi ve PDF okuyucu: ilk kullanımda indirilir, sonra cihazdan
    e.respondWith(caches.open("dis-dosya").then(c=>c.match(r.url).then(x=>x||fetch(r).then(y=>{if(y.ok||y.type==="opaque")c.put(r.url,y.clone());return y}))));return}
  if(u.origin!==location.origin)return;
  e.respondWith(caches.open(SURUM).then(c=>c.match(r,{ignoreSearch:true}).then(x=>x||(r.mode==="navigate"?c.match("index.html"):null))).then(x=>x||fetch(r)))});
