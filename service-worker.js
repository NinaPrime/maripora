const CACHE_NAME='maripora-v2.0.0';
const APP_FILES=['./','./index.html','./styles.css','./app.js','./domain.js','./exports.js','./manifest.webmanifest','./app-icon.svg','./dormente.svg','./icons/icon-192.png','./icons/icon-512.png'];
self.addEventListener('install',event=>{event.waitUntil(caches.open(CACHE_NAME).then(cache=>cache.addAll(APP_FILES)));});
self.addEventListener('activate',event=>{event.waitUntil(caches.keys().then(names=>Promise.all(names.filter(n=>(n.startsWith('maripora-')&&n!==CACHE_NAME)).map(n=>caches.delete(n)))).then(()=>self.clients.claim()));});
self.addEventListener('message',event=>{if(event.data==='SKIP_WAITING')self.skipWaiting();});
self.addEventListener('fetch',event=>{
  const request=event.request,url=new URL(request.url);if(request.method!=='GET'||url.origin!==self.location.origin)return;
  // Apenas arquivos do aplicativo. Não armazena APIs, autenticação ou exportações.
  const known=APP_FILES.some(f=>new URL(f,self.registration.scope).pathname===url.pathname);
  if(!known&&request.mode!=='navigate')return;
  if(request.mode==='navigate')event.respondWith(fetch(request).then(response=>{if(response.ok){const copy=response.clone();caches.open(CACHE_NAME).then(cache=>cache.put('./index.html',copy));}return response;}).catch(()=>caches.match('./index.html')));
  else event.respondWith(caches.match(request).then(cached=>cached||fetch(request).then(response=>{if(response.ok){const copy=response.clone();caches.open(CACHE_NAME).then(cache=>cache.put(request,copy));}return response;})));
});
