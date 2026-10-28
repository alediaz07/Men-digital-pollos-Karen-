import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import {DatabaseSync} from "node:sqlite";
import worker from "../cloudflare/src/worker.mjs";

function createD1(){
  const sql=fs.readFileSync("cloudflare/migrations/0001_initial.sql","utf8");
  const db=new DatabaseSync(":memory:");
  db.exec(sql);
  const wrap=(statement:any)=>({
    bind(...args:any[]){
      return wrap(db.prepare("__DUMMY__")) && bound(statement,args);
    }
  });
  function bound(statement:any,args:any[]){
    const obj:any={
      first:async()=>statement.get(...args)||null,
      all:async()=>({results:statement.all(...args)}),
      run:async()=>({success:true,meta:{changes:Number(statement.run(...args).changes)}})
    };
    return obj;
  }
  return {prepare(sql:string){return {bind(...args:any[]){return bound(db.prepare(sql),args);},
    first:async()=>db.prepare(sql).get()||null,all:async()=>({results:db.prepare(sql).all()}),
    run:async()=>({success:true,meta:{changes:Number(db.prepare(sql).run().changes)}})};},
    async batch(statements:any[]){
      db.exec("BEGIN IMMEDIATE");
      try{const responses=[];for(const s of statements)responses.push(await s.run());db.exec("COMMIT");return responses;}
      catch(err){db.exec("ROLLBACK");throw err;}
    },close(){db.close();}
  };
}
function env(){
  return {DB:createD1(),BOOTSTRAP_SECRET:"fixture-bootstrap-secret-never-production-32chars",
    ASSETS:{fetch:async()=>new Response("<html>test</html>",{headers:{"Content-Type":"text/html"}})}};
}
const base="https://pollos-karen-test.example";
async function request(environment:any,path:string,options:{method?:string; body?:unknown; cookies?:string; csrf?:string; authorization?:string; idempotency?:string; origin?:string}={}){
 const headers:Record<string,string>={};
 if(options.method&&options.method!=="GET")headers.Origin=options.origin||base;
 if(options.body!==undefined)headers["Content-Type"]="application/json";
 if(options.cookies)headers.Cookie=options.cookies;
 if(options.csrf)headers["X-CSRF-Token"]=options.csrf;
 if(options.authorization)headers.Authorization=options.authorization;
 if(options.idempotency)headers["Idempotency-Key"]=options.idempotency;
 const response=await worker.fetch(new Request(base+path,{method:options.method||"GET",headers,
    body:options.body===undefined?undefined:JSON.stringify(options.body)}),environment);
 const data=await response.json().catch(()=>null);
 return {response,data,status:response.status,cookie:response.headers.get("Set-Cookie")?.split(";")[0]};
}
test("Cloudflare D1: bootstrap, roles, QR, aprobación, cocina, mesa, cobro y antifraude",async()=>{
 const e=env();
 try{
  const boot=await request(e,"/api/bootstrap",{method:"POST",authorization:"Bearer "+e.BOOTSTRAP_SECRET,body:{username:"admin",password:"Clave-Larga-Pruebas-2026!"}});
  assert.equal(boot.status,201,JSON.stringify(boot.data));
  assert.equal((await request(e,"/api/bootstrap",{method:"POST",authorization:"Bearer "+e.BOOTSTRAP_SECRET,body:{username:"admin2",password:"Clave-Larga-Pruebas-2026!"}})).status,409);
  const anonymous=await request(e,"/api/session");
  assert.equal(anonymous.status,200);
  const session={cookies:anonymous.cookie!,csrf:anonymous.data.csrfToken};
  const blocked=await request(e,"/api/admin/pos/orders",{method:"POST",...session,body:{orderType:"window",items:[{menuItemId:"cas-pollo-frito",quantity:1}],authorize:true}});
  assert.equal(blocked.status,403);
  const login=await request(e,"/api/login",{method:"POST",...session,body:{username:"admin",password:"Clave-Larga-Pruebas-2026!"}});
  assert.equal(login.status,200,JSON.stringify(login.data));
  const admin={cookies:session.cookies+"; "+login.cookie,csrf:session.csrf};
  const setup=await request(e,"/api/state",{cookies:admin.cookies});
  assert.equal(setup.status,200);
  const table=setup.data.tables.find((t:any)=>t.number===1);
  assert.ok(table.qrToken);
  const dish=setup.data.menu.find((x:any)=>x.id==="cas-pollo-frito");
  assert.ok(dish);
  const enabled=await request(e,"/api/menu/item",{method:"POST",...admin,body:{...dish,scheduleText:"",available:true}});
  assert.equal(enabled.status,200,JSON.stringify(enabled.data));
  assert.equal((await request(e,"/api/table/"+encodeURIComponent(table.qrToken))).status,200);
  const create=await request(e,"/api/admin/pos/orders",{method:"POST",...admin,body:{
    orderType:"window",items:[{menuItemId:"cas-pollo-frito",quantity:1}],authorize:true
  }});
  assert.equal(create.status,201,JSON.stringify(create.data));
  assert.equal(create.data.serviceFee,0);
  assert.equal(create.data.deliveryFee,0);
  assert.equal(create.data.isPaid,false);
  const first=await request(e,"/api/admin/pos/orders",{method:"POST",...admin,body:{
    orderType:"dine_in",tableId:table.id,items:[{menuItemId:"cas-pollo-frito",quantity:1}],authorize:true
  }});
  const second=await request(e,"/api/admin/pos/orders",{method:"POST",...admin,body:{
    orderType:"dine_in",tableId:table.id,items:[{menuItemId:"cas-pollo-frito",quantity:2}],authorize:true
  }});
  assert.equal(first.status,201,JSON.stringify(first.data));
  assert.equal(second.status,201);
  const lone=await request(e,"/api/admin/checkout",{method:"POST",...admin,body:{
    orderIds:[first.data.id],paymentMethod:"efectivo",cashReceived:10000
  }});
  assert.equal(lone.status,409);
  const sum=first.data.total+second.data.total;
  const paid=await request(e,"/api/admin/checkout",{method:"POST",...admin,body:{
    orderIds:[first.data.id,second.data.id],paymentMethod:"efectivo",cashReceived:10000
  }});
  assert.equal(paid.status,200,JSON.stringify(paid.data));
  assert.equal(paid.data.changeGiven,10000-sum);
  assert.equal((await request(e,"/api/admin/checkout",{method:"POST",...admin,body:{
    orderIds:[first.data.id,second.data.id],paymentMethod:"efectivo",cashReceived:10000
  }})).status,409);
  const manager=await request(e,"/api/users",{method:"POST",...admin,body:{
    username:"kitchen",role:"kitchen",active:true,password:"Cocina-Clave-Pruebas-2026!"
  }});
  assert.equal(manager.status,200,JSON.stringify(manager.data));
  const kitchenInit=await request(e,"/api/session");
  const kitchenLogin=await request(e,"/api/login",{method:"POST",cookies:kitchenInit.cookie,csrf:kitchenInit.data.csrfToken,body:{
    username:"kitchen",password:"Cocina-Clave-Pruebas-2026!"
  }});
  assert.equal(kitchenLogin.status,200,JSON.stringify(kitchenLogin.data));
  const kitchen={cookies:kitchenInit.cookie+"; "+kitchenLogin.cookie,csrf:kitchenInit.data.csrfToken};
  assert.equal((await request(e,"/api/state",{cookies:kitchen.cookies})).data.tables.length,0);
  const done=await request(e,"/api/orders/"+create.data.id,{method:"PATCH",...kitchen,body:{status:"ready"}});
  assert.equal(done.status,200,JSON.stringify(done.data));
  assert.equal((await request(e,"/api/admin/checkout",{method:"POST",...kitchen,body:{
    orderIds:[create.data.id],paymentMethod:"efectivo",cashReceived:5000
  }})).status,403);
  const altered=await request(e,"/api/admin/pos/orders",{method:"POST",...admin,origin:"https://attacker.example",
     body:{orderType:"window",items:[{menuItemId:"cas-pollo-frito",quantity:1}],authorize:true}});
  assert.equal(altered.status,403);
 }finally{e.DB.close();}
});
