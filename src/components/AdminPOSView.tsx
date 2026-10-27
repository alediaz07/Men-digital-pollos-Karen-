import React, { useMemo, useState } from "react";
import { MenuItem, Order, OrderType, RestaurantTable } from "../types";
import { formatColones } from "../utils/format";
type Line = { menuItemId: string; quantity: number; selectedVariant?: string; notes?: string };
export function AdminPOSView({menu,tables,onCreate}:{
  menu:MenuItem[];tables:RestaurantTable[];onCreate:(b:{orderType:OrderType;tableId?:string;items:Line[];authorize:boolean})=>Promise<Order>;
}) {
  const [mode,setMode]=useState<OrderType.DINE_IN|OrderType.WINDOW>(OrderType.WINDOW);
  const [tableId,setTableId]=useState("");
  const [cart,setCart]=useState<Line[]>([]);
  const [category,setCategory]=useState("all");
  const [search,setSearch]=useState("");
  const [busy,setBusy]=useState(false),[message,setMessage]=useState("");
  const available=menu.filter(m=>m.available&&(category==="all"||m.category===category)&&m.name.toLowerCase().includes(search.toLowerCase()));
  const subtotal=useMemo(()=>cart.reduce((sum,c)=>sum+(menu.find(m=>m.id===c.menuItemId)?.price||0)*c.quantity,0),[cart,menu]);
  const service=mode===OrderType.DINE_IN?Math.round(subtotal*.1):0;
  const add=(product:MenuItem)=>{
    let selectedVariant: string|undefined;
    if(product.variants?.length){
      const response=window.prompt(`Opción de ${product.name}: ${product.variants.join(" / ")}`,product.variants[0]);
      if(response===null)return;
      if(!product.variants.includes(response.trim())){setMessage("Selecciona una variante exacta de la lista.");return;}
      selectedVariant=response.trim();
    }
    const notes=window.prompt("Observaciones de cocina (opcional):","")?.trim()||undefined;
    setCart(prev=>{
      const found=prev.findIndex(i=>i.menuItemId===product.id&&i.selectedVariant===selectedVariant&&i.notes===notes);
      if(found<0)return [...prev,{menuItemId:product.id,quantity:1,selectedVariant,notes}];
      return prev.map((item,i)=>i===found?{...item,quantity:item.quantity+1}:item);
    });
  };
  async function send(authorize:boolean) {
    if(!cart.length){setMessage("Selecciona al menos un producto.");return;}
    if(mode===OrderType.DINE_IN&&!tableId){setMessage("Selecciona una mesa activa.");return;}
    setBusy(true);setMessage("");
    try {
      const created=await onCreate({orderType:mode,tableId:mode===OrderType.DINE_IN?tableId:undefined,items:cart,authorize});
      setCart([]);setMessage(`Tiquete #${created.orderNumber} creado ${authorize?"y enviado a cocina":"pendiente de autorizar"} · PAGO PENDIENTE`);
    } catch(e){setMessage(e instanceof Error?e.message:"No se pudo registrar el tiquete.");}
    finally{setBusy(false);}
  }
  return <section className="space-y-4">
    <div className="bg-white border rounded-2xl p-5 space-y-3">
      <h2 className="font-bold text-xl">Punto de venta · Ventana y Mesas</h2>
      <p className="text-sm text-stone-600">Registra el pedido desde esta tablet. Se puede cobrar después de que el cliente termine de comer. Aquí no se descuenta inventario.</p>
      <div className="flex gap-2">
        <button type="button" className={`rounded-lg px-4 py-3 font-bold ${mode===OrderType.WINDOW?"bg-red-700 text-white":"bg-stone-100"}`} onClick={()=>setMode(OrderType.WINDOW)}>Venta por ventana</button>
        <button type="button" className={`rounded-lg px-4 py-3 font-bold ${mode===OrderType.DINE_IN?"bg-red-700 text-white":"bg-stone-100"}`} onClick={()=>setMode(OrderType.DINE_IN)}>Pedido de mesa</button>
      </div>
      {mode===OrderType.DINE_IN&&<label className="block text-sm font-bold">Mesa
        <select value={tableId} onChange={e=>setTableId(e.target.value)} className="block border p-3 rounded-lg w-full mt-1"><option value="">Selecciona una mesa</option>{tables.filter(t=>t.active).map(t=><option key={t.id} value={t.id}>{t.name}</option>)}</select>
      </label>}
      <div className="flex gap-2"><input type="search" value={search} onChange={e=>setSearch(e.target.value)} placeholder="Buscar platillo" aria-label="Buscar platillo" className="border p-3 flex-1 min-w-0 rounded-lg"/><select aria-label="Categoría" value={category} onChange={e=>setCategory(e.target.value)} className="border p-2 rounded-lg"><option value="all">Todos</option>{[...new Set(menu.map(m=>m.category))].map(c=><option key={c} value={c}>{c.replaceAll("_"," ")}</option>)}</select></div>
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-2 max-h-80 overflow-y-auto">
        {available.map(product=><button type="button" key={product.id} onClick={()=>add(product)} className="text-left rounded-xl border p-3 hover:border-red-600 bg-stone-50 flex justify-between items-center gap-3"><span className="font-semibold text-sm">{product.name}</span><strong className="text-red-700 whitespace-nowrap">{formatColones(product.price)} +</strong></button>)}
      </div>
    </div>
    <div className="bg-white border rounded-2xl p-5 space-y-3">
      <h3 className="font-bold text-lg">Tiquete actual · {mode===OrderType.WINDOW?"Ventana":tables.find(t=>t.id===tableId)?.name||"Mesa pendiente"}</h3>
      {!cart.length&&<p className="text-sm text-stone-500">Aún no hay productos en el tiquete.</p>}
      {cart.map((line,i)=>{const product=menu.find(m=>m.id===line.menuItemId);return <div key={i} className="flex justify-between gap-3 items-center border-b py-2 text-sm"><span className="flex-1">{line.quantity} × {product?.name} {line.selectedVariant&&<small className="block">{line.selectedVariant}</small>}{line.notes&&<small className="block">{line.notes}</small>}</span><strong>{formatColones((product?.price||0)*line.quantity)}</strong><div className="flex items-center gap-2"><button type="button" aria-label="Restar" className="border rounded p-2" onClick={()=>setCart(cs=>cs.flatMap((c,j)=>i!==j?[c]:c.quantity>1?[{...c,quantity:c.quantity-1}]:[]))}>−</button><button type="button" aria-label="Sumar" className="border rounded p-2" onClick={()=>setCart(cs=>cs.map((c,j)=>i===j?{...c,quantity:c.quantity+1}:c))}>+</button></div></div>})}
      <div className="text-sm flex justify-between"><span>Subtotal</span><strong>{formatColones(subtotal)}</strong></div>
      {mode===OrderType.DINE_IN&&<div className="text-sm flex justify-between"><span>Servicio 10%</span><strong>{formatColones(service)}</strong></div>}
      <div className="flex justify-between font-bold text-xl"><span>Total pendiente</span><span>{formatColones(subtotal+service)}</span></div>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
        <button disabled={busy||!cart.length} type="button" onClick={()=>void send(false)} className="p-3 rounded-xl bg-stone-800 text-white font-bold disabled:opacity-50">Guardar tiquete para autorizar</button>
        <button disabled={busy||!cart.length} type="button" onClick={()=>void send(true)} className="p-3 rounded-xl bg-red-700 text-white font-bold disabled:opacity-50">Autorizar y enviar a cocina</button>
      </div>
      {message&&<p role="status" className="p-3 rounded-lg bg-amber-50 border text-sm">{message}</p>}
    </div>
  </section>;
}