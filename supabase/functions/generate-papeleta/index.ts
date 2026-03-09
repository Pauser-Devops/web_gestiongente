// supabase/functions/generate-papeleta/index.ts
// Edge Function auto-contenida: genera el PDF de la papeleta con pdf-lib (Deno).
// No depende de Vercel ni de ningún servicio externo.
// DEPLOY: supabase functions deploy generate-papeleta

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { PDFDocument, StandardFonts, rgb } from 'https://esm.sh/pdf-lib@1.17.1'

const SUPABASE_URL        = Deno.env.get('SUPABASE_URL')!
const SUPABASE_SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY)

// ── Utilidades de fecha ──────────────────────────────────────────────────────
function fmtDate(s: string): string {
  if (!s) return '--/--/----'
  // Crear fecha asumiendo mediodía para evitar problemas de zona horaria
  const [y, m, d] = s.split('-').map(Number)
  const date = new Date(y, m - 1, d)
  return date.toLocaleDateString('es-PE', {
    day: '2-digit', month: '2-digit', year: 'numeric',
  })
}

function fmtLongDate(d: Date): string {
  const M = ['ENERO','FEBRERO','MARZO','ABRIL','MAYO','JUNIO',
             'JULIO','AGOSTO','SEPTIEMBRE','OCTUBRE','NOVIEMBRE','DICIEMBRE']
  return `${d.getDate()} DE ${M[d.getMonth()]} DE ${d.getFullYear()}`
}

// ── Generador PDF con pdf-lib ────────────────────────────────────────────────
// Ajustado para maximizar el ancho (MX=15) y coincidir con el diseño web (HTML/Tailwind)
// Web: border-[3px] outer, border-[2px] sections.
//
// Medidas ajustadas:
//   A4 Width = 595.28pt
//   MX = 15pt (~5mm) -> Área útil = 565.28pt (Más ancho que antes)
//
//   Alturas (puntos):
//   TH (Título) = 28pt
//   AH (Sec A)  = 48pt
//   BH (Sec B)  = 70pt
//   CH (Sec C)  = 24pt
//   SH (Firmas) = 90pt
//   FH (Footer) = 28pt
//   Total ~ 288pt por copia.

const PW = 595.28
const PH = 841.89
const MX = 15   // Margen reducido para aprovechar laterales (antes 20)

async function buildPDF(data: Record<string, any>): Promise<Uint8Array> {
  const doc  = await PDFDocument.create()
  const page = doc.addPage([PW, PH])

  const B  = await doc.embedFont(StandardFonts.HelveticaBold)
  const R  = await doc.embedFont(StandardFonts.Helvetica)
  const BI = await doc.embedFont(StandardFonts.HelveticaOblique)

  // Colores idénticos al CSS
  const K   = rgb(0, 0, 0)
  const BLU = rgb(0.117, 0.251, 0.686)   // #1e40af (text-blue-800)
  const DBL = rgb(0.117, 0.227, 0.541)   // #1e3a8a (text-blue-900)
  const LBL = rgb(0.145, 0.388, 0.922)   // #2563eb (text-blue-600)
  const GRY = rgb(0.42, 0.42, 0.42)
  const LGR = rgb(0.98, 0.98, 0.98)      // bg-gray-50
  const WHI = rgb(1, 1, 1)

  const TH = 28, AH = 48, BH = 70, CH = 24, SH = 90, FH = 28
  const COPY_H = TH + AH + BH + CH + SH + FH  // ~288pt

  // ── helpers ─────────────────────────────────────────────────────────────
  // Líneas con grosor variable para simular border-[3px] vs border-[1px]
  const hl = (lx:number, ly:number, lw:number, t=1) =>
    page.drawLine({ start:{x:lx,y:ly}, end:{x:lx+lw,y:ly}, color:K, thickness:t })
  const vl = (lx:number, ly:number, lh:number, t=1) =>
    page.drawLine({ start:{x:lx,y:ly}, end:{x:lx,y:ly+lh}, color:K, thickness:t })
  const txt = (s:string, tx:number, ty:number, f:typeof B, sz:number, c=K, mw?:number) =>
    page.drawText(s, { x:tx, y:ty, font:f, size:sz, color:c, ...(mw?{maxWidth:mw}:{}) })
  const fill = (rx:number, ry:number, rw:number, rh:number, bg:ReturnType<typeof rgb>) =>
    page.drawRectangle({ x:rx, y:ry, width:rw, height:rh, color:bg, borderWidth:0 })
  const box = (rx:number, ry:number, rw:number, rh:number, bg=WHI, bw=1) =>
    page.drawRectangle({ x:rx, y:ry, width:rw, height:rh, color:bg, borderColor:K, borderWidth:bw })

  function drawCopy(yTop: number, copyType: string): number {
    const W  = PW - 2*MX   // 565.28pt
    const LW = 28           // Ancho letra A/B/C (un poco más ancho)
    const LB = 75           // Etiqueta principal (EL EMPLEADOR...)
    const HW = (W - LW) / 2 // Mitad del contenido restante

    let y = yTop

    // Marco exterior de la copia (border-[3px])
    page.drawRectangle({ x:MX, y:y-COPY_H, width:W, height:COPY_H,
                         color:WHI, borderColor:K, borderWidth:3 })

    // ══ TÍTULO ═══════════════════════════════════════════════════════════════
    // bg-gray-50 border-b-[3px]
    fill(MX, y-TH, W, TH, LGR)
    hl(MX, y-TH, W, 3) 
    const ts = 'PAPELETA DE VACACIONES'
    // text-xl (20px -> ~15pt) tracking-widest
    txt(ts, MX+(W-B.widthOfTextAtSize(ts,15))/2, y-TH+9, B, 15)
    y -= TH

    // ══ SECCIÓN A: Empleador ═════════════════════════════════════════════════
    // border-b-[2px]
    hl(MX, y-AH, W, 2)
    // border-r-[2px] para la caja de letra
    vl(MX+LW, y-AH, AH, 2)
    txt('A', MX+(LW-B.widthOfTextAtSize('A',16))/2, y-AH/2-5, B, 16)

    const R1=16, R2=16                
    const R3 = AH - R1 - R2           

    // A fila 1: EL EMPLEADOR | nombre
    hl(MX+LW, y-R1, W-LW, 1)
    vl(MX+LW+LB, y-R1, R1, 1)
    txt('EL EMPLEADOR', MX+LW+4, y-R1+5, B, 8)
    txt(data.employer.nombre, MX+LW+LB+4, y-R1+5, B, 8, BLU)

    // A fila 2: con RUC | Domicilio
    const RL=40, DomL=45
    hl(MX+LW, y-R1-R2, W-LW, 1)
    vl(MX+LW+HW, y-R1-R2, R2, 1) // Separador central
    vl(MX+LW+RL, y-R1-R2, R2, 1) // Separador RUC
    
    txt('con RUC', MX+LW+3, y-R1-R2+5, B, 7)
    txt(data.employer.ruc, MX+LW+RL+3, y-R1-R2+5, R, 7)
    
    vl(MX+LW+HW+DomL, y-R1-R2, R2, 1) // Separador Domicilio
    txt('Domicilio', MX+LW+HW+3, y-R1-R2+5, B, 7)
    // Domicilio más pequeño para que quepa
    txt(data.employer.domicilio, MX+LW+HW+DomL+3, y-R1-R2+5, R, 6, K, HW-DomL-4)

    // A fila 3: Representante
    vl(MX+LW+LB, y-AH, R3, 1)
    txt('Representante', MX+LW+4, y-AH+R3/2-3, B, 7.5)
    txt(`${data.employer.representante} (DNI: ${data.employer.dni_representante})`,
        MX+LW+LB+4, y-AH+R3/2-3, R, 7.5)
    y -= AH

    // ══ SECCIÓN B: Trabajador ════════════════════════════════════════════════
    hl(MX, y-BH, W, 2)
    vl(MX+LW, y-BH, BH, 2)
    txt('B', MX+(LW-B.widthOfTextAtSize('B',16))/2, y-BH/2-5, B, 16)

    const DL2=40, CL=45

    // B fila 1: EL TRABAJADOR | nombre
    hl(MX+LW, y-R1, W-LW, 1)
    vl(MX+LW+LB, y-R1, R1, 1)
    txt('EL TRABAJADOR', MX+LW+4, y-R1+5, B, 8)
    txt(data.employee.name, MX+LW+LB+4, y-R1+5, B, 8, BLU)

    // B fila 2: DNI N° | CARGO
    hl(MX+LW, y-R1-R2, W-LW, 1)
    vl(MX+LW+HW, y-R1-R2, R2, 1)
    vl(MX+LW+DL2, y-R1-R2, R2, 1)
    
    txt('DNI N\xBA', MX+LW+3, y-R1-R2+5, B, 7)
    txt(data.employee.dni, MX+LW+DL2+3, y-R1-R2+5, B, 8, BLU)
    
    vl(MX+LW+HW+CL, y-R1-R2, R2, 1)
    txt('CARGO', MX+LW+HW+3, y-R1-R2+5, B, 7)
    txt(data.employee.position, MX+LW+HW+CL+3, y-R1-R2+5, B, 7.5, K, HW-CL-4)

    // B fechas
    const DH  = BH - R1 - R2
    const daY = y - R1 - R2
    const mid = daY - DH/2
    const bW  = 90, bH = 24  // Cajas más grandes
    const bY  = mid - bH/2
    const tY  = mid - 4

    const areaW = W - LW
    const g1cx  = MX + LW + areaW*0.25
    const g2cx  = MX + LW + areaW*0.75
    const lblW  = 40
    
    // Grupo 1: Salida
    const bx1 = g1cx - bW/2 + lblW/2
    const lx1 = bx1 - lblW - 6
    txt('FECHA DE', lx1, mid+5, B, 6, LBL)
    txt('SALIDA',   lx1, mid-4, B, 6, LBL)
    box(bx1, bY, bW, bH, WHI, 2)
    const fs = data.dates.formattedStart
    txt(fs, bx1+(bW-B.widthOfTextAtSize(fs,13))/2, tY, B, 13)

    // Grupo 2: Término
    const bx2 = g2cx - bW/2 + lblW/2
    const lx2 = bx2 - lblW - 6
    txt('FECHA DE',  lx2, mid+5, B, 6, LBL)
    txt('T\xC9RMINO', lx2, mid-4, B, 6, LBL)
    box(bx2, bY, bW, bH, WHI, 2)
    const fe = data.dates.formattedEnd
    txt(fe, bx2+(bW-B.widthOfTextAtSize(fe,13))/2, tY, B, 13)

    y -= BH

    // ══ SECCIÓN C: Motivo ════════════════════════════════════════════════════
    hl(MX, y-CH, W, 2)
    vl(MX+LW, y-CH, CH, 2)
    txt('C', MX+(LW-B.widthOfTextAtSize('C',16))/2, y-CH/2-5, B, 16)

    // Checkboxes
    const cbY  = y - CH/2 - 4
    const cbSz = 12
    const checks = [
      { l:'PERSONALES', c:data.flags.isPersonal,   cx: MX+LW+30 },
      { l:'SALUD',      c:data.flags.isSalud,      cx: MX+LW+180 },
      { l:'VACACIONES', c:data.flags.isVacaciones, cx: MX+LW+300 },
    ]
    for (const i of checks) {
      txt(i.l, i.cx, cbY, B, 8)
      const lw2 = B.widthOfTextAtSize(i.l, 8)
      box(i.cx+lw2+5, cbY-2, cbSz, cbSz)
      if (i.c) txt('X', i.cx+lw2+7, cbY, B, 10)
    }
    y -= CH

    // ══ FIRMAS ════════════════════════════════════════════════════════════════
    // Ajustar posiciones
    txt(`${data.employee.sede}, ${data.dates.formattedEmission}`, MX+12, y-12, B, 8)

    const sigLineY = y - 68
    const dash = [2, 2] as number[]
    const sigW  = 120  // Líneas más anchas

    // Firma 1: Empleador
    // Centrar en el primer tercio del área de firmas
    const s1Center = MX + (W-60)/4 + 10 // Aprox
    const s1x = s1Center - sigW/2
    
    page.drawLine({ start:{x:s1x,y:sigLineY}, end:{x:s1x+sigW,y:sigLineY},
                    color:K, thickness:0.7, dashArray:dash })
    txt(data.employer.representante.substring(0,30), s1x, sigLineY-9, B, 7, K)
    txt(`DNI: ${data.employer.dni_representante}`, s1x, sigLineY-18, R, 6)

    // Firma 2: Trabajador
    const s2Center = MX + (W-60)*0.75 - 10
    const s2x = s2Center - sigW/2
    
    page.drawLine({ start:{x:s2x,y:sigLineY}, end:{x:s2x+sigW,y:sigLineY},
                    color:K, thickness:0.7, dashArray:dash })
    txt(data.employee.name.substring(0,30), s2x, sigLineY-9, B, 7, DBL)
    txt(`DNI: ${data.employee.dni}`, s2x, sigLineY-18, R, 6)

    // Huella
    const fpX = MX + W - 55
    box(fpX, y-80, 45, 65)
    txt('HUELLA', fpX+10, y-25, R, 6, GRY)
    page.drawEllipse({ x:fpX+22.5, y:y-50, xScale:12, yScale:14,
                       borderColor:rgb(0.85,0.85,0.85), borderWidth:1 })
    txt('INDICE', fpX+11, y-72, R, 5, GRY)
    txt('DERECHO', fpX+8, y-77, R, 5, GRY)
    
    y -= SH

    // ══ FOOTER ═══════════════════════════════════════════════════════════════
    // border-t-[3px]
    hl(MX, y, W, 3)
    txt('PAUSER', MX+10, y-FH+10, B, 11)
    page.drawLine({ start:{x:MX+58,y:y-FH+16}, end:{x:MX+58,y:y-FH+6},
                    color:GRY, thickness:1 })
    txt('RECURSOS HUMANOS', MX+64, y-FH+11, B, 6, GRY)

    // Badge COPIA
    const badgeW = 100
    const badgeX = MX + W - badgeW
    vl(badgeX, y-FH, FH, 3) // borde izquierdo del badge
    fill(badgeX, y-FH, badgeW, FH, rgb(0.96,0.96,0.96))
    txt(`COPIA ${copyType}`, badgeX+12, y-FH+10, BI, 9)
    // Borde inferior ya dibujado por el loop siguiente o final
    hl(MX, y-FH, W, 2)
    y -= FH

    return y
  }

  // Dibujar copia EMPRESA
  const y1end = drawCopy(PH - 20, 'EMPRESA')

  // Línea de corte
  const sepY = y1end - 15
  // WinAnsi no soporta ✂ (0x2702), usamos caracteres estándar
  const st   = '- CORTAR AQUI -'
  page.drawLine({ start:{x:MX,y:sepY}, end:{x:PW-MX,y:sepY},
                  color:rgb(0.6,0.6,0.6), thickness:1, dashArray:[6,3] })
  // Fondo blanco para el texto de corte
  const stW = R.widthOfTextAtSize(st, 7)
  const stBgW = stW + 10
  fill((PW-stBgW)/2, sepY-3.5, stBgW, 7, WHI)
  txt(st, (PW-stW)/2, sepY-2, R, 7, rgb(0.5,0.5,0.5))

  // Dibujar copia EMPLEADO
  drawCopy(sepY - 25, 'EMPLEADO')

  return await doc.save()
}

// ── Handler principal ────────────────────────────────────────────────────────
Deno.serve(async (req: Request) => {
  try {
    // CORS headers
    const headers = {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
      'Content-Type': 'application/json'
    }

    if (req.method === 'OPTIONS') {
      return new Response('ok', { headers })
    }

    const payload = await req.json()
    const record  = payload.record

    if (!record?.id) {
      return new Response(JSON.stringify({ error: 'No record in payload' }), { status: 400, headers })
    }

    // 1. Obtener datos solicitud + empleado
    const { data: request, error: reqErr } = await supabase
      .from('vacation_requests')
      .select(`
        *,
        employees!vacation_requests_employee_id_fkey (
          id, full_name, dni, position, sede, email
        )
      `)
      .eq('id', record.id)
      .single()

    if (reqErr || !request) throw new Error(`Error obteniendo solicitud: ${reqErr?.message}`)

    const emp = request.employees as Record<string, any>

    // 2. Obtener firmante (jefe inmediato) via RPC
    // IMPORTANTE: .rpc devuelve array si la función es TABLE, usar maybeSingle() o tratar como array
    const { data: signerData, error: rpcErr } = await supabase
      .rpc('get_signing_authority', { p_employee_id: request.employee_id })

    if (rpcErr) console.error('Error RPC get_signing_authority:', rpcErr)

    // Manejar array o objeto
    let signer = null
    if (Array.isArray(signerData) && signerData.length > 0) {
      signer = signerData[0]
    } else if (signerData && !Array.isArray(signerData)) {
      signer = signerData
    }

    // Fallback si no hay supervisor
    const defaultSigner = { full_name: 'GIANCARLO URBINA GAITAN', dni: '18161904' }
    const finalSigner = signer || defaultSigner

    // 3. Construir datos render
    const rt    = (request.request_type || 'VACACIONES').toUpperCase()
    const isVac = rt.includes('VACACIONES')
    const isSal = rt.includes('SALUD') || rt.includes('MEDICO')

    const renderData = {
      employer: {
        nombre:            'PAUSER DISTRIBUCIONES S.A.C.',
        ruc:               '20600869940',
        domicilio:         'JR. PEDRO MU\xD1IZ NRO. 253 DPTO. 1601 SEC. JORGE CHAVEZ LA LIBERTAD - TRUJILLO',
        representante:     (finalSigner.full_name || 'GIANCARLO URBINA GAITAN').toUpperCase(),
        dni_representante: finalSigner.dni || '18161904',
      },
      employee: {
        name:     (emp.full_name || '').toUpperCase(),
        dni:      emp.dni || '00000000',
        position: (emp.position || '').toUpperCase(),
        sede:     (emp.sede || 'TRUJILLO').toUpperCase(),
      },
      flags: {
        isPersonal:   !isVac && !isSal,
        isSalud:      isSal,
        isVacaciones: isVac,
      },
      dates: {
        formattedStart:    fmtDate(request.start_date),
        formattedEnd:      fmtDate(request.end_date),
        formattedEmission: fmtLongDate(new Date()),
      },
    }

    // 4. Generar PDF
    const pdfBytes = await buildPDF(renderData)

    // 5. Subir Storage
    const storagePath = `papeletas/${emp.dni}_${record.id}_${Date.now()}.pdf`
    const { error: uploadErr } = await supabase.storage
      .from('papeletas')
      .upload(storagePath, pdfBytes, { contentType: 'application/pdf', upsert: false })

    if (uploadErr) throw new Error(`Error subiendo PDF: ${uploadErr.message}`)

    // 6. URL Pública
    const { data: urlData } = supabase.storage.from('papeletas').getPublicUrl(storagePath)

    // Reemplazar hostname interno de Docker (kong) con la IP pública del servidor
    const publicUrl = urlData.publicUrl
      .replace('http://kong:8000', 'http://161.132.48.71:8000')
      .replace('https://kong:8000', 'http://161.132.48.71:8000')

    // 7. Update registro
    await supabase
      .from('vacation_requests')
      .update({ pdf_url: publicUrl })
      .eq('id', record.id)

    return new Response(
      JSON.stringify({ success: true, pdf_url: publicUrl }),
      { status: 200, headers }
    )

  } catch (err: any) {
    console.error('Error:', err)
    return new Response(
      JSON.stringify({ error: err.message }),
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    )
  }
})
