/* Gestão SMS - funcionamento offline (tablets em campo)
   - a página e as bibliotecas ficam guardadas no aparelho
   - a página é buscada na internet quando há conexão (pega a versão nova) e
     sai do aparelho quando não há
   - o banco (Supabase) não passa por aqui: os dados offline e a fila de
     alterações ficam no próprio painel */
var VERSAO = 'gestao-sms-f45f30c935';
var LIBS = [
  'https://cdnjs.cloudflare.com/ajax/libs/Chart.js/4.4.1/chart.umd.min.js',
  'https://cdnjs.cloudflare.com/ajax/libs/chartjs-plugin-datalabels/2.2.0/chartjs-plugin-datalabels.min.js',
  'https://cdnjs.cloudflare.com/ajax/libs/exceljs/4.4.0/exceljs.min.js',
  'https://cdnjs.cloudflare.com/ajax/libs/html2canvas/1.4.1/html2canvas.min.js',
  'https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js',
  'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.45.4/dist/umd/supabase.js'
];
var LOCAIS = ['./', './index.html', './portal-sesmt.html', './tecnico-fotos.html', './manifest.webmanifest', './icone-192.png', './icone-512.png'];
var CDN = /^https:\/\/(cdnjs\.cloudflare\.com|cdn\.jsdelivr\.net)\//;
/* resposta que veio de um redirecionamento (ex.: Vercel tirando o ".html" do endereço)
   não pode ser usada para abrir a página sem internet: guarda uma cópia "limpa" */
function limpa(r){
  if(!r || !r.redirected) return Promise.resolve(r);
  return r.blob().then(function(b){ return new Response(b, { status:r.status, statusText:r.statusText, headers:r.headers }); });
}
function guardar(c, chave, r){ return limpa(r).then(function(x){ return c.put(chave, x); }); }
/* qualquer página do portal guardada serve de reserva */
function paginaGuardada(req){
  return caches.open(VERSAO).then(function(c){
    return c.match(req, { ignoreSearch:true }).then(function(r){
      if(r) return r;
      /* a página dos técnicos nunca cai no Gestão SMS e vice-versa */
      if(/tecnico-fotos/.test(new URL(req.url).pathname)) return c.match('./tecnico-fotos.html');
      return c.match('./').then(function(r0){ return r0 || c.match('./portal-sesmt.html'); }).then(function(r2){
        if(r2) return r2;
        return c.keys().then(function(ks){
          var k = ks.find(function(q){ return q.url.indexOf(self.location.origin) === 0 && !/\.(js|png|webmanifest|css)$/.test(new URL(q.url).pathname); });
          return k ? c.match(k) : undefined;
        });
      });
    });
  });
}

self.addEventListener('install', function(e){
  e.waitUntil(caches.open(VERSAO).then(function(c){
    /* cada arquivo separado: se um falhar, os outros ficam guardados */
    return Promise.all(LOCAIS.concat(LIBS).map(function(u){
      return fetch(u, { mode: CDN.test(u) ? 'cors' : 'same-origin', cache: 'no-cache' })
        .then(function(r){ if(r.ok) return guardar(c, u, r); }).catch(function(){});
    }));
  }));
  self.skipWaiting();
});

self.addEventListener('activate', function(e){
  e.waitUntil(caches.keys().then(function(ks){
    return Promise.all(ks.filter(function(k){ return k.indexOf('gestao-sms-') === 0 && k !== VERSAO; }).map(function(k){ return caches.delete(k); }));
  }).then(function(){ return self.clients.claim(); }).then(function(){
    /* guarda também o endereço exato pelo qual a página foi aberta */
    return self.clients.matchAll({ type:'window' }).then(function(cs){
      return caches.open(VERSAO).then(function(c){
        return Promise.all(cs.map(function(cl){ return fetch(cl.url, { cache:'no-cache' }).then(function(r){ if(r.ok) return guardar(c, cl.url, r); }).catch(function(){}); }));
      });
    });
  }));
});

self.addEventListener('fetch', function(e){
  var req = e.request;
  if(req.method !== 'GET') return;
  var url = req.url;
  if(req.mode === 'navigate'){
    e.respondWith(fetch(req).then(function(r){
      if(r.ok){ var cp = r.clone(); caches.open(VERSAO).then(function(c){ guardar(c, req.url, cp); }); }
      return r;
    }).catch(function(){
      return paginaGuardada(req).then(function(r){
        return limpa(r).then(function(x){ return x || new Response('<meta charset="utf-8"><body style="font-family:sans-serif;padding:40px"><h2>Gestão SMS</h2><p>Sem internet e o portal ainda não foi guardado neste aparelho. Abra uma vez com internet e recarregue a página.</p></body>', { headers:{ 'Content-Type':'text/html; charset=utf-8' } }); });
      });
    }));
    return;
  }
  var mesmaOrigem = url.indexOf(self.location.origin) === 0;
  if(CDN.test(url) || (mesmaOrigem && /\.(png|webmanifest|js|css)$/.test(new URL(url).pathname))){
    e.respondWith(caches.match(req).then(function(r){
      return r || fetch(req).then(function(n){ if(n.ok){ var cp = n.clone(); caches.open(VERSAO).then(function(c){ c.put(req, cp); }); } return n; });
    }));
  }
});
