import {id,sha,now,error,text,integer,allowedMethod,settings,tableFromToken,menu,orders,safeOrder,staffOrder,kitchenOrder,revision,bump,expressAvailability} from "./core.mjs";
const allStatus=["pending_reception","in_kitchen","ready","delivered","cancelled"];
const payMethods=["efectivo","sinpe","tarjeta"];
const inHours=(schedule,clock=new Date())=>{
  if(!schedule)return true;
  const parts=[...schedule.toLowerCase().matchAll(/(\d{1,2}):(\d{2})\s*(am|pm)/g)];
  if(parts.length!==2)return true;
  const parse=m=>(Number(m[1])%12+(m[3]==="pm"?12:0))*60+Number(m[2]);
  const local=new Intl.DateTimeFormat("en-GB",{timeZone:"America/Costa_Rica",hour:"2-digit",minute:"2-digit",hourCycle:"h23"}).format(clock);
  const [h,m]=local.split(":").map(Number),v=h*60+m,a=parse(parts[0]),b=parse(parts[1]);
  return a<b?(v>=a&&v<b):(v>=a||v<b);
};
export async function validatedItems(env,input) {
  if(!Array.isArray(input)||!input.length||input.length>100)error("Agrega productos al pedido.");
  const products=await menu(env),result=[];
  for(const part of input){
    const product=products.find(p=>p.id===part.menuItemId && p.available && inHours(p.scheduleText));
    if(!product)error("Producto no disponible o fuera de horario.");
    if(!Number.isInteger(part.quantity)||part.quantity<1||part.quantity>99)error("Cantidad inválida.");
    if(product.variants?.length ? !product.variants.includes(part.selectedVariant) : !!part.selectedVariant)error("Variante inválida.");
    result.push({id:id(),menuItemId:product.id,name:product.name,price:product.price,quantity:part.quantity,
      selectedVariant:part.selectedVariant||undefined,notes:text(part.notes,500)});
  }
  return result;
}
const sumItems=items=>items.reduce((n,x)=>n+x.price*x.quantity,0);
async function newNumber(env){
  const row=await env.DB.prepare("UPDATE pk_settings SET json=CAST(CAST(json AS INTEGER)+1 AS TEXT) WHERE key='order_counter' RETURNING json").first();
  if(!row)error("Sistema sin inicializar: administrador pendiente.",503);
  return Number(row.json);
}
async function insertOrder(env,order,receipt=null,idem=null){
  const q=[
    env.DB.prepare("INSERT INTO pk_orders(order_number,id,order_type,table_id,customer_owner_hash,status,is_paid,total,created_at,updated_at,json) VALUES(?,?,?,?,?,?,?,?,?,?,?)")
      .bind(order.orderNumber,order.id,order.orderType,order.tableId||null,order.ownerHash||null,order.status,order.isPaid?1:0,order.total,order.createdAt,order.createdAt,JSON.stringify(order))
  ];
  if(receipt)q.push(env.DB.prepare("INSERT INTO pk_receipts(order_id,mime,image_bytes,created_at) VALUES(?,?,?,?)").bind(order.id,receipt.mime,receipt.bytes,now()));
  if(idem)q.push(env.DB.prepare("INSERT INTO pk_idempotency(owner_hash,request_key,request_hash,order_id) VALUES(?,?,?,?)")
    .bind(idem.owner,idem.key,idem.digest,order.id));
  q.push(bump(env));
  await env.DB.batch(q);
  return staffOrder(order);
}
function receiptData(value){
  if(value==null)return null;
  if(typeof value!=="string" || value.length>1450000)error("Comprobante demasiado grande.");
  const match=/^data:image\/(jpeg|png|webp);base64,([A-Za-z0-9+/=]+)$/.exec(value);
  if(!match)error("Formato de comprobante inválido.");
  let bytes;
  try{const raw=atob(match[2]);bytes=Uint8Array.from(raw,ch=>ch.charCodeAt(0));}catch{error("Comprobante inválido.");}
  if(bytes.length>1000000)error("Comprobante demasiado grande.");
  const mime="image/"+match[1];
  return {mime,bytes};
}
export async function makeCustomerOrder(request,env,b,owner) {
  const requestKey=request.headers.get("Idempotency-Key")||"";
  if(!/^[A-Za-z0-9_-]{20,100}$/.test(requestKey))error("Identificador de envío inválido.");
  const requestHash=await sha(JSON.stringify(b));
  const existing=await env.DB.prepare("SELECT order_id,request_hash FROM pk_idempotency WHERE owner_hash=? AND request_key=?")
    .bind(owner.hash,requestKey).first();
  if(existing){
    if(existing.request_hash!==requestHash)error("El intento de pedido ya fue utilizado.",409);
    const old=await env.DB.prepare("SELECT json FROM pk_orders WHERE id=?").bind(existing.order_id).first();
    if(!old)error("Pedido no disponible.",409);
    return {order:safeOrder(JSON.parse(old.json)),created:false};
  }
  const table=b.tableToken?await tableFromToken(env,b.tableToken):null;
  const orderType=table?"dine_in":"express";
  if(b.orderType!==orderType || (b.tableToken&&!table))error("Modalidad o QR inválido.",403);
  const config=await settings(env);
  if(orderType==="express"&&!expressAvailability(config).open)error("Exprés cerrado. Lunes a viernes, de 7:00 a.m. a 4:00 p.m.",403);
  const items=await validatedItems(env,b.items),subtotal=sumItems(items);
  const serviceFee=table?Math.round(subtotal*.10):0;
  const deliveryFee=table?0:integer(config.expressDeliveryFee||500);
  const total=subtotal+serviceFee+deliveryFee;
  const customerName=text(b.customerName,100,!table);
  const customerPhone=table?undefined:text(b.customerPhone,30,true);
  const deliveryAddress=table?undefined:text(b.deliveryAddress,800,true);
  if(!table&&!/^[+\d ()-]{8,30}$/.test(customerPhone))error("Teléfono inválido.");
  const paymentMethod=table?"pendiente_caja":b.paymentMethod;
  if(!table&&!["sinpe","efectivo"].includes(paymentMethod))error("Forma de pago inválida.");
  const received=b.cashChangeFor==null?undefined:integer(b.cashChangeFor);
  if(!table&&paymentMethod==="efectivo"&&(received==null||received<total))error("Indica el efectivo con que pagarás (igual o mayor al total).");
  const receipt=table?null:receiptData(b.sinpeReceiptImage);
  if(!table&&paymentMethod==="sinpe"&&!receipt)error("Adjunta el comprobante SINPE para verificar.");
  const created=now();
  const order={id:id(),orderNumber:await newNumber(env),orderType,tableId:table?.id,tableName:table?.name,
    customerName,customerPhone,deliveryAddress,withinOneKmConfirmed:b.withinOneKmConfirmed===true,
    items,subtotal,serviceFee,deliveryFee,total,paymentMethod,sinpeReference:text(b.sinpeReference,100),
    sinpeReceiptImage:receipt?"private:d1":undefined,cashChangeFor:received,
    isPaid:false,status:"pending_reception",createdAt:created,coverageStatus:table?undefined:"pending",
    ownerHash:owner.hash,requestHash,requestKey
  };
  try{
    await insertOrder(env,order,receipt,{owner:owner.hash,key:requestKey,digest:requestHash});
  }catch(e){
    const previous=await env.DB.prepare("SELECT order_id,request_hash FROM pk_idempotency WHERE owner_hash=? AND request_key=?").bind(owner.hash,requestKey).first();
    if(previous&&previous.request_hash===requestHash){
      const row=await env.DB.prepare("SELECT json FROM pk_orders WHERE id=?").bind(previous.order_id).first();
      if(row)return {order:safeOrder(JSON.parse(row.json)),created:false};
    }
    throw e;
  }
  return {order:safeOrder(order),created:true};
}
export async function makePOSOrder(env,b,user) {
  const mode=b.orderType;
  if(!["dine_in","window"].includes(mode))error("Modalidad POS no válida.");
  const table=mode==="dine_in"?await env.DB.prepare("SELECT id,number,name,active FROM pk_tables WHERE id=? AND active=1").bind(b.tableId||"").first():null;
  if(mode==="dine_in"&&!table)error("Selecciona una mesa activa.");
  const items=await validatedItems(env,b.items),subtotal=sumItems(items),serviceFee=mode==="dine_in"?Math.round(subtotal*.10):0;
  const created=now(),auth=b.authorize===true;
  const order={id:id(),orderNumber:await newNumber(env),orderType:mode,tableId:table?.id,tableName:table?.name,
    customerName:text(b.customerName,100),items,subtotal,serviceFee,deliveryFee:0,total:subtotal+serviceFee,
    paymentMethod:"pendiente_caja",isPaid:false,status:auth?"in_kitchen":"pending_reception",
    createdAt:created,sentToKitchenAt:auth?created:undefined
  };
  await insertOrder(env,order);
  await env.DB.prepare("INSERT INTO pk_audit(id,actor,event_type,order_id,details,created_at) VALUES(?,?,?,?,?,?)")
    .bind(id(),user.username,auth?"pos_authorized":"pos_created",order.id,mode,created).run();
  return staffOrder(order);
}
export async function orderById(env,orderId){
  const row=await env.DB.prepare("SELECT json FROM pk_orders WHERE id=?").bind(orderId).first();
  return row?JSON.parse(row.json):null;
}
export async function updateOrder(env,orderId,b,user) {
  const o=await orderById(env,orderId);
  if(!o)error("Pedido no encontrado.",404);
  const allowed=user.role==="kitchen"?["status"]:["status","isPaid","paymentMethod","sinpeReference","sinpeVerified","coverageStatus","cancellationReason"];
  if(Object.keys(b).some(k=>!allowed.includes(k)))error("Campo no autorizado.",403);
  if(o.isPaid && (b.isPaid||b.paymentMethod||b.sinpeReference))error("El pedido ya está cobrado.",409);
  const next={...o},t=now();
  if(b.coverageStatus!==undefined){
    if(user.role==="kitchen"||o.orderType!=="express"||b.coverageStatus!=="verified")error("Verificación de cobertura inválida.");
    next.coverageStatus="verified";
  }
  if(b.status&&b.status!==o.status){
    const transitions={pending_reception:["in_kitchen","cancelled"],in_kitchen:["ready","cancelled"],ready:["delivered","cancelled"]};
    if(!transitions[o.status]?.includes(b.status))error("Transición no permitida.",409);
    if(user.role==="kitchen" && !(o.status==="in_kitchen"&&b.status==="ready"))error("Sin permisos de autorización.",403);
    if(b.status==="cancelled"){
      const reason=text(b.cancellationReason,300,true);
      if(reason.length<5||o.isPaid)error("Indica motivo válido; los pagos cobrados requieren conciliación.");
      next.cancellationReason=reason;
    }
    if(b.status==="in_kitchen"&&o.orderType==="express"){
      if(next.coverageStatus!=="verified")error("Verifica primero la cobertura del envío.",409);
      if(o.paymentMethod==="sinpe"&&!o.isPaid&&!b.isPaid)error("Confirma el SINPE antes de enviar a cocina.",409);
    }
    next.status=b.status;
    if(b.status==="in_kitchen")next.sentToKitchenAt=t;
    if(b.status==="ready")next.readyAt=t;
    if(b.status==="delivered")next.deliveredAt=t;
  }
  if(b.paymentMethod){
    allowedMethod(b.paymentMethod);
    next.paymentMethod=b.paymentMethod;
  }
  if(b.sinpeReference!==undefined)next.sinpeReference=text(b.sinpeReference,100);
  let payment=null;
  if(b.isPaid===true&&!o.isPaid){
    allowedMethod(next.paymentMethod);
    if(next.status==="cancelled")error("Pedido cancelado.",409);
    if(next.paymentMethod==="sinpe" && (!b.sinpeVerified || !next.sinpeReference||next.sinpeReference.length<4))error("Verifica el banco e indica referencia SINPE.",409);
    next.isPaid=true;next.paidAt=t;next.paidBy=user.username;
    if(next.paymentMethod==="sinpe")next.sinpeVerified=true;
    payment={id:id(),method:next.paymentMethod,bank:next.paymentMethod==="sinpe"?next.sinpeReference:null,amount:next.total};
  } else if(b.isPaid!==undefined&&b.isPaid!==true)error("No se puede revertir un pago.");
  const q=[];
  if(payment){
    q.push(env.DB.prepare("INSERT INTO pk_payments(id,actor,amount,method,bank_reference,created_at) VALUES(?,?,?,?,?,?)").bind(payment.id,user.username,payment.amount,payment.method,payment.bank,t));
    q.push(env.DB.prepare("INSERT INTO pk_payment_orders(payment_id,order_id) VALUES(?,?)").bind(payment.id,o.id));
  }
  q.push(env.DB.prepare("UPDATE pk_orders SET status=?,is_paid=?,updated_at=?,json=? WHERE id=? AND json=?")
    .bind(next.status,next.isPaid?1:0,t,JSON.stringify(next),o.id,JSON.stringify(o)));
  q.push(env.DB.prepare("INSERT INTO pk_audit(id,actor,event_type,order_id,details,created_at) VALUES(?,?,?,?,?,?)")
    .bind(id(),user.username,payment?"payment":"status",o.id,o.status+" -> "+next.status,t));
  q.push(bump(env));
  const result=await env.DB.batch(q);
  if(!result[payment?2:0]?.meta?.changes) {
    // Presence of another concurrent update: refresh before continuing.
    error("El pedido cambió durante la operación; actualiza la pantalla.",409);
  }
  return user.role==="kitchen"?kitchenOrder(next):staffOrder(next);
}
export async function charge(env,b,user) {
  const ids=b.orderIds;
  if(!Array.isArray(ids)||!ids.length||ids.length>100||new Set(ids).size!==ids.length)error("Tiquetes inválidos.");
  const selected=[];
  for(const orderId of ids){
    const o=await orderById(env,orderId);
    if(!o||o.isPaid||o.status==="cancelled")error("Pedido no disponible para cobro.",409);
    selected.push(o);
  }
  const first=selected[0];
  if(first.orderType==="dine_in"){
    if(selected.some(o=>o.tableId!==first.tableId||o.orderType!=="dine_in"))error("No se pueden mezclar mesas.",409);
    const remaining=await env.DB.prepare("SELECT id FROM pk_orders WHERE table_id=? AND is_paid=0 AND status!='cancelled'").bind(first.tableId).all();
    if(remaining.results.some(o=>!ids.includes(o.id)))error("La mesa tiene otros tiquetes pendientes; selecciona todos.",409);
  } else if(ids.length!==1)error("Ventana y exprés se cobran por tiquete.");
  allowedMethod(b.paymentMethod);
  const total=selected.reduce((sum,o)=>sum+o.total,0);
  const received=b.paymentMethod==="efectivo"?integer(b.cashReceived):undefined;
  if(b.paymentMethod==="efectivo"&&received<total)error("Efectivo insuficiente.");
  const reference=b.paymentMethod==="sinpe"?text(b.sinpeReference,100,true):undefined;
  if(b.paymentMethod==="sinpe"&&(!b.sinpeVerified||reference.length<4))error("Confirma el pago bancario y referencia SINPE.");
  const t=now(),paymentId=id(),change=received==null?undefined:received-total;
  const q=[env.DB.prepare("INSERT INTO pk_payments(id,actor,amount,method,cash_received,change_given,bank_reference,created_at) VALUES(?,?,?,?,?,?,?,?)")
    .bind(paymentId,user.username,total,b.paymentMethod,received??null,change??null,reference||null,t)];
  for(const o of selected){
    q.push(env.DB.prepare("INSERT INTO pk_payment_orders(payment_id,order_id) VALUES(?,?)").bind(paymentId,o.id));
    const next={...o,isPaid:true,paidAt:t,paidBy:user.username,paymentMethod:b.paymentMethod};
    if(reference){next.sinpeReference=reference;next.sinpeVerified=true;}
    q.push(env.DB.prepare("UPDATE pk_orders SET is_paid=1,updated_at=?,json=? WHERE id=? AND is_paid=0").bind(t,JSON.stringify(next),o.id));
    q.push(env.DB.prepare("INSERT INTO pk_audit(id,actor,event_type,order_id,details,created_at) VALUES(?,?,?,?,?,?)").bind(id(),user.username,"checkout",o.id,paymentId,t));
  }
  q.push(bump(env));
  await env.DB.batch(q);
  return {ok:true,transactionId:paymentId,total,cashReceived:received,changeGiven:change,paidOrders:ids};
}
export async function visibleState(env,user,ownerHash,customerScope=false){
  const who=customerScope?null:user;
  const restaurant=await settings(env);
  const staffMode=!!who;
  const available=await menu(env);
  const visibleMenu=staffMode?available:available.map(x=>({...x,available:x.available&&inHours(x.scheduleText)}));
  const tableList=who?.role==="admin"?await (await env.DB.prepare("SELECT id,number,name,active,qr_token AS qrToken FROM pk_tables ORDER BY number").all()).results.map(t=>({...t,capacity:4,active:!!t.active})):[];
  let list=[];
  if(who?.role==="kitchen") {
    list=(await orders(env,"SELECT json FROM pk_orders WHERE status IN ('in_kitchen','ready') ORDER BY order_number DESC LIMIT 200")).map(kitchenOrder);
    return {menu:[],tables:[],orders:list,settings:{restaurantName:restaurant.restaurantName},revision:await revision(env)};
  }
  if(staffMode)list=(await orders(env,"SELECT json FROM pk_orders ORDER BY order_number DESC LIMIT 500")).map(staffOrder);
  else if(ownerHash)list=(await orders(env,"SELECT json FROM pk_orders WHERE customer_owner_hash=? ORDER BY order_number DESC LIMIT 20",[ownerHash])).map(safeOrder);
  return {menu:visibleMenu,tables:tableList,orders:list,settings:restaurant,revision:await revision(env)};
}
