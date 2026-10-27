import React, { useMemo, useState } from "react";
import { Order, OrderStatus, OrderType, PaymentMethod } from "../types";
import { formatColones } from "../utils/format";
type Checkout = {orderIds:string[];paymentMethod:PaymentMethod;cashReceived?:number;sinpeReference?:string;sinpeVerified?:boolean};
type Receipt = {total:number;cashReceived?:number;changeGiven?:number;transactionId:string};
export function AdminCashierView({orders,onCheckout}:{orders:Order[];onCheckout:(b:Checkout)=>Promise<Receipt>}) {
  const open=orders.filter(o=>!o.isPaid && o.status!==OrderStatus.CANCELLED);
  const groups=useMemo(()=>{
    const map=new Map<string,Order[]>();
    open.forEach(order=>{
      const key=order.orderType===OrderType.DINE_IN && order.tableId ? "table:"+order.tableId : "order:"+order.id;
      map.set(key,[...(map.get(key)||[]),order]);
    });
    return [...map.entries()].map(([key,items])=>({key,items,total:items.reduce((v,o)=>v+o.total,0),label:items[0].orderType===OrderType.DINE_IN ? items[0].tableName||"Mesa" : items[0].orderType===OrderType.EXPRESS ? `Exprés #${items[0].orderNumber}` : `Ventana #${items[0].orderNumber}`}));
  },[orders]);
  const [selected,setSelected]=useState<string|null>(null);
  const [method,setMethod]=useState<PaymentMethod>(PaymentMethod.EFECTIVO);
  const [received,setReceived]=useState("");
  const [sinpeReference,setSinpeReference]=useState("");
  const [checkedBank,setCheckedBank]=useState(false);
  const [busy,setBusy]=useState(false);
  const [message,setMessage]=useState("");
  const [receipt,setReceipt]=useState<Receipt|null>(null);
  const group=groups.find(g=>g.key===selected);
  async function charge(e:React.FormEvent) {
    e.preventDefault();if(!group)return;
    if(method===PaymentMethod.EFECTIVO && (!received || !Number.isInteger(Number(received)) || Number(received)<group.total)){setMessage("El efectivo recibido debe ser igual o mayor al total.");return;}
    if(method===PaymentMethod.SINPE && (!checkedBank || sinpeReference.trim().length<4)){setMessage("Confirma el abono bancario e introduce la referencia SINPE.");return;}
    setBusy(true);setMessage("");
    try {
      const out=await onCheckout({orderIds:group.items.map(o=>o.id),paymentMethod:method,cashReceived:method===PaymentMethod.EFECTIVO?Number(received):undefined,sinpeReference:method===PaymentMethod.SINPE?sinpeReference.trim():undefined,sinpeVerified:method===PaymentMethod.SINPE?checkedBank:undefined});
      setReceipt(out);setSelected(null);setReceived("");setSinpeReference("");setCheckedBank(false);
      setMessage(`Cobro registrado: ${formatColones(out.total)}. ${out.changeGiven!=null?`Vuelto: ${formatColones(out.changeGiven)}`:""}`);
    } catch(err){setMessage(err instanceof Error?err.message:"No se pudo guardar el cobro.");}finally{setBusy(false);}
  }
  return <section className="space-y-4">
    <div className="rounded-2xl border bg-white p-5">
      <h2 className="text-xl font-bold">Caja · Cobros pendientes</h2>
      <p className="text-sm text-stone-600 mt-1">Los tiquetes de una misma mesa se cobran juntos. No hay conexión a datáfono: se registra el dinero realmente recibido.</p>
    </div>
    {message&&<p role="status" className="bg-emerald-50 border rounded-lg p-3">{message}</p>}
    {receipt&&<div className="border bg-white rounded-lg p-4"><strong>Último cobro: {formatColones(receipt.total)}</strong>{receipt.cashReceived!=null&&<p>Efectivo recibido: {formatColones(receipt.cashReceived)} · Vuelto: {formatColones(receipt.changeGiven||0)}</p>}<button className="underline text-sm" onClick={()=>window.print()}>Imprimir resumen</button></div>}
    <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
      {!groups.length&&<p className="text-stone-500">No hay cobros pendientes.</p>}
      {groups.map(g=><button key={g.key} onClick={()=>{setSelected(g.key);setReceipt(null);setMessage("");setMethod(PaymentMethod.EFECTIVO);setReceived("");}} className="border rounded-xl bg-white text-left p-4 hover:border-red-600 space-y-2">
        <h3 className="font-bold text-lg">{g.label}</h3>
        <p className="text-sm text-stone-600">{g.items.length} tiquete(s) · {g.items.flatMap(o=>o.items).reduce((n,i)=>n+i.quantity,0)} productos</p>
        <strong className="text-red-700 text-xl">{formatColones(g.total)}</strong>
        <p className="text-sm font-semibold">Ver cuenta y cobrar</p>
      </button>)}
    </div>
    {group&&<div className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-3">
      <form onSubmit={charge} className="bg-white rounded-2xl max-w-lg w-full p-5 space-y-3 max-h-[94vh] overflow-y-auto">
        <div className="flex items-center justify-between"><h2 className="font-bold text-xl">Cobrar · {group.label}</h2><button type="button" onClick={()=>setSelected(null)} className="border rounded-lg p-2">Cerrar</button></div>
        <div className="border rounded-lg p-3 space-y-2">
          {group.items.map(order=><div className="border-b pb-2" key={order.id}><p className="font-semibold text-sm">Tiquete #{order.orderNumber} · {order.status===OrderStatus.READY?"Listo":order.status===OrderStatus.DELIVERED?"Entregado":"En proceso"}</p>
          {order.items.map((item,i)=><div key={i} className="text-sm flex justify-between gap-3"><span>{item.quantity} × {item.name}</span><span>{formatColones(item.price*item.quantity)}</span></div>)}</div>)}
          <div className="flex justify-between text-sm"><span>Subtotal</span><strong>{formatColones(group.items.reduce((n,o)=>n+o.subtotal,0))}</strong></div>
          {group.items.some(o=>o.serviceFee>0)&&<div className="flex justify-between text-sm"><span>Servicio 10%</span><strong>{formatColones(group.items.reduce((n,o)=>n+o.serviceFee,0))}</strong></div>}
          {group.items.some(o=>o.deliveryFee>0)&&<div className="flex justify-between text-sm"><span>Envío exprés</span><strong>{formatColones(group.items.reduce((n,o)=>n+o.deliveryFee,0))}</strong></div>}
          <div className="flex justify-between font-bold text-xl"><span>TOTAL</span><span>{formatColones(group.total)}</span></div>
        </div>
        <div className="flex gap-2 flex-wrap">{[PaymentMethod.EFECTIVO,PaymentMethod.SINPE,PaymentMethod.TARJETA].map(m=><button type="button" key={m} onClick={()=>setMethod(m)} className={`rounded-lg border px-3 py-2 font-semibold ${method===m?"bg-red-700 text-white":"bg-white"}`}>{m===PaymentMethod.EFECTIVO?"Efectivo":m===PaymentMethod.SINPE?"SINPE":"Tarjeta"}</button>)}</div>
        {method===PaymentMethod.EFECTIVO&&<label className="block text-sm font-bold">¿Con cuánto está pagando?
          <input className="block w-full border p-3 rounded-lg mt-1" required min={group.total} step="1" type="number" value={received} onChange={e=>setReceived(e.target.value)}/>
          {received&&Number(received)>=group.total&&<p className="text-green-800 font-bold text-lg mt-2">Vuelto a entregar: {formatColones(Number(received)-group.total)}</p>}
        </label>}
        {method===PaymentMethod.SINPE&&<div className="space-y-2"><label className="text-sm font-bold">Referencia bancaria verificada<input className="w-full border p-3 rounded-lg" minLength={4} required value={sinpeReference} onChange={e=>setSinpeReference(e.target.value)}/></label><label className="flex gap-2"><input type="checkbox" checked={checkedBank} onChange={e=>setCheckedBank(e.target.checked)}/> Verifiqué el abono en la cuenta bancaria</label></div>}
        <button disabled={busy} className="w-full p-4 rounded-xl font-bold bg-emerald-700 text-white disabled:opacity-50">Registrar pago de {formatColones(group.total)}</button>
      </form>
    </div>}
  </section>;
}