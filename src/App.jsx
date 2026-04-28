import { useState, useEffect } from "react"
import { collection, onSnapshot, addDoc, updateDoc, deleteDoc, doc } from "firebase/firestore"
import { db } from "./lib/firebase"
import { Plus, Pencil, Trash2, ExternalLink, Package, Award, Plane, Ship } from "lucide-react"
import { Button } from "./components/ui/button"
import { Card, CardHeader, CardTitle, CardContent } from "./components/ui/card"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "./components/ui/dialog"
import { Input } from "./components/ui/input"
import { Label } from "./components/ui/label"
import { Badge } from "./components/ui/badge"

const EMPTY_FORM = {
  name: "",
  photo: "",
  link: "",
  wholesalePrice: "",
  quantity: "",
  weight: "",
  lossPercent: "",
  retailPrice: "",
  retailPriceCurrency: "USD",
  airUSA: "",
  airPY: "",
  seaUSA: "",
  seaPY: "",
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function calcMetrics(p, mode, qtyOverride) {
  const price = parseFloat(p.wholesalePrice) || 0
  const qty = qtyOverride !== undefined ? qtyOverride : (parseFloat(p.quantity) || 0)
  const loss = parseFloat(p.lossPercent) || 0
  const shUSA = mode === "air" ? (parseFloat(p.airUSA) || 0) : (parseFloat(p.seaUSA) || 0)
  const shPY  = mode === "air" ? (parseFloat(p.airPY)  || 0) : (parseFloat(p.seaPY)  || 0)

  const productCost = price * qty
  const totalShipping = shUSA + shPY
  const totalInvested = productCost + totalShipping
  const effectiveUnits = qty * (1 - loss / 100)
  const costPerUnit = effectiveUnits > 0 ? totalInvested / effectiveUnits : 0
  const shippingShare = totalInvested > 0 ? (totalShipping / totalInvested) * 100 : 0
  const lossImpact = (qty - effectiveUnits) * price

  return { productCost, totalShipping, totalInvested, effectiveUnits, costPerUnit, shippingShare, lossImpact }
}

function retailPriceUSD(p, tcg) {
  const val = parseFloat(p.retailPrice) || 0
  if (val <= 0) return 0
  return p.retailPriceCurrency === "GS" ? val / (tcg || 1) : val
}

function calcMargin(costPerUnit, sellUSD) {
  if (sellUSD <= 0 || costPerUnit <= 0) return null
  const marginPerUnit = sellUSD - costPerUnit
  const marginPct = (marginPerUnit / sellUSD) * 100
  return { sellUSD, marginPerUnit, marginPct }
}

function hasMode(p, mode) {
  if (mode === "air") return (parseFloat(p.airUSA) || 0) > 0 || (parseFloat(p.airPY) || 0) > 0
  return (parseFloat(p.seaUSA) || 0) > 0 || (parseFloat(p.seaPY) || 0) > 0
}

function fmt(n, decimals = 2) {
  return n.toLocaleString("en-US", { minimumFractionDigits: decimals, maximumFractionDigits: decimals })
}

function fmtGs(usd, tcg) {
  if (!tcg || tcg <= 0) return null
  const gs = usd * tcg
  return gs.toLocaleString("es-PY", { maximumFractionDigits: 0 }) + " Gs"
}

// ─── Tipo de cambio ───────────────────────────────────────────────────────────

function ExchangeRateBar({ tcg, onChange }) {
  return (
    <div className="flex items-center gap-2 bg-muted/60 border rounded-lg px-4 py-2.5">
      <span className="text-sm text-muted-foreground whitespace-nowrap">Tipo de cambio</span>
      <span className="text-sm text-muted-foreground">1 USD =</span>
      <Input
        type="number"
        min="1"
        step="1"
        value={tcg}
        onChange={(e) => onChange(e.target.value)}
        className="w-36 h-7 text-sm font-semibold"
      />
      <span className="text-sm text-muted-foreground">Gs</span>
    </div>
  )
}

// ─── Form ────────────────────────────────────────────────────────────────────

function ShippingSection({ title, icon, fields, form, set }) {
  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2">
        {icon}
        <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">{title}</p>
      </div>
      <div className="grid grid-cols-2 gap-4">
        {fields.map(({ id, label }) => (
          <div key={id} className="space-y-1.5">
            <Label htmlFor={id}>{label}</Label>
            <Input id={id} type="number" min="0" step="0.01" placeholder="0.00" value={form[id]} onChange={set(id)} />
          </div>
        ))}
      </div>
    </div>
  )
}

function ProductForm({ initial = EMPTY_FORM, onSave, onCancel, tcg }) {
  const [form, setForm] = useState({ ...EMPTY_FORM, ...initial })

  function set(field) {
    return (e) => setForm((f) => ({ ...f, [field]: e.target.value }))
  }

  function toggleCurrency() {
    setForm((f) => {
      const next = f.retailPriceCurrency === "USD" ? "GS" : "USD"
      const val = parseFloat(f.retailPrice) || 0
      if (!val || !tcg) return { ...f, retailPriceCurrency: next, retailPrice: "" }
      const converted = next === "GS" ? Math.round(val * tcg) : +(val / tcg).toFixed(2)
      return { ...f, retailPriceCurrency: next, retailPrice: String(converted) }
    })
  }

  function handleSubmit(e) {
    e.preventDefault()
    if (!form.name.trim()) return
    onSave(form)
  }

  const isGs = form.retailPriceCurrency === "GS"

  return (
    <form onSubmit={handleSubmit} className="space-y-5">
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div className="sm:col-span-2 space-y-1.5">
          <Label htmlFor="name">Nombre del producto *</Label>
          <Input id="name" placeholder="Ej: Auriculares BT5.0" value={form.name} onChange={set("name")} required />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="photo">URL de foto</Label>
          <Input id="photo" placeholder="https://..." value={form.photo} onChange={set("photo")} />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="link">Link del producto</Label>
          <Input id="link" placeholder="https://..." value={form.link} onChange={set("link")} />
        </div>
      </div>

      <div className="border-t pt-4">
        <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-3">Producto</p>
        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-1.5">
            <Label htmlFor="wholesalePrice">Precio mayorista (USD/u)</Label>
            <Input id="wholesalePrice" type="number" min="0" step="0.01" placeholder="0.00" value={form.wholesalePrice} onChange={set("wholesalePrice")} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="quantity">Cantidad de compra (u)</Label>
            <Input id="quantity" type="number" min="0" step="1" placeholder="0" value={form.quantity} onChange={set("quantity")} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="weight">Peso mercadería (kg)</Label>
            <Input id="weight" type="number" min="0" step="0.01" placeholder="0.00" value={form.weight} onChange={set("weight")} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="lossPercent">% Merma / Regalos / Dev.</Label>
            <Input id="lossPercent" type="number" min="0" max="100" step="0.1" placeholder="0" value={form.lossPercent} onChange={set("lossPercent")} />
          </div>

          {/* Precio de venta con toggle de moneda */}
          <div className="sm:col-span-2 space-y-1.5">
            <Label htmlFor="retailPrice">Precio de venta al público</Label>
            <div className="flex gap-2">
              <Input
                id="retailPrice"
                type="number"
                min="0"
                step={isGs ? "1" : "0.01"}
                placeholder={isGs ? "0" : "0.00"}
                value={form.retailPrice}
                onChange={set("retailPrice")}
                className="flex-1"
              />
              <button
                type="button"
                onClick={toggleCurrency}
                className="shrink-0 h-9 px-3 rounded-md border text-sm font-semibold transition-colors hover:bg-accent"
              >
                {isGs ? "Gs" : "USD"}
              </button>
            </div>
            {form.retailPrice && tcg > 0 && (
              <p className="text-xs text-muted-foreground">
                {isGs
                  ? `≈ $${fmt(parseFloat(form.retailPrice) / tcg)} USD`
                  : `≈ ${Math.round(parseFloat(form.retailPrice) * tcg).toLocaleString("es-PY")} Gs`}
              </p>
            )}
          </div>
        </div>
      </div>

      <div className="border-t pt-4 space-y-4">
        <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Envíos (completá los que apliquen)</p>
        <ShippingSection
          title="Aéreo"
          icon={<Plane className="h-3.5 w-3.5 text-sky-500" />}
          fields={[{ id: "airUSA", label: "Aéreo USA (USD)" }, { id: "airPY", label: "Aéreo PY (USD)" }]}
          form={form} set={set}
        />
        <ShippingSection
          title="Marítimo"
          icon={<Ship className="h-3.5 w-3.5 text-blue-700" />}
          fields={[{ id: "seaUSA", label: "Marítimo USA (USD)" }, { id: "seaPY", label: "Marítimo PY (USD)" }]}
          form={form} set={set}
        />
      </div>

      <div className="flex justify-end gap-2 pt-2">
        <Button type="button" variant="outline" onClick={onCancel}>Cancelar</Button>
        <Button type="submit">Guardar</Button>
      </div>
    </form>
  )
}

// ─── Card ─────────────────────────────────────────────────────────────────────

function InsightRow({ label, value, sub, highlight, warn, good }) {
  return (
    <div className="flex justify-between items-start">
      <span className={`text-sm ${highlight ? "font-medium text-foreground" : "text-muted-foreground"}`}>{label}</span>
      <div className="text-right">
        <span className={`text-sm font-semibold ${good ? "text-green-700" : highlight ? "text-foreground" : warn ? "text-amber-600" : "text-muted-foreground"}`}>{value}</span>
        {sub && <p className="text-xs text-muted-foreground leading-none mt-0.5">{sub}</p>}
      </div>
    </div>
  )
}

function ShippingInsights({ product, mode, bestCpu, qty, tcg }) {
  const m = calcMetrics(product, mode, qty)
  const isBest = bestCpu !== null && m.costPerUnit > 0 && m.costPerUnit === bestCpu
  const sellUSD = retailPriceUSD(product, tcg)
  const margin = calcMargin(m.costPerUnit, sellUSD)
  const Icon = mode === "air" ? Plane : Ship
  const label = mode === "air" ? "Aéreo" : "Marítimo"
  const color = mode === "air" ? "text-sky-600" : "text-blue-800"
  const bg = mode === "air" ? "bg-sky-50 border-sky-100" : "bg-blue-50 border-blue-100"

  return (
    <div className={`rounded-lg border p-3 space-y-1.5 ${bg}`}>
      <div className="flex items-center justify-between mb-1">
        <div className={`flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide ${color}`}>
          <Icon className="h-3.5 w-3.5" />{label}
        </div>
        {isBest && <Badge variant="success" className="text-xs gap-1 py-0"><Award className="h-3 w-3" />Mejor opción</Badge>}
      </div>
      <InsightRow label="Total invertido" value={`$${fmt(m.totalInvested)}`} sub={fmtGs(m.totalInvested, tcg)} highlight />
      <InsightRow label="Costo/u efectiva" value={`$${fmt(m.costPerUnit)}`} sub={fmtGs(m.costPerUnit, tcg)} highlight />
      <InsightRow label="% Envío" value={`${fmt(m.shippingShare, 1)}%`} warn={m.shippingShare > 40} />

      {margin && (
        <>
          <div className="border-t border-black/5 my-1" />
          <InsightRow
            label="Margen/u"
            value={`$${fmt(margin.marginPerUnit)}`}
            sub={fmtGs(margin.marginPerUnit, tcg)}
            good={margin.marginPerUnit > 0} warn={margin.marginPerUnit <= 0}
          />
          <InsightRow label="Margen %" value={`${fmt(margin.marginPct, 1)}%`} good={margin.marginPct > 30} warn={margin.marginPct <= 0} />
          <InsightRow
            label="Ganancia total"
            value={`$${fmt(margin.marginPerUnit * m.effectiveUnits)}`}
            sub={fmtGs(margin.marginPerUnit * m.effectiveUnits, tcg)}
            good={margin.marginPerUnit > 0} warn={margin.marginPerUnit <= 0}
          />
          <InsightRow
            label="ROI"
            value={`${fmt((margin.marginPerUnit * m.effectiveUnits) / m.totalInvested * 100, 1)}%`}
            good={margin.marginPerUnit > 0} warn={margin.marginPerUnit <= 0}
          />
        </>
      )}
    </div>
  )
}

function ProductCard({ product, bestCpu, onEdit, onDelete, tcg }) {
  const originalQty = parseFloat(product.quantity) || 0
  const [qty, setQty] = useState(originalQty)

  useEffect(() => { setQty(parseFloat(product.quantity) || 0) }, [product.quantity])

  const showAir = hasMode(product, "air")
  const showSea = hasMode(product, "sea")
  const loss = parseFloat(product.lossPercent) || 0
  const effectiveUnits = qty * (1 - loss / 100)
  const lossImpact = (qty - effectiveUnits) * (parseFloat(product.wholesalePrice) || 0)
  const sliderMin = Math.max(1, Math.round(originalQty * 0.1))
  const sliderMax = Math.max(originalQty * 3, 10)
  const sellUSD = retailPriceUSD(product, tcg)
  const isGs = product.retailPriceCurrency === "GS"

  return (
    <Card className="flex flex-col overflow-hidden">
      <div className="relative aspect-video bg-muted flex items-center justify-center overflow-hidden">
        {product.photo
          ? <img src={product.photo} alt={product.name} className="w-full h-full object-cover" onError={(e) => { e.target.style.display = "none" }} />
          : <Package className="h-12 w-12 text-muted-foreground/30" />}
        <div className="absolute top-2 right-2 flex gap-1">
          <Button size="icon" variant="secondary" className="h-7 w-7" onClick={onEdit}><Pencil className="h-3 w-3" /></Button>
          <Button size="icon" variant="secondary" className="h-7 w-7 text-destructive hover:text-destructive" onClick={onDelete}><Trash2 className="h-3 w-3" /></Button>
        </div>
      </div>

      <CardHeader className="pb-2">
        <div className="flex items-start justify-between gap-2">
          <CardTitle className="text-base leading-tight">{product.name}</CardTitle>
          {product.link && (
            <a href={product.link} target="_blank" rel="noopener noreferrer" className="shrink-0 text-muted-foreground hover:text-foreground mt-0.5">
              <ExternalLink className="h-4 w-4" />
            </a>
          )}
        </div>
      </CardHeader>

      <CardContent className="flex-1 space-y-4">
        <div className="grid grid-cols-2 gap-x-4 gap-y-1.5 text-sm">
          <span className="text-muted-foreground">Precio mayorista</span>
          <div className="text-right">
            <span className="font-medium">${fmt(parseFloat(product.wholesalePrice) || 0)}/u</span>
            {tcg > 0 && <p className="text-xs text-muted-foreground">{fmtGs(parseFloat(product.wholesalePrice) || 0, tcg)}/u</p>}
          </div>

          {product.retailPrice && (
            <>
              <span className="text-muted-foreground">Precio de venta</span>
              <div className="text-right">
                <span className="font-medium">
                  {isGs
                    ? `${Math.round(parseFloat(product.retailPrice)).toLocaleString("es-PY")} Gs/u`
                    : `$${fmt(parseFloat(product.retailPrice))}/u`}
                </span>
                {tcg > 0 && (
                  <p className="text-xs text-muted-foreground">
                    {isGs ? `≈ $${fmt(sellUSD)}/u` : fmtGs(sellUSD, tcg) + "/u"}
                  </p>
                )}
              </div>
            </>
          )}

          <span className="text-muted-foreground">Peso</span>
          <span className="font-medium text-right">{fmt(parseFloat(product.weight) || 0)} kg</span>
          <span className="text-muted-foreground">Merma / Dev.</span>
          <span className="font-medium text-right">{product.lossPercent || 0}%</span>
        </div>

        {/* Slider de cantidad */}
        {originalQty > 0 && (
          <div className="space-y-2 border rounded-lg p-3 bg-muted/40">
            <div className="flex items-center justify-between text-sm">
              <span className="text-muted-foreground font-medium">Cantidad simulada</span>
              <div className="flex items-center gap-2">
                <span className="font-semibold tabular-nums">{Math.round(qty)} u</span>
                {Math.round(qty) !== originalQty && (
                  <button onClick={() => setQty(originalQty)} className="text-xs text-muted-foreground underline hover:text-foreground">reset</button>
                )}
              </div>
            </div>
            <input
              type="range"
              min={sliderMin} max={sliderMax}
              step={Math.max(1, Math.round(originalQty * 0.01))}
              value={qty}
              onChange={(e) => setQty(Number(e.target.value))}
              className="w-full accent-foreground"
            />
            <div className="flex justify-between text-xs text-muted-foreground">
              <span>{sliderMin} u</span>
              <span className="text-muted-foreground/60">base: {originalQty} u</span>
              <span>{sliderMax} u</span>
            </div>
            <div className="flex justify-between text-xs pt-0.5">
              <span className="text-muted-foreground">U. efectivas</span>
              <span className="font-medium">{fmt(effectiveUnits, 0)} u</span>
            </div>
            {lossImpact > 0 && (
              <div className="flex justify-between text-xs">
                <span className="text-muted-foreground">Pérdida por merma</span>
                <div className="text-right">
                  <span className="font-medium text-amber-600">${fmt(lossImpact)}</span>
                  {tcg > 0 && <p className="text-xs text-amber-500">{fmtGs(lossImpact, tcg)}</p>}
                </div>
              </div>
            )}
          </div>
        )}

        {(showAir || showSea) && (
          <div className="space-y-2">
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Por modalidad de envío</p>
            {showAir && <ShippingInsights product={product} mode="air" bestCpu={bestCpu} qty={qty} tcg={tcg} />}
            {showSea && <ShippingInsights product={product} mode="sea" bestCpu={bestCpu} qty={qty} tcg={tcg} />}
          </div>
        )}

        {!showAir && !showSea && (
          <p className="text-xs text-muted-foreground italic">Sin datos de envío cargados.</p>
        )}
      </CardContent>
    </Card>
  )
}

// ─── Comparison ───────────────────────────────────────────────────────────────

function ComparisonPanel({ products, tcg }) {
  if (products.length < 2) return null

  const rows = []
  for (const p of products) {
    for (const mode of ["air", "sea"]) {
      if (!hasMode(p, mode)) continue
      const m = calcMetrics(p, mode)
      const sellUSD = retailPriceUSD(p, tcg)
      const margin = calcMargin(m.costPerUnit, sellUSD)
      rows.push({ name: p.name, mode, ...m, margin })
    }
  }
  if (rows.length < 2) return null

  const minCpu = Math.min(...rows.filter((r) => r.costPerUnit > 0).map((r) => r.costPerUnit))
  const maxCpu = Math.max(...rows.map((r) => r.costPerUnit))
  const hasMargins = rows.some((r) => r.margin)

  const ModeIcon = ({ mode }) =>
    mode === "air"
      ? <Plane className="h-3.5 w-3.5 inline mr-1 text-sky-500" />
      : <Ship className="h-3.5 w-3.5 inline mr-1 text-blue-700" />

  return (
    <div className="mt-8 rounded-xl border bg-card p-6">
      <h2 className="text-base font-semibold mb-4">Comparativa general</h2>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b">
              <th className="text-left pb-2 font-medium text-muted-foreground pr-4">Producto</th>
              <th className="text-left pb-2 font-medium text-muted-foreground px-3">Envío</th>
              <th className="text-right pb-2 font-medium text-muted-foreground px-3">Total invertido</th>
              <th className="text-right pb-2 font-medium text-muted-foreground px-3">U. efectivas</th>
              <th className="text-right pb-2 font-medium text-muted-foreground px-3">Costo/u</th>
              {hasMargins && <>
                <th className="text-right pb-2 font-medium text-muted-foreground px-3">Margen %</th>
                <th className="text-right pb-2 font-medium text-muted-foreground px-3">Ganancia total</th>
                <th className="text-right pb-2 font-medium text-muted-foreground pl-3">ROI</th>
              </>}
            </tr>
          </thead>
          <tbody>
            {rows.map((r, i) => {
              const isBest = r.costPerUnit > 0 && r.costPerUnit === minCpu
              const profit = r.margin ? r.margin.marginPerUnit * r.effectiveUnits : null
              const roi = r.margin && r.totalInvested > 0 ? (profit / r.totalInvested) * 100 : null
              return (
                <tr key={i} className={`border-b last:border-0 ${isBest ? "bg-green-50" : ""}`}>
                  <td className="py-2 font-medium pr-4">
                    {r.name}
                    {isBest && <span className="ml-2 text-xs text-green-700 font-normal">★ menor costo</span>}
                  </td>
                  <td className="py-2 px-3 whitespace-nowrap"><ModeIcon mode={r.mode} />{r.mode === "air" ? "Aéreo" : "Marítimo"}</td>
                  <td className="py-2 text-right px-3">
                    <div>${fmt(r.totalInvested)}</div>
                    {tcg > 0 && <div className="text-xs text-muted-foreground">{fmtGs(r.totalInvested, tcg)}</div>}
                  </td>
                  <td className="py-2 text-right px-3">{fmt(r.effectiveUnits, 0)}</td>
                  <td className={`py-2 text-right px-3 font-semibold ${isBest ? "text-green-700" : ""}`}>
                    <div>${fmt(r.costPerUnit)}</div>
                    {tcg > 0 && <div className="text-xs font-normal text-muted-foreground">{fmtGs(r.costPerUnit, tcg)}</div>}
                  </td>
                  {hasMargins && <>
                    <td className={`py-2 text-right px-3 ${r.margin ? (r.margin.marginPct > 30 ? "text-green-700 font-semibold" : r.margin.marginPct <= 0 ? "text-red-600" : "") : "text-muted-foreground"}`}>
                      {r.margin ? `${fmt(r.margin.marginPct, 1)}%` : "—"}
                    </td>
                    <td className={`py-2 text-right px-3 ${profit !== null ? (profit > 0 ? "text-green-700 font-semibold" : "text-red-600") : "text-muted-foreground"}`}>
                      {profit !== null ? (
                        <div>
                          <div>${fmt(profit)}</div>
                          {tcg > 0 && <div className="text-xs font-normal text-muted-foreground">{fmtGs(profit, tcg)}</div>}
                        </div>
                      ) : "—"}
                    </td>
                    <td className={`py-2 text-right pl-3 ${roi !== null ? (roi > 0 ? "text-green-700 font-semibold" : "text-red-600") : "text-muted-foreground"}`}>
                      {roi !== null ? `${fmt(roi, 1)}%` : "—"}
                    </td>
                  </>}
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>

      <div className="mt-6 space-y-3">
        <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Costo por unidad efectiva (relativo)</p>
        {rows.map((r, i) => {
          const pct = maxCpu > 0 ? (r.costPerUnit / maxCpu) * 100 : 0
          const isBest = r.costPerUnit > 0 && r.costPerUnit === minCpu
          const barColor = isBest ? "bg-green-500" : r.mode === "air" ? "bg-sky-400" : "bg-blue-700"
          return (
            <div key={i} className="space-y-1">
              <div className="flex justify-between text-xs">
                <span className="text-muted-foreground truncate max-w-[60%]">{r.name} · {r.mode === "air" ? "Aéreo" : "Marítimo"}</span>
                <span className="font-medium">${fmt(r.costPerUnit)}{tcg > 0 ? ` · ${fmtGs(r.costPerUnit, tcg)}` : ""}</span>
              </div>
              <div className="h-2 rounded-full bg-muted overflow-hidden">
                <div className={`h-full rounded-full transition-all ${barColor}`} style={{ width: `${pct}%` }} />
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}

// ─── App ──────────────────────────────────────────────────────────────────────

export default function App() {
  const [products, setProducts] = useState([])
  const [loading, setLoading] = useState(true)
  const [dialogOpen, setDialogOpen] = useState(false)
  const [editingProduct, setEditingProduct] = useState(null)
  const [tcg, setTcg] = useState(() => {
    const saved = localStorage.getItem("tcg")
    return saved ? parseFloat(saved) : 7800
  })

  useEffect(() => {
    localStorage.setItem("tcg", tcg)
  }, [tcg])

  useEffect(() => {
    const unsub = onSnapshot(collection(db, "products"), (snap) => {
      setProducts(snap.docs.map((d) => ({ id: d.id, ...d.data() })))
      setLoading(false)
    })
    return unsub
  }, [])

  const allCpus = products.flatMap((p) =>
    ["air", "sea"].filter((m) => hasMode(p, m)).map((m) => calcMetrics(p, m).costPerUnit).filter((c) => c > 0)
  )
  const bestCpu = allCpus.length > 1 ? Math.min(...allCpus) : null

  async function handleSave(form) {
    const { id, ...data } = form
    if (editingProduct) {
      await updateDoc(doc(db, "products", editingProduct.id), data)
    } else {
      await addDoc(collection(db, "products"), data)
    }
    setDialogOpen(false)
    setEditingProduct(null)
  }

  function handleDialogChange(open) {
    setDialogOpen(open)
    if (!open) setEditingProduct(null)
  }

  return (
    <div className="min-h-screen bg-background">
      <div className="max-w-6xl mx-auto px-4 py-8">

        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-8">
          <div>
            <h1 className="text-2xl font-bold tracking-tight">Comparador de Importación</h1>
            <p className="text-muted-foreground text-sm mt-1">
              {products.length === 0
                ? "Agregá productos para comparar costos"
                : `${products.length} producto${products.length !== 1 ? "s" : ""} cargado${products.length !== 1 ? "s" : ""}`}
            </p>
          </div>
          <div className="flex items-center gap-3 flex-wrap">
            <ExchangeRateBar tcg={tcg} onChange={(v) => setTcg(parseFloat(v) || 0)} />
            <Dialog open={dialogOpen} onOpenChange={handleDialogChange}>
              <DialogTrigger asChild>
                <Button onClick={() => setEditingProduct(null)}>
                  <Plus className="h-4 w-4 mr-2" />
                  Agregar producto
                </Button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>{editingProduct ? "Editar producto" : "Nuevo producto"}</DialogTitle>
                </DialogHeader>
                <ProductForm
                  key={editingProduct?.id ?? "new"}
                  initial={editingProduct ?? EMPTY_FORM}
                  onSave={handleSave}
                  onCancel={() => handleDialogChange(false)}
                  tcg={tcg}
                />
              </DialogContent>
            </Dialog>
          </div>
        </div>

        {loading && (
          <div className="flex flex-col items-center justify-center py-24 text-center">
            <p className="text-muted-foreground text-sm">Cargando productos...</p>
          </div>
        )}

        {!loading && products.length === 0 && (
          <div className="flex flex-col items-center justify-center py-24 text-center">
            <Package className="h-12 w-12 text-muted-foreground/30 mb-4" />
            <p className="text-muted-foreground">Todavía no hay productos.</p>
            <p className="text-muted-foreground text-sm mt-1">Usá el botón "Agregar producto" para empezar.</p>
          </div>
        )}

        {!loading && products.length > 0 && (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
            {products.map((p) => (
              <ProductCard
                key={p.id}
                product={p}
                bestCpu={bestCpu}
                tcg={tcg}
                onEdit={() => { setEditingProduct(p); setDialogOpen(true) }}
                onDelete={() => deleteDoc(doc(db, "products", p.id))}
              />
            ))}
          </div>
        )}

        <ComparisonPanel products={products} tcg={tcg} />
      </div>
    </div>
  )
}
