import { useState, useEffect, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { getRequests, getSigningAuthority } from '../services/requests'
import { useAuth } from '../context/AuthContext'
import { useToast } from '../context/ToastContext'
import Modal from '../components/ui/Modal'
import { supabase } from '../lib/supabase'
import { generatePapeletaPDF, buildRenderData } from '../utils/generatePapeletaPDF'

import {
  FileText,
  Search,
  Printer,
  CheckCircle,
  XCircle,
  Clock,
  RefreshCw,
  ThumbsUp,
  ThumbsDown,
  Upload,
} from 'lucide-react'

// --- DATOS DEL EMPLEADOR (centralizados) ---
const EMPLOYER = {
  nombre: "PAUSER DISTRIBUCIONES S.A.C.",
  ruc: "20600869940",
  domicilio: "JR. PEDRO MUÑIZ NRO. 253 DPTO. 1601 SEC. JORGE CHAVEZ LA LIBERTAD - TRUJILLO",
  representanteDefault: "GIANCARLO URBINA GAITAN",
  dniRepresentanteDefault: "18161904",
}

export default function RequestsList() {
  const navigate = useNavigate()
  const { user } = useAuth()
  const { showToast } = useToast()
  const [requests, setRequests] = useState([])
  const [loading, setLoading] = useState(true)
  const [searchTerm, setSearchTerm] = useState('')
  const [filterStatus, setFilterStatus] = useState('ALL')
  const [processingId, setProcessingId] = useState(null)
  const [modalConfig, setModalConfig] = useState({
    isOpen: false,
    title: '',
    message: '',
    type: 'info',
    onConfirm: null,
  })

  useEffect(() => {
    fetchRequests()
  }, [])

  const fetchRequests = async () => {
    setLoading(true)
    const { data, error } = await getRequests()
    if (!error && data) {
      let filteredData = data.map((req) => ({
        ...req,
        status: (req.status || 'PENDIENTE').trim().toUpperCase(),
      }))

      // 3. Filtrado de Seguridad
      const normalize = (str) => str ? str.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toUpperCase() : "";
      const userRole = normalize(user?.role);
      const userPosition = normalize(user?.position);

      const isGlobalAdmin =
        userRole === 'ADMIN' ||
        userRole === 'SUPER ADMIN' ||
        userRole === 'JEFE_RRHH' ||
        userPosition.includes('JEFE DE GENTE') || 
        userPosition.includes('GERENTE') ||
        userPosition.includes('GERENTE GENERAL') ||
        (user?.permissions && user?.permissions['*']) ||
        // Excepción Part Time ADM CENTRAL
        (userPosition.includes('ANALISTA DE GENTE') && userPosition.includes('PART TIME') && 
         user?.sede === 'ADM. CENTRAL' && 
         (user?.business_unit?.toUpperCase() === 'ADMINISTRACIÓN' || user?.business_unit?.toUpperCase() === 'ADMINISTRACION'))
      
      const isBoss = userRole.includes('JEFE') || 
                     userRole.includes('GERENTE') || 
                     userPosition.includes('JEFE') || 
                     userPosition.includes('GERENTE') ||
                     userPosition.includes('COORDINADOR') ||
                     userPosition.includes('SUPERVISOR');

      if (!isGlobalAdmin) {
          // Para usuarios no admin (incluyendo Jefes), usamos la lógica de Áreas
          // Obtenemos los empleados permitidos para este usuario
          const { data: allowedEmployees } = await supabase.rpc('get_employees_by_user_area')
          
          if (allowedEmployees) {
              const allowedIds = new Set(allowedEmployees.map(e => e.id))
              filteredData = filteredData.filter(req => allowedIds.has(req.employee_id))
          } else {
              // Si falla o no hay empleados, no mostrar nada por seguridad
              filteredData = []
          }

          // FILTRADO ESTRICTO ADICIONAL POR SEDE Y UNIDAD DE NEGOCIO
          // Solo se aplica si NO es Jefe/Supervisor, ya que ellos deben ver toda su área (que puede ser multi-sede)
          if (user?.sede && !isBoss) {
              filteredData = filteredData.filter(req => req.employees?.sede === user.sede)
          }

          if (user?.business_unit && !isBoss) {
              filteredData = filteredData.filter(req => req.employees?.business_unit === user.business_unit)
          }
      }

      setRequests(filteredData)
    }
    setLoading(false)
  }

  // --- GENERAR Y SUBIR PDF A SUPABASE ---
  const generateAndUploadPDF = async (request) => {
    // 1. Obtener Autoridad Firmante (Jefe Inmediato)
    const empId = request.employee_id || request.employees?.id
    const { data: signer } = await getSigningAuthority(empId)
    
    // Crear objeto 'user' simulado con los datos del firmante para el generador
    const signerUser = signer ? {
        full_name: signer.full_name,
        dni: signer.dni
    } : null

    const renderData = buildRenderData({ request, employer: EMPLOYER, user: signerUser })
    const filename = `Papeleta_${request.employees?.dni || 'empleado'}_${request.id}`

    const pdfBlob = await generatePapeletaPDF(renderData, filename, 'blob')

    const storagePath = `papeletas/${request.employees?.dni}_${request.id}_${Date.now()}.pdf`
    const { error: uploadError } = await supabase.storage
      .from('papeletas')
      .upload(storagePath, pdfBlob, {
        contentType: 'application/pdf',
        upsert: false,
      })

    if (uploadError) throw uploadError

    const { data: publicUrlData } = supabase.storage
      .from('papeletas')
      .getPublicUrl(storagePath)

    return publicUrlData.publicUrl
  }

  // --- MODAL DE CONFIRMACIÓN ---
  const openStatusModal = (id, newStatus) => {
    setModalConfig({
      isOpen: true,
      title: newStatus === 'APROBADO' ? 'Aprobar Solicitud' : 'Rechazar Solicitud',
      message: `¿Estás seguro de cambiar el estado a ${newStatus}?`,
      type: newStatus === 'APROBADO' ? 'info' : 'warning',
      confirmText: newStatus === 'APROBADO' ? 'Aprobar' : 'Rechazar',
      onConfirm: () => handleStatusChange(id, newStatus),
    })
  }

  // --- CAMBIAR ESTADO (APROBAR / RECHAZAR) ---
  const handleStatusChange = async (id, newStatus) => {
    setModalConfig((prev) => ({ ...prev, isOpen: false }))
    setProcessingId(id)
    try {
      let pdfUrl = null

      if (newStatus === 'APROBADO') {
        const request = requests.find((r) => r.id === id)
        if (request) {
          try {
            pdfUrl = await generateAndUploadPDF(request)
          } catch (err) {
            console.error('Error generando PDF:', err)
            showToast(
              'Error generando el PDF, pero se intentará aprobar. ' + err.message,
              'warning'
            )
          }
        }
      }

      const { error } = await supabase
        .from('vacation_requests')
        .update({
          status: newStatus,
          validated_by: user?.employee_id || null,
          validated_at: new Date().toISOString(),
          pdf_url: pdfUrl,
        })
        .eq('id', id)

      if (error) throw error

      setRequests((prev) =>
        prev.map((req) =>
          req.id === id ? { ...req, status: newStatus, pdf_url: pdfUrl } : req
        )
      )

      showToast(`Solicitud ${newStatus.toLowerCase()} correctamente`, 'success')
    } catch (error) {
      console.error(error)
      showToast('Error al actualizar el estado: ' + error.message, 'error')
    } finally {
      setProcessingId(null)
    }
  }

  // --- BADGE DE ESTADO ---
  const getStatusBadge = (status) => {
    switch (status?.toUpperCase()) {
      case 'APROBADO':
        return (
          <span className="flex items-center gap-1 text-green-600 bg-green-50 px-2 py-1 rounded-full text-xs font-medium">
            <CheckCircle size={12} /> Aprobado
          </span>
        )
      case 'COMPLETADO':
        return (
          <span className="flex items-center gap-1 text-blue-600 bg-blue-50 px-2 py-1 rounded-full text-xs font-medium">
            <CheckCircle size={12} /> Completado
          </span>
        )
      case 'RECHAZADO':
        return (
          <span className="flex items-center gap-1 text-red-600 bg-red-50 px-2 py-1 rounded-full text-xs font-medium">
            <XCircle size={12} /> Rechazado
          </span>
        )
      case 'CANCELADO':
        return (
          <span className="flex items-center gap-1 text-gray-600 bg-gray-100 px-2 py-1 rounded-full text-xs font-medium">
            <XCircle size={12} /> Cancelado
          </span>
        )
      case 'PENDIENTE':
        return (
          <span className="flex items-center gap-1 text-yellow-600 bg-yellow-50 px-2 py-1 rounded-full text-xs font-medium">
            <Clock size={12} /> Pendiente
          </span>
        )
      default:
        return (
          <span className="flex items-center gap-1 text-gray-500 bg-gray-50 px-2 py-1 rounded-full text-xs font-medium border border-gray-200">
            {status || 'Desconocido'}
          </span>
        )
    }
  }

  // --- FILTRADO ---
  const filteredRequests = requests.filter((req) => {
    const employeeName = req.employees?.full_name || 'Desconocido'
    const employeeDni = req.employees?.dni || ''
    const matchesSearch =
      employeeName.toLowerCase().includes(searchTerm.toLowerCase()) ||
      employeeDni.includes(searchTerm)
    const matchesStatus = filterStatus === 'ALL' || req.status === filterStatus
    return matchesSearch && matchesStatus
  })

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-800 flex items-center gap-2">
            <FileText className="text-blue-600" />
            Solicitudes
          </h1>
          <p className="text-gray-500 text-sm mt-1">
            Gestiona permisos, licencias y vacaciones
          </p>
        </div>
        <button
          onClick={fetchRequests}
          className="flex items-center justify-center gap-2 px-4 py-2 bg-white border border-gray-200 rounded-lg text-gray-600 hover:bg-gray-50 transition-colors text-sm font-medium w-full md:w-auto"
        >
          <RefreshCw size={18} className={loading ? 'animate-spin' : ''} />
          Actualizar
        </button>
      </div>

      {/* Filtros */}
      <div className="bg-white p-4 rounded-xl shadow-sm border border-gray-100 grid grid-cols-1 md:grid-cols-12 gap-4 items-center">
        <div className="md:col-span-8 lg:col-span-9 relative">
          <Search
            className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400"
            size={20}
          />
          <input
            type="text"
            placeholder="Buscar por empleado o DNI..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full pl-10 pr-4 py-2 bg-gray-50 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all"
          />
        </div>
        <div className="md:col-span-4 lg:col-span-3">
          <select
            value={filterStatus}
            onChange={(e) => setFilterStatus(e.target.value)}
            className="w-full px-4 py-2 bg-white border border-gray-200 rounded-lg text-sm text-gray-600 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 cursor-pointer transition-all"
          >
            <option value="ALL">Todos los estados</option>
            <option value="PENDIENTE">Pendientes</option>
            <option value="APROBADO">Aprobados</option>
            <option value="COMPLETADO">Completados</option>
            <option value="RECHAZADO">Rechazados</option>
            <option value="CANCELADO">Cancelados</option>
          </select>
        </div>
      </div>

      {/* Tabla */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left">
            <thead>
              <tr className="bg-gray-50 border-b border-gray-100">
                <th className="px-6 py-4 text-xs font-semibold text-gray-500 uppercase tracking-wider">
                  Empleado
                </th>
                <th className="px-6 py-4 text-xs font-semibold text-gray-500 uppercase tracking-wider">
                  Tipo / Motivo
                </th>
                <th className="px-6 py-4 text-xs font-semibold text-gray-500 uppercase tracking-wider">
                  Fechas
                </th>
                <th className="px-6 py-4 text-xs font-semibold text-gray-500 uppercase tracking-wider">
                  Estado
                </th>
                <th className="px-6 py-4 text-xs font-semibold text-gray-500 uppercase tracking-wider text-right">
                  Acciones
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {loading ? (
                <tr>
                  <td colSpan="5" className="px-6 py-8 text-center text-gray-500">
                    <div className="flex justify-center items-center gap-2">
                      <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-blue-600" />
                      Cargando solicitudes...
                    </div>
                  </td>
                </tr>
              ) : filteredRequests.length === 0 ? (
                <tr>
                  <td colSpan="5" className="px-6 py-12 text-center text-gray-500">
                    No se encontraron solicitudes
                  </td>
                </tr>
              ) : (
                filteredRequests.map((req) => (
                  <tr key={req.id} className="hover:bg-gray-50 transition-colors">
                    {/* Empleado */}
                    <td className="px-6 py-4">
                      <div className="flex items-center gap-3">
                        <div className="w-8 h-8 rounded-full bg-blue-100 flex items-center justify-center text-blue-600 font-bold text-xs">
                          {req.employees?.full_name?.charAt(0) || '?'}
                        </div>
                        <div>
                          <p className="text-sm font-medium text-gray-900">
                            {req.employees?.full_name || 'Empleado no encontrado'}
                          </p>
                          <p className="text-xs text-gray-500">
                            {req.employees?.position || 'Sin cargo'}
                          </p>
                        </div>
                      </div>
                    </td>

                    {/* Tipo / Motivo */}
                    <td className="px-6 py-4">
                      <p className="text-sm font-medium text-gray-900">
                        {req.request_type || 'Solicitud'}
                      </p>
                      <p
                        className="text-xs text-gray-500 truncate max-w-[200px]"
                        title={req.notes || req.reason}
                      >
                        {req.notes || req.reason || '-'}
                      </p>
                    </td>

                    {/* Fechas */}
                    <td className="px-6 py-4">
                      <div className="text-sm text-gray-900">
                        <p>
                          Desde:{' '}
                          {new Date(req.start_date + 'T00:00:00').toLocaleDateString('es-PE')}
                        </p>
                        <p>
                          Hasta:{' '}
                          {new Date(req.end_date + 'T00:00:00').toLocaleDateString('es-PE')}
                        </p>
                        <p className="text-xs text-gray-500 mt-1">
                          ({req.total_days} días)
                        </p>
                      </div>
                    </td>

                    {/* Estado */}
                    <td className="px-6 py-4">
                      {getStatusBadge(req.status)}
                      
                      {/* Información de Aprobador (Para RRHH) */}
                      {(req.status === 'APROBADO' || req.status === 'RECHAZADO') && req.approver && (
                        <div className={`mt-2 text-[10px] p-2 rounded border leading-tight ${
                          req.status === 'APROBADO' 
                            ? 'bg-green-50 border-green-100 text-green-800' 
                            : 'bg-red-50 border-red-100 text-red-800'
                        }`}>
                          <strong className="block mb-1 opacity-75">
                            {req.status === 'APROBADO' ? 'APROBADO POR:' : 'RECHAZADO POR:'}
                          </strong>
                          <div className="font-medium">{req.approver.full_name}</div>
                          <div className="opacity-75">
                            {req.approver.sede} • {req.approver.business_unit || 'Sin Unidad'}
                          </div>
                          <div className="opacity-75 italic">{req.approver.position}</div>
                        </div>
                      )}
                    </td>

                    {/* Acciones */}
                    <td className="px-6 py-4 text-right">
                      <div className="flex justify-end gap-2">
                        {req.status === 'PENDIENTE' && (
                          <>
                            <button
                              onClick={() => openStatusModal(req.id, 'APROBADO')}
                              disabled={processingId === req.id || !req.signed_file_url}
                              className={`p-1.5 rounded-lg transition-colors ${
                                !req.signed_file_url 
                                  ? 'bg-gray-100 text-gray-400 cursor-not-allowed opacity-50' 
                                  : 'bg-green-50 text-green-600 hover:bg-green-100'
                              }`}
                              title={!req.signed_file_url ? "Pendiente de firma del empleado" : "Aprobar"}
                            >
                              <ThumbsUp size={16} />
                            </button>
                            <button
                              onClick={() => openStatusModal(req.id, 'RECHAZADO')}
                              disabled={processingId === req.id || !req.signed_file_url}
                              className={`p-1.5 rounded-lg transition-colors ${
                                !req.signed_file_url 
                                  ? 'bg-gray-100 text-gray-400 cursor-not-allowed opacity-50' 
                                  : 'bg-red-50 text-red-600 hover:bg-red-100'
                              }`}
                              title={!req.signed_file_url ? "Pendiente de firma del empleado" : "Rechazar"}
                            >
                              <ThumbsDown size={16} />
                            </button>
                          </>
                        )}

                        <button
                          onClick={() => navigate(`/papeleta/${req.id}`)}
                          className="inline-flex items-center gap-1 px-3 py-1.5 bg-white border border-gray-200 text-gray-700 rounded-lg hover:bg-gray-50 hover:border-blue-300 hover:text-blue-600 transition-all text-sm font-medium shadow-sm"
                          title="Ver Papeleta Generada"
                        >
                          <Printer size={16} />
                          <span className="hidden sm:inline">Papeleta</span>
                        </button>

                        {/* Botón para Ver Firmado (Solo si existe URL) */}
                        {req.signed_file_url && (
                          <a
                            href={req.signed_file_url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="inline-flex items-center gap-1 px-3 py-1.5 bg-indigo-50 border border-indigo-200 text-indigo-700 rounded-lg hover:bg-indigo-100 transition-all text-sm font-medium shadow-sm"
                            title="Ver Documento Firmado"
                          >
                            <FileText size={16} />
                            <span className="hidden sm:inline">Ver Firmado</span>
                          </a>
                        )}
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
      
      <Modal
        isOpen={modalConfig.isOpen}
        onClose={() => setModalConfig((prev) => ({ ...prev, isOpen: false }))}
        title={modalConfig.title}
        message={modalConfig.message}
        type={modalConfig.type}
        confirmText={modalConfig.confirmText}
        onConfirm={modalConfig.onConfirm}
        showCancel
      />
    </div>
  )
}