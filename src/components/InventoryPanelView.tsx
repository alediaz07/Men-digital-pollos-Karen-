import React, { useEffect, useState } from "react";
import { api } from "../utils/api";
import type { MenuItem } from "../types";

type Ingredient = { id: string; name: string; unit: "g" | "kg" | "ml" | "l" | "unidad"; quantity: number; minimum: number };
type Recipe = { menuItemId: string; parts: { ingredientId: string; quantity: number }[] };
type Movement = { id: string; ingredientId: string; delta: number; reason: string; createdAt: string; by: string; orderId?: string };
const input = "w-full rounded-lg border border-stone-300 px-3 py-2 text-sm";
const button = "rounded-lg bg-stone-900 text-white font-semibold px-4 py-2 text-sm disabled:opacity-40";

export function InventoryPanelView({ menu }: { menu: MenuItem[] }) {
  const [ingredients, setIngredients] = useState<Ingredient[]>([]);
  const [recipes, setRecipes] = useState<Recipe[]>([]);
  const [movements, setMovements] = useState<Movement[]>([]);
  const [message, setMessage] = useState("");
  const [newIngredient, setNewIngredient] = useState({ name:"", unit:"g" as Ingredient["unit"], quantity:0, minimum:0 });
  const [selectedMenu, setSelectedMenu] = useState(menu[0]?.id || "");
  const [selectedIngredient, setSelectedIngredient] = useState("");
  const [recipeQuantity, setRecipeQuantity] = useState(0);
  const [adjustment, setAdjustment] = useState(0);
  const [reason, setReason] = useState("");
  async function refresh() {
    const data = await api<{ingredients:Ingredient[];recipes:Recipe[];movements:Movement[]}>("/api/admin/inventory");
    setIngredients(data.ingredients); setRecipes(data.recipes); setMovements(data.movements);
  }
  useEffect(() => { void refresh().catch((err:Error) => setMessage(err.message)); }, []);
  async function save(url:string, method:string, data:unknown) {
    try { await api(url,method,data); await refresh(); setMessage("Cambios guardados correctamente."); return true; }
    catch(err) { setMessage(err instanceof Error ? err.message : "No fue posible guardar."); return false; }
  }
  const activeRecipe = recipes.find(r => r.menuItemId === selectedMenu);
  const parts = activeRecipe?.parts || [];
  const selected = ingredients.find(i => i.id === selectedIngredient);
  return <div className="space-y-6">
    <div className="rounded-xl border border-amber-300 bg-amber-50 p-4 text-sm text-amber-950">
      <strong>Importante:</strong> registra las existencias reales y configura las recetas antes de aprobar pedidos.
      Los productos sin receta no descuentan inventario; las recetas existentes bloquean comandas si faltan insumos.
      Utiliza unidades consistentes para cada receta.
    </div>
    {message && <p role="status" className="rounded-lg border bg-white p-3 text-sm">{message}</p>}
    <section className="rounded-xl border bg-white p-5 space-y-3">
      <h2 className="text-lg font-bold">Insumos y existencias</h2>
      <form className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-2" onSubmit={async e=>{e.preventDefault();if(await save("/api/admin/inventory/ingredient","POST",newIngredient))setNewIngredient({name:"",unit:"g",quantity:0,minimum:0});}}>
        <label className="text-xs">Nombre<input className={input} required maxLength={80} value={newIngredient.name} onChange={e=>setNewIngredient(v=>({...v,name:e.target.value}))}/></label>
        <label className="text-xs">Unidad<select className={input} value={newIngredient.unit} onChange={e=>setNewIngredient(v=>({...v,unit:e.target.value as Ingredient["unit"]}))}>{["g","kg","ml","l","unidad"].map(u=><option key={u}>{u}</option>)}</select></label>
        <label className="text-xs">Cantidad inicial<input className={input} type="number" min="0" step="0.001" required value={newIngredient.quantity} onChange={e=>setNewIngredient(v=>({...v,quantity:Number(e.target.value)}))}/></label>
        <label className="text-xs">Stock mínimo<input className={input} type="number" min="0" step="0.001" required value={newIngredient.minimum} onChange={e=>setNewIngredient(v=>({...v,minimum:Number(e.target.value)}))}/></label>
        <button className={button}>Agregar insumo</button>
      </form>
      <div className="overflow-x-auto"><table className="w-full text-sm text-left"><thead><tr className="border-b"><th className="p-2">Insumo</th><th>Disponible</th><th>Mínimo</th><th>Estado</th></tr></thead><tbody>{ingredients.map(i=><tr key={i.id} className="border-b"><td className="p-2">{i.name}</td><td>{i.quantity} {i.unit}</td><td>{i.minimum}</td><td className={i.quantity<=i.minimum?"font-semibold text-red-700":"text-emerald-700"}>{i.quantity<=i.minimum?"Reabastecer":"Correcto"}</td></tr>)}</tbody></table></div>
    </section>
    <section className="rounded-xl border bg-white p-5 space-y-3">
      <h2 className="text-lg font-bold">Recetas por producto</h2>
      <label className="text-sm">Producto<select className={input} value={selectedMenu} onChange={e=>setSelectedMenu(e.target.value)}>{menu.map(m=><option value={m.id} key={m.id}>{m.name}</option>)}</select></label>
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
        <select className={input} aria-label="Insumo de la receta" value={selectedIngredient} onChange={e=>setSelectedIngredient(e.target.value)}><option value="">Selecciona ingrediente</option>{ingredients.map(i=><option value={i.id} key={i.id}>{i.name} ({i.unit})</option>)}</select>
        <input className={input} aria-label="Cantidad por unidad del producto" type="number" min="0.001" step="0.001" value={recipeQuantity} onChange={e=>setRecipeQuantity(Number(e.target.value))}/>
        <button type="button" className={button} disabled={!selectedMenu||!selected||recipeQuantity<=0} onClick={()=>void save(`/api/admin/inventory/recipe/${encodeURIComponent(selectedMenu)}`,"PUT",{parts:[...parts.filter(p=>p.ingredientId!==selectedIngredient),{ingredientId:selectedIngredient,quantity:recipeQuantity}]}).then(ok=>{if(ok)setRecipeQuantity(0);})}>Guardar en receta</button>
      </div>
      {parts.length===0 && <p className="text-sm text-amber-800">Sin receta configurada para este producto.</p>}
      {parts.map(part=><div className="flex justify-between items-center rounded-lg bg-stone-50 p-2 text-sm" key={part.ingredientId}><span>{ingredients.find(i=>i.id===part.ingredientId)?.name || part.ingredientId}: {part.quantity} {ingredients.find(i=>i.id===part.ingredientId)?.unit}</span><button type="button" className="text-red-700 font-semibold" onClick={()=>void save(`/api/admin/inventory/recipe/${encodeURIComponent(selectedMenu)}`,"PUT",{parts:parts.filter(p=>p.ingredientId!==part.ingredientId)})}>Eliminar</button></div>)}
    </section>
    <section className="rounded-xl border bg-white p-5 space-y-3">
      <h2 className="text-lg font-bold">Entradas, mermas y ajustes</h2>
      <form className="grid grid-cols-1 sm:grid-cols-4 gap-2" onSubmit={async e=>{e.preventDefault();if(await save("/api/admin/inventory/adjust","POST",{ingredientId:selectedIngredient,delta:adjustment,reason})) {setAdjustment(0);setReason("");}}}>
        <select required className={input} aria-label="Insumo a ajustar" value={selectedIngredient} onChange={e=>setSelectedIngredient(e.target.value)}><option value="">Selecciona insumo</option>{ingredients.map(i=><option value={i.id} key={i.id}>{i.name}</option>)}</select>
        <input required className={input} type="number" step="0.001" aria-label="Cantidad positiva para entrada, negativa para merma" value={adjustment} onChange={e=>setAdjustment(Number(e.target.value))}/>
        <input required minLength={5} maxLength={300} className={input} placeholder="Motivo del movimiento" value={reason} onChange={e=>setReason(e.target.value)}/>
        <button className={button} disabled={!selectedIngredient||!adjustment||reason.trim().length<5}>Registrar ajuste</button>
      </form>
      <p className="text-xs text-stone-500">Los valores positivos agregan existencia y los negativos registran consumo o merma.</p>
      <div className="max-h-60 overflow-y-auto text-xs">{movements.slice(0,40).map(m=><div className="border-b p-2" key={m.id}>{new Date(m.createdAt).toLocaleString("es-CR")} · {ingredients.find(i=>i.id===m.ingredientId)?.name || m.ingredientId} · {m.delta>0?"+":""}{m.delta} · {m.reason} · {m.by}</div>)}</div>
    </section>
  </div>;
}