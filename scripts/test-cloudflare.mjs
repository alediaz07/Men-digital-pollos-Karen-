// Verificación sin datos reales ni acceso a Cloudflare remoto.
// Ejecutar luego de npm run build:cloudflare.
import {spawn,spawnSync} from "node:child_process";
import {setTimeout as wait} from "node:timers/promises";
import assert from "node:assert/strict";
const port=8809,host="http://127.0.0.1:"+port;
const secret="Only-for-local-test-bootstrapping-123456789";
const subprocess=(args,timeout=120000)=>spawnSync("npx",["--yes","wrangler@4",...args],{encoding:"utf8",timeout,env:{...process.env,WRANGLER_SEND_METRICS:"false"}});
const migration=subprocess(["d1","migrations","apply","pollos-karen-db","--local"],120000);
assert.equal(migration.status,0,"D1 migration failed: "+migration.stderr+"\n"+migration.stdout);
const server=spawn("npx",["--yes","wrangler@4","dev","--local","--ip","127.0.0.1","--port",String(port),"--var","BOOTSTRAP_SECRET:"+secret],{stdio:["ignore","pipe","pipe"],detached:true,env:{...process.env,WRANGLER_SEND_METRICS:"false"}});
let log="";
server.stdout.on("data",b=>log+=b.toString());
server.stderr.on("data",b=>log+=b.toString());
try{
  let healthy=false;
  for(let i=0;i<140;i++){
    try{const r=await fetch(host+"/api/health",{signal:AbortSignal.timeout(3000)});if(r.ok){healthy=true;break;}}catch{}
    await wait(200);
  }
  assert.ok(healthy,"Worker local no inició: "+log.slice(-3500));
  async function request(path,{method="GET",body,cookie,csrf,authorization}={}){
    const headers={"Origin":host};
    if(body!==undefined)headers["Content-Type"]="application/json";
    if(cookie)headers["Cookie"]=cookie;
    if(csrf)headers["X-CSRF-Token"]=csrf;
    if(authorization)headers["Authorization"]=authorization;
    const r=await fetch(host+path,{method,headers,body:body!==undefined?JSON.stringify(body):undefined,signal:AbortSignal.timeout(5000)});
    const data=await r.json().catch(()=>({}));
    return {status:r.status,data,cookie:r.headers.get("set-cookie")};
  }
  const health=await request("/api/health");
  assert.equal(health.data.database,"connected");
  const init=await request("/api/bootstrap",{method:"POST",authorization:"Bearer "+secret,body:{username:"admin",password:"TestStrongPassword!2026"}});
  assert.equal(init.status,201,JSON.stringify(init));
  assert.ok(init.data.seededMenu>0);
  const anonymous=await request("/api/session");
  assert.ok(anonymous.cookie?.includes("pk_c="));
  const customerCookie=anonymous.cookie.split(";")[0];
  const ccsrf=anonymous.data.csrfToken;
  const denied=await request("/api/users",{cookie:customerCookie});
  assert.equal(denied.status,403);
  const logged=await request("/api/login",{method:"POST",cookie:customerCookie,csrf:ccsrf,body:{username:"admin",password:"TestStrongPassword!2026"}});
  assert.equal(logged.status,200,JSON.stringify(logged));
  const adminCookie=customerCookie+"; "+logged.cookie.split(";")[0];
  const snapshot=await request("/api/state",{cookie:adminCookie});
  assert.equal(snapshot.status,200);
  assert.ok(snapshot.data.tables.length>0);
  const table=snapshot.data.tables[0],dish=snapshot.data.menu.find(x=>x.available);
  assert.ok(table.qrToken&&dish);
  // La prueba corre a cualquier hora; elimina el horario del platillo solo en la D1 local.
  const edited=await request("/api/menu/item",{method:"POST",cookie:adminCookie,csrf:ccsrf,body:{...dish,scheduleText:""}});
  assert.equal(edited.status,200,JSON.stringify(edited));

  const forbidden=await request("/api/admin/pos/orders",{method:"POST",cookie:customerCookie,csrf:ccsrf,body:{orderType:"window",items:[{menuItemId:dish.id,quantity:1}],authorize:true}});
  assert.equal(forbidden.status,403);
  const newOrder=async(quant)=>request("/api/admin/pos/orders",{method:"POST",cookie:adminCookie,csrf:ccsrf,body:{orderType:"dine_in",tableId:table.id,items:[{menuItemId:dish.id,quantity:quant,selectedVariant:dish.variants?.[0]}],authorize:true}});
  const first=await newOrder(1),second=await newOrder(2);
  assert.equal(first.status,201,JSON.stringify(first));
  assert.equal(second.status,201,JSON.stringify(second));
  assert.equal(first.data.status,"in_kitchen");
  assert.equal(first.data.isPaid,false);
  const total=first.data.total+second.data.total;
  const partially=await request("/api/admin/checkout",{method:"POST",cookie:adminCookie,csrf:ccsrf,body:{orderIds:[first.data.id],paymentMethod:"efectivo",cashReceived:20000}});
  assert.equal(partially.status,409,JSON.stringify(partially));
  const paid=await request("/api/admin/checkout",{method:"POST",cookie:adminCookie,csrf:ccsrf,body:{orderIds:[first.data.id,second.data.id],paymentMethod:"efectivo",cashReceived:20000}});
  assert.equal(paid.status,200,JSON.stringify(paid));
  assert.equal(paid.data.changeGiven,20000-total);
  const duplicate=await request("/api/admin/checkout",{method:"POST",cookie:adminCookie,csrf:ccsrf,body:{orderIds:[first.data.id,second.data.id],paymentMethod:"efectivo",cashReceived:20000}});
  assert.equal(duplicate.status,409);
  const publicPos=await request("/api/orders/"+first.data.id,{cookie:customerCookie});
  assert.equal(publicPos.status,404,"A client cannot read another person's POS order");
  const closed=await request("/api/settings",{method:"PUT",cookie:adminCookie,csrf:ccsrf,body:{expressTemporarilyClosed:true}});
  assert.equal(closed.status,200,JSON.stringify(closed));
  const avail=await request("/api/express/status");
  assert.equal(avail.data.open,false);
  console.log("Cloudflare local smoke OK: D1, auth, POS, caja conjunta, CSRF, privacidad, cierre exprés.");
}finally{
  try {process.kill(-server.pid,"SIGTERM");} catch {server.kill("SIGTERM");}
  server.stdout.destroy();server.stderr.destroy();
}
