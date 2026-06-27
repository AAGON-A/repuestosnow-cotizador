import { useState, useRef, useCallback } from "react";

// ════════════════════════════════════════════════════════════════════════════
//  REPUESTOSNOW — Sistema de Cotización y Factura Electrónica
//  Versión: 1.0.0
//  Uso: Herramienta interna para calcular precios y generar cotizaciones PDF
// ════════════════════════════════════════════════════════════════════════════

// ── CONFIGURACIÓN DE LA EMPRESA ───────────────────────────────────────────
const EMPRESA = {
  nombre:     "RepuestosNow",
  propietario:"Andrés Abad",
  ruc:        "EN TRÁMITE",           // ← actualizar con RUC real
  ciudad:     "Cuenca, Ecuador",
  telefono:   "+593 XX XXX XXXX",     // ← actualizar
  email:      "info@repuestosnow.com",
  web:        "www.repuestosnow.com",
  banco:      "Banco Pichincha",       // ← actualizar
  cuenta:     "XXXXXXXXXXXX",          // ← actualizar con número de cuenta
  tipo_cuenta:"Cuenta Corriente",
};

// ── COLORES ───────────────────────────────────────────────────────────────
const C = {
  black:   "#080808", surface: "#111111", s2: "#181818",
  s3: "#202020", border: "#252525", orange: "#FF5C00",
  orangeH: "#FF7530", orangeD: "#FF5C001A", orangeB: "#FF5C0033",
  white: "#FFFFFF", gray: "#888888", grayLt: "#BBBBBB",
  grayD: "#3A3A3A", green: "#22C55E", greenBg: "#052E16",
  red: "#EF4444", redBg: "#1A0505", amber: "#F59E0B", amberBg: "#1A1200",
  blue: "#3B82F6",
};

// ── CONSTANTES DE CÁLCULO ─────────────────────────────────────────────────
const TIPO_CAMBIO_EUR_USD = 1.08; // ← actualizar según el mercado

// Aranceles por categoría (%)
const ARANCELES = {
  "Herramientas manuales":        10,
  "Herramientas eléctricas":      10,
  "Repuestos automotrices":        5,
  "Rodamientos industriales":      5,
  "Herramientas de corte CNC":     5,
  "Equipos de medición":           5,
  "Lubricantes y sellantes":      10,
  "Electrónica / IoT":             0,
  "Filamentos 3D":                 0,
  "Equipos médicos":               0,
  "Otros":                        10,
};

// Flete DHL Express estimado (USD por kg, mínimo $25)
const FLETE_POR_KG = 7.5;
const FLETE_MINIMO = 25;

// IVA Ecuador
const IVA = 0.15;

// FODINFA
const FODINFA = 0.005;

// Costos operativos fijos por pedido (gestión, comunicación, etc.)
const COSTO_OPERATIVO_FIJO = 8;

// Porcentaje de costos operativos variables
const COSTO_OPERATIVO_PCT = 0.10;

// Dificultad de búsqueda — multiplicador sobre margen base
const DIFICULTAD = {
  "Fácil — disponible en Autodoc/Amazon DE": { label: "Fácil",   mult: 1.0,  color: C.green },
  "Normal — requiere búsqueda en 2-3 sitios":{ label: "Normal",  mult: 1.10, color: C.amber },
  "Difícil — pieza especializada o escasa":   { label: "Difícil", mult: 1.20, color: C.orange },
  "Muy difícil — descontinuada o exclusiva":  { label: "Rara",    mult: 1.35, color: C.red },
};

// Urgencia — cargo adicional en USD
const URGENCIA = {
  "Normal (7–12 días hábiles)":      { label: "Normal",   cargo: 0,   color: C.gray },
  "Prioritario (5–7 días hábiles)":  { label: "Prioritario", cargo: 15, color: C.amber },
  "Urgente (3–5 días hábiles)":      { label: "Urgente",  cargo: 35,  color: C.orange },
  "Crítico (hoy — disponibilidad)":  { label: "Crítico",  cargo: 60,  color: C.red },
};

// ── ESTADO INICIAL DEL ÍTEM ───────────────────────────────────────────────
const ITEM_VACIO = {
  id: 1, descripcion: "", marca: "", referencia: "",
  precio_eur: 0, peso_kg: 0.5, cantidad: 1,
  categoria: "Repuestos automotrices",
  dificultad: "Normal — requiere búsqueda en 2-3 sitios",
  urgencia: "Normal (7–12 días hábiles)",
  margen_base: 60,
  notas: "",
};

// ── UTILIDADES ─────────────────────────────────────────────────────────────
const fmt = (n) => `$${Number(n).toFixed(2)}`;
const fmtEUR = (n) => `€${Number(n).toFixed(2)}`;
const round2 = (n) => Math.round(n * 100) / 100;

// ── MOTOR DE CÁLCULO DE PRECIO ────────────────────────────────────────────
function calcularPrecio(item) {
  const { precio_eur, peso_kg, cantidad, categoria, dificultad, urgencia, margen_base } = item;

  // 1. Costo FOB en USD
  const fob_usd = precio_eur * TIPO_CAMBIO_EUR_USD * cantidad;

  // 2. Flete estimado
  const peso_total = peso_kg * cantidad;
  const flete = Math.max(FLETE_MINIMO, peso_total * FLETE_POR_KG);

  // 3. Seguro (1% del FOB)
  const seguro = fob_usd * 0.01;

  // 4. Valor CIF (base imponible)
  const cif = fob_usd + flete + seguro;

  // 5. Tributos aduaneros
  const arancel_pct = ARANCELES[categoria] / 100;
  const arancel = cif * arancel_pct;
  const iva_imp = (cif + arancel) * IVA;
  const fodinfa = cif * FODINFA;
  const total_tributos = arancel + iva_imp + fodinfa;

  // 6. Costo importado total
  const costo_importado = fob_usd + flete + total_tributos + COSTO_OPERATIVO_FIJO;

  // 7. Costos operativos variables
  const costo_op_var = costo_importado * COSTO_OPERATIVO_PCT;
  const costo_total = costo_importado + costo_op_var;

  // 8. Margen ajustado por dificultad
  const mult_dificultad = DIFICULTAD[dificultad]?.mult || 1.0;
  const margen_ajustado = margen_base * mult_dificultad;

  // 9. Precio base con margen
  const precio_base = costo_total * (1 + margen_ajustado / 100);

  // 10. Cargo por urgencia
  const cargo_urgencia = URGENCIA[urgencia]?.cargo || 0;

  // 11. Subtotal sin IVA de venta
  const subtotal_sin_iva = precio_base + cargo_urgencia;

  // 12. IVA de venta Ecuador (15%)
  const iva_venta = subtotal_sin_iva * IVA;

  // 13. Precio final al cliente
  const precio_final = subtotal_sin_iva + iva_venta;

  // 14. Ganancia neta
  const ganancia = subtotal_sin_iva - costo_total - cargo_urgencia * 0.5;
  const margen_real = costo_total > 0 ? (ganancia / costo_total) * 100 : 0;

  return {
    fob_usd: round2(fob_usd),
    flete: round2(flete),
    seguro: round2(seguro),
    cif: round2(cif),
    arancel: round2(arancel),
    iva_imp: round2(iva_imp),
    fodinfa: round2(fodinfa),
    total_tributos: round2(total_tributos),
    costo_importado: round2(costo_importado),
    costo_op_var: round2(costo_op_var),
    costo_total: round2(costo_total),
    margen_ajustado: round2(margen_ajustado),
    precio_base: round2(precio_base),
    cargo_urgencia: round2(cargo_urgencia),
    subtotal_sin_iva: round2(subtotal_sin_iva),
    iva_venta: round2(iva_venta),
    precio_final: round2(precio_final),
    ganancia: round2(ganancia),
    margen_real: round2(margen_real),
    peso_total: round2(peso_total),
    arancel_pct: ARANCELES[categoria],
  };
}

// ════════════════════════════════════════════════════════════════════════════
//  COMPONENTES
// ════════════════════════════════════════════════════════════════════════════

// ── INPUT HELPER ──────────────────────────────────────────────────────────
function Field({ label, children, half, third, span }) {
  const cols = span ? "1 / -1" : "auto";
  return (
    <div style={{ gridColumn: span ? cols : "auto" }}>
      <label style={{ fontSize: 11, fontWeight: 700, color: C.grayLt,
        letterSpacing: 0.5, marginBottom: 5, display: "block", textTransform: "uppercase" }}>
        {label}
      </label>
      {children}
    </div>
  );
}

const inp = (extra = {}) => ({
  width: "100%", padding: "10px 12px", background: C.s3,
  border: `1.5px solid ${C.border}`, borderRadius: 7, color: C.white,
  fontSize: 13, outline: "none", fontFamily: "inherit", boxSizing: "border-box",
  transition: "border-color 0.15s", ...extra,
});

// ── CALCULADORA DE ÍTEM ───────────────────────────────────────────────────
function CalculadoraItem({ item, onChange, onDelete, showDelete }) {
  const calc = calcularPrecio(item);

  const set = (k, v) => onChange({ ...item, [k]: v });

  const margenColor = calc.margen_real > 80 ? C.green
    : calc.margen_real > 50 ? C.amber
    : C.red;

  return (
    <div style={{ background: C.s2, border: `1.5px solid ${C.border}`,
      borderRadius: 12, padding: 20, marginBottom: 14 }}>

      {/* Header del ítem */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <div style={{ width: 28, height: 28, background: C.orange, borderRadius: 6,
            display: "flex", alignItems: "center", justifyContent: "center",
            fontSize: 12, fontWeight: 900, color: C.white }}>
            {item.id}
          </div>
          <span style={{ fontSize: 14, fontWeight: 700, color: C.white }}>
            {item.descripcion || `Ítem ${item.id}`}
          </span>
        </div>
        <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
          <div style={{ textAlign: "right" }}>
            <div style={{ fontSize: 10, color: C.gray }}>Precio final al cliente</div>
            <div style={{ fontSize: 22, fontWeight: 900, color: C.orange }}>{fmt(calc.precio_final)}</div>
          </div>
          {showDelete && (
            <button onClick={onDelete}
              style={{ background: C.redBg, border: `1px solid ${C.red}33`, color: C.red,
                borderRadius: 7, padding: "6px 10px", cursor: "pointer", fontSize: 12, fontWeight: 700 }}>
              ✕
            </button>
          )}
        </div>
      </div>

      {/* Grid de inputs */}
      <div style={{ display: "grid", gridTemplateColumns: "2fr 1fr 1fr", gap: 12, marginBottom: 12 }}>
        <Field label="Descripción del producto *">
          <input value={item.descripcion} onChange={e => set("descripcion", e.target.value)}
            placeholder="Ej: Alicates Cobra Knipex 87 01 250mm" style={inp()}
            onFocus={e => e.target.style.borderColor = C.orange}
            onBlur={e => e.target.style.borderColor = C.border} />
        </Field>
        <Field label="Marca">
          <input value={item.marca} onChange={e => set("marca", e.target.value)}
            placeholder="Knipex, Bosch, SKF..." style={inp()}
            onFocus={e => e.target.style.borderColor = C.orange}
            onBlur={e => e.target.style.borderColor = C.border} />
        </Field>
        <Field label="Referencia / Nro parte">
          <input value={item.referencia} onChange={e => set("referencia", e.target.value)}
            placeholder="87 01 250 / A651090..." style={inp()}
            onFocus={e => e.target.style.borderColor = C.orange}
            onBlur={e => e.target.style.borderColor = C.border} />
        </Field>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr 1fr", gap: 12, marginBottom: 12 }}>
        <Field label="Precio en Europa (€)">
          <input type="number" min="0" step="0.01" value={item.precio_eur}
            onChange={e => set("precio_eur", parseFloat(e.target.value) || 0)}
            style={inp()} onFocus={e => e.target.style.borderColor = C.orange}
            onBlur={e => e.target.style.borderColor = C.border} />
        </Field>
        <Field label="Peso por unidad (kg)">
          <input type="number" min="0.01" step="0.01" value={item.peso_kg}
            onChange={e => set("peso_kg", parseFloat(e.target.value) || 0.1)}
            style={inp()} onFocus={e => e.target.style.borderColor = C.orange}
            onBlur={e => e.target.style.borderColor = C.border} />
        </Field>
        <Field label="Cantidad">
          <input type="number" min="1" step="1" value={item.cantidad}
            onChange={e => set("cantidad", parseInt(e.target.value) || 1)}
            style={inp()} onFocus={e => e.target.style.borderColor = C.orange}
            onBlur={e => e.target.style.borderColor = C.border} />
        </Field>
        <Field label="Margen base (%)">
          <input type="number" min="10" max="200" step="5" value={item.margen_base}
            onChange={e => set("margen_base", parseInt(e.target.value) || 60)}
            style={inp()} onFocus={e => e.target.style.borderColor = C.orange}
            onBlur={e => e.target.style.borderColor = C.border} />
        </Field>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 12, marginBottom: 12 }}>
        <Field label="Categoría (determina arancel)">
          <select value={item.categoria} onChange={e => set("categoria", e.target.value)}
            style={{ ...inp(), cursor: "pointer" }}>
            {Object.keys(ARANCELES).map(k => (
              <option key={k} value={k}>{k} ({ARANCELES[k]}%)</option>
            ))}
          </select>
        </Field>
        <Field label="Dificultad de búsqueda">
          <select value={item.dificultad} onChange={e => set("dificultad", e.target.value)}
            style={{ ...inp(), cursor: "pointer" }}>
            {Object.keys(DIFICULTAD).map(k => (
              <option key={k} value={k}>{k}</option>
            ))}
          </select>
        </Field>
        <Field label="Urgencia del pedido">
          <select value={item.urgencia} onChange={e => set("urgencia", e.target.value)}
            style={{ ...inp(), cursor: "pointer" }}>
            {Object.keys(URGENCIA).map(k => (
              <option key={k} value={k}>{k}</option>
            ))}
          </select>
        </Field>
      </div>

      <Field label="Notas internas (no aparecen en la cotización al cliente)">
        <input value={item.notas} onChange={e => set("notas", e.target.value)}
          placeholder="Proveedor recomendado, observaciones especiales..." style={inp()}
          onFocus={e => e.target.style.borderColor = C.orange}
          onBlur={e => e.target.style.borderColor = C.border} />
      </Field>

      {/* Desglose de cálculo */}
      <div style={{ marginTop: 16, background: C.black, borderRadius: 8,
        padding: 14, display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 8 }}>

        {/* Columna costos */}
        <div>
          <div style={{ fontSize: 10, fontWeight: 700, color: C.orange, letterSpacing: 1.5,
            textTransform: "uppercase", marginBottom: 8 }}>Costos de importación</div>
          {[
            [`FOB USD (€${item.precio_eur} × ${item.cantidad} × ${TIPO_CAMBIO_EUR_USD})`, fmt(calc.fob_usd)],
            [`Flete DHL (${calc.peso_total}kg)`, fmt(calc.flete)],
            ["Seguro (1% FOB)", fmt(calc.seguro)],
            ["Valor CIF", fmt(calc.cif)],
            [`Arancel ${calc.arancel_pct}%`, fmt(calc.arancel)],
            ["IVA importación 15%", fmt(calc.iva_imp)],
            ["FODINFA 0.5%", fmt(calc.fodinfa)],
            ["Costos operativos", fmt(calc.costo_op_var + COSTO_OPERATIVO_FIJO)],
          ].map(([l, v]) => (
            <div key={l} style={{ display: "flex", justifyContent: "space-between",
              fontSize: 11, color: C.gray, marginBottom: 4 }}>
              <span>{l}</span><span style={{ color: C.grayLt }}>{v}</span>
            </div>
          ))}
          <div style={{ display: "flex", justifyContent: "space-between",
            fontSize: 12, fontWeight: 800, color: C.red, marginTop: 6,
            paddingTop: 6, borderTop: `1px solid ${C.border}` }}>
            <span>COSTO TOTAL</span><span>{fmt(calc.costo_total)}</span>
          </div>
        </div>

        {/* Columna precio */}
        <div>
          <div style={{ fontSize: 10, fontWeight: 700, color: C.orange, letterSpacing: 1.5,
            textTransform: "uppercase", marginBottom: 8 }}>Precio de venta</div>
          {[
            [`Margen ${calc.margen_ajustado}% (base ${item.margen_base}% × dificultad)`,
              fmt(calc.precio_base - calc.costo_total)],
            [`Cargo urgencia (${URGENCIA[item.urgencia]?.label})`, fmt(calc.cargo_urgencia)],
            ["Subtotal sin IVA", fmt(calc.subtotal_sin_iva)],
            ["IVA venta 15%", fmt(calc.iva_venta)],
          ].map(([l, v]) => (
            <div key={l} style={{ display: "flex", justifyContent: "space-between",
              fontSize: 11, color: C.gray, marginBottom: 4 }}>
              <span style={{ maxWidth: 140 }}>{l}</span>
              <span style={{ color: C.grayLt }}>{v}</span>
            </div>
          ))}
          <div style={{ display: "flex", justifyContent: "space-between",
            fontSize: 14, fontWeight: 900, color: C.orange, marginTop: 6,
            paddingTop: 6, borderTop: `1px solid ${C.border}` }}>
            <span>PRECIO FINAL</span><span>{fmt(calc.precio_final)}</span>
          </div>
        </div>

        {/* Columna ganancia */}
        <div>
          <div style={{ fontSize: 10, fontWeight: 700, color: C.orange, letterSpacing: 1.5,
            textTransform: "uppercase", marginBottom: 8 }}>Tu ganancia</div>
          <div style={{ textAlign: "center", padding: "12px 0" }}>
            <div style={{ fontSize: 36, fontWeight: 900, color: margenColor, lineHeight: 1 }}>
              {fmt(calc.ganancia)}
            </div>
            <div style={{ fontSize: 12, color: C.gray, marginTop: 4 }}>ganancia neta</div>
            <div style={{ fontSize: 24, fontWeight: 900, color: margenColor, marginTop: 8 }}>
              {calc.margen_real.toFixed(0)}%
            </div>
            <div style={{ fontSize: 11, color: C.gray }}>margen sobre costo</div>
            <div style={{ marginTop: 10, fontSize: 11, padding: "6px 10px",
              background: margenColor + "18", borderRadius: 6, color: margenColor, fontWeight: 700 }}>
              {calc.margen_real > 80 ? "🔥 Excelente"
                : calc.margen_real > 50 ? "✅ Bueno"
                : calc.margen_real > 30 ? "⚠️ Justo"
                : "❌ Revisar precio"}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

// ── VISTA PREVIA DE COTIZACIÓN (para PDF) ─────────────────────────────────
function VistaCotizacion({ items, cliente, numero, fecha, validez, condiciones }) {
  const totales = items.reduce((acc, item) => {
    const c = calcularPrecio(item);
    return {
      subtotal: acc.subtotal + c.subtotal_sin_iva,
      iva:      acc.iva + c.iva_venta,
      total:    acc.total + c.precio_final,
      ganancia: acc.ganancia + c.ganancia,
    };
  }, { subtotal: 0, iva: 0, total: 0, ganancia: 0 });

  return (
    <div id="cotizacion-pdf" style={{ background: C.white, color: "#1A1A1A",
      fontFamily: "'Inter','Segoe UI',sans-serif", padding: 40, minWidth: 700 }}>

      {/* Header */}
      <div style={{ display: "flex", justifyContent: "space-between",
        alignItems: "flex-start", marginBottom: 32, paddingBottom: 24,
        borderBottom: "3px solid #FF5C00" }}>
        <div>
          <div style={{ fontSize: 28, fontWeight: 900, color: "#1A1A1A", letterSpacing: -1 }}>
            Repuestos<span style={{ color: "#FF5C00" }}>Now</span>
          </div>
          <div style={{ fontSize: 11, color: "#666", marginTop: 4 }}>Repuestos Alemanes Originales</div>
          <div style={{ fontSize: 11, color: "#888", marginTop: 8, lineHeight: 1.6 }}>
            {EMPRESA.propietario}<br />
            {EMPRESA.ciudad}<br />
            {EMPRESA.telefono} · {EMPRESA.email}<br />
            {EMPRESA.web}<br />
            {EMPRESA.ruc !== "EN TRÁMITE"
              ? `RUC: ${EMPRESA.ruc}`
              : "RUC: En trámite · Persona Natural"}
          </div>
        </div>
        <div style={{ textAlign: "right" }}>
          <div style={{ fontSize: 22, fontWeight: 900, color: "#FF5C00", letterSpacing: -0.5 }}>
            COTIZACIÓN
          </div>
          <div style={{ fontSize: 14, fontWeight: 700, color: "#1A1A1A", marginTop: 4 }}>
            N° {numero}
          </div>
          <div style={{ fontSize: 12, color: "#666", marginTop: 6, lineHeight: 1.8 }}>
            Fecha: {fecha}<br />
            Válida hasta: {validez}<br />
          </div>
          {/* Sello urgente si hay ítems urgentes */}
          {items.some(i => i.urgencia.includes("Urgente") || i.urgencia.includes("Crítico")) && (
            <div style={{ marginTop: 10, background: "#FF5C00", color: "#fff",
              padding: "4px 12px", borderRadius: 4, fontSize: 11, fontWeight: 800,
              display: "inline-block" }}>⚡ PEDIDO URGENTE</div>
          )}
        </div>
      </div>

      {/* Datos del cliente */}
      <div style={{ background: "#F8F8F8", borderRadius: 8, padding: "14px 18px",
        marginBottom: 24, display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
        <div>
          <div style={{ fontSize: 10, fontWeight: 700, color: "#FF5C00", letterSpacing: 2,
            textTransform: "uppercase", marginBottom: 4 }}>Cliente</div>
          <div style={{ fontSize: 14, fontWeight: 700 }}>{cliente.nombre || "—"}</div>
          <div style={{ fontSize: 12, color: "#666" }}>{cliente.empresa || ""}</div>
          <div style={{ fontSize: 12, color: "#666" }}>{cliente.email || ""}</div>
          <div style={{ fontSize: 12, color: "#666" }}>{cliente.telefono || ""}</div>
          <div style={{ fontSize: 12, color: "#666" }}>{cliente.ciudad || ""}</div>
        </div>
        <div>
          <div style={{ fontSize: 10, fontWeight: 700, color: "#FF5C00", letterSpacing: 2,
            textTransform: "uppercase", marginBottom: 4 }}>Detalles de entrega</div>
          <div style={{ fontSize: 12, color: "#444", lineHeight: 1.7 }}>
            <strong>Tiempo estimado:</strong> 7–12 días hábiles<br />
            <strong>Modalidad:</strong> Importación directa Alemania → Ecuador<br />
            <strong>Flete:</strong> DHL Express aéreo incluido<br />
            <strong>Pago:</strong> 50% anticipo · 50% a la entrega
          </div>
        </div>
      </div>

      {/* Tabla de ítems */}
      <table style={{ width: "100%", borderCollapse: "collapse", marginBottom: 24 }}>
        <thead>
          <tr style={{ background: "#1A1A1A", color: "#fff" }}>
            {["#", "Descripción", "Marca / Ref.", "Cant.", "P. Unit. (sin IVA)", "IVA 15%", "Total"].map(h => (
              <th key={h} style={{ padding: "10px 12px", fontSize: 11, fontWeight: 700,
                textAlign: h === "#" || h === "Cant." ? "center" : h.includes("$") || h === "Total" || h.includes("Unit") || h.includes("IVA") ? "right" : "left",
                letterSpacing: 0.5 }}>{h}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {items.map((item, idx) => {
            const c = calcularPrecio(item);
            const precio_unit_sin_iva = c.subtotal_sin_iva / item.cantidad;
            const iva_unit = c.iva_venta / item.cantidad;
            return (
              <tr key={item.id} style={{ background: idx % 2 === 0 ? "#fff" : "#FAFAFA",
                borderBottom: "1px solid #EEE" }}>
                <td style={{ padding: "10px 12px", fontSize: 12, textAlign: "center",
                  color: "#FF5C00", fontWeight: 700 }}>{idx + 1}</td>
                <td style={{ padding: "10px 12px", fontSize: 12 }}>
                  <div style={{ fontWeight: 600 }}>{item.descripcion}</div>
                  <div style={{ fontSize: 10, color: "#999", marginTop: 2 }}>
                    {DIFICULTAD[item.dificultad]?.label} · {URGENCIA[item.urgencia]?.label}
                    {c.cargo_urgencia > 0 && ` (+${fmt(c.cargo_urgencia)} urgencia)`}
                  </div>
                </td>
                <td style={{ padding: "10px 12px", fontSize: 11, color: "#666" }}>
                  {item.marca}<br />
                  <span style={{ fontSize: 10, color: "#999" }}>{item.referencia}</span>
                </td>
                <td style={{ padding: "10px 12px", fontSize: 12, textAlign: "center", fontWeight: 600 }}>
                  {item.cantidad}
                </td>
                <td style={{ padding: "10px 12px", fontSize: 12, textAlign: "right" }}>
                  {fmt(precio_unit_sin_iva)}
                </td>
                <td style={{ padding: "10px 12px", fontSize: 12, textAlign: "right", color: "#666" }}>
                  {fmt(iva_unit)}
                </td>
                <td style={{ padding: "10px 12px", fontSize: 13, textAlign: "right",
                  fontWeight: 800, color: "#FF5C00" }}>
                  {fmt(c.precio_final)}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>

      {/* Totales */}
      <div style={{ display: "flex", justifyContent: "flex-end", marginBottom: 28 }}>
        <div style={{ width: 280 }}>
          {[
            ["Subtotal (sin IVA)", fmt(totales.subtotal)],
            ["IVA 15%", fmt(totales.iva)],
          ].map(([l, v]) => (
            <div key={l} style={{ display: "flex", justifyContent: "space-between",
              padding: "7px 0", borderBottom: "1px solid #EEE", fontSize: 13, color: "#666" }}>
              <span>{l}</span><span>{v}</span>
            </div>
          ))}
          <div style={{ display: "flex", justifyContent: "space-between",
            padding: "12px 0", fontSize: 18, fontWeight: 900, color: "#1A1A1A",
            borderTop: "2px solid #FF5C00", marginTop: 4 }}>
            <span>TOTAL</span><span style={{ color: "#FF5C00" }}>{fmt(totales.total)}</span>
          </div>
        </div>
      </div>

      {/* Condiciones de pago */}
      <div style={{ background: "#FFF8F5", border: "1px solid #FF5C0033",
        borderRadius: 8, padding: "14px 18px", marginBottom: 20 }}>
        <div style={{ fontSize: 11, fontWeight: 700, color: "#FF5C00", marginBottom: 8,
          textTransform: "uppercase", letterSpacing: 1 }}>Condiciones de pago y entrega</div>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, fontSize: 12, color: "#555" }}>
          <div>
            ✅ <strong>Anticipo:</strong> 50% al confirmar el pedido<br />
            ✅ <strong>Saldo:</strong> 50% a la entrega del pedido<br />
            ✅ <strong>Formas de pago:</strong> Transferencia bancaria / Efectivo
          </div>
          <div>
            🏦 <strong>Banco:</strong> {EMPRESA.banco}<br />
            🔢 <strong>Cuenta:</strong> {EMPRESA.cuenta}<br />
            📋 <strong>Tipo:</strong> {EMPRESA.tipo_cuenta}
          </div>
        </div>
      </div>

      {/* Condiciones adicionales */}
      {condiciones && (
        <div style={{ background: "#F8F8F8", borderRadius: 8, padding: "12px 16px", marginBottom: 20 }}>
          <div style={{ fontSize: 11, fontWeight: 700, color: "#666", marginBottom: 6,
            textTransform: "uppercase", letterSpacing: 1 }}>Notas y condiciones adicionales</div>
          <div style={{ fontSize: 12, color: "#555", lineHeight: 1.7 }}>{condiciones}</div>
        </div>
      )}

      {/* Footer legal */}
      <div style={{ borderTop: "1px solid #EEE", paddingTop: 16,
        fontSize: 10, color: "#AAA", lineHeight: 1.7 }}>
        <strong>Aviso legal:</strong> Esta cotización tiene validez hasta la fecha indicada.
        Los precios incluyen flete aéreo estimado y aranceles estimados — el precio final puede variar ±5%
        según tipo de cambio y tasas aduaneras vigentes al momento de la importación.
        El 50% de anticipo no es reembolsable una vez confirmada y enviada la orden al proveedor europeo.
        Todos los productos son originales con trazabilidad al proveedor europeo.
        {EMPRESA.ruc !== "EN TRÁMITE" && ` · RUC: ${EMPRESA.ruc}`}
        {" "}· {EMPRESA.ciudad} · {EMPRESA.web}
      </div>
    </div>
  );
}

// ── APP PRINCIPAL ─────────────────────────────────────────────────────────
export default function App() {
  const [items, setItems] = useState([{ ...ITEM_VACIO }]);
  const [cliente, setCliente] = useState({
    nombre: "", empresa: "", email: "", telefono: "", ciudad: ""
  });
  const [numero, setNumero] = useState(`RN-${new Date().getFullYear()}-001`);
  const [validez, setValidez] = useState(() => {
    const d = new Date(); d.setDate(d.getDate() + 7);
    return d.toLocaleDateString("es-EC");
  });
  const [condiciones, setCondiciones] = useState("");
  const [vista, setVista] = useState("calculadora"); // calculadora | cotizacion
  const [imprimiendo, setImprimiendo] = useState(false);
  const printRef = useRef(null);

  const fecha = new Date().toLocaleDateString("es-EC", {
    year: "numeric", month: "long", day: "numeric"
  });

  // Agregar nuevo ítem
  const agregarItem = () => {
    const nuevoId = Math.max(...items.map(i => i.id)) + 1;
    setItems([...items, { ...ITEM_VACIO, id: nuevoId }]);
  };

  // Actualizar ítem
  const actualizarItem = (id, nuevoItem) => {
    setItems(items.map(i => i.id === id ? nuevoItem : i));
  };

  // Eliminar ítem
  const eliminarItem = (id) => {
    if (items.length > 1) setItems(items.filter(i => i.id !== id));
  };

  // Calcular totales generales
  const totales = items.reduce((acc, item) => {
    const c = calcularPrecio(item);
    return {
      subtotal: acc.subtotal + c.subtotal_sin_iva,
      iva:      acc.iva + c.iva_venta,
      total:    acc.total + c.precio_final,
      ganancia: acc.ganancia + c.ganancia,
      costo:    acc.costo + c.costo_total,
    };
  }, { subtotal: 0, iva: 0, total: 0, ganancia: 0, costo: 0 });

  const margenGlobal = totales.costo > 0
    ? ((totales.ganancia / totales.costo) * 100).toFixed(0)
    : 0;

  // Imprimir / Guardar PDF
  const imprimirPDF = useCallback(() => {
    setImprimiendo(true);
    setVista("cotizacion");
    setTimeout(() => {
      window.print();
      setImprimiendo(false);
    }, 500);
  }, []);

  const setCliente_ = (k, v) => setCliente(c => ({ ...c, [k]: v }));

  // Estilos de input para datos del cliente
  const inpCliente = { ...inp(), marginBottom: 0 };

  return (
    <div style={{ fontFamily: "'Inter','Segoe UI',sans-serif",
      background: C.black, minHeight: "100vh", color: C.white }}>

      {/* CSS para impresión */}
      <style>{`
        * { box-sizing: border-box; }
        select option { background: #1E1E1E; color: white; }
        @media print {
          body { background: white !important; }
          .no-print { display: none !important; }
          #cotizacion-pdf {
            position: fixed; top: 0; left: 0;
            width: 100%; background: white;
            padding: 20px; color: black;
          }
        }
        ::-webkit-scrollbar { width: 5px; }
        ::-webkit-scrollbar-track { background: #0A0A0A; }
        ::-webkit-scrollbar-thumb { background: #2A2A2A; border-radius: 3px; }
      `}</style>

      {/* HEADER */}
      <div className="no-print" style={{ background: C.surface,
        borderBottom: `1px solid ${C.border}`, padding: "0 24px" }}>
        <div style={{ maxWidth: 1200, margin: "0 auto", height: 60,
          display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <div style={{ width: 32, height: 32, background: C.orange, borderRadius: 7,
              display: "flex", alignItems: "center", justifyContent: "center", fontSize: 16 }}>⚙️</div>
            <div>
              <div style={{ fontSize: 16, fontWeight: 900, color: C.white }}>
                Repuestos<span style={{ color: C.orange }}>Now</span>
                <span style={{ fontSize: 11, color: C.grayD, marginLeft: 8, fontWeight: 400 }}>
                  Sistema de Cotización
                </span>
              </div>
            </div>
          </div>
          <div style={{ display: "flex", gap: 8 }}>
            {[["calculadora","🧮 Calculadora"],["cotizacion","📄 Vista Cotización"]].map(([v,l]) => (
              <button key={v} onClick={() => setVista(v)}
                style={{ padding: "8px 16px", fontSize: 12, fontWeight: 600, borderRadius: 7,
                  cursor: "pointer", transition: "all 0.15s",
                  background: vista === v ? C.orange : "transparent",
                  color: vista === v ? C.white : C.gray,
                  border: `1.5px solid ${vista === v ? C.orange : C.border}` }}>
                {l}
              </button>
            ))}
            <button onClick={imprimirPDF}
              style={{ padding: "8px 18px", fontSize: 12, fontWeight: 800, borderRadius: 7,
                background: C.green, border: "none", color: C.white, cursor: "pointer",
                display: "flex", alignItems: "center", gap: 6 }}>
              🖨️ Guardar PDF
            </button>
          </div>
        </div>
      </div>

      {/* VISTA CALCULADORA */}
      {vista === "calculadora" && (
        <div className="no-print" style={{ maxWidth: 1200, margin: "0 auto", padding: "24px 20px 60px" }}>

          {/* KPIs globales */}
          <div style={{ display: "grid", gridTemplateColumns: "repeat(5, 1fr)", gap: 10, marginBottom: 24 }}>
            {[
              { l: "Ítems", v: items.length, c: C.white },
              { l: "Costo total importado", v: fmt(totales.costo), c: C.red },
              { l: "Total al cliente (con IVA)", v: fmt(totales.total), c: C.orange },
              { l: "Ganancia neta total", v: fmt(totales.ganancia), c: C.green },
              { l: "Margen global", v: `${margenGlobal}%`, c: margenGlobal > 60 ? C.green : margenGlobal > 40 ? C.amber : C.red },
            ].map(k => (
              <div key={k.l} style={{ background: C.s2, border: `1px solid ${C.border}`,
                borderRadius: 10, padding: "12px 16px", textAlign: "center" }}>
                <div style={{ fontSize: 9, color: C.gray, textTransform: "uppercase",
                  letterSpacing: 1.5, marginBottom: 4 }}>{k.l}</div>
                <div style={{ fontSize: 20, fontWeight: 900, color: k.c }}>{k.v}</div>
              </div>
            ))}
          </div>

          {/* Datos del cliente */}
          <div style={{ background: C.s2, border: `1px solid ${C.border}`,
            borderRadius: 12, padding: 20, marginBottom: 20 }}>
            <div style={{ fontSize: 12, fontWeight: 700, color: C.orange,
              letterSpacing: 2, textTransform: "uppercase", marginBottom: 14 }}>
              Datos del cliente y cotización
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(6, 1fr)", gap: 12 }}>
              <Field label="N° Cotización">
                <input value={numero} onChange={e => setNumero(e.target.value)}
                  style={inpCliente}
                  onFocus={e => e.target.style.borderColor = C.orange}
                  onBlur={e => e.target.style.borderColor = C.border} />
              </Field>
              <Field label="Válida hasta">
                <input value={validez} onChange={e => setValidez(e.target.value)}
                  style={inpCliente}
                  onFocus={e => e.target.style.borderColor = C.orange}
                  onBlur={e => e.target.style.borderColor = C.border} />
              </Field>
              <Field label="Nombre cliente *">
                <input value={cliente.nombre} onChange={e => setCliente_("nombre", e.target.value)}
                  placeholder="Juan Pérez" style={inpCliente}
                  onFocus={e => e.target.style.borderColor = C.orange}
                  onBlur={e => e.target.style.borderColor = C.border} />
              </Field>
              <Field label="Empresa / Taller">
                <input value={cliente.empresa} onChange={e => setCliente_("empresa", e.target.value)}
                  placeholder="Taller Pérez" style={inpCliente}
                  onFocus={e => e.target.style.borderColor = C.orange}
                  onBlur={e => e.target.style.borderColor = C.border} />
              </Field>
              <Field label="Email">
                <input value={cliente.email} onChange={e => setCliente_("email", e.target.value)}
                  placeholder="juan@correo.com" style={inpCliente}
                  onFocus={e => e.target.style.borderColor = C.orange}
                  onBlur={e => e.target.style.borderColor = C.border} />
              </Field>
              <Field label="WhatsApp">
                <input value={cliente.telefono} onChange={e => setCliente_("telefono", e.target.value)}
                  placeholder="+593 99..." style={inpCliente}
                  onFocus={e => e.target.style.borderColor = C.orange}
                  onBlur={e => e.target.style.borderColor = C.border} />
              </Field>
            </div>
            <div style={{ marginTop: 12 }}>
              <Field label="Notas / condiciones adicionales para el cliente">
                <input value={condiciones} onChange={e => setCondiciones(e.target.value)}
                  placeholder="Incluye garantía de 30 días / Se requiere pago previo al despacho..."
                  style={inpCliente}
                  onFocus={e => e.target.style.borderColor = C.orange}
                  onBlur={e => e.target.style.borderColor = C.border} />
              </Field>
            </div>
          </div>

          {/* Ítems */}
          <div style={{ fontSize: 12, fontWeight: 700, color: C.orange,
            letterSpacing: 2, textTransform: "uppercase", marginBottom: 14 }}>
            Ítems de la cotización ({items.length})
          </div>

          {items.map(item => (
            <CalculadoraItem
              key={item.id}
              item={item}
              onChange={(nuevoItem) => actualizarItem(item.id, nuevoItem)}
              onDelete={() => eliminarItem(item.id)}
              showDelete={items.length > 1}
            />
          ))}

          {/* Botón agregar ítem */}
          <button onClick={agregarItem}
            style={{ width: "100%", padding: "14px", background: "transparent",
              border: `2px dashed ${C.border}`, color: C.gray, fontSize: 14,
              fontWeight: 600, borderRadius: 10, cursor: "pointer",
              transition: "all 0.2s", marginBottom: 24 }}
            onMouseEnter={e => { e.currentTarget.style.borderColor = C.orange; e.currentTarget.style.color = C.orange; }}
            onMouseLeave={e => { e.currentTarget.style.borderColor = C.border; e.currentTarget.style.color = C.gray; }}>
            + Agregar otro ítem
          </button>

          {/* Resumen final */}
          <div style={{ background: C.orange, borderRadius: 12, padding: 24,
            display: "grid", gridTemplateColumns: "1fr 1fr 1fr 1fr", gap: 20 }}>
            {[
              { l: "Subtotal sin IVA", v: fmt(totales.subtotal) },
              { l: "IVA 15%", v: fmt(totales.iva) },
              { l: "TOTAL AL CLIENTE", v: fmt(totales.total), big: true },
              { l: `Tu ganancia neta (${margenGlobal}%)`, v: fmt(totales.ganancia), green: true },
            ].map(k => (
              <div key={k.l} style={{ textAlign: "center" }}>
                <div style={{ fontSize: 10, color: "rgba(255,255,255,0.7)",
                  textTransform: "uppercase", letterSpacing: 1.5, marginBottom: 4 }}>{k.l}</div>
                <div style={{ fontSize: k.big ? 28 : 22, fontWeight: 900,
                  color: k.green ? "#86EFAC" : C.white }}>{k.v}</div>
              </div>
            ))}
          </div>

          {/* Instrucción final */}
          <div style={{ marginTop: 16, textAlign: "center", fontSize: 13, color: C.gray }}>
            Revisá los datos → click en{" "}
            <strong style={{ color: C.orange }}>Vista Cotización</strong>{" "}
            para ver el documento final → click en{" "}
            <strong style={{ color: C.green }}>Guardar PDF</strong>{" "}
            para descargarlo
          </div>
        </div>
      )}

      {/* VISTA COTIZACIÓN */}
      {vista === "cotizacion" && (
        <div>
          <div className="no-print" style={{ background: C.s2, padding: "12px 24px",
            display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <div style={{ fontSize: 13, color: C.gray }}>
              Vista previa del documento — así lo verá el cliente
            </div>
            <div style={{ display: "flex", gap: 8 }}>
              <button onClick={() => setVista("calculadora")}
                style={{ padding: "8px 16px", fontSize: 12, background: "transparent",
                  border: `1px solid ${C.border}`, color: C.gray, borderRadius: 7, cursor: "pointer" }}>
                ← Volver a editar
              </button>
              <button onClick={imprimirPDF}
                style={{ padding: "8px 18px", fontSize: 12, fontWeight: 800, borderRadius: 7,
                  background: C.green, border: "none", color: C.white, cursor: "pointer",
                  display: "flex", alignItems: "center", gap: 6 }}>
                🖨️ Guardar PDF
              </button>
            </div>
          </div>
          <div style={{ maxWidth: 860, margin: "24px auto", padding: "0 20px 60px" }}>
            <VistaCotizacion
              items={items}
              cliente={cliente}
              numero={numero}
              fecha={fecha}
              validez={validez}
              condiciones={condiciones}
            />
          </div>
        </div>
      )}
    </div>
  );
}
