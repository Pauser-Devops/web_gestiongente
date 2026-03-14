import { useState, useEffect, useMemo } from 'react'
import { getRequests } from '../services/requests'
import { toSecureUrl } from '../lib/supabase'
import { useAuth } from '../context/AuthContext'
import { ChevronLeft, ChevronRight, Filter, Users, Calendar, Clock, Info, Download } from 'lucide-react'
import Modal from '../components/ui/Modal'
import * as XLSX from '@e965/xlsx'
import { useToast } from '../context/ToastContext'

const CalendarRequests = () => {
  const { user } = useAuth()
  const { showToast } = useToast()
  const [currentDate, setCurrentDate] = useState(new Date())
  const [requests, setRequests] = useState([])
  const [loading, setLoading] = useState(true)
  const [exporting, setExporting] = useState(false)
  const [selectedDayInfo, setSelectedDayInfo] = useState(null) // { date: Date, requests: [] }

  const [filters, setFilters] = useState({
    VACACIONES: true,
    SALUD: true,
    PERSONAL: true,
    OTROS: true
  })

  useEffect(() => {
    fetchRequests()
  }, [])

  const fetchRequests = async () => {
    try {
      const { data } = await getRequests()
      if (data) {
          let filteredData = data
          
          // --- FILTRADO DE SEGURIDAD POR SEDE/UNIDAD ---
          const normalize = (str) => str ? str.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toUpperCase() : "";
          const userPosition = normalize(user?.position);
          
          const isGlobalAdmin = 
            user?.role === 'ADMIN' || 
            user?.role === 'SUPER ADMIN' || 
            user?.role === 'JEFE_RRHH' || 
            (user?.permissions && user?.permissions['*']) ||
            // Excepción Part Time ADM CENTRAL
            (userPosition.includes('ANALISTA DE GENTE') && userPosition.includes('PART TIME') && 
             user?.sede === 'ADM.CENTRAL' &&
             (user?.business_unit?.toUpperCase() === 'ADMINISTRACIÓN' || user?.business_unit?.toUpperCase() === 'ADMINISTRACION'));
          
          // Filtrar canceladas o rechazadas (Nuevo requerimiento)
          filteredData = filteredData.filter(req => {
            const status = (req.status || '').toUpperCase()
            return status !== 'CANCELADO' && status !== 'RECHAZADO'
          })

          if (!isGlobalAdmin) {
              if (user?.sede) {
                  filteredData = filteredData.filter(req => req.employees?.sede === user.sede)
              }
              if (user?.business_unit) {
                  filteredData = filteredData.filter(req => req.employees?.business_unit === user.business_unit)
              }
          }
          
          setRequests(filteredData)
      }
    } catch (error) {
      console.error("Error cargando solicitudes:", error)
    } finally {
      setLoading(false)
    }
  }

  const getDaysInMonth = (date) => {
    const year = date.getFullYear()
    const month = date.getMonth()
    const days = new Date(year, month + 1, 0).getDate()
    const firstDay = new Date(year, month, 1).getDay()
    return { days, firstDay }
  }

  const handleExportExcel = () => {
      try {
          setExporting(true)
          
          // Preparar datos para Excel
          const exportData = filteredRequests.map(req => ({
              'Empleado': req.employees?.full_name || 'Desconocido',
              'DNI': req.employees?.dni || '',
              'Cargo': req.employees?.position || '',
              'Sede': req.employees?.sede || '',
              'Tipo Solicitud': req.request_type,
              'Fecha Inicio': req.start_date,
              'Fecha Fin': req.end_date,
              'Días Solicitados': req.total_days,
              'Estado': req.status,
              'Notas': req.notes || ''
          }))

          const wb = XLSX.utils.book_new()
          const ws = XLSX.utils.json_to_sheet(exportData)
          
          // Ajustar ancho de columnas
          const wscols = [
              {wch: 30}, // Empleado
              {wch: 12}, // DNI
              {wch: 25}, // Cargo
              {wch: 15}, // Sede
              {wch: 20}, // Tipo
              {wch: 12}, // Inicio
              {wch: 12}, // Fin
              {wch: 10}, // Días
              {wch: 12}, // Estado
              {wch: 40}  // Notas
          ]
          ws['!cols'] = wscols

          XLSX.utils.book_append_sheet(wb, ws, 'Solicitudes')
          
          const fileName = `Reporte_Solicitudes_${currentDate.toISOString().slice(0, 7)}.xlsx`
          XLSX.writeFile(wb, fileName)
          
          showToast('Reporte exportado correctamente', 'success')
      } catch (error) {
          console.error('Error exportando:', error)
          showToast('Error al generar el reporte', 'error')
      } finally {
          setExporting(false)
      }
  }

  const { days: totalDays, firstDay } = useMemo(() => getDaysInMonth(currentDate), [currentDate])
  
  const prevMonth = () => {
    setCurrentDate(new Date(currentDate.getFullYear(), currentDate.getMonth() - 1, 1))
  }

  const nextMonth = () => {
    setCurrentDate(new Date(currentDate.getFullYear(), currentDate.getMonth() + 1, 1))
  }

  const getRequestType = (type) => {
    if (!type) return 'OTROS'
    const t = type.toUpperCase()
    if (t.includes('VACACIONES')) return 'VACACIONES'
    if (t.includes('SALUD') || t.includes('MEDICO') || t.includes('ENFERMEDAD')) return 'SALUD'
    if (t.includes('PERSONAL') || t.includes('FAMILIAR')) return 'PERSONAL'
    return 'OTROS'
  }

  const getColor = (type) => {
    switch (type) {
      case 'VACACIONES': return 'bg-emerald-100 text-emerald-800 border-emerald-200'
      case 'SALUD': return 'bg-rose-100 text-rose-800 border-rose-200'
      case 'PERSONAL': return 'bg-amber-100 text-amber-800 border-amber-200'
      default: return 'bg-blue-100 text-blue-800 border-blue-200'
    }
  }
  
  const getDotColor = (type) => {
    switch (type) {
      case 'VACACIONES': return 'bg-emerald-500'
      case 'SALUD': return 'bg-rose-500'
      case 'PERSONAL': return 'bg-amber-500'
      default: return 'bg-blue-500'
    }
  }

  const filteredRequests = useMemo(() => requests.filter(req => {
    const type = getRequestType(req.request_type)
    return filters[type]
  }), [requests, filters])

  // Función para verificar si una solicitud cae en un día específico
  const getRequestsForDay = (day) => {
    const currentMonthStr = currentDate.toISOString().slice(0, 7) // YYYY-MM
    const dateStr = `${currentMonthStr}-${String(day).padStart(2, '0')}`
    
    return filteredRequests.filter(req => {
        return req.start_date <= dateStr && req.end_date >= dateStr
    })
  }

  const toggleFilter = (type) => {
    setFilters(prev => ({ ...prev, [type]: !prev[type] }))
  }

  const handleDayClick = (day, dayRequests) => {
    if (dayRequests.length === 0) return
    const currentMonthStr = currentDate.toISOString().slice(0, 7)
    const dateStr = `${currentMonthStr}-${String(day).padStart(2, '0')}`
    // Parsear fecha localmente para evitar desfases
    const [y, m, d] = dateStr.split('-').map(Number)
    const dateObj = new Date(y, m - 1, d)
    
    setSelectedDayInfo({
        date: dateObj,
        requests: dayRequests
    })
  }

  const daysOfWeek = ['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb']
  const monthNames = ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre']

  // Generar celdas vacías previas
  const emptyCells = Array(firstDay).fill(null)
  // Generar días del mes
  const daysCells = Array.from({ length: totalDays }, (_, i) => i + 1)

  return (
    <div className="p-6 max-w-7xl mx-auto">
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center mb-8 gap-4">
        <div>
            <h1 className="text-3xl font-bold text-gray-800">Calendario de Solicitudes</h1>
            <p className="text-gray-500 mt-1">Visualiza y filtra las ausencias del personal</p>
        </div>
        
        <div className="flex items-center gap-4">
            {/* Botón Exportar */}
            <button
                onClick={handleExportExcel}
                disabled={exporting || loading}
                className="flex items-center gap-2 px-4 py-2 bg-green-600 text-white rounded-lg shadow-sm hover:bg-green-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                title="Exportar listado visible a Excel"
            >
                {exporting ? (
                    <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin"></div>
                ) : (
                    <Download size={18} />
                )}
                <span className="hidden sm:inline">Exportar</span>
            </button>

            <div className="flex items-center gap-4 bg-white p-2 rounded-lg shadow-sm border border-gray-200">
                <button 
                    onClick={prevMonth} 
                    className="p-2 hover:bg-gray-100 rounded-full transition-colors focus:outline-none focus:ring-2 focus:ring-blue-500"
                    aria-label="Mes anterior"
                >
                    <ChevronLeft size={20} />
                </button>
                <span className="text-lg font-semibold w-40 text-center capitalize">
                    {monthNames[currentDate.getMonth()]} {currentDate.getFullYear()}
                </span>
                <button 
                    onClick={nextMonth} 
                    className="p-2 hover:bg-gray-100 rounded-full transition-colors focus:outline-none focus:ring-2 focus:ring-blue-500"
                    aria-label="Mes siguiente"
                >
                    <ChevronRight size={20} />
                </button>
            </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-4 gap-8">
        {/* Sidebar de Filtros y Leyenda */}
        <div className="lg:col-span-1 space-y-6">
            <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-200">
                <div className="flex items-center gap-2 mb-4 text-gray-700 font-semibold">
                    <Filter size={18} />
                    <h3>Filtros</h3>
                </div>
                <div className="space-y-3">
                    {Object.keys(filters).map(type => (
                        <label key={type} className="flex items-center gap-3 cursor-pointer group p-2 hover:bg-gray-50 rounded-lg transition-colors">
                            <div className="relative flex items-center">
                                <input 
                                    type="checkbox" 
                                    checked={filters[type]} 
                                    onChange={() => toggleFilter(type)}
                                    className="peer h-5 w-5 cursor-pointer appearance-none rounded-md border border-gray-300 transition-all checked:border-blue-500 checked:bg-blue-500 focus:ring-2 focus:ring-blue-200"
                                    aria-label={`Filtrar ${type}`}
                                />
                                <span className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 text-white opacity-0 peer-checked:opacity-100 pointer-events-none">
                                    <svg xmlns="http://www.w3.org/2000/svg" className="h-3.5 w-3.5" viewBox="0 0 20 20" fill="currentColor">
                                        <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                                    </svg>
                                </span>
                            </div>
                            <div className="flex items-center gap-2 flex-1">
                                <span className={`w-3 h-3 rounded-full ${getDotColor(type)}`}></span>
                                <span className="text-sm text-gray-600 group-hover:text-gray-900 capitalize">{type.toLowerCase()}</span>
                            </div>
                        </label>
                    ))}
                </div>
            </div>

            <div className="bg-blue-50 p-6 rounded-xl border border-blue-100">
                <h3 className="text-blue-900 font-semibold mb-2 flex items-center gap-2">
                    <Info size={16} />
                    Resumen del Mes
                </h3>
                <p className="text-sm text-blue-700">
                    Total de solicitudes visibles: <span className="font-bold text-lg ml-1">{filteredRequests.length}</span>
                </p>
            </div>
        </div>

        {/* Calendario Grid */}
        <div className="lg:col-span-3">
            <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
                {/* Días de la semana */}
                <div className="grid grid-cols-7 border-b border-gray-200 bg-gray-50">
                    {daysOfWeek.map(day => (
                        <div key={day} className="py-3 text-center text-sm font-semibold text-gray-500 uppercase tracking-wider">
                            {day}
                        </div>
                    ))}
                </div>

                {/* Días */}
                <div className="grid grid-cols-7 auto-rows-fr bg-gray-200 gap-px">
                    {emptyCells.map((_, i) => (
                        <div key={`empty-${i}`} className="bg-gray-50/50 min-h-[120px]"></div>
                    ))}
                    
                    {daysCells.map(day => {
                        const dayRequests = getRequestsForDay(day)
                        
                        const cellDate = new Date(currentDate.getFullYear(), currentDate.getMonth(), day)
                        const today = new Date()
                        today.setHours(0, 0, 0, 0)
                        
                        const isPast = cellDate < today
                        const isToday = 
                            day === new Date().getDate() && 
                            currentDate.getMonth() === new Date().getMonth() && 
                            currentDate.getFullYear() === new Date().getFullYear()

                        const hasRequests = dayRequests.length > 0
                        const maxVisible = 2
                        const visibleRequests = dayRequests.slice(0, maxVisible)
                        const hiddenCount = dayRequests.length - maxVisible
                        
                        // Agrupar ocultos por tipo para el tooltip/resumen
                        const hiddenSummary = dayRequests.slice(maxVisible).reduce((acc, req) => {
                            const type = getRequestType(req.request_type)
                            acc[type] = (acc[type] || 0) + 1
                            return acc
                        }, {})

                        return (
                            <div 
                                key={day} 
                                className={`bg-white min-h-[120px] p-2 transition-all hover:bg-blue-50/50 flex flex-col gap-1 relative group focus-within:ring-2 focus-within:ring-inset focus-within:ring-blue-500 ${isToday ? 'bg-blue-50/30' : ''}`}
                                onClick={() => handleDayClick(day, dayRequests)}
                                role="button"
                                tabIndex={hasRequests ? 0 : -1}
                                onKeyDown={(e) => {
                                    if ((e.key === 'Enter' || e.key === ' ') && hasRequests) {
                                        e.preventDefault()
                                        handleDayClick(day, dayRequests)
                                    }
                                }}
                                aria-label={`${day} de ${monthNames[currentDate.getMonth()]}, ${dayRequests.length} solicitudes`}
                            >
                                <div className="flex justify-between items-start">
                                    <span className={`text-sm font-medium w-7 h-7 flex items-center justify-center rounded-full transition-transform ${isToday ? 'bg-blue-600 text-white shadow-md scale-105' : 'text-gray-700 group-hover:scale-110'}`}>
                                        {day}
                                    </span>
                                    {hasRequests && (
                                        <span className="text-[10px] font-bold text-gray-500 bg-gray-100 px-1.5 py-0.5 rounded-full border border-gray-200 group-hover:bg-blue-100 group-hover:text-blue-700 transition-colors">
                                            {dayRequests.length}
                                        </span>
                                    )}
                                </div>
                                
                                <div className="flex flex-col gap-1 mt-1 flex-1">
                                    {visibleRequests.map(req => {
                                        const type = getRequestType(req.request_type)
                                        let style = getColor(type)
                                        
                                        // Si el día ya pasó, mostramos en gris/transparente
                                        if (isPast) {
                                            style = 'bg-gray-100 text-gray-400 border-gray-200 opacity-70 grayscale'
                                        }

                                        return (
                                            <div 
                                                key={req.id} 
                                                className={`text-[10px] px-2 py-1 rounded-md border-l-2 truncate cursor-pointer transition-transform hover:-translate-y-0.5 hover:shadow-sm ${style}`}
                                                title={`${req.employees?.full_name} - ${req.request_type}`}
                                            >
                                                <span className="font-semibold">{req.employees?.full_name?.split(' ')[0]}</span>
                                            </div>
                                        )
                                    })}
                                    
                                    {hiddenCount > 0 && (
                                        <div className="mt-auto pt-1">
                                            <div className="text-[10px] font-medium text-gray-500 text-center bg-gray-50 rounded-md py-1 border border-dashed border-gray-300 group-hover:border-blue-300 group-hover:bg-blue-50 group-hover:text-blue-600 transition-colors cursor-pointer">
                                                +{hiddenCount} más
                                            </div>
                                            {/* Tooltip personalizado al hacer hover en "más" o en la celda */}
                                            <div className="absolute left-1/2 bottom-2 -translate-x-1/2 translate-y-full opacity-0 group-hover:opacity-100 pointer-events-none transition-opacity z-20 w-48 bg-gray-900 text-white text-xs rounded-lg py-2 px-3 shadow-xl">
                                                <div className="font-bold mb-1 border-b border-gray-700 pb-1">Resumen</div>
                                                {Object.entries(hiddenSummary).map(([type, count]) => (
                                                    <div key={type} className="flex justify-between items-center py-0.5">
                                                        <span className="capitalize text-gray-300">{type.toLowerCase()}</span>
                                                        <span className="font-bold bg-gray-800 px-1.5 rounded text-[10px]">{count}</span>
                                                    </div>
                                                ))}
                                                <div className="text-[9px] text-gray-400 mt-1 text-center italic">Clic para ver detalles</div>
                                            </div>
                                        </div>
                                    )}
                                </div>
                            </div>
                        )
                    })}
                </div>
            </div>
        </div>
      </div>

      {/* Modal de Detalles */}
      <Modal
        isOpen={!!selectedDayInfo}
        onClose={() => setSelectedDayInfo(null)}
        title={selectedDayInfo ? `Solicitudes del ${selectedDayInfo.date.toLocaleDateString('es-ES', { weekday: 'long', day: 'numeric', month: 'long' })}` : ''}
        showCancel={false}
        confirmText="Cerrar"
        onConfirm={() => setSelectedDayInfo(null)}
      >
        <div className="space-y-4 max-h-[60vh] overflow-y-auto pr-2 custom-scrollbar">
            {selectedDayInfo?.requests.map(req => {
                const type = getRequestType(req.request_type)
                const style = getColor(type)
                return (
                    <div key={req.id} className={`p-3 rounded-lg border ${style} bg-opacity-10 border-opacity-50 flex justify-between items-start hover:shadow-sm transition-shadow`}>
                        <div className="flex items-start gap-3">
                            <div className="mt-1">
                                {req.employees?.profile_picture_url ? (
                                    <img src={toSecureUrl(req.employees.profile_picture_url)} alt="" className="w-10 h-10 rounded-full object-cover border-2 border-white shadow-sm" />
                                ) : (
                                    <div className={`w-10 h-10 rounded-full flex items-center justify-center text-lg font-bold bg-white/50`}>
                                        {req.employees?.full_name?.charAt(0)}
                                    </div>
                                )}
                            </div>
                            <div>
                                <h4 className="font-bold text-gray-900">{req.employees?.full_name}</h4>
                                <div className="flex items-center gap-2 text-xs mt-1 opacity-80 font-medium">
                                    <span className="uppercase tracking-wide">{req.employees?.position || 'Sin cargo'}</span>
                                    <span>•</span>
                                    <span className="capitalize">{type.toLowerCase()}</span>
                                    {/* Badge de estado en el modal */}
                                    <span className={`px-1.5 py-0.5 rounded text-[10px] font-bold border ${
                                        req.status === 'APROBADO' ? 'bg-green-100 text-green-700 border-green-200' :
                                        req.status === 'RECHAZADO' ? 'bg-red-100 text-red-700 border-red-200' :
                                        'bg-yellow-100 text-yellow-700 border-yellow-200'
                                    }`}>
                                        {req.status}
                                    </span>
                                </div>
                                {req.notes && (
                                    <p className="text-xs mt-2 italic opacity-90 bg-white/50 p-1.5 rounded">
                                        "{req.notes}"
                                    </p>
                                )}
                            </div>
                        </div>
                        <div className="text-right shrink-0">
                            <div className="flex items-center justify-end gap-1 text-xs font-semibold">
                                <Calendar size={12} />
                                {req.total_days} días
                            </div>
                            <div className="text-[10px] mt-1 opacity-75">
                                {new Date(req.start_date).toLocaleDateString('es-ES', { day: '2-digit', month: 'short' })} - {new Date(req.end_date).toLocaleDateString('es-ES', { day: '2-digit', month: 'short' })}
                            </div>
                        </div>
                    </div>
                )
            })}
        </div>
      </Modal>
    </div>
  )
}

export default CalendarRequests
