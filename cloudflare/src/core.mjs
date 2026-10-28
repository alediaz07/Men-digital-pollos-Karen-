import { INITIAL_MENU, INITIAL_SETTINGS, INITIAL_TABLES } from "../../src/data/initialData.ts";
import { expressAvailability } from "../../src/utils/expressHours.ts";

export const now = () => new Date().toISOString();
export const id = () => crypto.randomUUID();
export const randomToken = () => {
  const bytes = crypto.getRandomValues(new Uint8Array(32));
  return Array.from(bytes, x => x.toString(16).padStart(2,"0")).join("");
};
export async function sha(value) {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(String(value)));
  return Array.from(new Uint8Array(buf), x => x.toString(16).padStart(2,"0")).join("");
}
export function error(message, status=400) { const e=new Error(message); e.status=status; throw e; }
export function text(value,max=200,required=false) {
  if (required && (typeof value!=="string" || !value.trim())) error("Campo obligatorio.");
  if (value==null || value==="") return undefined;
  if (typeof value!=="string" || value.length>max) error("Texto inválido.");
  return value.trim();
}
export function integer(value) {
  if (typeof value!=="number" || !Number.isSafeInteger(value) || value<0 || value>10000000) error("Monto inválido.");
  return value;
}
export function allowedMethod(method) {
  if (!["efectivo","sinpe","tarjeta"].includes(method)) error("Método de pago inválido.");
}
export const cookie = (request,name) => {
  const raw=request.headers.get("Cookie")||"";
  const part=raw.split(/;\s*/).find(x=>x.startsWith(name+"="));
  return part ? part.substring(name.length+1) : "";
};
export const setCookie=(name,value,maxAge=86400)=>name+"="+value+"; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age="+maxAge;
export const json=(data,status=200,headers={})=>new Response(JSON.stringify(data),{status,headers:{"Content-Type":"application/json;charset=utf-8","Cache-Control":"no-store","X-Content-Type-Options":"nosniff","Referrer-Policy":"no-referrer",...headers}});
export async function body(request) {
  if (Number(request.headers.get("Content-Length")||"0")>1900000) error("Solicitud demasiado grande.",413);
  let value;
  try {value=await request.json();}catch{error("JSON inválido.");}
  if (!value || typeof value!=="object" || Array.isArray(value)) error("Datos inválidos.");
  return value;
}
export async function passwordHash(password) {
  if(typeof password!=="string" || password.length<12 || password.length>128)error("Contraseña: 12 a 128 caracteres.");
  const salt=randomToken();
  const key=await crypto.subtle.importKey("raw",new TextEncoder().encode(password),"PBKDF2",false,["deriveBits"]);
  const bits=await crypto.subtle.deriveBits({name:"PBKDF2",hash:"SHA-256",iterations:160000,salt:new TextEncoder().encode(salt)},key,256);
  const hash=Array.from(new Uint8Array(bits),b=>b.toString(16).padStart(2,"0")).join("");
  return "pbkdf2-sha256:160000:"+salt+":"+hash;
}
export async function verifyPassword(password,encoded) {
  if(typeof password!=="string" || password.length>128) return false;
  const segments=String(encoded||"").split(":");
  if(segments.length!==4 || segments[0]!=="pbkdf2-sha256") return false;
  const rounds=Number(segments[1]);
  if(rounds<100000 || rounds>300000) return false;
  const key=await crypto.subtle.importKey("raw",new TextEncoder().encode(password),"PBKDF2",false,["deriveBits"]);
  const bits=await crypto.subtle.deriveBits({name:"PBKDF2",hash:"SHA-256",iterations:rounds,salt:new TextEncoder().encode(segments[2])},key,256);
  const actual=new Uint8Array(bits);
  const expected=segments[3];
  let diff=0;
  if(expected.length!==64) return false;
  for(let i=0;i<32;i++) diff |= (actual[i] ^ parseInt(expected.slice(i*2,i*2+2),16));
  return diff===0;
}
export async function client(request,env) {
  const token=cookie(request,"pk_c");
  if(!/^[a-f0-9]{64}$/.test(token))return null;
  const hash=await sha(token);
  const row=await env.DB.prepare("SELECT * FROM pk_sessions WHERE token_hash=? AND client_id IS NOT NULL AND expires_at>?").bind(hash,Date.now()).first();
  return row ? {...row, token, hash, csrf:await sha(token+":pk-csrf:v1")} : null;
}
export async function staff(request,env) {
  const token=cookie(request,"pk_s");
  if(!/^[a-f0-9]{64}$/.test(token))return null;
  const hash=await sha(token);
  const row=await env.DB.prepare("SELECT u.id,u.username,u.role,u.version,u.active FROM pk_sessions s JOIN pk_staff u ON u.id=s.staff_id WHERE s.token_hash=? AND s.expires_at>? AND u.active=1").bind(hash,Date.now()).first();
  return row||null;
}
export async function ensureClient(request,env) {
  const existing=await client(request,env);
  if(existing)return {client:existing,headers:{}};
  const token=randomToken(),hash=await sha(token),csrf=await sha(token+":pk-csrf:v1");
  await env.DB.prepare("INSERT INTO pk_sessions(token_hash,client_id,csrf_hash,expires_at) VALUES (?,?,?,?)").bind(hash,id(),await sha(csrf),Date.now()+90*86400000).run();
  return {client:{token,hash,csrf},headers:{"Set-Cookie":setCookie("pk_c",token,90*86400)}};
}
export async function requireMutation(request,env) {
  const url=new URL(request.url);
  if(request.headers.get("Origin")!==url.origin)error("Origen no autorizado.",403);
  const customer=await client(request,env);
  const csrf=request.headers.get("X-CSRF-Token");
  if(!customer || !csrf || csrf!==customer.csrf)error("Sesión inválida. Recarga la página.",403);
  return customer;
}
export function requireStaff(user,roles=["admin","reception"]) {
  if(!user||!roles.includes(user.role))error("Acceso denegado.",403);
  return user;
}
export async function settings(env) {
  const row=await env.DB.prepare("SELECT json FROM pk_settings WHERE key='restaurant'").first();
  return row?JSON.parse(row.json):{...INITIAL_SETTINGS,expressOpen:"07:00",expressClose:"16:00",expressDays:[1,2,3,4,5],expressTemporarilyClosed:false};
}
export async function tableFromToken(env,token) {
  const hash=await sha(token||"");
  return env.DB.prepare("SELECT id,number,name,active FROM pk_tables WHERE qr_token_hash=? AND active=1").bind(hash).first();
}
export async function menu(env) {
  const rs=await env.DB.prepare("SELECT json FROM pk_menu WHERE active=1 ORDER BY rowid").all();
  return rs.results.map(x=>JSON.parse(x.json));
}
export async function allTables(env) {
  const rs=await env.DB.prepare("SELECT id,number,name,capacity,active,qr_token AS qrToken FROM pk_tables ORDER BY number").all();
  return rs.results.map(t=>({...t,active:!!t.active}));
}
export async function orders(env,sql,params=[]) {
  const rs=await env.DB.prepare(sql).bind(...params).all();
  return rs.results.map(x=>JSON.parse(x.json));
}
export function safeOrder(o) {
  const {ownerHash,requestHash,requestKey,sinpeReceiptImage,...rest}=o;
  return rest;
}
export function staffOrder(o) {
  return {...safeOrder(o),sinpeReceiptImage:o.sinpeReceiptImage?"/api/orders/"+o.id+"/receipt":undefined};
}
export function kitchenOrder(o) {
  return {id:o.id,orderNumber:o.orderNumber,orderType:o.orderType,tableName:o.tableName,
    items:o.items.map(i=>({id:i.id,menuItemId:i.menuItemId,name:i.name,quantity:i.quantity,selectedVariant:i.selectedVariant,notes:i.notes})),
    status:o.status,createdAt:o.createdAt,sentToKitchenAt:o.sentToKitchenAt,readyAt:o.readyAt};
}
export async function revision(env) {
  const r=await env.DB.prepare("SELECT json FROM pk_settings WHERE key='revision'").first();
  return r?Number(r.json):0;
}
export function bump(env) {
  return env.DB.prepare("INSERT INTO pk_settings(key,json) VALUES ('revision','1') ON CONFLICT(key) DO UPDATE SET json=CAST(CAST(json AS INTEGER)+1 AS TEXT)");
}
export async function bootstrap(env,username,password) {
  const existing=await env.DB.prepare("SELECT COUNT(*) AS n FROM pk_staff").first();
  if(existing.n)error("El administrador inicial ya fue configurado.",409);
  if(!/^[a-z0-9._-]{3,80}$/.test(username))error("Usuario inválido.");
  const ph=await passwordHash(password),adminId=id();
  const all=INITIAL_TABLES.map(t=>({...t,qrToken:randomToken()}));
  const entries=[
    env.DB.prepare("INSERT INTO pk_staff(id,username,password_hash,role,active,version) VALUES (?,?,?,'admin',1,1)").bind(adminId,username,ph),
    env.DB.prepare("INSERT INTO pk_settings(key,json) VALUES ('restaurant',?)").bind(JSON.stringify(await settings(env))),
    env.DB.prepare("INSERT INTO pk_settings(key,json) VALUES ('revision','1')"),
    env.DB.prepare("INSERT INTO pk_settings(key,json) VALUES ('order_counter','0')")
  ];
  for(const p of INITIAL_MENU)entries.push(env.DB.prepare("INSERT INTO pk_menu(id,json) VALUES(?,?)").bind(p.id,JSON.stringify(p)));
  for(const t of all)entries.push(env.DB.prepare("INSERT INTO pk_tables(id,number,name,capacity,qr_token_hash,qr_token) VALUES(?,?,?,?,?,?)").bind(t.id,t.number,t.name,t.capacity||4,await sha(t.qrToken),t.qrToken));
  await env.DB.batch(entries);
  return {ok:true,user:username,seededMenu:INITIAL_MENU.length,seededTables:all.length};
}
export {expressAvailability};
