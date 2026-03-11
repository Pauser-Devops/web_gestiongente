import { useEffect, useState, useRef } from 'react'
import { useParams } from 'react-router-dom'
import { getPapeletaById, getSigningAuthority } from '../services/requests'
import { Printer, Download } from 'lucide-react'
import * as html2pdfPkg from 'html2pdf.js'
import { PapeletaTemplate } from './PapeletaTemplate'

const html2pdf = html2pdfPkg.default || html2pdfPkg

const formatDate = (dateString) => {
  if (!dateString) return '26/01/2026'
  const date = new Date(dateString + 'T00:00:00')
  return date.toLocaleDateString('es-PE', { day: '2-digit', month: '2-digit', year: 'numeric' })
}

const formatLongDate = (date) => {
  const months = ["ENERO","FEBRERO","MARZO","ABRIL","MAYO","JUNIO",
    "JULIO","AGOSTO","SEPTIEMBRE","OCTUBRE","NOVIEMBRE","DICIEMBRE"]
  return `${date.getDate()} DE ${months[date.getMonth()]} DE ${date.getFullYear()}`
}

// ─── CLAVE: parchea el documento clonado por html2canvas ───────────────────
// html2canvas clona todo el DOM + stylesheets. Tailwind v3/v4 usa oklch() en
// sus variables CSS, que canvas 2D no soporta → error "unsupported color function".
// Solución: editar el texto de cada <style> en el clon para quitar oklch.
const patchClonedDoc = (clonedDoc) => {
  // 1. Reemplazar oklch() en el texto de todos los <style>
  clonedDoc.querySelectorAll('style').forEach(tag => {
    try {
      // Regex que captura oklch(...) y lo reemplaza por un color seguro
      tag.textContent = tag.textContent
        .replace(/oklch\([^)]+\)/g, '#000000')
    } catch (_) {}
  })

  // 2. Inyectar override al final para neutralizar variables residuales
  const s = clonedDoc.createElement('style')
  s.textContent = `
    :root { color-scheme: light !important; }
    * { --tw-ring-color: rgba(59,130,246,.5) !important; }
  `
  clonedDoc.head.appendChild(s)

  // 3. Forzar estilos computados en elementos individuales
  clonedDoc.querySelectorAll('*').forEach(el => {
    try {
      const cs = clonedDoc.defaultView?.getComputedStyle(el)
      if (!cs) return
      if (cs.color?.includes('oklch'))            el.style.color = '#000000'
      if (cs.backgroundColor?.includes('oklch'))  el.style.backgroundColor = '#ffffff'
      if (cs.borderColor?.includes('oklch'))       el.style.borderColor = '#000000'
    } catch (_) {}
  })
}

// ─── Genera PDF desde un elemento del DOM ya renderizado ───────────────────
const captureElementToPdf = async (element, filename, mode = 'save') => {
  // Overlay blanco para tapar la pantalla durante la captura
  const overlay = document.createElement('div')
  overlay.style.cssText = 'position:fixed;inset:0;background:white;z-index:99998;pointer-events:none;'
  document.body.appendChild(overlay)

  const opt = {
    margin: 0,
    filename: `${filename}.pdf`,
    image: { type: 'jpeg', quality: 0.98 },
    html2canvas: {
      scale: 2,
      useCORS: true,
      backgroundColor: '#ffffff',
      logging: false,
      windowWidth: document.documentElement.scrollWidth,
      scrollX: 0,
      scrollY: -window.scrollY,
      // onclone recibe (clonedDoc, element) — aquí arreglamos los estilos del DOC completo
      onclone: (clonedDoc) => patchClonedDoc(clonedDoc),
    },
    jsPDF: { unit: 'mm', format: 'a4', orientation: 'portrait' },
  }

  try {
    const worker = html2pdf().set(opt).from(element)
    if (mode === 'blob') return await worker.output('blob')
    await worker.save()
  } finally {
    if (document.body.contains(overlay)) document.body.removeChild(overlay)
  }
}

const PapeletaFinal = () => {
  const { id } = useParams()
  const [papeleta, setPapeleta] = useState(null)
  const [signer, setSigner] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [downloading, setDownloading] = useState(false)
  const papeletaRef = useRef(null)

  useEffect(() => {
    const fetchData = async () => {
      if (!id) { setLoading(false); return }
      setLoading(true)
      try {
        const { data, error } = await getPapeletaById(id)
        if (error) throw new Error(error.message)
        setPapeleta(data)
        
        if (data?.employee_id) {
          const { data: signerData } = await getSigningAuthority(data.employee_id)
          if (signerData) setSigner(signerData)
        }
      } catch (err) {
        setError(err.message)
      } finally {
        setLoading(false)
      }
    }
    fetchData()
  }, [id])

  if (loading) return <div className="flex items-center justify-center min-h-screen">Cargando...</div>
  if (error)   return <div className="flex items-center justify-center min-h-screen text-red-600">Error: {error}</div>

  const safePapeleta = papeleta || {}
  const safeEmployee = safePapeleta.employees || {}

  const employeeName     = (safeEmployee.full_name || '').toUpperCase()
  const employeeDni      = safeEmployee.dni || '00000000'
  const employeePosition = (safeEmployee.position || '').toUpperCase()
  const emissionDate     = safePapeleta.created_at ? new Date(safePapeleta.created_at) : new Date()
  const employeeSede     = (safeEmployee.sede || 'TRUJILLO').toUpperCase()
  const employeeEmail    = safeEmployee.email

  const requestType  = (safePapeleta.request_type || 'VACACIONES').toUpperCase()
  const isVacaciones = requestType.includes('VACACIONES')
  const isSalud      = requestType.includes('SALUD') || requestType.includes('MEDICO')
  const isPersonal   = !isVacaciones && !isSalud

  const EMPLOYER_DATA = {
    nombre: "PAUSER DISTRIBUCIONES S.A.C.",
    ruc: "20600869940",
    domicilio: "JR. PEDRO MUÑIZ NRO. 253 DPTO. 1601 SEC. JORGE CHAVEZ LA LIBERTAD - TRUJILLO",
    representante: (signer?.full_name || "GIANCARLO URBINA GAITAN").toUpperCase(),
    dni_representante: signer?.dni || "18161904"
  }

  const renderData = {
    employer: EMPLOYER_DATA,
    employee: { name: employeeName, dni: employeeDni, position: employeePosition, sede: employeeSede },
    flags:    { isPersonal, isSalud, isVacaciones },
    dates: {
      emission: emissionDate,
      formattedStart:    formatDate(safePapeleta.start_date),
      formattedEnd:      formatDate(safePapeleta.end_date),
      formattedEmission: formatLongDate(emissionDate)
    }
  }

  const handleDownload = async () => {
    if (!papeletaRef.current) return
    setDownloading(true)
    try {
      await captureElementToPdf(papeletaRef.current, `Papeleta_${employeeDni}_${id}`, 'save')
    } catch (e) {
      console.error(e)
      alert('Error al descargar: ' + e.message)
    } finally {
      setDownloading(false)
    }
  }

  return (
    <div className="bg-gray-100 min-h-screen py-10 flex justify-center">

      <style dangerouslySetInnerHTML={{ __html: `
        @media print {
          @page { size: A4; margin: 18mm 10mm 8mm 10mm; }
          html, body { height: 100%; margin: 0; padding: 0; }
          body { visibility: hidden; }
          .printable-content {
            visibility: visible !important;
            position: absolute !important;
            left: 0 !important; top: 0 !important;
            width: 100% !important; margin: 0 !important;
            padding: 2mm 10mm !important;
            box-sizing: border-box !important;
            -webkit-print-color-adjust: exact !important;
            print-color-adjust: exact !important;
          }
          .printable-content * { visibility: visible !important; }
          .no-print { display: none !important; }
        }
      `}} />

      {/* BOTONES */}
      <div className="no-print fixed top-6 right-6 z-50 flex flex-col gap-3">
        <button
          onClick={() => window.print()}
          className="bg-blue-700 text-white px-6 py-3 rounded-full shadow-lg hover:bg-blue-800 font-bold flex items-center gap-2 transition-all"
        >
          <Printer size={20} /> IMPRIMIR
        </button>

        <button
          onClick={handleDownload}
          disabled={downloading}
          className={`px-6 py-3 rounded-full shadow-lg font-bold flex items-center gap-2 transition-all
            ${downloading ? 'bg-gray-400 text-gray-200 cursor-not-allowed' : 'bg-indigo-600 text-white hover:bg-indigo-700'}`}
        >
          {downloading
            ? <><div className="animate-spin rounded-full h-5 w-5 border-b-2 border-white" />Generando...</>
            : <><Download size={20} />DESCARGAR PDF</>}
        </button>
      </div>

      {/* CONTENIDO — ref para captura PDF */}
      <div
        ref={papeletaRef}
        id="papeleta-content"
        className="printable-content bg-white w-[210mm] h-auto shadow-2xl p-[5mm] text-black font-sans box-border flex flex-col items-center"
      >
        <div className="w-full">
          <PapeletaTemplate data={renderData} copyType="EMPRESA" />
        </div>

        <div className="w-full border-b-2 border-dashed border-gray-300 my-4 relative flex-shrink-0">
          <span className="absolute left-1/2 -top-3 -translate-x-1/2 bg-white px-2 text-[8px] text-gray-400 font-bold uppercase tracking-widest print:bg-transparent">
            Cortar Aquí
          </span>
        </div>

        <div className="w-full">
          <PapeletaTemplate data={renderData} copyType="EMPLEADO" />
        </div>
      </div>
    </div>
  )
}

export default PapeletaFinal