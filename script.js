// ============================================================
// SUPABASE CONFIG — reemplaza con tus credenciales
// ============================================================
const SUPABASE_URL = 'https://evoewvoxfcmldrhcbmcj.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImV2b2V3dm94ZmNtbGRyaGNibWNqIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzg5NjI1ODYsImV4cCI6MjA5NDUzODU4Nn0.eAeIJnpGOKbjZbWdz5KAfa_3yp2tHaDV_ArjPoTVdx8';
const { createClient } = supabase;
const sb = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

// ============================================================
// ESTADO LOCAL (no va a Supabase)
// ============================================================
let carrito = [];          // se sincroniza con DB
let usuarioActual = null;  // objeto usuario cargado de DB
let configGlobal = {};     // cache de configuracion
let productosCache = [];   // cache local de productos
let pedidoSeccion = 'pendiente';
let filtroActivo = 'todos';
let ordenActivo = null;
let waContext = {};
let productoFormMode = null;
let advTelPendiente = null;
let progBloqueoReglas = [];
let timePeriod = 'AM';

// ============================================================
// AUDIO
// ============================================================
function playConfirmSound(){try{const c=new(window.AudioContext||window.webkitAudioContext)();const t=c.currentTime;[523.25,659.25,783.99].forEach((f,i)=>{const o=c.createOscillator(),g=c.createGain();o.type='sine';o.frequency.value=f;g.gain.setValueAtTime(0,t+i*0.12);g.gain.linearRampToValueAtTime(0.18,t+i*0.12+0.04);g.gain.linearRampToValueAtTime(0,t+i*0.12+0.22);o.connect(g);g.connect(c.destination);o.start(t+i*0.12);o.stop(t+i*0.12+0.25);});}catch(e){}}
function playReadySound(){try{const c=new(window.AudioContext||window.webkitAudioContext)();const t=c.currentTime;[880,1046.5].forEach((f,i)=>{const o=c.createOscillator(),g=c.createGain();o.type='sine';o.frequency.value=f;g.gain.setValueAtTime(0,t+i*0.15);g.gain.linearRampToValueAtTime(0.22,t+i*0.15+0.05);g.gain.linearRampToValueAtTime(0,t+i*0.15+0.28);o.connect(g);g.connect(c.destination);o.start(t+i*0.15);o.stop(t+i*0.15+0.3);});}catch(e){}}

// ============================================================
// UTILIDADES UI
// ============================================================
let toastTimer;
function showToast(msg,ms=2600){clearTimeout(toastTimer);const t=document.getElementById('toast');t.textContent=msg;t.classList.add('show');toastTimer=setTimeout(()=>t.classList.remove('show'),ms);}

function abrirModalById(id){document.getElementById(id).classList.add('open');document.body.style.overflow='hidden';}
function cerrarModalById(id){document.getElementById(id).classList.remove('open');if(!document.querySelector('.modal-overlay.open'))document.body.style.overflow='';}
function cerrarModal(id,e){if(e.target===document.getElementById(id))cerrarModalById(id);}

function setLoading(btnId,on){const b=document.getElementById(btnId);if(!b)return;b.classList.toggle('loading',on);}

function mostrarConfirmDialog(titulo,texto,labelOk,fnOk,peligro=false){
  document.getElementById('confirm-dialog-content').innerHTML=`
    <div style="text-align:center;margin-bottom:16px">
      <div style="font-size:1.2rem;font-weight:600;color:var(--cafe-dark);margin-bottom:6px">${titulo}</div>
      ${texto?`<p style="font-size:0.87rem;color:var(--texto-suave)">${texto}</p>`:''}
    </div>
    <div style="display:flex;gap:8px">
      <button class="btn" style="flex:1" onclick="cerrarModalById('modal-confirm-dialog')">Cancelar</button>
      <button class="btn ${peligro?'btn-danger':'btn-primary'}" style="flex:2" id="dialog-ok-btn">${labelOk}</button>
    </div>`;
  document.getElementById('dialog-ok-btn').onclick=()=>{fnOk();cerrarModalById('modal-confirm-dialog');};
  abrirModalById('modal-confirm-dialog');
}

function formatTel(input){let v=input.value.replace(/\D/g,'').slice(0,8);input.value=v.length>4?v.slice(0,4)+' '+v.slice(4):v;}
function formatQ(n){return'Q'+Number(n).toFixed(2);}
function formatHora(iso){return new Date(iso).toLocaleTimeString('es-GT',{hour:'2-digit',minute:'2-digit'});}
function formatFecha(iso){return new Date(iso).toLocaleDateString('es-GT',{day:'2-digit',month:'short',year:'numeric'});}
function getAdvCount(u){return Array.isArray(u.advertencias)?u.advertencias.length:0;}
function generatePedidoId(){return String(Math.floor(1000+Math.random()*9000));}
function getNombreUsuario(tel){const u=productosCache._usuarios?.find(x=>x.telefono===tel);return u?u.nombre:'cliente';}

// detalles con saltos de línea → HTML
function detallesHtml(txt){if(!txt)return'';return txt.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/\n/g,'<br>');}

function getEstadoBadge(e){
  const m={pendiente:'<span class="badge badge-aviso">Recibida</span>',confirmado:'<span class="badge badge-info">Confirmada</span>',listo:'<span class="badge badge-exito">Lista</span>',entregado:'<span class="badge badge-neutro">Entregada</span>',cancelado:'<span class="badge badge-cancelado">Cancelada</span>'};
  return m[e]||e;
}

const CAT_ICONS={'Pan':'ti-bread','Pan dulce':'ti-croissant','Bebidas':'ti-bottle','Reposteria':'ti-cake','Tienda':'ti-basket'};
const getCatIcon=c=>CAT_ICONS[c]||'ti-shopping-bag';

function getHoraEstimada(p){
  if(p.hora_recogida)return p.hora_recogida;
  const d=new Date(new Date(p.created_at).getTime()+30*60000);
  return d.toLocaleTimeString('es-GT',{hour:'2-digit',minute:'2-digit'});
}

// ============================================================
// BLOQUEO DE PRODUCTO PROGRAMADO
// ============================================================
function productoEstaDisponible(prod){
  if(prod.bloqueado)return false;
  if(!prod.bloqueo_prog||!prod.bloqueo_prog.length)return true;
  const ahora=new Date();
  const diaSemana=ahora.getDay(); // 0=Dom
  const horaActual=ahora.getHours()*60+ahora.getMinutes();
  for(const r of prod.bloqueo_prog){
    if(r.tipo==='dias'&&r.dias&&r.dias.includes(diaSemana))return false;
    if(r.tipo==='horas'&&r.desde&&r.hasta){
      const[dh,dm]=r.desde.split(':').map(Number);
      const[hh,hm]=r.hasta.split(':').map(Number);
      if(horaActual>=dh*60+dm&&horaActual<=hh*60+hm)return false;
    }
  }
  return true;
}

// ============================================================
// ANALYTICS (contadores locales → DB)
// ============================================================
async function registrarClick(){
  if(!usuarioActual)return;
  try{await sb.from('usuarios').update({clicks:sb.rpc?undefined:undefined}).eq('id',usuarioActual.id);}catch(e){}
  // Usamos update con incremento raw SQL no disponible en JS client, así que lo hacemos así:
  try{
    const{data}=await sb.from('usuarios').select('clicks').eq('id',usuarioActual.id).single();
    if(data)await sb.from('usuarios').update({clicks:(data.clicks||0)+1}).eq('id',usuarioActual.id);
  }catch(e){}
}
function regClick(){if(usuarioActual)registrarClick();}

async function registrarVisita(){
  if(!usuarioActual)return;
  try{
    const{data}=await sb.from('usuarios').select('visitas').eq('id',usuarioActual.id).single();
    if(data)await sb.from('usuarios').update({visitas:(data.visitas||0)+1}).eq('id',usuarioActual.id);
  }catch(e){}
}

// ============================================================
// INIT
// ============================================================
document.addEventListener('DOMContentLoaded',async()=>{
  await cargarConfigGlobal();
  await intentarRestaurarSesion();
  await cargarProductos();
  renderFiltrosCategorias();
  actualizarTerminosUI();
  initTimePicker();
  // Listener global de clicks para analytics
  document.addEventListener('click',()=>regClick(),{passive:true});
});

// ============================================================
// SESIÓN PERSISTENTE (localStorage)
// ============================================================
async function intentarRestaurarSesion(){
  const tel=localStorage.getItem('mdj_tel');
  if(!tel)return;
  try{
    const{data,error}=await sb.from('usuarios').select('*').eq('telefono',tel).single();
    if(data&&!error){
      usuarioActual=data;
      carrito=Array.isArray(data.carrito)?data.carrito:[];
      actualizarCarritoUI();
      await registrarVisita();
    }else{localStorage.removeItem('mdj_tel');}
  }catch(e){localStorage.removeItem('mdj_tel');}
}

// ============================================================
// CONFIGURACIÓN GLOBAL
// ============================================================
async function cargarConfigGlobal(){
  try{
    const{data}=await sb.from('configuracion').select('*');
    if(data)data.forEach(row=>{
      try{configGlobal[row.clave]=typeof row.valor==='string'?JSON.parse(row.valor):row.valor;}
      catch(e){configGlobal[row.clave]=row.valor;}
    });
  }catch(e){}
  // Defaults si no hay DB aún
  if(!configGlobal.telefono_tienda)configGlobal.telefono_tienda='58965725';
  if(!configGlobal.terminos_extra)configGlobal.terminos_extra='Una vez le enviemos la confirmación, tendrá 15 minutos para pasar a recoger su orden.';
  if(!configGlobal.estados_info)configGlobal.estados_info={pendiente:'Su orden fue recibida.',confirmado:'En preparación.',listo:'Lista para recoger.',entregado:'Completada.',cancelado:'Cancelada.'};
  if(!configGlobal.funciones_bloqueadas)configGlobal.funciones_bloqueadas={realizar_pedidos:false,hora_recogida:false,pedido_domicilio:false,nota_pedido:false};
}

async function guardarConfig(clave,valor){
  try{await sb.from('configuracion').upsert({clave,valor:JSON.stringify(valor),updated_at:new Date().toISOString()});}catch(e){}
  configGlobal[clave]=valor;
}

function actualizarTerminosUI(){const el=document.getElementById('terminos-extra-texto');if(el)el.textContent=configGlobal.terminos_extra||'';}

// ============================================================
// PRODUCTOS
// ============================================================
async function cargarProductos(){
  document.getElementById('productos-grid').innerHTML='<div class="loading-full" style="grid-column:1/-1"><div class="spinner"></div></div>';
  try{
    const{data,error}=await sb.from('productos').select('*').order('created_at',{ascending:true});
    if(data)productosCache=data;
    else productosCache=[];
  }catch(e){productosCache=[];}
  renderProductos();
}

function getCategoriasUnicas(){return[...new Set(productosCache.map(p=>p.categoria))];}

function renderFiltrosCategorias(){
  const cont=document.getElementById('filtros-container');
  // Remove dynamic cat buttons first
  cont.querySelectorAll('[data-cat]').forEach(b=>b.remove());
  getCategoriasUnicas().forEach(cat=>{
    const b=document.createElement('button');b.className='filtro-btn';b.setAttribute('data-cat',cat);
    b.innerHTML=`<i class="ti ${getCatIcon(cat)}"></i> ${cat}`;b.onclick=function(){setFiltro(cat,this);};cont.appendChild(b);
  });
  // mostrar filtro favoritos si hay usuario
  const btnFav=document.getElementById('btn-fav-filtro');
  if(btnFav)btnFav.style.display=usuarioActual?'flex':'none';
}

function setFiltro(cat,btn){filtroActivo=cat;ordenActivo=null;document.querySelectorAll('.filtro-btn').forEach(b=>b.classList.remove('active'));if(btn)btn.classList.add('active');renderProductos();}
function setOrden(orden,btn){ordenActivo=orden;filtroActivo='todos';document.querySelectorAll('.filtro-btn').forEach(b=>b.classList.remove('active'));if(btn)btn.classList.add('active');renderProductos();}

function renderProductos(){
  const grid=document.getElementById('productos-grid');
  const busqueda=(document.getElementById('nav-search')||{}).value?.toLowerCase()||'';
  const favs=usuarioActual?.favoritos||[];
  let prods=[...productosCache];
  if(filtroActivo==='favoritos')prods=prods.filter(p=>favs.includes(p.id));
  else if(filtroActivo&&filtroActivo!=='todos')prods=prods.filter(p=>p.categoria===filtroActivo);
  if(busqueda)prods=prods.filter(p=>p.nombre.toLowerCase().includes(busqueda)||p.categoria.toLowerCase().includes(busqueda)||(p.subcategoria||'').toLowerCase().includes(busqueda));
  if(ordenActivo==='precio-asc')prods.sort((a,b)=>a.precio-b.precio);
  if(ordenActivo==='precio-desc')prods.sort((a,b)=>b.precio-a.precio);
  if(!prods.length){grid.innerHTML='<div class="empty" style="grid-column:1/-1"><i class="ti ti-search"></i><p>Sin resultados</p></div>';return;}
  const esFav=id=>favs.includes(id);
  grid.innerHTML=prods.map(p=>{
    const disponible=productoEstaDisponible(p);
    return`<div class="card card-hover producto-card fade-in" onclick="verProducto(${p.id})">
      <div class="producto-img-wrap">
        ${p.imagen?`<img src="${p.imagen}" alt="${p.nombre}" onerror="this.parentNode.innerHTML='<i class=\\'ti ${getCatIcon(p.categoria)} producto-img-icon\\'></i>'">`:`<i class="ti ${getCatIcon(p.categoria)} producto-img-icon"></i>`}
        ${!disponible?`<div class="no-disp-overlay"><i class="ti ti-ban" style="font-size:1.1rem;display:block;margin-bottom:3px"></i>No disponible actualmente</div>`:''}
      </div>
      <div class="producto-info">
        <div class="producto-nombre">${p.nombre}${p.subcategoria?`<span style="font-size:0.7rem;color:var(--texto-muy-suave);margin-left:4px">${p.subcategoria}</span>`:''}</div>
        <div style="display:flex;align-items:center;justify-content:space-between;margin-top:4px">
          <div class="producto-precio">${formatQ(p.precio)}</div>
          <div style="display:flex;gap:4px">
            ${usuarioActual?`<button class="fav-btn${esFav(p.id)?' active':''}" onclick="event.stopPropagation();toggleFav(${p.id})" title="Favorito"><i class="ti ti-heart${esFav(p.id)?'-filled':''}"></i></button>`:''}
            ${disponible?`<button class="add-btn" onclick="event.stopPropagation();agregarCarrito(${p.id})"><i class="ti ti-plus"></i></button>`:''}
          </div>
        </div>
        ${p.extra?`<div class="producto-extra-tag"><i class="ti ti-clock" style="font-size:0.72rem"></i>${p.extra}</div>`:''}
      </div>
    </div>`;
  }).join('');
}

function verProducto(id,esAdmin=false){
  const p=productosCache.find(x=>x.id===id);if(!p)return;
  const disponible=productoEstaDisponible(p);
  const contenido=`
    <div style="text-align:center;margin-bottom:16px">
      <div style="width:110px;height:110px;border-radius:14px;background:var(--beige);display:flex;align-items:center;justify-content:center;margin:0 auto 10px;overflow:hidden;position:relative">
        ${p.imagen?`<img src="${p.imagen}" style="width:100%;height:100%;object-fit:cover" onerror="this.parentNode.innerHTML='<i class=\\'ti ${getCatIcon(p.categoria)}\\' style=\\'font-size:2.8rem;color:var(--cafe-light)\\'></i>'">`:`<i class="ti ${getCatIcon(p.categoria)}" style="font-size:2.8rem;color:var(--cafe-light)"></i>`}
        ${!disponible?`<div class="no-disp-overlay" style="font-size:0.7rem"><i class="ti ti-ban" style="font-size:1rem;display:block;margin-bottom:3px"></i>No disponible</div>`:''}
      </div>
      <h2 style="color:var(--cafe-dark)">${p.nombre}</h2>
      ${p.subcategoria?`<div style="font-size:0.78rem;color:var(--texto-muy-suave);margin-top:2px">${p.subcategoria}</div>`:''}
      <div style="font-size:1.25rem;font-weight:700;color:var(--cafe);margin:4px 0">${formatQ(p.precio)}</div>
      <span class="badge badge-neutro">${p.categoria}</span>
    </div>
    ${p.detalles?`<div style="margin-bottom:11px"><div class="section-title">Detalles</div><p style="font-size:0.86rem;color:var(--texto-suave);line-height:1.7">${detallesHtml(p.detalles)}</p></div>`:''}
    ${p.extra?`<div style="margin-bottom:13px"><div class="section-title">Disponibilidad</div><div class="producto-extra-tag"><i class="ti ti-clock" style="font-size:0.75rem"></i>${p.extra}</div></div>`:''}
    <button class="btn" style="width:100%" onclick="cerrarModalById('${esAdmin?'modal-admin-producto-detalle':'modal-producto'}')">Cerrar</button>
    ${!esAdmin&&disponible?`<button class="btn btn-primary" style="width:100%;margin-top:8px" onclick="agregarCarrito(${p.id});cerrarModalById('modal-producto')"><i class="ti ti-shopping-bag-plus"></i> Agregar</button>`:''}
  `;
  if(esAdmin){document.getElementById('admin-producto-detalle-content').innerHTML=contenido;abrirModalById('modal-admin-producto-detalle');}
  else{document.getElementById('producto-detalle-content').innerHTML=contenido;abrirModalById('modal-producto');}
}

// ============================================================
// FAVORITOS
// ============================================================
async function toggleFav(prodId){
  if(!usuarioActual){showToast('Inicia sesión para guardar favoritos');return;}
  let favs=Array.isArray(usuarioActual.favoritos)?[...usuarioActual.favoritos]:[];
  const idx=favs.indexOf(prodId);
  if(idx>=0)favs.splice(idx,1);else favs.push(prodId);
  usuarioActual.favoritos=favs;
  try{await sb.from('usuarios').update({favoritos:favs,updated_at:new Date().toISOString()}).eq('id',usuarioActual.id);}catch(e){}
  renderProductos();
  const btnFav=document.getElementById('btn-fav-filtro');if(btnFav)btnFav.style.display='flex';
}

function abrirFavoritos(){
  if(!usuarioActual){showToast('Inicia sesión para ver tus favoritos');return;}
  const favs=usuarioActual.favoritos||[];
  const prods=productosCache.filter(p=>favs.includes(p.id));
  document.getElementById('favoritos-content').innerHTML=`
    <div class="modal-header"><i class="ti ti-heart" style="font-size:1.2rem;color:var(--peligro)"></i><h2 class="modal-title">Mis favoritos</h2></div>
    ${!prods.length?`<div class="empty"><i class="ti ti-heart"></i><p>Aún no tiene favoritos.<br>Presiona el corazón en un producto.</p></div>`
    :prods.map(p=>`
      <div style="display:flex;align-items:center;gap:10px;padding:10px 0;border-bottom:1px solid var(--borde);cursor:pointer" onclick="verProducto(${p.id})">
        <div style="width:46px;height:46px;border-radius:9px;background:var(--beige);display:flex;align-items:center;justify-content:center;overflow:hidden;flex-shrink:0">
          ${p.imagen?`<img src="${p.imagen}" style="width:100%;height:100%;object-fit:cover" onerror="this.parentNode.innerHTML='<i class=\\'ti ${getCatIcon(p.categoria)}\\'></i>'">`:`<i class="ti ${getCatIcon(p.categoria)}" style="font-size:1.3rem;color:var(--cafe-light)"></i>`}
        </div>
        <div style="flex:1"><div style="font-size:0.88rem;font-weight:500">${p.nombre}</div><div style="font-size:0.8rem;color:var(--cafe)">${formatQ(p.precio)}</div></div>
        <button onclick="event.stopPropagation();toggleFav(${p.id});renderFavoritosModal()" class="fav-btn active"><i class="ti ti-heart-filled"></i></button>
      </div>
    `).join('')}
  `;
  abrirModalById('modal-favoritos');
}

function renderFavoritosModal(){
  if(document.getElementById('modal-favoritos')?.classList.contains('open'))abrirFavoritos();
}

// ============================================================
// CARRITO
// ============================================================
function agregarCarrito(id){
  if(usuarioActual?.bloqueado){showToast('Tu cuenta está bloqueada.');return;}
  const p=productosCache.find(x=>x.id===id);if(!p)return;
  if(!productoEstaDisponible(p)){showToast('Este producto no está disponible ahora.');return;}
  const ex=carrito.find(c=>c.id===id);
  if(ex)ex.cantidad++;else carrito.push({id:p.id,nombre:p.nombre,precio:p.precio,categoria:p.categoria,imagen:p.imagen||'',cantidad:1});
  actualizarCarritoUI();
  if(document.getElementById('modal-carrito').classList.contains('open'))renderCarritoModal();
  sincronizarCarritoDB();
  showToast(p.nombre+' agregado al carrito');
}
function quitarCarrito(id){const ex=carrito.find(c=>c.id===id);if(!ex)return;if(ex.cantidad>1)ex.cantidad--;else carrito=carrito.filter(c=>c.id!==id);actualizarCarritoUI();renderCarritoModal();sincronizarCarritoDB();}

async function sincronizarCarritoDB(){
  if(!usuarioActual)return;
  try{await sb.from('usuarios').update({carrito,updated_at:new Date().toISOString()}).eq('id',usuarioActual.id);}catch(e){}
}

function actualizarCarritoUI(){
  const total=carrito.reduce((s,c)=>s+c.precio*c.cantidad,0);
  const count=carrito.reduce((s,c)=>s+c.cantidad,0);
  const countEl=document.getElementById('carrito-count');const fab=document.getElementById('carrito-fab');
  document.getElementById('fab-total').textContent=formatQ(total);
  countEl.style.display=count>0?'flex':'none';countEl.textContent=count;
  fab.classList.toggle('hidden',count===0);
}
function abrirCarrito(){renderCarritoModal();abrirModalById('modal-carrito');}
function renderCarritoModal(){
  const lista=document.getElementById('carrito-lista');const totalEl=document.getElementById('carrito-total');const accEl=document.getElementById('carrito-acciones');
  if(!carrito.length){lista.innerHTML='<div class="empty"><i class="ti ti-shopping-bag"></i><p>Su carrito está vacío</p></div>';totalEl.innerHTML='';accEl.innerHTML='';return;}
  lista.innerHTML=carrito.map(c=>`
    <div class="carrito-item">
      <div class="carrito-item-img">${c.imagen?`<img src="${c.imagen}" onerror="this.parentNode.innerHTML='<i class=\\'ti ${getCatIcon(c.categoria)}\\'></i>'">`:`<i class="ti ${getCatIcon(c.categoria)}"></i>`}</div>
      <div class="carrito-item-info"><div class="carrito-item-nombre">${c.nombre}</div><div class="carrito-item-precio">${formatQ(c.precio)} c/u</div></div>
      <div class="cant-ctrl"><button class="cant-btn" onclick="quitarCarrito(${c.id})">−</button><span class="cant-num">${c.cantidad}</span><button class="cant-btn" onclick="agregarCarrito(${c.id})">+</button></div>
    </div>`).join('');
  const total=carrito.reduce((s,c)=>s+c.precio*c.cantidad,0);
  totalEl.innerHTML=`<div class="divider"></div><div style="display:flex;justify-content:space-between;align-items:center"><span style="color:var(--texto-suave)">Total</span><span style="font-size:1.15rem;font-weight:700;color:var(--cafe-dark)">${formatQ(total)}</span></div>`;
  accEl.innerHTML=`<button class="btn btn-primary" style="width:100%;margin-top:9px" onclick="irARealizarPedido()"><i class="ti ti-arrow-right"></i> Continuar con la orden</button>`;
}

function irARealizarPedido(){
  const fb=configGlobal.funciones_bloqueadas||{};
  if(!usuarioActual){cerrarModalById('modal-carrito');showToast('Por favor inicia sesión primero');setTimeout(()=>abrirLogin(),400);return;}
  if(usuarioActual.bloqueado){cerrarModalById('modal-carrito');mostrarBloqueo(usuarioActual.msg_bloqueo);return;}
  if(fb.realizar_pedidos){cerrarModalById('modal-carrito');document.getElementById('producto-detalle-content').innerHTML=`<div class="func-bloqueada"><i class="ti ti-lock"></i>Los pedidos en línea están temporalmente desactivados.</div><button class="btn" style="width:100%;margin-top:4px" onclick="cerrarModalById('modal-producto')">Cerrar</button>`;abrirModalById('modal-producto');return;}
  cerrarModalById('modal-carrito');mostrarConfirmacionPedido();
}

function mostrarBloqueo(msg){
  document.getElementById('producto-detalle-content').innerHTML=`<div class="bloqueado-banner"><i class="ti ti-lock"></i><div><p style="font-weight:600;margin-bottom:3px">Cuenta bloqueada</p><p>${msg||'No puedes realizar pedidos. Contáctanos para más información.'}</p></div></div><button class="btn" style="width:100%;margin-top:4px" onclick="cerrarModalById('modal-producto')">Cerrar</button>`;
  abrirModalById('modal-producto');
}

function toggleTerminos(){const el=document.getElementById('terminos-extra');const btn=document.querySelector('.mostrar-mas');if(!el||!btn)return;el.classList.toggle('visible');btn.textContent=el.classList.contains('visible')?'Ocultar':'Mostrar términos completos';}

function mostrarConfirmacionPedido(){
  actualizarTerminosUI();
  const fb=configGlobal.funciones_bloqueadas||{};
  const total=carrito.reduce((s,c)=>s+c.precio*c.cantidad,0);
  document.getElementById('resumen-pedido-confirm').innerHTML=`<div style="background:var(--crema);border-radius:10px;padding:11px;border:1px solid var(--borde)">${carrito.map(c=>`<div style="display:flex;justify-content:space-between;font-size:0.84rem;padding:3px 0"><span>${c.nombre} ×${c.cantidad}</span><span>${formatQ(c.precio*c.cantidad)}</span></div>`).join('')}<div class="divider"></div><div style="display:flex;justify-content:space-between;font-weight:700"><span>Total</span><span style="color:var(--cafe-dark)">${formatQ(total)}</span></div></div>`;
  // Mostrar/ocultar secciones según bloqueos
  const horaSection=document.getElementById('hora-recogida-section');if(horaSection)horaSection.style.display=fb.hora_recogida?'none':'block';
  const notaSection=document.getElementById('nota-section');if(notaSection)notaSection.style.display=fb.nota_pedido?'none':'block';
  const domSection=document.getElementById('domicilio-section');if(domSection)domSection.style.display=fb.pedido_domicilio?'none':'block';
  const det=document.getElementById('terminos-extra');const btn=document.querySelector('.mostrar-mas');
  if(det)det.classList.remove('visible');if(btn)btn.textContent='Mostrar términos completos';
  const notaEl=document.getElementById('nota-pedido');if(notaEl)notaEl.value='';
  const chkDom=document.getElementById('chk-domicilio');if(chkDom){chkDom.checked=false;}
  const domFields=document.getElementById('domicilio-fields');if(domFields)domFields.style.display='none';
  limpiarHora();
  abrirModalById('modal-confirmar-pedido');
}

function toggleDomicilio(){
  const chk=document.getElementById('chk-domicilio');
  const fields=document.getElementById('domicilio-fields');
  if(fields)fields.style.display=chk.checked?'block':'none';
}

async function confirmarPedido(){
  const fb=configGlobal.funciones_bloqueadas||{};
  const chkDom=document.getElementById('chk-domicilio');
  const esDomicilio=chkDom&&chkDom.checked&&!fb.pedido_domicilio;
  if(esDomicilio){
    const dir=(document.getElementById('dom-direccion')||{}).value?.trim();
    const maps=(document.getElementById('dom-maps')||{}).value?.trim();
    if(!dir||!maps){showToast('Para domicilio, ingresa tu dirección y link de Google Maps');return;}
  }
  setLoading('btn-confirmar-pedido',true);
  try{
    const total=carrito.reduce((s,c)=>s+c.precio*c.cantidad,0);
    const id=generatePedidoId();
    const nota=!fb.nota_pedido?(document.getElementById('nota-pedido')||{}).value?.trim()||'':'';
    const hora=!fb.hora_recogida?((document.getElementById('hora-display')||{}).dataset?.hora||''):'';
    const dir=esDomicilio?(document.getElementById('dom-direccion')||{}).value?.trim()||'':'';
    const maps=esDomicilio?(document.getElementById('dom-maps')||{}).value?.trim()||'':'';
    const nuevoPedido={id,usuario_id:usuarioActual.id,usuario_tel:usuarioActual.telefono,productos:carrito.map(c=>({id:c.id,nombre:c.nombre,precio:c.precio,cantidad:c.cantidad})),total,estado:'pendiente',nota,hora_recogida:hora,es_domicilio:esDomicilio,dir_domicilio:dir,maps_domicilio:maps,msg_cancelacion:'',historial_estados:[{estado:'pendiente',fecha:new Date().toISOString()}],created_at:new Date().toISOString(),updated_at:new Date().toISOString()};
    const{error}=await sb.from('pedidos').insert(nuevoPedido);
    if(error)throw error;
    // Limpiar carrito en DB
    carrito=[];await sb.from('usuarios').update({carrito:[],updated_at:new Date().toISOString()}).eq('id',usuarioActual.id);
    actualizarCarritoUI();
    cerrarModalById('modal-confirmar-pedido');
    playConfirmSound();
    const tel=configGlobal.telefono_tienda||'';
    let msgWa=`¡Hola! He realizado una orden con el ID #${id}.`;
    if(esDomicilio)msgWa+=` Solicito entrega a domicilio en: ${dir}.`;
    if(hora)msgWa+=` Hora de recogida: ${hora}.`;
    if(nota)msgWa+=` Nota: ${nota}.`;
    msgWa+=' Quedo atento a la confirmación. 😊';
    window.open(`https://wa.me/502${tel}?text=${encodeURIComponent(msgWa)}`,'_blank');
    mostrarPostPedido(nuevoPedido);
  }catch(e){showToast('Error al crear la orden: '+e.message);}
  setLoading('btn-confirmar-pedido',false);
}

function mostrarPostPedido(p){
  document.getElementById('post-pedido-info').innerHTML=`
    <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px"><span style="font-weight:700;font-size:1.05rem;color:var(--cafe-dark)">#${p.id}</span>${getEstadoBadge(p.estado)}</div>
    ${p.hora_recogida?`<div style="font-size:0.82rem;color:var(--info);display:flex;align-items:center;gap:4px;margin-bottom:6px"><i class="ti ti-clock" style="font-size:0.9rem"></i>Recogida: <strong>${p.hora_recogida}</strong></div>`:''}
    ${p.es_domicilio?`<div style="font-size:0.82rem;color:var(--exito);display:flex;align-items:center;gap:4px;margin-bottom:6px"><i class="ti ti-truck" style="font-size:0.9rem"></i>Entrega a domicilio</div>`:''}
    ${p.productos.map(pr=>`<div style="display:flex;justify-content:space-between;font-size:0.83rem;padding:2px 0"><span>${pr.nombre} ×${pr.cantidad}</span><span>${formatQ(pr.precio*pr.cantidad)}</span></div>`).join('')}
    <div class="divider"></div>
    <div style="display:flex;justify-content:space-between;font-weight:700;font-size:0.9rem"><span>Total</span><span style="color:var(--cafe-dark)">${formatQ(p.total)}</span></div>
    ${p.nota?`<div style="margin-top:8px;font-size:0.8rem;color:var(--texto-suave);border-top:1px solid var(--borde);padding-top:7px;display:flex;align-items:center;gap:4px"><i class="ti ti-note" style="font-size:0.9rem"></i>${p.nota}</div>`:''}
  `;
  abrirModalById('modal-post-pedido');
}

// ============================================================
// TIME PICKER CUSTOM
// ============================================================
const HORAS_12=[5,6,7,8,9,10,11,12];
const MINUTOS=[0,5,10,15,20,25,30,35,40,45,50,55];

function initTimePicker(){
  const dH=document.getElementById('drum-horas');
  const dM=document.getElementById('drum-minutos');
  if(!dH||!dM)return;
  // Padding items para snap
  const pad=`<div class="time-drum-item" style="pointer-events:none"></div>`.repeat(1);
  dH.innerHTML=pad+HORAS_12.map(h=>`<div class="time-drum-item" data-val="${h}">${String(h).padStart(2,'0')}</div>`).join('')+pad;
  dM.innerHTML=pad+MINUTOS.map(m=>`<div class="time-drum-item" data-val="${m}">${String(m).padStart(2,'0')}</div>`).join('')+pad;
  // Snap listener
  [dH,dM].forEach(d=>d.addEventListener('scroll',()=>highlightSelected(d),{passive:true}));
  // Inicial
  setTimeout(()=>{dH.scrollTop=0;dM.scrollTop=0;highlightSelected(dH);highlightSelected(dM);},100);
}

function highlightSelected(drum){
  const items=drum.querySelectorAll('.time-drum-item[data-val]');
  const center=drum.scrollTop+60; // 120/2
  items.forEach(it=>{
    const mid=it.offsetTop+20;
    it.classList.toggle('selected-item',Math.abs(mid-center)<22);
  });
}

function getSelectedVal(drumId){
  const drum=document.getElementById(drumId);
  const items=drum.querySelectorAll('.time-drum-item[data-val]');
  const center=drum.scrollTop+60;
  let best=null,bestDist=999;
  items.forEach(it=>{const mid=it.offsetTop+20;const d=Math.abs(mid-center);if(d<bestDist){bestDist=d;best=it.dataset.val;}});
  return best;
}

function setPeriod(p){
  timePeriod=p;
  document.getElementById('btn-am').classList.toggle('active',p==='AM');
  document.getElementById('btn-pm').classList.toggle('active',p==='PM');
}

function abrirTimePicker(){
  initTimePicker();
  abrirModalById('modal-time-picker');
}

function confirmarHora(){
  const h=getSelectedVal('drum-horas');
  const m=getSelectedVal('drum-minutos');
  if(!h)return;
  let hora24=parseInt(h);
  if(timePeriod==='AM'&&hora24===12)hora24=0;
  if(timePeriod==='PM'&&hora24!==12)hora24+=12;
  // Validar rango 5:00 a 22:00
  if(hora24<5||hora24>22){showToast('Hora fuera de rango permitido (5:00 AM – 10:00 PM)');return;}
  const str=`${String(hora24).padStart(2,'0')}:${String(m||0).padStart(2,'0')}`;
  const dispEl=document.getElementById('hora-display');
  if(dispEl){dispEl.textContent=str;dispEl.dataset.hora=str;dispEl.style.color='var(--texto)';}
  const clearEl=document.getElementById('hora-clear');if(clearEl)clearEl.style.display='inline';
  cerrarModalById('modal-time-picker');
}

function limpiarHora(){
  const dispEl=document.getElementById('hora-display');
  if(dispEl){dispEl.textContent='Sin hora programada';dispEl.dataset.hora='';dispEl.style.color='var(--texto-muy-suave)';}
  const clearEl=document.getElementById('hora-clear');if(clearEl)clearEl.style.display='none';
}

// ============================================================
// LOGIN / USUARIO
// ============================================================
function abrirLogin(){if(usuarioActual){abrirPerfil();return;}abrirModalById('modal-login');}

async function hacerLogin(){
  const nombre=document.getElementById('login-nombre').value.trim();
  const apellido=document.getElementById('login-apellido').value.trim();
  const tel=document.getElementById('login-tel').value.replace(/\D/g,'');
  if(!nombre){showToast('El nombre es obligatorio');return;}
  if(tel.length!==8){showToast('El teléfono debe tener 8 dígitos');return;}
  if(nombre==='MDJ'&&apellido==='Bakery'&&tel==='85498549'){cerrarModalById('modal-login');entrarAdmin();return;}
  setLoading('btn-login',true);
  try{
    let{data:user}=await sb.from('usuarios').select('*').eq('telefono',tel).single();
    if(!user){
      const nuevo={nombre,apellido,telefono:tel,created_at:new Date().toISOString(),updated_at:new Date().toISOString(),advertencias:[],bloqueado:false,msg_bloqueo:'',favoritos:[],carrito:[],clicks:0,visitas:1};
      const{data:creado}=await sb.from('usuarios').insert(nuevo).select().single();
      user=creado;
      showToast('¡Bienvenido! Cuenta creada.');
    }else{
      showToast('¡Bienvenido de vuelta, '+user.nombre+'!');
      await registrarVisita();
    }
    usuarioActual=user;
    carrito=Array.isArray(user.carrito)?user.carrito:[];
    actualizarCarritoUI();
    localStorage.setItem('mdj_tel',tel);
    cerrarModalById('modal-login');
    renderFiltrosCategorias();
    renderProductos();
    abrirPerfil();
  }catch(e){showToast('Error al ingresar: '+e.message);}
  setLoading('btn-login',false);
}

function abrirPerfil(){if(!usuarioActual){abrirLogin();return;}renderPerfil();abrirModalById('modal-perfil');}

async function renderPerfil(){
  // Refrescar datos del usuario desde DB
  try{const{data}=await sb.from('usuarios').select('*').eq('id',usuarioActual.id).single();if(data)usuarioActual=data;}catch(e){}
  const u=usuarioActual;
  const advc=getAdvCount(u);
  let pedidosU=[];
  try{const{data}=await sb.from('pedidos').select('*').eq('usuario_tel',u.telefono).order('created_at',{ascending:false});if(data)pedidosU=data;}catch(e){}
  const activas=pedidosU.filter(p=>p.estado!=='entregado'&&p.estado!=='cancelado');
  const historico=pedidosU.filter(p=>p.estado==='entregado'||p.estado==='cancelado');
  document.getElementById('perfil-content').innerHTML=`
    <div class="perfil-header">
      <div class="perfil-avatar">${u.nombre[0]}${u.apellido?u.apellido[0]:''}</div>
      <div class="perfil-nombre">${u.nombre} ${u.apellido||''}</div>
      <div class="perfil-tel"><i class="ti ti-phone" style="font-size:0.88rem"></i>${u.telefono.slice(0,4)+' '+u.telefono.slice(4)}</div>
      <button class="btn btn-xs" style="margin-top:7px" onclick="editarPerfil()"><i class="ti ti-edit"></i> Editar perfil</button>
    </div>
    ${u.bloqueado?`<div class="bloqueado-banner"><i class="ti ti-lock"></i><div><p style="font-weight:600;margin-bottom:2px">Cuenta bloqueada</p><p>${u.msg_bloqueo||'No puedes realizar pedidos.'}</p></div></div>`:''}
    ${advc>0?`<div style="display:flex;align-items:center;gap:7px;background:var(--aviso-bg);border-radius:8px;padding:8px 11px;margin-bottom:10px;font-size:0.82rem;color:var(--aviso);font-weight:500"><i class="ti ti-alert-triangle" style="font-size:1rem"></i> Tiene ${advc} advertencia${advc>1?'s':''} acumulada${advc>1?'s':''}</div>`:''}
    <div class="divider"></div>
    ${activas.length?`<div style="margin-bottom:14px"><div class="section-title">Órdenes activas (${activas.length})</div>${activas.map(p=>`<div style="margin-top:6px">${p.estado==='pendiente'?`<div class="editar-aviso" style="margin-bottom:4px"><i class="ti ti-pencil" style="font-size:0.9rem"></i> #${p.id} — Aún puede modificarla</div>`:''}<div class="pedido-mini" onclick="verDetallePedido('${p.id}')"><div style="display:flex;justify-content:space-between;align-items:center"><span style="font-size:1.05rem;font-weight:700;color:var(--cafe-dark)">#${p.id}</span>${getEstadoBadge(p.estado)}</div><div style="font-size:0.8rem;color:var(--texto-suave);margin-top:2px">${p.productos.length} producto(s) · ${formatQ(p.total)}${p.hora_recogida?` · 🕐 ${p.hora_recogida}`:''}${p.es_domicilio?' · 🚚 Domicilio':''}</div></div></div>`).join('')}</div>`:''}
    <div class="section-title">Historial</div>
    ${historico.length?historico.map(p=>`<div class="pedido-mini" style="margin-top:6px" onclick="verDetallePedido('${p.id}')"><div style="display:flex;justify-content:space-between"><span style="font-weight:700;color:var(--cafe-dark)">#${p.id}</span>${getEstadoBadge(p.estado)}</div><div style="font-size:0.78rem;color:var(--texto-suave);margin-top:2px">${formatQ(p.total)} · ${formatFecha(p.created_at)}</div></div>`).join(''):'<div class="empty" style="padding:18px 0"><i class="ti ti-clock"></i><p>Sin órdenes completadas</p></div>'}
    <div class="divider"></div>
    <button class="btn" style="width:100%" onclick="pedirCerrarSesion()"><i class="ti ti-logout"></i> Cerrar sesión</button>
  `;
}

function pedirCerrarSesion(){
  mostrarConfirmDialog('¿Cerrar sesión?','Tendrá que ingresar nuevamente con su teléfono.','Cerrar sesión',()=>{
    usuarioActual=null;carrito=[];localStorage.removeItem('mdj_tel');actualizarCarritoUI();cerrarModalById('modal-perfil');renderFiltrosCategorias();renderProductos();showToast('Sesión cerrada');
  },false);
}

function editarPerfil(){
  const u=usuarioActual;
  document.getElementById('perfil-content').innerHTML=`
    <div class="modal-header"><button class="back-btn" onclick="renderPerfil()"><i class="ti ti-arrow-left"></i></button><h2 class="modal-title">Editar perfil</h2></div>
    <div class="form-group"><label>Nombre *</label><input type="text" id="edit-nombre" value="${u.nombre}"></div>
    <div class="form-group"><label>Apellido</label><input type="text" id="edit-apellido" value="${u.apellido||''}"></div>
    <div class="form-group"><label>Dirección</label><input type="text" id="edit-dir" value="${u.direccion||''}" placeholder="Ej: Zona 10, Calle Principal"></div>
    <div class="form-group"><label>Link de Google Maps (opcional)</label><input type="url" id="edit-maps" value="${u.maps_link||''}" placeholder="https://maps.google.com/…"></div>
    <button class="btn btn-primary" style="width:100%;margin-top:4px" id="btn-guardar-perfil" onclick="guardarEditPerfil()"><span class="btn-label"><i class="ti ti-device-floppy"></i> Guardar</span><div class="btn-spinner"></div></button>
  `;
}

async function guardarEditPerfil(){
  const n=document.getElementById('edit-nombre').value.trim();if(!n){showToast('El nombre es obligatorio');return;}
  setLoading('btn-guardar-perfil',true);
  try{
    const upd={nombre:n,apellido:document.getElementById('edit-apellido').value.trim(),direccion:document.getElementById('edit-dir').value.trim(),maps_link:document.getElementById('edit-maps').value.trim(),updated_at:new Date().toISOString()};
    await sb.from('usuarios').update(upd).eq('id',usuarioActual.id);
    Object.assign(usuarioActual,upd);
    showToast('Perfil actualizado');renderPerfil();
  }catch(e){showToast('Error: '+e.message);}
  setLoading('btn-guardar-perfil',false);
}

async function verDetallePedido(pedidoId){
  let p=null;
  try{const{data}=await sb.from('pedidos').select('*').eq('id',pedidoId).single();p=data;}catch(e){}
  if(!p)return;
  const puedeEditar=p.estado==='pendiente';
  const puedeCancelar=p.estado==='pendiente';
  const infoEstado=(configGlobal.estados_info||{})[p.estado]||'';
  document.getElementById('detalle-pedido-content').innerHTML=`
    <div style="display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:12px">
      <div><div style="font-size:1.25rem;font-weight:700;color:var(--cafe-dark)">#${p.id}</div><div style="font-size:0.78rem;color:var(--texto-muy-suave)">${formatFecha(p.created_at)}</div></div>
      <div>${getEstadoBadge(p.estado)}<button onclick="toggleEstadoInfo('estinfo')" class="estado-info-btn"><i class="ti ti-info-circle"></i></button></div>
    </div>
    <div class="estado-info-popup" id="estinfo">${infoEstado}</div>
    ${puedeEditar?'<div class="editar-aviso" style="margin-top:8px"><i class="ti ti-pencil" style="font-size:0.9rem"></i> Aún puede modificar su orden</div>':''}
    ${p.hora_recogida?`<div style="font-size:0.82rem;color:var(--info);display:flex;align-items:center;gap:4px;margin:6px 0"><i class="ti ti-clock"></i>Recogida: <strong>${p.hora_recogida}</strong></div>`:''}
    ${p.es_domicilio?`<div style="font-size:0.82rem;color:var(--exito);display:flex;align-items:center;gap:4px;margin-bottom:6px"><i class="ti ti-truck"></i>Entrega a domicilio${p.dir_domicilio?': '+p.dir_domicilio:''}</div>`:''}
    <div style="margin:10px 0">
      ${p.productos.map(pr=>`<div style="display:flex;align-items:center;gap:9px;padding:8px 0;border-bottom:1px solid var(--borde)">
        <div style="width:33px;height:33px;border-radius:7px;background:var(--beige);display:flex;align-items:center;justify-content:center;flex-shrink:0"><i class="ti ${getCatIcon(productosCache.find(x=>x.id===pr.id)?.categoria||'')}" style="font-size:1rem;color:var(--cafe-light)"></i></div>
        <div style="flex:1"><div style="font-size:0.86rem;font-weight:500">${pr.nombre}</div><div style="font-size:0.76rem;color:var(--texto-suave)">${formatQ(pr.precio)} × ${pr.cantidad}</div></div>
        <div style="font-weight:700;color:var(--cafe-dark);font-size:0.88rem">${formatQ(pr.precio*pr.cantidad)}</div>
        ${puedeEditar?`<div style="display:flex;gap:4px"><button class="cant-btn" onclick="editarCantPedido('${p.id}',${pr.id},-1)">−</button><button class="cant-btn" onclick="editarCantPedido('${p.id}',${pr.id},1)">+</button></div>`:''}
      </div>`).join('')}
      ${p.nota?`<div style="margin-top:8px;font-size:0.82rem;color:var(--texto-suave);display:flex;align-items:center;gap:5px"><i class="ti ti-note"></i>${p.nota}</div>`:''}
      <div style="display:flex;justify-content:space-between;font-weight:700;padding:10px 0"><span>Total</span><span style="color:var(--cafe-dark)">${formatQ(p.total)}</span></div>
    </div>
    ${puedeCancelar?`<button class="btn btn-danger" style="width:100%;margin-bottom:8px" id="btn-cancelar-pedido" onclick="cancelarPedidoUsuario('${p.id}')"><span class="btn-label"><i class="ti ti-x"></i> Cancelar esta orden</span><div class="btn-spinner"></div></button>`:''}
    <button class="btn" style="width:100%" onclick="cerrarModalById('modal-detalle-pedido')">Cerrar</button>
  `;
  abrirModalById('modal-detalle-pedido');
}

async function cancelarPedidoUsuario(pedidoId){
  setLoading('btn-cancelar-pedido',true);
  try{
    const hist={estado:'cancelado',fecha:new Date().toISOString()};
    // Obtener historial actual
    const{data:ped}=await sb.from('pedidos').select('historial_estados').eq('id',pedidoId).single();
    const histList=[...(ped?.historial_estados||[]),hist];
    await sb.from('pedidos').update({estado:'cancelado',historial_estados:histList,updated_at:new Date().toISOString()}).eq('id',pedidoId);
    cerrarModalById('modal-detalle-pedido');
    renderPerfil();
    const tel=configGlobal.telefono_tienda||'';
    window.open(`https://wa.me/502${tel}?text=${encodeURIComponent('¡Hola! Me gustaría cancelar mi orden con el ID #'+pedidoId+'. Por favor confirmen la cancelación. Gracias.')}`,'_blank');
    showToast('Orden cancelada — se abrió WhatsApp',3000);
  }catch(e){showToast('Error: '+e.message);}
  setLoading('btn-cancelar-pedido',false);
}

function toggleEstadoInfo(id){const el=document.getElementById(id);if(el)el.classList.toggle('visible');}

async function editarCantPedido(pid,prodId,delta){
  try{
    const{data:p}=await sb.from('pedidos').select('*').eq('id',pid).single();
    if(!p||p.estado!=='pendiente')return;
    const prods=[...p.productos];const pr=prods.find(x=>x.id===prodId);if(!pr)return;
    pr.cantidad=Math.max(0,pr.cantidad+delta);
    const newProds=prods.filter(x=>x.cantidad>0);
    if(!newProds.length){await sb.from('pedidos').update({estado:'cancelado',updated_at:new Date().toISOString()}).eq('id',pid);cerrarModalById('modal-detalle-pedido');renderPerfil();showToast('Orden cancelada');return;}
    const newTotal=newProds.reduce((s,x)=>s+x.precio*x.cantidad,0);
    await sb.from('pedidos').update({productos:newProds,total:newTotal,updated_at:new Date().toISOString()}).eq('id',pid);
    verDetallePedido(pid);
  }catch(e){showToast('Error: '+e.message);}
}

// ============================================================
// ADMIN
// ============================================================
function entrarAdmin(){document.getElementById('page-tienda').classList.remove('active');document.getElementById('page-admin').classList.add('active');renderAdminPedidos();}

function pedirCerrarAdmin(){
  mostrarConfirmDialog('¿Salir del panel?','Volverá a la tienda y se cerrará la sesión admin.','Salir',()=>{
    document.getElementById('page-admin').classList.remove('active');document.getElementById('page-tienda').classList.add('active');usuarioActual=null;localStorage.removeItem('mdj_tel');
  },false);
}

function adminTab(vista,btn){
  document.querySelectorAll('.admin-tab').forEach(b=>b.classList.remove('active'));btn.classList.add('active');
  document.querySelectorAll('.admin-view').forEach(v=>v.classList.remove('active'));document.getElementById('admin-'+vista).classList.add('active');
  ({pedidos:renderAdminPedidos,historial:renderAdminHistorial,productos:renderAdminProductos,usuarios:renderAdminUsuarios,config:renderAdminConfig})[vista]?.();
}

function setPedidoSec(sec,btn){pedidoSeccion=sec;document.querySelectorAll('.subsec-btn').forEach(b=>b.classList.remove('active'));btn.classList.add('active');renderListaPedidos();}

async function renderAdminPedidos(){
  let peds=[];
  try{const{data}=await sb.from('pedidos').select('*');if(data)peds=data;}catch(e){}
  const pend=peds.filter(p=>p.estado==='pendiente').length;
  const conf=peds.filter(p=>p.estado==='confirmado').length;
  const list=peds.filter(p=>p.estado==='listo').length;
  document.getElementById('admin-resumen').innerHTML=`
    <div class="resumen-card"><div class="resumen-num">${pend}</div><div class="resumen-label">Pendientes</div></div>
    <div class="resumen-card"><div class="resumen-num">${conf}</div><div class="resumen-label">Confirmadas</div></div>
    <div class="resumen-card"><div class="resumen-num">${list}</div><div class="resumen-label">Listas</div></div>`;
  renderListaPedidos();
}

async function renderListaPedidos(){
  const lista=document.getElementById('admin-pedidos-lista');
  lista.innerHTML='<div class="loading-full"><div class="spinner"></div></div>';
  let pedidos=[];
  try{const{data}=await sb.from('pedidos').select('*').eq('estado',pedidoSeccion).order('created_at',{ascending:true});if(data)pedidos=data;}catch(e){}
  let usrs=[];
  try{const{data}=await sb.from('usuarios').select('id,nombre,apellido,telefono');if(data)usrs=data;productosCache._usuarios=usrs;}catch(e){}
  if(!pedidos.length){lista.innerHTML='<div class="empty"><i class="ti ti-clipboard-list"></i><p>Sin órdenes en esta sección</p></div>';return;}
  lista.innerHTML=pedidos.map(p=>{
    const user=usrs.find(u=>u.telefono===p.usuario_tel);
    const horaEst=getHoraEstimada(p);
    return`<div class="admin-pedido-card" onclick="verAdminPedido('${p.id}')">
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:4px">
        <div style="display:flex;align-items:center;gap:7px"><span class="admin-pedido-id">#${p.id}</span><span style="font-size:0.83rem;color:var(--texto-suave);font-weight:500">${user?user.nombre+' '+(user.apellido||''):'Cliente'}</span>${p.es_domicilio?'<span class="badge badge-exito" style="font-size:0.65rem">Domicilio</span>':''}</div>
        <span style="font-weight:700;color:var(--cafe-dark)">${formatQ(p.total)}</span>
      </div>
      <div style="display:flex;gap:10px;flex-wrap:wrap;font-size:0.76rem;color:var(--texto-muy-suave)">
        <span><i class="ti ti-package" style="vertical-align:-2px"></i> ${p.productos.length} producto(s)</span>
        <span><i class="ti ti-clock" style="vertical-align:-2px"></i> ${formatHora(p.created_at)}</span>
        <span class="hora-estimada"><i class="ti ti-alarm" style="font-size:0.8rem"></i> Entrega: ${horaEst}</span>
      </div>
      ${p.nota?`<div style="font-size:0.74rem;color:var(--texto-suave);margin-top:4px;display:flex;align-items:center;gap:3px"><i class="ti ti-note" style="font-size:0.8rem"></i>${p.nota}</div>`:''}
    </div>`;
  }).join('');
}

async function verAdminPedido(pedidoId){
  let p=null;
  try{const{data}=await sb.from('pedidos').select('*').eq('id',pedidoId).single();p=data;}catch(e){}
  if(!p)return;
  let usrs=[];
  try{const{data}=await sb.from('usuarios').select('id,nombre,apellido,telefono');if(data)usrs=data;}catch(e){}
  const user=usrs.find(u=>u.telefono===p.usuario_tel);
  const esActiva=p.estado!=='entregado'&&p.estado!=='cancelado';
  const horaEst=getHoraEstimada(p);
  document.getElementById('admin-pedido-detalle-content').innerHTML=`
    <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:12px">
      <div><span class="admin-pedido-id">#${p.id}</span><div style="margin-top:3px"><span class="hora-estimada"><i class="ti ti-alarm" style="font-size:0.8rem"></i> Entrega: ${horaEst}</span></div></div>
      ${getEstadoBadge(p.estado)}
    </div>
    <div style="background:var(--crema);border-radius:10px;padding:11px;margin-bottom:12px;cursor:pointer;border:1px solid var(--borde)" onclick="verAdminUsuario('${p.usuario_tel}')">
      <div style="display:flex;align-items:center;gap:9px">
        <div style="width:34px;height:34px;border-radius:50%;background:var(--beige-dark);display:flex;align-items:center;justify-content:center;font-weight:700;color:var(--cafe-dark);flex-shrink:0">${user?user.nombre[0]:'?'}</div>
        <div style="flex:1"><div style="font-size:0.88rem;font-weight:500">${user?user.nombre+' '+(user.apellido||''):'Desconocido'}</div><div style="font-size:0.78rem;color:var(--cafe);display:flex;align-items:center;gap:3px"><i class="ti ti-phone" style="font-size:0.82rem"></i>${p.usuario_tel.slice(0,4)+' '+p.usuario_tel.slice(4)}</div></div>
        <i class="ti ti-chevron-right" style="color:var(--texto-muy-suave)"></i>
      </div>
    </div>
    ${p.es_domicilio?`<div style="background:var(--exito-bg);border-radius:8px;padding:9px 12px;margin-bottom:10px;font-size:0.84rem;color:var(--exito);display:flex;align-items:flex-start;gap:6px"><i class="ti ti-truck" style="font-size:1rem;flex-shrink:0"></i><div><strong>Domicilio:</strong> ${p.dir_domicilio||''}${p.maps_domicilio?`<br><a href="${p.maps_domicilio}" target="_blank" style="color:var(--exito);font-size:0.78rem">Ver en Maps</a>`:''}</div></div>`:''}
    <div style="margin-bottom:12px">
      <div class="section-title" style="margin-bottom:6px">Productos — toca para ver detalles</div>
      ${p.productos.map(pr=>`<div class="admin-prod-row" onclick="verProducto(${pr.id},true)">
        ${esActiva?`<span class="qty-chip">${pr.cantidad}</span>`:`<span style="font-size:0.82rem;color:var(--texto-muy-suave);font-weight:600;flex-shrink:0">×${pr.cantidad}</span>`}
        <div style="flex:1"><div style="font-size:0.88rem;font-weight:500">${pr.nombre}${pr.noDisponible?'<span class="badge badge-peligro" style="margin-left:5px;font-size:0.64rem">No disp.</span>':''}</div><div style="font-size:0.76rem;color:var(--texto-suave)">${formatQ(pr.precio)} c/u · ${formatQ(pr.precio*pr.cantidad)}</div></div>
        <i class="ti ti-info-circle admin-prod-tap"></i>
      </div>`).join('')}
      ${p.nota?`<div style="margin-top:8px;font-size:0.82rem;color:var(--texto-suave);display:flex;align-items:flex-start;gap:5px;padding:6px 0 0"><i class="ti ti-note" style="font-size:0.92rem;flex-shrink:0;margin-top:1px"></i><span><strong>Nota:</strong> ${p.nota}</span></div>`:''}
      <div style="display:flex;justify-content:space-between;font-weight:700;padding:9px 0"><span>Total</span><span style="color:var(--cafe-dark)">${formatQ(p.total)}</span></div>
    </div>
    <div class="divider"></div>
    <div class="section-title" style="margin-bottom:8px">Acciones</div>
    ${renderAccionesAdmin(p)}
  `;
  abrirModalById('modal-admin-pedido');
}

function renderAccionesAdmin(p){
  let h='';
  if(p.estado==='listo')h+=`<button class="accion-btn" onclick="accionEntregado('${p.id}')"><i class="ti ti-checks" style="color:var(--cafe)"></i> Marcar como entregada</button>`;
  if(p.estado==='pendiente')h+=`<button class="accion-btn" onclick="accionConfirmar('${p.id}')"><i class="ti ti-circle-check" style="color:var(--info)"></i> Confirmar orden recibida</button>`;
  if(p.estado!=='listo'&&p.estado!=='entregado'&&p.estado!=='cancelado')h+=`<button class="accion-btn" onclick="accionPedido('${p.id}','listo')"><i class="ti ti-package-export" style="color:var(--exito)"></i> Orden lista para recoger</button>`;
  if(p.estado!=='entregado'&&p.estado!=='cancelado'){
    h+=`<button class="accion-btn" onclick="accionNoDisponible('${p.id}')"><i class="ti ti-package-off" style="color:var(--aviso)"></i> Productos no disponibles</button>`;
    h+=`<button class="accion-btn danger" onclick="accionCancelar('${p.id}')"><i class="ti ti-x"></i> Cancelar orden</button>`;
  }
  return h;
}

async function cambiarEstadoPedido(pedidoId,nuevoEstado){
  try{
    const{data:ped}=await sb.from('pedidos').select('historial_estados').eq('id',pedidoId).single();
    const hist=[...(ped?.historial_estados||[]),{estado:nuevoEstado,fecha:new Date().toISOString()}];
    await sb.from('pedidos').update({estado:nuevoEstado,historial_estados:hist,updated_at:new Date().toISOString()}).eq('id',pedidoId);
  }catch(e){showToast('Error al actualizar: '+e.message);}
}

async function accionConfirmar(pedidoId){
  await cambiarEstadoPedido(pedidoId,'confirmado');
  cerrarModalById('modal-admin-pedido');renderAdminPedidos();showToast('Orden #'+pedidoId+' confirmada');
}

async function accionPedido(pedidoId,nuevoEstado){
  let p=null;try{const{data}=await sb.from('pedidos').select('*').eq('id',pedidoId).single();p=data;}catch(e){}
  if(!p)return;
  waContext={pedidoId,nuevoEstado};
  const usrs=productosCache._usuarios||[];const user=usrs.find(u=>u.telefono===p.usuario_tel);const nom=user?user.nombre:'cliente';
  document.getElementById('wa-mensaje-edit').value=`¡Hola, ${nom}! Su orden #${p.id} está lista para recoger en el local. Recuerde que tiene 15 minutos para pasar. ¡Le esperamos! 🥐`;
  document.getElementById('wa-numero-display').textContent=p.usuario_tel.slice(0,4)+' '+p.usuario_tel.slice(4);
  abrirModalById('modal-wa-confirm');
}

async function accionNoDisponible(pedidoId){
  let p=null;try{const{data}=await sb.from('pedidos').select('*').eq('id',pedidoId).single();p=data;}catch(e){}
  if(!p)return;
  waContext={pedidoId,nuevoEstado:null,prodNoDisponibles:[]};
  document.getElementById('prod-nodisponible-lista').innerHTML=p.productos.map(pr=>`<label class="producto-check"><input type="checkbox" value="${pr.id}" style="width:auto;margin:0;width:16px;height:16px;accent-color:var(--cafe)"><span style="font-size:0.87rem">${pr.nombre}</span></label>`).join('');
  abrirModalById('modal-prod-nodisponible');
}

async function armarMsgNoDisponible(){
  const checks=document.querySelectorAll('#prod-nodisponible-lista input:checked');
  if(!checks.length){showToast('Seleccione al menos un producto');return;}
  let p=null;try{const{data}=await sb.from('pedidos').select('*').eq('id',waContext.pedidoId).single();p=data;}catch(e){}
  if(!p)return;
  const sel=Array.from(checks).map(c=>{const pr=p.productos.find(x=>x.id==c.value);return pr?.nombre||'';}).filter(Boolean);
  waContext.prodNoDisponibles=Array.from(checks).map(c=>parseInt(c.value));
  const todos=waContext.prodNoDisponibles.length===p.productos.length;
  const usrs=productosCache._usuarios||[];const user=usrs.find(u=>u.telefono===p.usuario_tel);const nom=user?user.nombre:'cliente';
  let msg;
  if(todos){waContext.nuevoEstado='cancelado';msg=`¡Hola, ${nom}! Lamentablemente ninguno de los productos de su orden #${p.id} está disponible:\n\n- ${sel.join('\n- ')}\n\nPor esta razón, su orden ha sido cancelada. Disculpe los inconvenientes.`;}
  else{waContext.nuevoEstado=null;msg=`¡Hola, ${nom}! Algunos productos de su orden #${p.id} no están disponibles:\n\n- ${sel.join('\n- ')}\n\n¿Desea proceder con el resto o prefiere cancelar?`;}
  document.getElementById('wa-mensaje-edit').value=msg;
  document.getElementById('wa-numero-display').textContent=p.usuario_tel.slice(0,4)+' '+p.usuario_tel.slice(4);
  cerrarModalById('modal-prod-nodisponible');abrirModalById('modal-wa-confirm');
}

async function accionCancelar(pedidoId){
  let p=null;try{const{data}=await sb.from('pedidos').select('*').eq('id',pedidoId).single();p=data;}catch(e){}
  if(!p)return;
  waContext={pedidoId,nuevoEstado:'cancelado'};
  const usrs=productosCache._usuarios||[];const user=usrs.find(u=>u.telefono===p.usuario_tel);const nom=user?user.nombre:'cliente';
  document.getElementById('wa-mensaje-edit').value=`¡Hola, ${nom}! Lamentablemente su orden #${p.id} fue cancelada. Si tiene consultas, puede comunicarse con nosotros. Disculpe los inconvenientes.`;
  document.getElementById('wa-numero-display').textContent=p.usuario_tel.slice(0,4)+' '+p.usuario_tel.slice(4);
  abrirModalById('modal-wa-confirm');
}

async function accionEntregado(pedidoId){
  await cambiarEstadoPedido(pedidoId,'entregado');
  cerrarModalById('modal-admin-pedido');renderAdminPedidos();showToast('Orden marcada como entregada');
}

async function confirmarEnvioWA(){
  setLoading('btn-enviar-wa',true);
  try{
    const msg=document.getElementById('wa-mensaje-edit').value;
    if(waContext.nuevoEstado)await cambiarEstadoPedido(waContext.pedidoId,waContext.nuevoEstado);
    if(waContext.prodNoDisponibles?.length){
      const{data:ped}=await sb.from('pedidos').select('productos').eq('id',waContext.pedidoId).single();
      if(ped){const prods=ped.productos.map(pr=>({...pr,noDisponible:waContext.prodNoDisponibles.includes(pr.id)?true:pr.noDisponible}));await sb.from('pedidos').update({productos:prods,updated_at:new Date().toISOString()}).eq('id',waContext.pedidoId);}
    }
    if(waContext.nuevoEstado==='listo')playReadySound();
    const{data:ped}=await sb.from('pedidos').select('usuario_tel').eq('id',waContext.pedidoId).single();
    if(ped)window.open(`https://wa.me/502${ped.usuario_tel}?text=${encodeURIComponent(msg)}`,'_blank');
    cerrarModalById('modal-wa-confirm');cerrarModalById('modal-admin-pedido');
    renderAdminPedidos();showToast('Estado actualizado · WhatsApp abierto');
  }catch(e){showToast('Error: '+e.message);}
  setLoading('btn-enviar-wa',false);
}

// ============================================================
// ADMIN USUARIO
// ============================================================
async function verAdminUsuario(tel){
  let u=null;
  try{const{data}=await sb.from('usuarios').select('*').eq('telefono',tel).single();u=data;}catch(e){}
  if(!u)return;
  let pedidos=[];
  try{const{data}=await sb.from('pedidos').select('*').eq('usuario_tel',tel).order('created_at',{ascending:false});if(data)pedidos=data;}catch(e){}
  const advc=getAdvCount(u);
  document.getElementById('admin-usuario-detalle').innerHTML=`
    <div class="perfil-header">
      <div class="perfil-avatar">${u.nombre[0]}${u.apellido?u.apellido[0]:''}</div>
      <div class="perfil-nombre">${u.nombre} ${u.apellido||''}</div>
      <div class="perfil-tel"><i class="ti ti-phone" style="font-size:0.88rem"></i>${u.telefono.slice(0,4)+' '+u.telefono.slice(4)}</div>
    </div>
    ${u.bloqueado?`<div class="bloqueado-banner"><i class="ti ti-lock"></i><div><p style="font-weight:600;margin-bottom:2px">Cuenta bloqueada</p><p>${u.msg_bloqueo||'Sin mensaje.'}</p></div></div>`:''}
    <div style="display:grid;grid-template-columns:repeat(3,1fr);gap:8px;margin:10px 0">
      <div class="resumen-card"><div class="resumen-num">${pedidos.length}</div><div class="resumen-label">Órdenes</div></div>
      <div class="resumen-card"><div class="resumen-num">${advc}</div><div class="resumen-label">Advertencias</div></div>
      <div class="resumen-card"><div class="resumen-num">${u.visitas||0}</div><div class="resumen-label">Visitas</div></div>
    </div>
    ${u.direccion?`<div style="font-size:0.84rem;color:var(--texto-suave);margin-bottom:3px;display:flex;align-items:center;gap:5px"><i class="ti ti-map-pin" style="font-size:0.92rem"></i>${u.direccion}</div>`:''}
    ${u.maps_link?`<a href="${u.maps_link}" target="_blank" style="font-size:0.8rem;color:var(--cafe);display:flex;align-items:center;gap:4px;margin-bottom:8px;text-decoration:none"><i class="ti ti-external-link" style="font-size:0.88rem"></i>Ver en Google Maps</a>`:''}
    <div style="font-size:0.72rem;color:var(--texto-muy-suave);margin-bottom:8px">Registro: ${formatFecha(u.created_at)} · Última act.: ${formatFecha(u.updated_at)} · Clicks: ${u.clicks||0}</div>
    <div class="divider"></div>
    <div class="section-title" style="margin-bottom:8px">Gestión de cuenta</div>
    <div style="display:flex;gap:6px;margin-bottom:8px">
      <button class="btn btn-sm btn-danger" onclick="abrirModalAdvertencia('${tel}')" style="flex:1"><i class="ti ti-alert-triangle"></i> Agregar advertencia</button>
      ${advc>0?`<button class="btn btn-sm" onclick="quitarAdvertencia('${tel}')" style="flex:1"><i class="ti ti-minus"></i> Quitar advertencia</button>`:''}
    </div>
    ${advc>0?`<div style="margin-bottom:10px"><div class="section-title" style="margin-bottom:6px">Notas de advertencias</div>${(Array.isArray(u.advertencias)?u.advertencias:[]).map((a,i)=>`<div style="font-size:0.8rem;color:var(--texto-suave);padding:5px 8px;background:var(--aviso-bg);border-radius:6px;margin-bottom:4px"><span style="font-weight:600;color:var(--aviso)">#${i+1}</span>${a.nota?' — '+a.nota:' (sin nota)'}</div>`).join('')}</div>`:''}
    ${u.bloqueado
      ?`<button class="accion-btn" onclick="pedirDesbloquear('${tel}')"><i class="ti ti-lock-open" style="color:var(--exito)"></i> Desbloquear cuenta</button>`
      :`<button class="accion-btn danger" onclick="abrirFormBloqueo('${tel}')"><i class="ti ti-lock"></i> Bloquear cuenta</button>`}
    <div id="form-bloqueo-${tel.replace(/\s/g,'')}" style="display:none;border:1px solid var(--borde);border-radius:10px;padding:12px;margin-bottom:8px">
      <div class="form-group" style="margin-bottom:8px"><label>Mensaje para el usuario</label><textarea id="msg-bloqueo-${tel.replace(/\s/g,'')}" placeholder="Ej: Múltiples incumplimientos" rows="2">${u.msg_bloqueo||''}</textarea></div>
      <div style="display:flex;gap:6px"><button class="btn btn-sm" style="flex:1" onclick="document.getElementById('form-bloqueo-${tel.replace(/\s/g,'')}').style.display='none'">Cancelar</button><button class="btn btn-sm btn-danger" style="flex:2" id="btn-bloquear-${tel.replace(/\s/g,'')}" onclick="bloquearUsuario('${tel}')"><span class="btn-label"><i class="ti ti-lock"></i> Confirmar bloqueo</span><div class="btn-spinner"></div></button></div>
    </div>
    <div class="divider"></div>
    <div class="section-title" style="margin-bottom:8px">Historial</div>
    ${pedidos.map(p=>`<div class="historial-item"><div style="display:flex;justify-content:space-between;align-items:center"><span style="font-weight:700;color:var(--cafe-dark)">#${p.id}</span>${getEstadoBadge(p.estado)}</div><div style="font-size:0.78rem;color:var(--texto-suave);margin-top:2px">${formatQ(p.total)} · ${formatFecha(p.created_at)}</div><div style="margin-top:4px">${p.productos.map(pr=>`<span style="font-size:0.73rem;color:var(--texto-suave)">${pr.nombre} ×${pr.cantidad}</span>`).join(' · ')}</div></div>`).join('')||'<p style="font-size:0.84rem;color:var(--texto-muy-suave)">Sin órdenes</p>'}
  `;
  abrirModalById('modal-admin-usuario');
}

function abrirModalAdvertencia(tel){advTelPendiente=tel;const inp=document.getElementById('adv-nota-input');if(inp)inp.value='';abrirModalById('modal-advertencia-nota');}

async function confirmarAdvertencia(){
  const u_data=await sb.from('usuarios').select('advertencias').eq('telefono',advTelPendiente).single();
  const adv=Array.isArray(u_data.data?.advertencias)?[...u_data.data.advertencias]:[];
  const nota=(document.getElementById('adv-nota-input')||{}).value?.trim()||'';
  adv.push({nota,fecha:new Date().toISOString()});
  setLoading('btn-confirmar-adv',true);
  try{
    await sb.from('usuarios').update({advertencias:adv,updated_at:new Date().toISOString()}).eq('telefono',advTelPendiente);
    cerrarModalById('modal-advertencia-nota');showToast('Advertencia agregada');verAdminUsuario(advTelPendiente);
  }catch(e){showToast('Error: '+e.message);}
  setLoading('btn-confirmar-adv',false);
}

async function quitarAdvertencia(tel){
  const{data}=await sb.from('usuarios').select('advertencias').eq('telefono',tel).single();
  const adv=Array.isArray(data?.advertencias)?[...data.advertencias]:[];
  if(adv.length>0)adv.pop();
  try{await sb.from('usuarios').update({advertencias:adv,updated_at:new Date().toISOString()}).eq('telefono',tel);showToast('Advertencia eliminada');verAdminUsuario(tel);}catch(e){showToast('Error: '+e.message);}
}

function abrirFormBloqueo(tel){const id='form-bloqueo-'+tel.replace(/\s/g,'');const f=document.getElementById(id);if(f)f.style.display=f.style.display==='none'?'block':'none';}

async function bloquearUsuario(tel){
  const id='msg-bloqueo-'+tel.replace(/\s/g,'');const msg=(document.getElementById(id)||{}).value?.trim()||'';
  setLoading('btn-bloquear-'+tel.replace(/\s/g,''),true);
  try{await sb.from('usuarios').update({bloqueado:true,msg_bloqueo:msg,updated_at:new Date().toISOString()}).eq('telefono',tel);showToast('Cuenta bloqueada');verAdminUsuario(tel);}catch(e){showToast('Error: '+e.message);}
  setLoading('btn-bloquear-'+tel.replace(/\s/g,''),false);
}

function pedirDesbloquear(tel){
  mostrarConfirmDialog('¿Desbloquear cuenta?','El usuario podrá volver a realizar pedidos.','Desbloquear',async()=>{
    try{await sb.from('usuarios').update({bloqueado:false,updated_at:new Date().toISOString()}).eq('telefono',tel);showToast('Cuenta desbloqueada');verAdminUsuario(tel);}catch(e){showToast('Error: '+e.message);}
  },false);
}

// ============================================================
// ADMIN HISTORIAL
// ============================================================
async function renderAdminHistorial(){
  const lista=document.getElementById('admin-historial-lista');
  const busq=((document.getElementById('historial-search-input')||{}).value||'').toLowerCase().trim();
  lista.innerHTML='<div class="loading-full"><div class="spinner"></div></div>';
  let todos=[];
  try{const{data}=await sb.from('pedidos').select('*').order('created_at',{ascending:false});if(data)todos=data;}catch(e){}
  let usrs=[];try{const{data}=await sb.from('usuarios').select('id,nombre,apellido,telefono');if(data)usrs=data;}catch(e){}
  if(busq)todos=todos.filter(p=>{const u=usrs.find(x=>x.telefono===p.usuario_tel);return p.id.toLowerCase().includes(busq)||(u&&(u.nombre.toLowerCase().includes(busq)||u.apellido?.toLowerCase().includes(busq)))||p.usuario_tel.includes(busq);});
  if(!todos.length){lista.innerHTML='<div class="empty"><i class="ti ti-history"></i><p>'+(busq?'Sin resultados':'Sin órdenes aún')+'</p></div>';return;}
  lista.innerHTML=`<p style="font-size:0.78rem;color:var(--texto-muy-suave);margin-bottom:10px">${todos.length} orden(es)</p>`+todos.map(p=>{
    const u=usrs.find(x=>x.telefono===p.usuario_tel);
    return`<div class="historial-item" style="cursor:pointer" onclick="verAdminPedido('${p.id}')">
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:4px"><div style="display:flex;align-items:center;gap:7px"><span style="font-weight:700;color:var(--cafe-dark)">#${p.id}</span>${getEstadoBadge(p.estado)}${p.es_domicilio?'<span class="badge badge-exito" style="font-size:0.64rem">Domicilio</span>':''}</div><span style="font-weight:700;color:var(--cafe-dark)">${formatQ(p.total)}</span></div>
      <div style="font-size:0.81rem;font-weight:500;color:var(--texto-suave);margin-bottom:3px">${u?u.nombre+' '+(u.apellido||''):'Cliente'}</div>
      <div style="font-size:0.75rem;color:var(--texto-muy-suave);margin-bottom:4px">${formatFecha(p.created_at)} · ${formatHora(p.created_at)}</div>
      <div>${p.productos.map(pr=>`<span style="font-size:0.73rem;color:var(--texto-suave)">${pr.nombre} ×${pr.cantidad}</span>`).join(' · ')}</div>
      ${p.nota?`<div style="font-size:0.73rem;color:var(--texto-muy-suave);margin-top:4px;display:flex;align-items:center;gap:3px"><i class="ti ti-note" style="font-size:0.8rem"></i>${p.nota}</div>`:''}
    </div>`;
  }).join('');
}

// ============================================================
// ADMIN PRODUCTOS
// ============================================================
async function renderAdminProductos(){
  const lista=document.getElementById('admin-productos-lista');
  lista.innerHTML='<div class="loading-full"><div class="spinner"></div></div>';
  await cargarProductos();
  if(!productosCache.length){lista.innerHTML='<div class="empty"><i class="ti ti-bread"></i><p>Sin productos aún</p></div>';return;}
  lista.innerHTML=productosCache.map(p=>`
    <div class="admin-pedido-card" style="display:flex;align-items:center;gap:10px">
      <div style="width:40px;height:40px;border-radius:9px;background:var(--beige);display:flex;align-items:center;justify-content:center;flex-shrink:0;overflow:hidden">${p.imagen?`<img src="${p.imagen}" style="width:100%;height:100%;object-fit:cover" onerror="this.parentNode.innerHTML='<i class=\\'ti ${getCatIcon(p.categoria)}\\' style=\\'font-size:1.1rem;color:var(--cafe-light)\\'></i>'">`:`<i class="ti ${getCatIcon(p.categoria)}" style="font-size:1.1rem;color:var(--cafe-light)"></i>`}</div>
      <div style="flex:1;min-width:0">
        <div style="font-size:0.87rem;font-weight:500">${p.nombre}${p.bloqueado?'<span class="badge badge-cancelado" style="margin-left:4px;font-size:0.64rem">Bloqueado</span>':''}${!productoEstaDisponible(p)&&!p.bloqueado?'<span class="badge badge-aviso" style="margin-left:4px;font-size:0.64rem">No disp. ahora</span>':''}</div>
        <div style="font-size:0.76rem;color:var(--texto-suave)">${p.categoria}${p.subcategoria?' · '+p.subcategoria:''} · ${formatQ(p.precio)}</div>
        ${p.extra?`<div style="font-size:0.7rem;color:var(--aviso);margin-top:1px;display:flex;align-items:center;gap:2px"><i class="ti ti-clock" style="font-size:0.72rem"></i>${p.extra}</div>`:''}
      </div>
      <div style="display:flex;gap:4px;flex-shrink:0">
        <button class="btn-icon" style="width:34px;height:34px;color:${p.bloqueado?'var(--peligro)':'var(--cafe-light)'}" onclick="toggleBloqueoProducto(${p.id})" title="${p.bloqueado?'Desbloquear':'Bloquear'}"><i class="ti ti-${p.bloqueado?'lock-open':'lock'}" style="font-size:0.9rem"></i></button>
        <button class="btn-icon" style="width:34px;height:34px" onclick="abrirFormProducto(${p.id})"><i class="ti ti-edit" style="font-size:0.9rem"></i></button>
        <button class="btn-icon" style="width:34px;height:34px;color:var(--peligro)" onclick="eliminarProducto(${p.id})"><i class="ti ti-trash" style="font-size:0.9rem"></i></button>
      </div>
    </div>`).join('');
}

async function toggleBloqueoProducto(id){
  const p=productosCache.find(x=>x.id===id);if(!p)return;
  try{await sb.from('productos').update({bloqueado:!p.bloqueado,updated_at:new Date().toISOString()}).eq('id',id);showToast(p.bloqueado?'Producto desbloqueado':'Producto bloqueado');renderAdminProductos();}catch(e){showToast('Error: '+e.message);}
}

// DROPDOWN CATEGORÍAS CUSTOM
let catDropdownOpen=false;
function toggleCatDropdown(){catDropdownOpen=!catDropdownOpen;const list=document.getElementById('cat-dropdown-list');const btn=document.getElementById('cat-btn');list.classList.toggle('open',catDropdownOpen);btn.classList.toggle('open',catDropdownOpen);if(catDropdownOpen){renderCatOpciones('');document.getElementById('cat-nueva-input').value='';}}
function renderCatOpciones(filtro){const cats=getCategoriasUnicas().filter(c=>!filtro||c.toLowerCase().includes(filtro.toLowerCase()));const selected=document.getElementById('fp-categoria').value;document.getElementById('cat-opciones-list').innerHTML=cats.length?cats.map(c=>`<div class="cat-dropdown-item${c===selected?' selected':''}" onclick="seleccionarCategoria('${c}')">${c}</div>`).join(''):'';}
function seleccionarCategoria(cat){document.getElementById('fp-categoria').value=cat;document.getElementById('cat-btn-text').textContent=cat;document.getElementById('cat-btn-text').style.color='var(--texto)';catDropdownOpen=false;document.getElementById('cat-dropdown-list').classList.remove('open');document.getElementById('cat-btn').classList.remove('open');}
function crearCategoriaNueva(){const v=document.getElementById('cat-nueva-input').value.trim();if(v)seleccionarCategoria(v);}
document.addEventListener('click',e=>{const wrap=document.querySelector('.cat-dropdown-wrap');if(wrap&&!wrap.contains(e.target)&&catDropdownOpen){catDropdownOpen=false;document.getElementById('cat-dropdown-list')?.classList.remove('open');document.getElementById('cat-btn')?.classList.remove('open');}});

// BLOQUEO PROGRAMADO
function agregarReglaProg(tipo){
  const idx=progBloqueoReglas.length;
  if(tipo==='dias')progBloqueoReglas.push({tipo:'dias',dias:[]});
  else progBloqueoReglas.push({tipo:'horas',desde:'09:00',hasta:'12:00'});
  renderProgBloqueo();
}
function renderProgBloqueo(){
  const cont=document.getElementById('prog-bloqueo-lista');if(!cont)return;
  const diasNombres=['Dom','Lun','Mar','Mié','Jue','Vie','Sáb'];
  cont.innerHTML=progBloqueoReglas.map((r,i)=>`
    <div class="prog-block-row">
      ${r.tipo==='dias'?`<div style="flex:1"><div style="font-size:0.78rem;color:var(--texto-suave);margin-bottom:4px">Bloquear en días:</div><div style="display:flex;gap:4px;flex-wrap:wrap">${diasNombres.map((d,di)=>`<button onclick="toggleDiaProg(${i},${di})" style="padding:3px 7px;border-radius:6px;border:1.5px solid var(--borde-fuerte);background:${(r.dias||[]).includes(di)?'var(--cafe)':'var(--blanco)'};color:${(r.dias||[]).includes(di)?'#fff':'var(--cafe)'};font-size:0.75rem;cursor:pointer">${d}</button>`).join('')}</div></div>`
        :`<div style="flex:1;display:flex;align-items:center;gap:6px;flex-wrap:wrap"><span style="font-size:0.82rem">Bloquear de</span><input type="time" style="width:100px;padding:5px 8px;font-size:0.82rem" value="${r.desde}" onchange="progBloqueoReglas[${i}].desde=this.value"><span style="font-size:0.82rem">a</span><input type="time" style="width:100px;padding:5px 8px;font-size:0.82rem" value="${r.hasta}" onchange="progBloqueoReglas[${i}].hasta=this.value"></div>`}
      <button onclick="progBloqueoReglas.splice(${i},1);renderProgBloqueo()" style="width:28px;height:28px;border-radius:50%;border:none;background:var(--peligro-bg);color:var(--peligro);cursor:pointer;flex-shrink:0;font-size:1rem;display:flex;align-items:center;justify-content:center"><i class="ti ti-x"></i></button>
    </div>`).join('');
}
function toggleDiaProg(ruleIdx,dia){const r=progBloqueoReglas[ruleIdx];if(!r.dias)r.dias=[];const idx=r.dias.indexOf(dia);if(idx>=0)r.dias.splice(idx,1);else r.dias.push(dia);renderProgBloqueo();}

function abrirFormProducto(id){
  productoFormMode=id;catDropdownOpen=false;progBloqueoReglas=[];
  if(id){
    const p=productosCache.find(x=>x.id===id);if(!p)return;
    document.getElementById('form-producto-titulo').textContent='Editar producto';
    document.getElementById('fp-id').value=id;document.getElementById('fp-nombre').value=p.nombre;
    document.getElementById('fp-categoria').value=p.categoria;document.getElementById('cat-btn-text').textContent=p.categoria;document.getElementById('cat-btn-text').style.color='var(--texto)';
    document.getElementById('fp-subcategoria').value=p.subcategoria||'';
    document.getElementById('fp-precio').value=p.precio;document.getElementById('fp-imagen').value=p.imagen||'';
    document.getElementById('fp-detalles').value=p.detalles||'';document.getElementById('fp-extra').value=p.extra||'';
    progBloqueoReglas=Array.isArray(p.bloqueo_prog)?JSON.parse(JSON.stringify(p.bloqueo_prog)):[];
  }else{
    document.getElementById('form-producto-titulo').textContent='Agregar producto';
    ['fp-id','fp-nombre','fp-categoria','fp-subcategoria','fp-precio','fp-imagen','fp-detalles','fp-extra'].forEach(x=>{const el=document.getElementById(x);if(el)el.value='';});
    document.getElementById('cat-btn-text').textContent='Seleccionar categoría';document.getElementById('cat-btn-text').style.color='var(--texto-muy-suave)';
  }
  document.getElementById('cat-dropdown-list').classList.remove('open');document.getElementById('cat-btn').classList.remove('open');
  renderProgBloqueo();
  renderCatOpciones('');
  abrirModalById('modal-form-producto');
}

async function guardarProducto(){
  const nombre=document.getElementById('fp-nombre').value.trim();
  const categoria=document.getElementById('fp-categoria').value.trim();
  const precio=parseFloat(document.getElementById('fp-precio').value);
  const subcategoria=document.getElementById('fp-subcategoria').value.trim();
  const imagen=document.getElementById('fp-imagen').value.trim();
  const detalles=document.getElementById('fp-detalles').value;  // conservar \n
  const extra=document.getElementById('fp-extra').value.trim();
  if(!nombre||!categoria||isNaN(precio)){showToast('Complete los campos obligatorios');return;}
  setLoading('btn-guardar-producto',true);
  try{
    const datos={nombre,categoria,subcategoria,precio,imagen,detalles,extra,bloqueo_prog:progBloqueoReglas,updated_at:new Date().toISOString()};
    if(productoFormMode){
      await sb.from('productos').update(datos).eq('id',productoFormMode);showToast('Producto actualizado');
    }else{
      datos.created_at=new Date().toISOString();datos.bloqueado=false;
      await sb.from('productos').insert(datos);showToast('Producto agregado');
    }
    cerrarModalById('modal-form-producto');
    await renderAdminProductos();
    renderFiltrosCategorias();
  }catch(e){showToast('Error: '+e.message);}
  setLoading('btn-guardar-producto',false);
}

async function eliminarProducto(id){
  if(!confirm('¿Eliminar este producto?'))return;
  try{await sb.from('productos').delete().eq('id',id);showToast('Producto eliminado');renderAdminProductos();}catch(e){showToast('Error: '+e.message);}
}

// ============================================================
// ADMIN USUARIOS
// ============================================================
async function renderAdminUsuarios(){
  const lista=document.getElementById('admin-usuarios-lista');
  lista.innerHTML='<div class="loading-full"><div class="spinner"></div></div>';
  let usrs=[];
  try{const{data}=await sb.from('usuarios').select('*').order('created_at',{ascending:false});if(data)usrs=data;}catch(e){}
  lista.innerHTML=`<p style="font-size:0.78rem;color:var(--texto-muy-suave);margin-bottom:9px">${usrs.length} cliente(s)</p>`+usrs.map(u=>{
    const advc=getAdvCount(u);
    const avatarClass=u.bloqueado?'avatar-block':advc>0?'avatar-warn':'';
    return`<div class="usuario-row" onclick="verAdminUsuario('${u.telefono}')">
      <div class="usuario-avatar ${avatarClass}">${u.nombre[0]}${u.apellido?u.apellido[0]:''}</div>
      <div style="flex:1"><div style="font-size:0.87rem;font-weight:500;display:flex;align-items:center;gap:5px">${u.nombre} ${u.apellido||''}${u.bloqueado?'<i class="ti ti-lock" style="font-size:0.85rem;color:var(--peligro)"></i>':''}</div><div style="font-size:0.76rem;color:var(--cafe);display:flex;align-items:center;gap:3px"><i class="ti ti-phone" style="font-size:0.8rem"></i>${u.telefono.slice(0,4)+' '+u.telefono.slice(4)}</div></div>
      <div style="text-align:right"><div style="font-size:0.7rem;color:var(--texto-muy-suave)">${formatFecha(u.created_at)}</div>${advc?`<span class="badge badge-peligro" style="margin-top:2px"><i class="ti ti-alert-triangle" style="font-size:0.72rem"></i>${advc}</span>`:''}</div>
    </div>`;
  }).join('');
}

// ============================================================
// ADMIN CONFIG
// ============================================================
async function renderAdminConfig(){
  await cargarConfigGlobal();
  const fb=configGlobal.funciones_bloqueadas||{};
  document.getElementById('admin-config-content').innerHTML=`
    <div class="form-group"><label>Teléfono de la tienda</label><input type="text" id="cfg-tel" value="${configGlobal.telefono_tienda||''}"></div>
    <div class="form-group"><label>Términos adicionales</label><textarea id="cfg-terminos" rows="4">${configGlobal.terminos_extra||''}</textarea></div>
    <div class="divider"></div>
    <div class="section-title" style="margin-bottom:10px">Descripción de estados</div>
    ${Object.entries(configGlobal.estados_info||{}).map(([k,v])=>`<div class="form-group"><label>${k}</label><input type="text" id="cfg-estado-${k}" value="${v}"></div>`).join('')}
    <div class="divider"></div>
    <div class="section-title" style="margin-bottom:4px">Funciones de usuarios</div>
    <p style="font-size:0.78rem;color:var(--texto-muy-suave);margin-bottom:10px">Cuando estén bloqueadas, los usuarios verán un mensaje y no podrán usarlas.</p>
    ${[['realizar_pedidos','Realizar pedidos'],['hora_recogida','Hora de recogida'],['pedido_domicilio','Pedido a domicilio'],['nota_pedido','Nota para la panadería']].map(([k,lbl])=>`
      <div class="toggle-row">
        <span class="toggle-label">${lbl}</span>
        <label class="toggle-switch"><input type="checkbox" id="toggle-${k}" ${fb[k]?'checked':''} onchange="guardarFuncionBloqueada('${k}',this.checked)"><span class="toggle-slider"></span></label>
      </div>`).join('')}
    <button class="btn btn-primary" style="width:100%;margin-top:14px" id="btn-guardar-cfg" onclick="guardarConfigAdmin()"><span class="btn-label"><i class="ti ti-device-floppy"></i> Guardar configuración</span><div class="btn-spinner"></div></button>
  `;
}

async function guardarFuncionBloqueada(clave,val){
  const fb={...(configGlobal.funciones_bloqueadas||{})};fb[clave]=val;
  await guardarConfig('funciones_bloqueadas',fb);
}

async function guardarConfigAdmin(){
  setLoading('btn-guardar-cfg',true);
  try{
    const tel=document.getElementById('cfg-tel').value.replace(/\D/g,'');
    const terminos=document.getElementById('cfg-terminos').value;
    const estados={};
    ['pendiente','confirmado','listo','entregado','cancelado'].forEach(k=>{const el=document.getElementById('cfg-estado-'+k);if(el)estados[k]=el.value;});
    await guardarConfig('telefono_tienda',tel);
    await guardarConfig('terminos_extra',terminos);
    await guardarConfig('estados_info',estados);
    actualizarTerminosUI();
    showToast('Configuración guardada');
  }catch(e){showToast('Error: '+e.message);}
  setLoading('btn-guardar-cfg',false);
}


