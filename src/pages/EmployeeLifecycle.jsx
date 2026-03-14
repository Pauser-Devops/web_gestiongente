import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../context/AuthContext'
import { useToast } from '../context/ToastContext'
import { 
  UserPlus, 
  UserMinus, 
  Calendar, 
  Search, 
  Download, 
  Filter,
  RefreshCw,
  FileText,
  Eye
} from 'lucide-react'
import * as XLSX from '@e965/xlsx'

export default function EmployeeLifecycle() {
  const { user } = useAuth()
  const { showToast } = useToast()
  const [activeTab, setActiveTab] = useState('altas') // 'altas' | 'bajas'
  const [loading, setLoading] = useState(false)
  const [data, setData] = useState([])
  const [selectedYear, setSelectedYear] = useState(new Date().getFullYear())
  const [selectedMonth, setSelectedMonth] = useState(new Date().getMonth() + 1)
  const [searchTerm, setSearchTerm] = useState('')

  // Modal de Reactivación
  const [reactivateModal, setReactivateModal] = useState({ isOpen: false, employeeId: null, employeeName: '' })

  const months = [
    { value: 1, label: 'Enero' },
    { value: 2, label: 'Febrero' },
    { value: 3, label: 'Marzo' },
    { value: 4, label: 'Abril' },
    { value: 5, label: 'Mayo' },
    { value: 6, label: 'Junio' },
    { value: 7, label: 'Julio' },
    { value: 8, label: 'Agosto' },
    { value: 9, label: 'Septiembre' },
    { value: 10, label: 'Octubre' },
    { value: 11, label: 'Noviembre' },
    { value: 12, label: 'Diciembre' }
  ]

  const years = Array.from({ length: 5 }, (_, i) => new Date().getFullYear() - i)

  useEffect(() => {
    fetchData()
  }, [activeTab, selectedYear, selectedMonth])

  const fetchData = async () => {
    setLoading(true)
    setData([]) // Limpiar datos anteriores para evitar estados inconsistentes si falla la consulta
    try {
      let query = supabase
        .from('employees')
        .select('*')

      // ── FILTRADO DE SEGURIDAD ──
      const normalize = (str) => str ? str.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toUpperCase() : "";
      const userRole = normalize(user?.role);
      const userPosition = normalize(user?.position);

      const isGlobalAdmin =
        userRole === 'ADMIN' || userRole === 'SUPER ADMIN' || userRole === 'JEFE_RRHH' ||
        userPosition.includes('JEFE DE GENTE') || 
        userPosition.includes('GERENTE GENERAL') ||
        (user?.permissions && user?.permissions['*']) ||
        // Excepción Part Time ADM CENTRAL
        (userPosition.includes('ANALISTA DE GENTE') && userPosition.includes('PART TIME') && 
         user?.sede === 'ADM.CENTRAL' &&
         (user?.business_unit?.toUpperCase() === 'ADMINISTRACIÓN' || user?.business_unit?.toUpperCase() === 'ADMINISTRACION'));
      
      const isBoss = userRole.includes('JEFE') || 
                     userRole.includes('GERENTE') || 
                     userPosition.includes('JEFE') || 
                     userPosition.includes('GERENTE') ||
                     userPosition.includes('COORDINADOR') ||
                     userPosition.includes('SUPERVISOR');

      if (!isGlobalAdmin) {
          // Si es Jefe, idealmente filtraríamos por Área, pero como fallback usamos Sede si no es Jefe Global.
          // Para Analistas (que no son Jefes), filtramos estrictamente por Sede y Unidad.
          if (user?.sede && !isBoss) {
              query = query.eq('sede', user.sede)
          }
          if (user?.business_unit && !isBoss) {
              query = query.eq('business_unit', user.business_unit)
          }
          
          // Si es Jefe (Supervisor/Coordinador), podríamos necesitar filtrar por Área.
          // Por ahora, asumimos que Lifecycle es principalmente para RRHH (Analistas/Jefes de Gente).
          // Si un Supervisor entra aquí, verá todo si no filtramos.
          // Pero ProtectedRoute limita el acceso a 'lifecycle' solo a RRHH/Gerencia.
          // Así que los Supervisores normales NO entran aquí.
          // Los únicos que entran son Analistas de Gente (que ahora filtramos por sede) y Jefes de Gente (Admins).
      }

      // Construir rango de fechas para el mes seleccionado
      const startDate = `${selectedYear}-${String(selectedMonth).padStart(2, '0')}-01`
      const endDate = new Date(selectedYear, selectedMonth, 0).toISOString().split('T')[0] // Último día del mes

      if (activeTab === 'altas') {
        // Altas: Filtrar por fecha de ingreso
        query = query
          .gte('entry_date', startDate)
          .lte('entry_date', endDate)
          .order('entry_date', { ascending: false })
      } else {
        // Bajas: Filtrar por inactivos y fecha de baja
        // Nota: Si termination_date es null (registros antiguos), no saldrán aquí.
        // Asumimos que el proceso de baja llena este campo.
        query = query
          .eq('is_active', false)
          .gte('termination_date', startDate)
          .lte('termination_date', endDate)
          .order('termination_date', { ascending: false })
      }

      const { data: employees, error } = await query

      if (error) throw error
      setData(employees || [])
    } catch (error) {
      console.error('Error fetching data:', error)
      showToast('Error al cargar datos: ' + error.message, 'error')
    } finally {
      setLoading(false)
    }
  }

  const handleReactivate = async () => {
    if (!reactivateModal.employeeId) return

    try {
      const { error } = await supabase
        .from('employees')
        .update({ 
          is_active: true,
          termination_date: null,
          termination_reason: null,
          termination_document_url: null
        })
        .eq('id', reactivateModal.employeeId)

      if (error) throw error

      showToast('Empleado reactivado exitosamente', 'success')
      setReactivateModal({ isOpen: false, employeeId: null, employeeName: '' })
      fetchData() // Recargar lista
    } catch (error) {
      showToast('Error al reactivar: ' + error.message, 'error')
    }
  }

  const filteredData = data.filter(item => 
    item.full_name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
    item.dni?.includes(searchTerm)
  )

  const exportToExcel = () => {
    const exportData = filteredData.map(item => ({
      'DNI': item.dni,
      'Nombre Completo': item.full_name,
      'Cargo': item.position,
      'Sede': item.sede,
      'Unidad': item.business_unit,
      [activeTab === 'altas' ? 'Fecha Ingreso' : 'Fecha Baja']: activeTab === 'altas' ? item.entry_date : item.termination_date,
      ...(activeTab === 'bajas' ? { 'Motivo Baja': item.termination_reason || '-' } : {})
    }))

    const ws = XLSX.utils.json_to_sheet(exportData)
    const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb, ws, activeTab === 'altas' ? 'Altas' : 'Bajas')
    XLSX.writeFile(wb, `Reporte_${activeTab}_${selectedMonth}_${selectedYear}.xlsx`)
  }

  return (
    <div className="space-y-6 w-full">
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-800 flex items-center gap-2">
            <RefreshCw className="text-blue-600" />
            Gestión de Altas y Bajas
          </h1>
          <p className="text-gray-500 text-sm mt-1">
            Control de ingresos y ceses de personal por periodo
          </p>
        </div>
        
        <div className="flex gap-2">
          <button
            onClick={exportToExcel}
            className="flex items-center gap-2 px-4 py-2 bg-white border border-gray-200 rounded-lg text-gray-600 hover:bg-gray-50 transition-colors text-sm font-medium"
          >
            <Download size={18} />
            Exportar
          </button>
        </div>
      </div>

      {/* Tabs y Filtros */}
      <div className="bg-white p-4 rounded-xl shadow-sm border border-gray-100 flex flex-col md:flex-row gap-4 justify-between items-end">
        <div className="flex bg-gray-100 p-1 rounded-lg w-full md:w-auto">
          <button
            onClick={() => setActiveTab('altas')}
            className={`flex items-center gap-2 px-6 py-2 rounded-md text-sm font-medium transition-all ${
              activeTab === 'altas' 
                ? 'bg-white text-emerald-600 shadow-sm' 
                : 'text-gray-500 hover:text-gray-700'
            }`}
          >
            <UserPlus size={18} />
            Altas (Ingresos)
          </button>
          <button
            onClick={() => setActiveTab('bajas')}
            className={`flex items-center gap-2 px-6 py-2 rounded-md text-sm font-medium transition-all ${
              activeTab === 'bajas' 
                ? 'bg-white text-red-600 shadow-sm' 
                : 'text-gray-500 hover:text-gray-700'
            }`}
          >
            <UserMinus size={18} />
            Bajas (Ceses)
          </button>
        </div>

        <div className="flex flex-wrap gap-3 w-full md:w-auto">
          <div className="flex-1 min-w-[140px]">
            <label className="block text-xs font-medium text-gray-500 mb-1">Mes</label>
            <select
              value={selectedMonth}
              onChange={(e) => setSelectedMonth(Number(e.target.value))}
              className="w-full px-3 py-2 bg-gray-50 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20"
            >
              {months.map(m => (
                <option key={m.value} value={m.value}>{m.label}</option>
              ))}
            </select>
          </div>
          <div className="w-[100px]">
            <label className="block text-xs font-medium text-gray-500 mb-1">Año</label>
            <select
              value={selectedYear}
              onChange={(e) => setSelectedYear(Number(e.target.value))}
              className="w-full px-3 py-2 bg-gray-50 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20"
            >
              {years.map(y => (
                <option key={y} value={y}>{y}</option>
              ))}
            </select>
          </div>
          <div className="flex-1 min-w-[200px] relative">
            <label className="block text-xs font-medium text-gray-500 mb-1">Buscar</label>
            <Search className="absolute left-3 top-[2.1rem] text-gray-400" size={16} />
            <input
              type="text"
              placeholder="Buscar por nombre o DNI..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full pl-9 pr-4 py-2 bg-gray-50 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20"
            />
          </div>
        </div>
      </div>

      {/* Tabla */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left">
            <thead>
              <tr className="bg-gray-50/50 border-b border-gray-100">
                <th className="px-6 py-4 text-xs font-semibold text-gray-500 uppercase tracking-wider">Empleado</th>
                <th className="px-6 py-4 text-xs font-semibold text-gray-500 uppercase tracking-wider">Ubicación</th>
                <th className="px-6 py-4 text-xs font-semibold text-gray-500 uppercase tracking-wider">
                  {activeTab === 'altas' ? 'Fecha Ingreso' : 'Fecha Baja'}
                </th>
                {activeTab === 'bajas' && (
                  <th className="px-6 py-4 text-xs font-semibold text-gray-500 uppercase tracking-wider">Motivo</th>
                )}
                <th className="px-6 py-4 text-xs font-semibold text-gray-500 uppercase tracking-wider text-right">Acciones</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {loading ? (
                <tr>
                  <td colSpan="6" className="px-6 py-12 text-center text-gray-500">
                    <div className="flex items-center justify-center gap-2">
                      <div className="w-4 h-4 border-2 border-blue-500 border-t-transparent rounded-full animate-spin"></div>
                      <span>Cargando registros...</span>
                    </div>
                  </td>
                </tr>
              ) : filteredData.length === 0 ? (
                <tr>
                  <td colSpan="6" className="px-6 py-12 text-center text-gray-500">
                    <div className="flex flex-col items-center justify-center">
                      <div className="bg-gray-50 p-4 rounded-full mb-3">
                        <Filter size={24} className="text-gray-400" />
                      </div>
                      <p className="font-medium text-gray-900">No se encontraron registros</p>
                      <p className="text-sm mt-1">
                        No hay {activeTab} registradas en {months.find(m => m.value === selectedMonth)?.label} {selectedYear}
                      </p>
                    </div>
                  </td>
                </tr>
              ) : (
                filteredData.map((emp) => (
                  <tr key={emp.id} className="hover:bg-gray-50/50 transition-colors">
                    <td className="px-6 py-4">
                      <div className="flex items-center gap-3">
                        <div className={`w-10 h-10 rounded-full flex items-center justify-center font-bold text-sm ${
                          activeTab === 'altas' ? 'bg-emerald-100 text-emerald-600' : 'bg-red-100 text-red-600'
                        }`}>
                          {emp.full_name.charAt(0)}
                        </div>
                        <div>
                          <p className="font-medium text-gray-900">{emp.full_name}</p>
                          <p className="text-xs text-gray-500">DNI: {emp.dni}</p>
                        </div>
                      </div>
                    </td>
                    <td className="px-6 py-4">
                      <p className="text-sm text-gray-900">{emp.sede}</p>
                      <p className="text-xs text-gray-500">{emp.business_unit}</p>
                    </td>
                    <td className="px-6 py-4">
                      <div className="flex items-center gap-2 text-sm text-gray-700">
                        <Calendar size={14} className="text-gray-400" />
                        {activeTab === 'altas' 
                          ? new Date(emp.entry_date + 'T00:00:00').toLocaleDateString('es-PE')
                          : emp.termination_date ? new Date(emp.termination_date + 'T00:00:00').toLocaleDateString('es-PE') : '-'
                        }
                      </div>
                    </td>
                    {activeTab === 'bajas' && (
                      <td className="px-6 py-4">
                        {(() => {
                            const reason = emp.termination_reason || ''
                            const typeMatch = reason.match(/^\[(.*?)\]\s*(.*)/)
                            const type = emp.termination_type || (typeMatch ? typeMatch[1] : 'BAJA')
                            const detail = typeMatch ? typeMatch[2] : reason

                            let badgeColor = 'bg-gray-100 text-gray-600'
                            if (type === 'RENUNCIA') badgeColor = 'bg-blue-50 text-blue-600 border-blue-100'
                            if (type === 'TERMINO_CONTRATO') badgeColor = 'bg-purple-50 text-purple-600 border-purple-100'
                            if (type === 'PERIODO_PRUEBA') badgeColor = 'bg-indigo-50 text-indigo-600 border-indigo-100'
                            if (type === 'MUTUO_DISENSO') badgeColor = 'bg-pink-50 text-pink-600 border-pink-100'
                            if (type === 'ABANDONO_TRABAJO') badgeColor = 'bg-orange-50 text-orange-600 border-orange-100'
                            if (type === 'NO_RENOVACION') badgeColor = 'bg-yellow-50 text-yellow-600 border-yellow-100'
                            if (type === 'DESPIDO') badgeColor = 'bg-red-50 text-red-600 border-red-100'

                            return (
                                <div className="space-y-1">
                                    <span className={`inline-block px-2 py-0.5 rounded text-[10px] font-bold border ${badgeColor}`}>
                                        {type}
                                    </span>
                                    <p className="text-xs text-gray-600 max-w-[200px] truncate" title={detail}>
                                        {detail || 'Sin detalle'}
                                    </p>
                                </div>
                            )
                        })()}
                        {emp.termination_document_url && (
                          <div className="flex flex-col gap-1 mt-1">
                            {(() => {
                                try {
                                    // Intenta parsear como array JSON
                                    const urls = JSON.parse(emp.termination_document_url)
                                    if (Array.isArray(urls)) {
                                        return urls.map((url, i) => (
                                            <a key={i} href={url} target="_blank" rel="noopener noreferrer" className="text-xs text-blue-600 hover:underline flex items-center gap-1">
                                                <FileText size={10} /> Ver documento {i+1}
                                            </a>
                                        ))
                                    }
                                    throw new Error('Not array')
                                } catch (e) {
                                    // Fallback para URL simple
                                    return (
                                        <a href={emp.termination_document_url} target="_blank" rel="noopener noreferrer" className="text-xs text-blue-600 hover:underline flex items-center gap-1">
                                            <FileText size={10} /> Ver documento
                                        </a>
                                    )
                                }
                            })()}
                          </div>
                        )}
                      </td>
                    )}
                    <td className="px-6 py-4 text-right">
                      {activeTab === 'bajas' && (
                        <button
                          onClick={() => setReactivateModal({ isOpen: true, employeeId: emp.id, employeeName: emp.full_name })}
                          className="px-3 py-1.5 bg-blue-50 text-blue-700 rounded-lg text-xs font-medium hover:bg-blue-100 transition-colors"
                        >
                          Reactivar
                        </button>
                      )}
                      {activeTab === 'altas' && (
                        <span className="text-xs text-emerald-600 font-medium px-2 py-1 bg-emerald-50 rounded-full">
                          Nuevo Ingreso
                        </span>
                      )}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Modal Confirmación Reactivación */}
      {reactivateModal.isOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-md p-6">
            <h3 className="text-lg font-bold text-gray-900 mb-2">Confirmar Reactivación</h3>
            <p className="text-gray-600 mb-6">
              ¿Estás seguro de reactivar a <span className="font-semibold text-gray-900">{reactivateModal.employeeName}</span>?
              <br/><br/>
              El empleado volverá a aparecer en las listas de personal, asistencias y recuperará el acceso a la App Móvil.
            </p>
            <div className="flex justify-end gap-3">
              <button
                onClick={() => setReactivateModal({ isOpen: false, employeeId: null, employeeName: '' })}
                className="px-4 py-2 text-gray-600 hover:bg-gray-100 rounded-lg font-medium transition-colors"
              >
                Cancelar
              </button>
              <button
                onClick={handleReactivate}
                className="px-4 py-2 bg-blue-600 text-white rounded-lg font-medium hover:bg-blue-700 transition-colors"
              >
                Confirmar Reactivación
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
