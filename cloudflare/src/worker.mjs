import {id,now,sha,randomToken,error,text,integer,json,body,cookie,setCookie,passwordHash,verifyPassword,client,staff,ensureClient,requireMutation,requireStaff,settings,tableFromToken,menu,allTables,bootstrap,bump,expressAvailability} from "./core.mjs";
import {makeCustomerOrder,makePOSOrder,orderById,updateOrder,charge,visibleState} from "./orders.mjs";

const roleUser = user=>user?{username:user.username,role:user.role}:null;
const fail=(message,status=400)=>json({error:message},status);
const sameOrigin=request=>request.headers.get("Origin")===new URL(request.url).origin;
const splitPath=request=>new URL(request.url).pathname.split("/").filter(Boolean);
async function authSession(request,env){
  const {client:owner,headers}=await ensureClient(request,env);
  const user=await staff(request,env);
  return json({user:roleUser(user),csrfToken:owner.csrf},200,headers);
}
async function login(request,env){
  const b=await body(request),owner=await requireMutation(request,env);
  const name=text(b.username,80,true)?.toLowerCase();
  if(!/^[a-z0-9._-]{3,80}$/.test(name))error("Usuario o contraseña incorrectos.",401);
  const row=await env.DB.prepare("SELECT * FROM pk_staff WHERE username=? AND active=1").bind(name).first();
  const attempts=await env.DB.prepare("SELECT failures,blocked_until FROM pk_auth_attempts WHERE username=?").bind(name).first();
  if(attempts?.blocked_until>Date.now())error("Demasiados intentos. Intenta más tarde.",429);
  let valid=false;
  if(row)valid=await verifyPassword(b.password,row.password_hash);
  if(!valid){
    await env.DB.prepare("INSERT INTO pk_auth_attempts(username,failures,blocked_until) VALUES (?,1,0) ON CONFLICT(username) DO UPDATE SET failures=failures+1,blocked_until=CASE WHEN failures>=7 THEN ? ELSE blocked_until END")
      .bind(name,Date.now()+900000).run();
    error("Usuario o contraseña incorrectos.",401);
  }
  await env.DB.prepare("DELETE FROM pk_auth_attempts WHERE username=?").bind(name).run();
  const token=randomToken(),hash=await sha(token);
  await env.DB.prepare("INSERT INTO pk_sessions(token_hash,staff_id,csrf_hash,expires_at) VALUES(?,?,?,?)")
    .bind(hash,row.id,await sha(owner.csrf),Date.now()+8*3600000).run();
  return json({user:roleUser(row),csrfToken:owner.csrf},200,{"Set-Cookie":setCookie("pk_s",token,8*3600)});
}
async function logout(request,env){
  await requireMutation(request,env);
  const token=cookie(request,"pk_s");
  if(token)await env.DB.prepare("DELETE FROM pk_sessions WHERE token_hash=?").bind(await sha(token)).run();
  return json({ok:true},200,{"Set-Cookie":setCookie("pk_s","",0)});
}
async function staffList(env){
  const rs=await env.DB.prepare("SELECT id,username,role,active,version FROM pk_staff ORDER BY username").all();
  return rs.results.map(x=>({...x,active:!!x.active}));
}
async function putUser(env,b){
  const username=text(b.username,80,true)?.toLowerCase();
  if(!/^[a-z0-9._-]{3,80}$/.test(username)||!["admin","reception","kitchen"].includes(b.role))error("Usuario o rol inválido.");
  const old=await env.DB.prepare("SELECT * FROM pk_staff WHERE username=?").bind(username).first();
  const ph=b.password?await passwordHash(b.password):old?.password_hash;
  if(!ph)error("La contraseña del usuario nuevo es obligatoria.");
  const active=b.active!==false,staffId=old?.id||id();
  if(old?.role==="admin" && (b.role!=="admin"||!active)){
    const admins=await env.DB.prepare("SELECT COUNT(*) AS n FROM pk_staff WHERE role='admin' AND active=1 AND id!=?").bind(old.id).first();
    if(!admins?.n)error("Debe conservarse un administrador activo.");
  }
  const q=[env.DB.prepare("INSERT INTO pk_staff(id,username,password_hash,role,active,version) VALUES(?,?,?,?,?,1) ON CONFLICT(username) DO UPDATE SET password_hash=excluded.password_hash,role=excluded.role,active=excluded.active,version=pk_staff.version+1").bind(staffId,username,ph,b.role,active?1:0)];
  if(old)q.push(env.DB.prepare("DELETE FROM pk_sessions WHERE staff_id=?").bind(old.id));
  await env.DB.batch(q);
  return {ok:true};
}
async function putSettings(env,b) {
  const next={...await settings(env)};
  for(const [key,value] of Object.entries(b)){
    if(!Object.hasOwn(next,key))error("Campo de configuración no permitido.");
    if(key==="serviceChargePercent"){if(value!==10)error("Servicio de mesa permanece en 10%.");next[key]=10;}
    else if(key==="expressDeliveryFee")next[key]=integer(value);
    else if(key==="expressRadiusKm"){if(value!==1)error("El envío exprés mantiene cobertura manual de 1 km.");next[key]=1;}
    else if(key==="expressDays"){
      if(!Array.isArray(value)||!value.length||value.some(d=>!Number.isInteger(d)||d<0||d>6)||new Set(value).size!==value.length)error("Días inválidos.");
      next[key]=value;
    }else if(key==="expressTemporarilyClosed"){
      if(typeof value!=="boolean")error("Valor inválido.");
      next[key]=value;
    }else if(key==="expressOpen"||key==="expressClose"){
      if(typeof value!=="string"||!/^(?:[01]\d|2[0-3]):[0-5]\d$/.test(value))error("Hora inválida.");
      next[key]=value;
    }else next[key]=text(value,1000,true);
  }
  if(next.expressOpen>=next.expressClose)error("Cierre debe ser posterior a apertura.");
  await env.DB.batch([env.DB.prepare("UPDATE pk_settings SET json=?,updated_at=CURRENT_TIMESTAMP WHERE key='restaurant'").bind(JSON.stringify(next)),bump(env)]);
  return next;
}
const validateDish=b=>{
  if(!b||typeof b!=="object"||!["plato_del_dia","desayunos","casados","comida_rapida","refrescos"].includes(b.category)||typeof b.available!=="boolean")error("Producto inválido.");
  const item={id:text(b.id,100,true),name:text(b.name,150,true),category:b.category,price:integer(b.price),available:b.available,
    description:text(b.description,1000),scheduleText:text(b.scheduleText,200),featured:b.featured===true};
  if(b.variants){
    if(!Array.isArray(b.variants)||b.variants.length>30)error("Variantes inválidas.");
    item.variants=b.variants.map(v=>text(v,100,true));
  }
  return item;
};
async function upsertDish(env,b){
  const item=validateDish(b);
  await env.DB.batch([env.DB.prepare("INSERT INTO pk_menu(id,json,active) VALUES(?,?,1) ON CONFLICT(id) DO UPDATE SET json=excluded.json,active=1,updated_at=CURRENT_TIMESTAMP").bind(item.id,JSON.stringify(item)),bump(env)]);
  return item;
}
async function updateTables(env,list){
  if(!Array.isArray(list)||list.length>200)error("Lista de mesas inválida.");
  if(new Set(list.map(x=>x.id)).size!==list.length||new Set(list.map(x=>x.number)).size!==list.length)error("Mesas duplicadas.");
  const existing=await allTables(env),q=[],toReturn=[];
  for(const t of list){
    if(!Number.isInteger(t.number)||t.number<1||!Number.isInteger(t.capacity)||t.capacity<1||t.capacity>100)error("Datos de mesa inválidos.");
    const old=existing.find(x=>x.id===t.id);
    const token=old?.qrToken||randomToken();
    q.push(env.DB.prepare("INSERT INTO pk_tables(id,number,name,capacity,qr_token_hash,qr_token,active) VALUES(?,?,?,?,?,?,?) ON CONFLICT(id) DO UPDATE SET number=excluded.number,name=excluded.name,capacity=excluded.capacity,active=excluded.active")
      .bind(text(t.id,100,true),t.number,text(t.name,100,true),t.capacity,await sha(token),token,t.active===false?0:1));
    toReturn.push({id:t.id,number:t.number,name:t.name,capacity:t.capacity,active:t.active!==false,qrToken:token});
  }
  for(const old of existing.filter(x=>!list.some(y=>y.id===x.id)))q.push(env.DB.prepare("UPDATE pk_tables SET active=0 WHERE id=?").bind(old.id));
  q.push(bump(env));
  await env.DB.batch(q);
  return toReturn;
}
async function route(request,env){
  const url=new URL(request.url),path=url.pathname,method=request.method;
  if(method==="GET"&&path==="/api/health"){
    const connected=await env.DB.prepare("SELECT 1 AS ok").first();
    return json({application:"Pollos Karen",database:connected?.ok===1?"connected":"error",worker:"d1"});
  }
  if(method==="GET"&&path==="/api/setup/status"){
    const count=await env.DB.prepare("SELECT COUNT(*) AS n FROM pk_staff").first();
    return json({needsSetup:count.n===0});
  }
  if(method==="POST"&&path==="/api/bootstrap"){
    if(!sameOrigin(request))error("Origen inválido.",403);
    const value=request.headers.get("Authorization")||"";
    if(!env.BOOTSTRAP_SECRET||env.BOOTSTRAP_SECRET.length<32||await sha(value)!==await sha("Bearer "+env.BOOTSTRAP_SECRET))error("Instalación no autorizada.",403);
    const b=await body(request);
    return json(await bootstrap(env,text(b.username,80,true)?.toLowerCase(),b.password),201);
  }
  if(method==="GET"&&path==="/api/session")return authSession(request,env);
  if(method==="POST"&&path==="/api/login")return login(request,env);
  if(method==="POST"&&path==="/api/logout")return logout(request,env);
  if(method==="GET"&&path==="/api/express/status")return json(expressAvailability(await settings(env)));
  const currentUser=await staff(request,env);
  const currentClient=await client(request,env);
  if(method==="GET"&&path==="/api/state")return json(await visibleState(env,currentUser,currentClient?.hash,url.searchParams.get("scope")==="customer"));
  if(method==="GET"&&path.startsWith("/api/table/")){
    const t=await tableFromToken(env,decodeURIComponent(path.slice("/api/table/".length)));
    return t?json({id:t.id,number:t.number,name:t.name,capacity:t.capacity,active:!!t.active}):fail("QR de mesa inválido o revocado.",404);
  }
  const pieces=splitPath(request),orderId=pieces[1]==="orders"?pieces[2]:null;
  if(method==="GET"&&pieces[0]==="api"&&orderId&&pieces.length===3){
    const o=await orderById(env,orderId);
    if(!o||(!currentUser&&(!currentClient||!o.ownerHash||o.ownerHash!==currentClient.hash)))return fail("Pedido no encontrado.",404);
    if(currentUser?.role==="kitchen")return ["in_kitchen","ready"].includes(o.status)?json({id:o.id,orderNumber:o.orderNumber,orderType:o.orderType,items:o.items,status:o.status,createdAt:o.createdAt}):fail("Pedido no encontrado.",404);
    return json(currentUser?{...o,ownerHash:undefined,sinpeReceiptImage:o.sinpeReceiptImage?"/api/orders/"+o.id+"/receipt":undefined}:((({ownerHash,requestKey,requestHash,sinpeReceiptImage,...rest})=>rest)(o)));
  }
  if(method==="GET"&&pieces[0]==="api"&&orderId&&pieces[3]==="receipt"){
    requireStaff(currentUser);
    const row=await env.DB.prepare("SELECT mime,image_bytes FROM pk_receipts WHERE order_id=?").bind(orderId).first();
    return row?new Response(new Uint8Array(row.image_bytes),{headers:{"Content-Type":row.mime,"Cache-Control":"no-store","X-Content-Type-Options":"nosniff"}}):fail("No hay comprobante.",404);
  }
  if(method==="GET"&&path==="/api/users"){requireStaff(currentUser,["admin"]);return json(await staffList(env));}
  if(method==="GET"&&path==="/api/admin/checkout/history"){
    requireStaff(currentUser);
    const rs=await env.DB.prepare("SELECT id,actor,amount AS total,method,cash_received AS cashReceived,change_given AS changeGiven,bank_reference AS sinpeReference,created_at AS createdAt FROM pk_payments ORDER BY created_at DESC LIMIT 200").all();
    return json(rs.results);
  }
  if(method==="GET"&&path==="/api/admin/audit"){
    requireStaff(currentUser,["admin"]);
    const rs=await env.DB.prepare("SELECT * FROM pk_audit ORDER BY created_at DESC LIMIT 300").all();
    return json(rs.results);
  }
  if(method==="GET"&&path==="/api/admin/kpis"){
    requireStaff(currentUser,["admin"]);
    const rs=await env.DB.prepare("SELECT json FROM pk_orders WHERE is_paid=1").all();
    const paid=rs.results.map(r=>JSON.parse(r.json)).filter(o=>o.status!=="cancelled");
    const sum=fn=>paid.reduce((n,o)=>n+fn(o),0);
    return json({paidOrders:paid.length,totalCollected:sum(o=>o.total),restaurantGross:sum(o=>o.subtotal+o.deliveryFee),serviceFeesHeld:sum(o=>o.serviceFee),deliveryFees:sum(o=>o.deliveryFee)});
  }
  if(path.startsWith("/api/admin/inventory")){requireStaff(currentUser,["admin"]);return fail("Inventario temporalmente pausado por el restaurante.",423);}
  // Todas las escrituras requieren sesión de cliente y CSRF. El personal requiere además su rol.
  if(!["GET","HEAD","OPTIONS"].includes(method))await requireMutation(request,env);
  if(method==="POST"&&path==="/api/orders"){
    if(!currentClient)error("Sesión caducada. Recarga la página.",403);
    const outcome=await makeCustomerOrder(request,env,await body(request),currentClient);
    return json(outcome.order,outcome.created?201:200);
  }
  if(method==="POST"&&path==="/api/admin/pos/orders"){
    requireStaff(currentUser);
    return json(await makePOSOrder(env,await body(request),currentUser),201);
  }
  if(method==="POST"&&path==="/api/admin/checkout"){
    requireStaff(currentUser);
    return json(await charge(env,await body(request),currentUser));
  }
  if(method==="PATCH"&&pieces[0]==="api"&&orderId&&pieces.length===3){
    requireStaff(currentUser,["admin","reception","kitchen"]);
    return json(await updateOrder(env,orderId,await body(request),currentUser));
  }
  if(method==="DELETE"&&pieces[0]==="api"&&orderId)error("No se eliminan pedidos del historial.",409);
  if(method==="POST"&&path==="/api/users"){requireStaff(currentUser,["admin"]);return json(await putUser(env,await body(request)));}
  if(method==="PUT"&&path==="/api/settings"){requireStaff(currentUser,["admin"]);return json(await putSettings(env,await body(request)));}
  if(method==="POST"&&path==="/api/menu/item"){requireStaff(currentUser,["admin"]);return json(await upsertDish(env,await body(request)));}
  if(method==="DELETE"&&path.startsWith("/api/menu/item/")){
    requireStaff(currentUser,["admin"]);
    const dishId=decodeURIComponent(path.substring("/api/menu/item/".length));
    await env.DB.batch([env.DB.prepare("UPDATE pk_menu SET active=0 WHERE id=?").bind(dishId),bump(env)]);
    return json({ok:true});
  }
  if(method==="PUT"&&path==="/api/tables"){requireStaff(currentUser,["admin"]);return json(await updateTables(env,await request.json()));}
  if(method==="POST"&&pieces[0]==="api"&&pieces[1]==="tables"&&pieces[3]==="rotate"){
    requireStaff(currentUser,["admin"]);
    const qr=randomToken(),t=pieces[2];
    const rs=await env.DB.prepare("UPDATE pk_tables SET qr_token=?,qr_token_hash=? WHERE id=?").bind(qr,await sha(qr),t).run();
    if(!rs.meta?.changes)error("Mesa no encontrada.",404);
    await bump(env).run();
    return json(await allTables(env));
  }
  return fail("Ruta inexistente.",404);
}
const setupHtml='<!doctype html><html lang="es"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Pollos Karen · Instalación</title><main style="font:16px system-ui;max-width:440px;margin:5vh auto;padding:24px"><h1>Pollos Karen · Configuración inicial</h1><p>Solo se utiliza una vez. Primero configurá BOOTSTRAP_SECRET en las variables secretas del Worker.</p><form id="f"><label>Clave inicial<input name="key" type="password" required autocomplete="off"></label><p><label>Administrador<input name="username" required pattern="[a-z0-9._-]{3,80}"></label></p><p><label>Contraseña fuerte<input name="password" type="password" required minlength="12" autocomplete="new-password"></label></p><button>Configurar</button></form><pre id="result"></pre><script>document.getElementById("f").onsubmit=async(e)=>{e.preventDefault();const f=new FormData(e.target);const r=await fetch("/api/bootstrap",{method:"POST",headers:{"Content-Type":"application/json","Authorization":"Bearer "+f.get("key")},body:JSON.stringify({username:f.get("username"),password:f.get("password")})});document.getElementById("result").textContent=r.ok?"Configuración completada. Entrá a /admin":(await r.json()).error||"Error de configuración";};</script></main></html>';
export default {
  async fetch(request,env){
    const url=new URL(request.url);
    if(url.pathname==="/setup")return new Response(setupHtml,{headers:{"Content-Type":"text/html;charset=utf-8","Cache-Control":"no-store","X-Frame-Options":"DENY"}});
    if(!url.pathname.startsWith("/api/"))return env.ASSETS.fetch(request);
    try{
      return await route(request,env);
    }catch(e){
      const status=e?.status||500;
      if(status>=500)console.error("Pollos Karen D1 API error:",e?.message);
      return json({error:status>=500?"No se pudo completar la operación. Reintentá.":e.message},status);
    }
  }
};
