import { useState, useEffect, useMemo } from 'react'
import { useParams, useNavigate, useSearchParams } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { deleteEmployee } from '../services/employees'
import { getPositions } from '../services/positions'
import { getOrganizationStructure } from '../services/organization'
import { useAuth } from '../context/AuthContext'
import { useToast } from '../context/ToastContext'
import Modal from '../components/ui/Modal'
import EmployeeExcelUpload from './EmployeeExcelUpload'
import EmployeeProfileCard from '../components/EmployeeProfileCard'
import TerminationModal from '../components/employees/TerminationModal'
import EmployeesFilterBar from '../components/employees/EmployeesFilterBar'
import EmployeesTable from '../components/employees/EmployeesTable'
import { 
  Download, UserPlus, Building2, Upload, Users
} from 'lucide-react'

export default function EmployeesList() {
  const { sede } = useParams()
  const [searchParams] = useSearchParams()
  const businessUnit = searchParams.get('business')
  const { user } = useAuth()
  const navigate = useNavigate()
  const { showToast } = useToast()

  const [employees, setEmployees] = useState([])
  const [structureData, setStructureData] = useState([])
  const [loading, setLoading] = useState(true)
  const [searchTerm, setSearchTerm] = useState('')
  const [positionAreaMap, setPositionAreaMap] = useState({})
  const [selectedSede, setSelectedSede] = useState('')
  const [selectedUnit, setSelectedUnit] = useState('')
  const [selectedArea, setSelectedArea] = useState('')
  const [selectedType, setSelectedType] = useState('')
  const [activeMenu, setActiveMenu] = useState(null)
  const [modalConfig, setModalConfig] = useState({ isOpen: false, title: '', message: '', type: 'info', onConfirm: null })
  const [selectedEmployee, setSelectedEmployee] = useState(null)
  const [showProfileModal, setShowProfileModal] = useState(false)
  const [showImportModal, setShowImportModal] = useState(false)
  const [terminatingEmployee, setTerminatingEmployee] = useState(null)

  const sedeMap = {
    'adm-central': 'ADM.CENTRAL', 'trujillo': 'TRUJILLO', 'chimbote': 'CHIMBOTE',
    'huaraz': 'HUARAZ', 'huacho': 'HUACHO', 'chincha': 'CHINCHA',
    'ica': 'ICA', 'desaguadero': 'DESAGUADERO', 'lima': 'LIMA'
  }

  // Normalizar sede: eliminar espacio tras punto (sedes.name='ADM. CENTRAL' vs employees.sede='ADM.CENTRAL')
  const normalizeSede = (name) => name ? name.replace(/\.\s+/g, '.').trim() : name
  let currentSedeName = normalizeSede(sedeMap[sede] || sede)
  const normalize = (str) => str ? str.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toUpperCase() : ""
  const userRole = normalize(user?.role)
  const userPosition = normalize(user?.position)

  // ── Niveles de acceso ──────────────────────────────────────────────────────
  const isGlobalAdmin =
    userRole === 'ADMIN' || userRole === 'SUPER ADMIN' || userRole === 'JEFE_RRHH' || userRole === 'SISTEMAS' ||
    userPosition.includes('JEFE DE GENTE') ||
    userPosition.includes('GERENTE GENERAL') ||
    (user?.permissions && user?.permissions['*']) ||
    // ANALISTA DE GENTE Y GESTIÓN (con o sin PART TIME) de ADM. CENTRAL + ADMINISTRACIÓN
    (userPosition.includes('ANALISTA DE GENTE') &&
     normalize(user?.sede || '').includes('ADM') && normalize(user?.sede || '').includes('CENTRAL') &&
     normalize(user?.business_unit || '').includes('ADMINISTRACI'))

  const isBoss =
    userRole.includes('JEFE') || userRole.includes('GERENTE') ||
    userPosition.includes('JEFE') || userPosition.includes('GERENTE') ||
    userPosition.includes('COORDINADOR') || userPosition.includes('SUPERVISOR')

  // ── Área restringida para Jefes de Área ───────────────────────────────────
  // Un Jefe de Operaciones ve OPERACIONES en TODAS las sedes/unidades
  // RRHH/Gente y admins globales no tienen restricción de área
  const userRestrictedArea = useMemo(() => {
    if (isGlobalAdmin) return null
    if (!isBoss) return null
    if (userPosition.includes('GENTE') || userPosition.includes('RRHH')) return null
    if (userPosition.includes('OPERACIONES')) return 'OPERACIONES'
    if (userPosition.includes('COMERCIAL') || userPosition.includes('VENTAS')) return 'COMERCIAL'
    if (userPosition.includes('ALMACEN') || userPosition.includes('LOGISTICA')) return 'ALMACEN'
    if (userPosition.includes('DISTRIBUCION') || userPosition.includes('TRANSPORTE')) return 'DISTRIBUCION'
    if (userPosition.includes('MANTENIMIENTO')) return 'MANTENIMIENTO'
    if (userPosition.includes('FINANZAS') || userPosition.includes('CONTABILIDAD')) return 'FINANZAS'
    if (userPosition.includes('SISTEMAS') || userPosition.includes('TI')) return 'SISTEMAS'
    return null
  }, [userPosition, isGlobalAdmin, isBoss])

  // Solo forzar sede para usuarios rasos (no jefes, no admins)
  if (!isGlobalAdmin && !isBoss && user?.sede) {
    const userSedeNorm = user.sede.toUpperCase().trim()
    if (currentSedeName?.toUpperCase() !== userSedeNorm) currentSedeName = user.sede
  }

  useEffect(() => { fetchEmployees() }, [sede, businessUnit, user?.sede, user?.business_unit, user?.role])

  useEffect(() => {
    const fetchStructure = async () => {
      const { data } = await getOrganizationStructure()
      if (data) setStructureData(data)
    }
    fetchStructure()
  }, [])

  useEffect(() => {
    setSelectedSede(''); setSelectedUnit(''); setSelectedArea(''); setSelectedType(''); setSearchTerm('')
  }, [sede, businessUnit])
  useEffect(() => {
    const handler = () => setActiveMenu(null)
    document.addEventListener('click', handler)
    return () => document.removeEventListener('click', handler)
  }, [])

  const fetchEmployees = async () => {
    setLoading(true)
    try {
      let query

      // Incluir área del cargo directamente desde job_positions → areas
      // Sin !hint para evitar ambigüedad en PostgREST (FK única en cada relación)
      const selectFields = '*, job_positions(area_id, areas(name))'

      if (currentSedeName) {
        query = supabase.from('employees').select(selectFields).eq('sede', currentSedeName).eq('is_active', true)
      } else {
        if (isGlobalAdmin || isBoss) {
          query = supabase.from('employees').select(selectFields).eq('is_active', true)
        } else {
          query = supabase.rpc('get_my_employees_v2').eq('is_active', true)
        }
      }

      query = query.order('full_name', { ascending: true })

      // Solo forzar business_unit para usuarios rasos
      // Jefes y Admins NO están limitados por su propia unidad
      if (!isGlobalAdmin && !isBoss && user?.business_unit) {
        query = query.eq('business_unit', user.business_unit.toUpperCase())
      } else if (businessUnit && !isGlobalAdmin) {
        // Usuarios no-admin con URL businessUnit: filtrar en SQL
        // Usar ilike con ambas formas (con y sin tilde) por si hay inconsistencia en la BD
        const buNorm = normalize(businessUnit)
        const buOrig = businessUnit.toUpperCase()
        if (buOrig !== buNorm) {
          query = query.or(`business_unit.ilike.${buOrig},business_unit.ilike.${buNorm}`)
        } else {
          query = query.ilike('business_unit', businessUnit)
        }
      }
      // Admins globales: sin filtro SQL por business_unit → se resuelve en cliente con normalize()

      const { data: positionsData } = await getPositions()
      const areaMap = {}
      if (positionsData) {
        positionsData.forEach(pos => {
          if (pos.area_name && pos.area_name !== 'Sin Área Asignada') areaMap[pos.name] = pos.area_name
        })
      }
      setPositionAreaMap(areaMap)

      const { data, error } = await query
      if (error) throw error
      setEmployees(data || [])
    } catch (error) {
      console.error('Error fetching employees:', error)
    } finally {
      setLoading(false)
    }
  }

  const openDeleteModal = (id) => {
    setModalConfig({
      isOpen: true, title: 'Eliminar Empleado',
      message: '¿Estás seguro de que deseas eliminar a este empleado? Esta acción no se puede deshacer.',
      type: 'error', confirmText: 'Eliminar', onConfirm: () => handleDelete(id)
    })
  }

  const handleDelete = async (id) => {
    setModalConfig(prev => ({ ...prev, isOpen: false }))
    try {
      const { error } = await deleteEmployee(id)
      if (error) throw error
      setEmployees(employees.filter(emp => emp.id !== id))
      showToast('Empleado eliminado correctamente', 'success')
    } catch (err) {
      showToast('Error al eliminar empleado: ' + err.message, 'error')
    }
  }

  const handleNewEmployee = () => {
    const params = new URLSearchParams()
    if (currentSedeName) params.append('sede', currentSedeName)
    if (businessUnit) params.append('business', businessUnit.toUpperCase())
    navigate(`/register-employee?${params.toString()}`)
  }

  const handleImportSuccess = () => {
    setShowImportModal(false)
    showToast('Empleados importados correctamente', 'success')
    fetchEmployees()
  }

  const handleViewProfile = (emp) => {
    setSelectedEmployee({ ...emp, area_name: positionAreaMap[emp.position] })
    setShowProfileModal(true)
  }

  const filterOptions = useMemo(() => {
    // Obtener sedes de la estructura y de los empleados existentes
    const sedesFromStructure = structureData.map(s => s.sedes?.name).filter(Boolean)
    const sedesFromEmployees = employees.map(e => e.sede).filter(Boolean)
    const sedes = [...new Set([...sedesFromStructure, ...sedesFromEmployees])].sort()

    // Obtener unidades filtradas por sede (de estructura y empleados)
    const unitsFromStructure = structureData
      .filter(s => !selectedSede || s.sedes?.name === selectedSede)
      .map(s => s.business_units?.name)
      .filter(Boolean)
      
    const unitsFromEmployees = employees
      .filter(e => !selectedSede || e.sede === selectedSede)
      .map(e => e.business_unit)
      .filter(Boolean)

    const units = [...new Set([...unitsFromStructure, ...unitsFromEmployees])].sort()

    const areas = [...new Set(employees
      .filter(e => (!selectedSede || e.sede === selectedSede) && (!selectedUnit || e.business_unit === selectedUnit))
      .map(e => e.job_positions?.areas?.name || positionAreaMap[e.position] || 'Sin Área').filter(Boolean))].sort()
    return { sedes, units, areas }
  }, [employees, structureData, selectedSede, selectedUnit, positionAreaMap])

  useEffect(() => {
    if (!loading && employees.length > 0) {
      if (filterOptions.sedes.length === 1 && !selectedSede) setSelectedSede(filterOptions.sedes[0])
      if (filterOptions.units.length === 1 && !selectedUnit) setSelectedUnit(filterOptions.units[0])
      if (filterOptions.areas.length === 1 && !selectedArea) setSelectedArea(filterOptions.areas[0])
      // Auto-seleccionar unidad del URL param para admins globales (resuelve diferencias de tilde)
      if (isGlobalAdmin && businessUnit && !selectedUnit) {
        const match = employees.find(e => normalize(e.business_unit) === normalize(businessUnit))
        if (match) setSelectedUnit(match.business_unit)
      }
      // Auto-seleccionar el área restringida del jefe (sin tocar sede ni unidad)
      if (isBoss && !isGlobalAdmin && userRestrictedArea && !selectedArea) {
        const match = filterOptions.areas.find(a => normalize(a) === normalize(userRestrictedArea))
        if (match) setSelectedArea(match)
      }
    }
  }, [loading, employees, filterOptions, isBoss, isGlobalAdmin, userRestrictedArea, businessUnit])

  // ── Filtrado en cliente ────────────────────────────────────────────────────
  // Obtener área de un empleado: primero por job_position (exacto), luego por positionAreaMap (texto)
  const getEmpArea = (emp) =>
    emp.job_positions?.areas?.name || positionAreaMap[emp.position] || 'Sin Área'

  const totalInScope = useMemo(() => {
    if (!userRestrictedArea) return employees.length
    return employees.filter(emp => normalize(getEmpArea(emp)) === normalize(userRestrictedArea)).length
  }, [employees, userRestrictedArea, positionAreaMap])

  const filteredEmployees = employees.filter(emp => {
    const matchesSearch =
      emp.full_name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      emp.dni?.includes(searchTerm)
    const matchesSede = !selectedSede || emp.sede === selectedSede
    const matchesUnit = !selectedUnit || emp.business_unit === selectedUnit
    const empArea = getEmpArea(emp)
    const matchesArea = userRestrictedArea
      ? normalize(empArea) === normalize(userRestrictedArea)
      : (!selectedArea || empArea === selectedArea)
    const matchesType = !selectedType || (
      selectedType === 'ADMINISTRATIVO'
        ? (emp.position.includes('JEFE') || emp.position.includes('ANALISTA') || emp.position.includes('COORDINADOR') || emp.position.includes('ASISTENTE'))
        : (!emp.position.includes('JEFE') && !emp.position.includes('ANALISTA') && !emp.position.includes('COORDINADOR') && !emp.position.includes('ASISTENTE'))
    )
    return matchesSearch && matchesSede && matchesUnit && matchesArea && matchesType
  })

  const isHR = userRole === 'JEFE_RRHH' || userRole === 'ADMIN' || userRole === 'SUPER ADMIN' || userPosition.includes('JEFE DE GENTE')
  const isCentralHRAnalyst = userPosition.includes('ANALISTA DE GENTE') && user?.sede === 'ADM.CENTRAL' &&
    (user?.business_unit === 'ADMINISTRACIÓN' || user?.business_unit === 'ADMINISTRACION')
  const canManage = isHR || isCentralHRAnalyst
  const activeFiltersCount = [selectedSede, selectedUnit, selectedArea, selectedType].filter(Boolean).length

  return (
    <div className="min-h-screen bg-gray-50/60">
      {showImportModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4 overflow-y-auto">
          <div className="w-full max-w-4xl max-h-[90vh] overflow-y-auto">
            <EmployeeExcelUpload onClose={() => setShowImportModal(false)} onSuccess={handleImportSuccess}
              defaultSede={currentSedeName} defaultBusinessUnit={businessUnit ? businessUnit.toUpperCase() : null} />
          </div>
        </div>
      )}

      <div className="max-w-full px-6 py-6 space-y-5">

        {/* ── HEADER ── */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-blue-600 flex items-center justify-center shadow-sm shadow-blue-200">
              {currentSedeName === 'ADM.CENTRAL' ? <Building2 size={20} className="text-white" /> : <Users size={20} className="text-white" />}
            </div>
            <div>
              <h1 className="text-xl font-bold text-gray-900 leading-tight">
                {currentSedeName || 'Todos los Empleados'}
                {businessUnit && <span className="text-gray-400 font-normal ml-2 text-base">/ {businessUnit.toUpperCase()}</span>}
              </h1>
              <p className="text-sm text-gray-500 mt-0.5">
                <span className="font-semibold text-gray-700">{filteredEmployees.length}</span> colaboradores
                {userRestrictedArea && (
                  <span className="ml-1.5 px-2 py-0.5 bg-blue-50 text-blue-600 text-xs font-semibold rounded-full border border-blue-100">
                    Área: {userRestrictedArea}
                  </span>
                )}
              </p>
            </div>
          </div>
          {canManage && (
            <div className="flex items-center gap-2">
              <button onClick={() => setShowImportModal(true)} className="flex items-center gap-2 px-3.5 py-2 bg-white border border-gray-200 rounded-lg text-sm font-medium text-gray-600 hover:bg-gray-50 hover:border-gray-300 transition-all shadow-sm">
                <Upload size={15} /> Importar
              </button>
              <button className="flex items-center gap-2 px-3.5 py-2 bg-white border border-gray-200 rounded-lg text-sm font-medium text-gray-600 hover:bg-gray-50 hover:border-gray-300 transition-all shadow-sm">
                <Download size={15} /> Exportar
              </button>
              <button onClick={handleNewEmployee} className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg text-sm font-semibold hover:bg-blue-700 transition-all shadow-sm shadow-blue-200">
                <UserPlus size={15} /> Nuevo Empleado
              </button>
            </div>
          )}
        </div>

        {/* ── FILTROS ── */}
        <EmployeesFilterBar 
          selectedSede={selectedSede} setSelectedSede={setSelectedSede}
          selectedUnit={selectedUnit} setSelectedUnit={setSelectedUnit}
          selectedArea={selectedArea} setSelectedArea={setSelectedArea}
          selectedType={selectedType} setSelectedType={setSelectedType}
          searchTerm={searchTerm} setSearchTerm={setSearchTerm}
          filterOptions={filterOptions}
          filteredCount={filteredEmployees.length}
          totalInScope={totalInScope}
          userRestrictedArea={userRestrictedArea}
        />

        {/* ── TABLA ── */}
        <EmployeesTable 
          loading={loading}
          employees={employees}
          filteredEmployees={filteredEmployees}
          positionAreaMap={positionAreaMap}
          handleViewProfile={handleViewProfile}
          navigate={navigate}
          setTerminatingEmployee={setTerminatingEmployee}
          openDeleteModal={openDeleteModal}
          canManage={canManage}
          searchTerm={searchTerm}
          activeFiltersCount={activeFiltersCount}
          clearFilters={() => { setSelectedSede(''); setSelectedUnit(''); setSelectedArea(''); setSelectedType(''); setSearchTerm('') }}
        />
      </div>

      <Modal isOpen={modalConfig.isOpen} onClose={() => setModalConfig(prev => ({ ...prev, isOpen: false }))}
        title={modalConfig.title} message={modalConfig.message} type={modalConfig.type}
        confirmText={modalConfig.confirmText} onConfirm={modalConfig.onConfirm} showCancel />

      <Modal isOpen={showProfileModal} onClose={() => setShowProfileModal(false)} title="Perfil de Empleado" showCancel={false} cancelText="Cerrar">
        <EmployeeProfileCard employee={selectedEmployee} />
      </Modal>

      <TerminationModal 
        isOpen={!!terminatingEmployee}
        onClose={() => setTerminatingEmployee(null)}
        employee={terminatingEmployee}
        onSuccess={fetchEmployees}
      />
    </div>
  )
}