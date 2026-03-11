import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'
import { getVacationOverview } from '../services/vacations'
import { getSedes, getOrganizationStructure } from '../services/organization'
import { useAuth } from '../context/AuthContext'
import Modal from '../components/ui/Modal'
import VacationCalendar from '../components/VacationCalendar'
import { 
    Search, Filter, AlertTriangle, CheckCircle, 
    Calendar, Calculator, Clock, Briefcase, MapPin, Store
} from 'lucide-react'

// Constante para la clave de localStorage
const FILTERS_STORAGE_KEY = 'vacation_dashboard_filters'

export default function VacationDashboard() {
    const { user } = useAuth()
    const [employees, setEmployees] = useState([])
    const [loading, setLoading] = useState(true)
    const [sedes, setSedes] = useState([])
    const [structureData, setStructureData] = useState([])
    const [businessUnits, setBusinessUnits] = useState([])
    
    // Helper para determinar si el usuario es admin global
    const isGlobalAdmin = user?.role === 'ADMIN' || 
                          user?.role === 'SUPER ADMIN' || 
                          user?.role === 'JEFE_RRHH' || 
                          user?.position?.includes('JEFE DE GENTE') ||
                          user?.position?.includes('GERENTE') ||
                          user?.position?.includes('GERENTE GENERAL') ||
                          (user?.permissions && user?.permissions['*'])

    const normalize = (str) => str ? str.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toUpperCase() : "";
    const userRole = normalize(user?.role);
    const userPosition = normalize(user?.position);
    
    const isBoss = userRole.includes('JEFE') || 
                   userRole.includes('GERENTE') || 
                   userPosition.includes('JEFE') || 
                   userPosition.includes('GERENTE') ||
                   userPosition.includes('COORDINADOR') ||
                   userPosition.includes('SUPERVISOR');

    // Función para cargar filtros guardados del localStorage
    const loadSavedFilters = () => {
        try {
            const saved = localStorage.getItem(FILTERS_STORAGE_KEY)
            if (saved) {
                const parsed = JSON.parse(saved)
                // Validar que los datos guardados sean del mismo usuario
                if (parsed.userId === user?.id) {
                    return parsed.filters
                }
            }
        } catch (error) {
            console.error('Error cargando filtros guardados:', error)
        }
        return null
    }

    // Función para guardar filtros en localStorage
    const saveFilters = (filters) => {
        try {
            localStorage.setItem(FILTERS_STORAGE_KEY, JSON.stringify({
                userId: user?.id,
                filters: filters,
                timestamp: Date.now()
            }))
        } catch (error) {
            console.error('Error guardando filtros:', error)
        }
    }

    // Inicializar filtros con valores guardados o valores por defecto
    const initializeFilters = () => {
        const savedFilters = loadSavedFilters()
        
        // Si hay filtros guardados y el usuario es admin, usarlos
        if (savedFilters && isGlobalAdmin) {
            return {
                sede: savedFilters.sede || '',
                businessUnit: savedFilters.businessUnit || '',
                search: savedFilters.search || '',
                status: savedFilters.status || 'all'
            }
        }
        
        // Si el usuario tiene restricciones, aplicarlas
        // CORRECCIÓN: Si es Jefe (isBoss), NO forzar sede ni business unit por defecto
        return {
            sede: (!isGlobalAdmin && !isBoss && user?.sede) ? user.sede : (savedFilters?.sede || ''),
            // Si es Jefe, businessUnit por defecto es VACÍO (ver todo su equipo), no su propia unidad
            businessUnit: (!isGlobalAdmin && !isBoss && user?.business_unit) ? user.business_unit : (savedFilters?.businessUnit || ''),
            search: savedFilters?.search || '',
            status: savedFilters?.status || 'all'
        }
    }

    const initialFilters = initializeFilters()

    // Filtros - Inicializados con valores persistidos
    const [selectedSede, setSelectedSede] = useState(initialFilters.sede)
    const [selectedBusinessUnit, setSelectedBusinessUnit] = useState(initialFilters.businessUnit)
    const [searchTerm, setSearchTerm] = useState(initialFilters.search)
    const [statusFilter, setStatusFilter] = useState(initialFilters.status)

    // Modal
    const [selectedEmployee, setSelectedEmployee] = useState(null)
    const [isModalOpen, setIsModalOpen] = useState(false)
    
    // Modal Calendario
    const [calendarEmployee, setCalendarEmployee] = useState(null)
    const [isCalendarOpen, setIsCalendarOpen] = useState(false)

    // Guardar filtros cada vez que cambien
    useEffect(() => {
        if (user?.id) {
            const filters = {
                sede: selectedSede,
                businessUnit: selectedBusinessUnit,
                search: searchTerm,
                status: statusFilter
            }
            saveFilters(filters)
        }
    }, [selectedSede, selectedBusinessUnit, searchTerm, statusFilter, user?.id])

    // 1. Cargar datos iniciales
    useEffect(() => {
        const fetchInitial = async () => {
            try {
                const { data: locs } = await getSedes()
                if (locs) setSedes(locs)

                const { data: struct } = await getOrganizationStructure()
                if (struct) setStructureData(struct)
            } catch (err) {
                console.error("Error loading initial data:", err)
            }

            // CORRECCIÓN: Si es Jefe, NO forzar sede. Dejar en blanco (todas)
            if (!isGlobalAdmin && !isBoss && user?.sede) {
                setSelectedSede(user.sede)
            }
            
            // CORRECCIÓN: Si es Jefe, NO forzar business unit. Dejar que use la del filtro guardado o ninguna (para ver toda su área)
            if (!isGlobalAdmin && !isBoss && user?.business_unit) {
                // Solo si NO es jefe forzamos la unidad. Si es jefe, lo dejamos libre.
                // setSelectedBusinessUnit(user.business_unit) 
            }
        }
        fetchInitial()
    }, [user?.id]) 

    // 2. Cargar Business Units cuando cambia la sede seleccionada
    useEffect(() => {
        if (!selectedSede) {
            setBusinessUnits([])
            return
        }

        const sedeObj = sedes.find(s => s.name === selectedSede)
        if (!sedeObj) return

        const currentSelection = selectedBusinessUnit 

        // Filtrar unidades usando la estructura organizacional (Nueva Lógica)
        const units = structureData
            .filter(item => item.sedes?.id === sedeObj.id && item.business_units)
            .map(item => item.business_units)
            // Eliminar duplicados
            .filter((v, i, a) => a.findIndex(t => t.id === v.id) === i)
            .sort((a, b) => a.name.localeCompare(b.name))

        setBusinessUnits(units)
        
        if (!isGlobalAdmin && user?.business_unit) {
            const buExists = units.some(bu => bu.name === user.business_unit)
            if (buExists && !isBoss) { // Solo forzar si NO es jefe
                    if (currentSelection !== user.business_unit) {
                        setSelectedBusinessUnit(user.business_unit)
                    }
            } else if (isBoss) {
                // Si es jefe, no forzamos nada, permitimos selección libre
            } else {
                setSelectedBusinessUnit('')
            }
        } else {
            const selectionStillValid = currentSelection && units.some(bu => bu.name === currentSelection)
            
            if (!selectionStillValid && currentSelection) {
                setSelectedBusinessUnit('')
            }
        }
    }, [selectedSede, sedes, structureData, isGlobalAdmin, user?.business_unit])

    // 3. Cargar empleados cuando cambian filtros relevantes
    useEffect(() => {
        if (sedes.length === 0) return
        loadData()
    }, [selectedSede, searchTerm, selectedBusinessUnit, sedes, user?.sede, user?.business_unit])

    const loadData = async () => {
        setLoading(true)
        try {
            const searchParam = searchTerm.length > 2 ? searchTerm : null
            let querySede = selectedSede
            let queryBusinessUnit = selectedBusinessUnit

            if (!isGlobalAdmin) {
                if (user?.sede && !isBoss) querySede = user.sede
                // CORRECCIÓN: Si es Jefe, NO forzar business unit local. Confiar en RPC de áreas.
                if (user?.business_unit && !isBoss) queryBusinessUnit = user.business_unit
            }

            // 1. Obtener lista de empleados permitidos por Área (si no es admin)
            let allowedIds = null;
            if (!isGlobalAdmin) {
                 const { data: allowedEmployees } = await supabase.rpc('get_employees_by_user_area')
                 
                 if (allowedEmployees) {
                     allowedIds = new Set(allowedEmployees.map(e => e.id))
                 } else {
                     allowedIds = new Set() // Sin acceso
                 }
            }

            // CORRECCIÓN FILTRO SUPERVISOR:
            // - Sede: Siempre estricto si no es Admin, EXCEPTO si es Jefe/Supervisor (usan lógica de Área/allowedIds)
            // - Unidad: Relajado si es Jefe/Supervisor (usan lógica de Área/allowedIds)
            const shouldFilterBySede = !isGlobalAdmin && !isBoss && user?.sede;
            const shouldFilterByUnit = !isGlobalAdmin && !isBoss && user?.business_unit;

            // Pasamos queryBusinessUnit al servicio para filtrado server-side
            const { data, error } = await getVacationOverview(querySede, searchParam, queryBusinessUnit)
            if (error) throw error
            
            let filteredResult = data || []
            
            // Si el RPC no soporta el filtro, o para asegurar consistencia UI, filtramos en memoria
            // CORRECCIÓN: Usar comparación flexible (lowercase y trim) para evitar discrepancias
            if (shouldFilterBySede) {
                const targetSede = user.sede.toUpperCase().trim();
                filteredResult = filteredResult.filter(emp => emp.sede && emp.sede.toUpperCase().trim() === targetSede)
            }
            if (shouldFilterByUnit) {
                const targetUnit = user.business_unit.toUpperCase().trim();
                filteredResult = filteredResult.filter(emp => emp.business_unit && emp.business_unit.toUpperCase().trim() === targetUnit)
            }
            
            // FILTRADO POR ÁREA (Seguridad estricta)
            if (allowedIds) {
                // CORRECCIÓN: get_vacation_overview devuelve 'employee_id', no 'id'
                filteredResult = filteredResult.filter(emp => allowedIds.has(emp.employee_id))
            }

            setEmployees(filteredResult)
        } catch (err) {
            console.error("Error cargando vacaciones:", err)
        } finally {
            setLoading(false)
        }
    }

    // Filtrado local por Estado (Semáforo)
    const filteredData = employees.filter(emp => {
        if (statusFilter === 'all') return true
        return emp.status === statusFilter
    })

    // KPIs
    const totalEmployees = employees.length
    const dangerCount = employees.filter(e => e.status === 'danger').length
    const warningCount = employees.filter(e => e.status === 'warning').length
    const safeCount = employees.filter(e => e.status === 'safe').length

    const handleOpenKardex = (emp) => {
        setSelectedEmployee(emp)
        setIsModalOpen(true)
    }

    const handleOpenCalendar = (emp) => {
        setCalendarEmployee(emp)
        setIsCalendarOpen(true)
    }

    const getStatusBadge = (status) => {
        switch(status) {
            case 'danger': 
                return <span className="px-2 py-1 rounded-full bg-red-100 text-red-700 text-xs font-bold flex items-center gap-1"><AlertTriangle size={12} /> CRÍTICO (+30d)</span>
            case 'warning': 
                return <span className="px-2 py-1 rounded-full bg-yellow-100 text-yellow-700 text-xs font-bold flex items-center gap-1"><Clock size={12} /> POR VENCER (15-30d)</span>
            default: 
                return <span className="px-2 py-1 rounded-full bg-green-100 text-green-700 text-xs font-bold flex items-center gap-1"><CheckCircle size={12} /> AL DÍA</span>
        }
    }

    const handleSedeChange = (e) => {
        const newSede = e.target.value
        if (!isGlobalAdmin && !isBoss && user?.sede && newSede !== user.sede && newSede !== '') {
            console.warn('Usuario no autorizado para cambiar de sede')
            return
        }
        setSelectedSede(newSede)
    }

    const handleClearFilters = () => {
        const defaultSede = (!isGlobalAdmin && !isBoss && user?.sede) ? user.sede : ''
        const defaultBU = (!isGlobalAdmin && user?.business_unit) ? user.business_unit : ''
        
        setSelectedSede(defaultSede)
        setSelectedBusinessUnit(defaultBU)
        setSearchTerm('')
        setStatusFilter('all')
        
        try {
            localStorage.removeItem(FILTERS_STORAGE_KEY)
        } catch (error) {
            console.error('Error limpiando filtros:', error)
        }
    }

    const sedeDisabled = !isGlobalAdmin && !isBoss && !!user?.sede
    const businessUnitDisabled = !selectedSede || businessUnits.length === 0 || (!isGlobalAdmin && !!user?.business_unit)

    const hasActiveFilters = searchTerm !== '' || statusFilter !== 'all' || 
                            (isGlobalAdmin && (selectedSede !== '' || selectedBusinessUnit !== ''))

    return (
        <div className="space-y-6 p-6 bg-slate-50 min-h-screen">
            {/* Header */}
            <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
                <div>
                    <h1 className="text-2xl font-bold text-slate-800">Monitor de Vacaciones</h1>
                    <p className="text-slate-500 text-sm">Gestión y control de saldos vacacionales</p>
                </div>
                
                {/* KPIs Rápidos */}
                <div className="flex gap-4">
                    <div className="bg-white p-3 rounded-lg shadow-sm border border-slate-200 flex flex-col items-center min-w-[100px]">
                        <span className="text-xs text-slate-400 uppercase font-bold">Total</span>
                        <span className="text-xl font-bold text-slate-700">{totalEmployees}</span>
                    </div>
                    <div className="bg-red-50 p-3 rounded-lg shadow-sm border border-red-100 flex flex-col items-center min-w-[100px]">
                        <span className="text-xs text-red-600 uppercase font-bold">Críticos</span>
                        <span className="text-xl font-bold text-red-700">{dangerCount}</span>
                    </div>
                    <div className="bg-yellow-50 p-3 rounded-lg shadow-sm border border-yellow-100 flex flex-col items-center min-w-[100px]">
                        <span className="text-xs text-yellow-600 uppercase font-bold">Por Vencer</span>
                        <span className="text-xl font-bold text-yellow-700">{warningCount}</span>
                    </div>
                    <div className="bg-green-50 p-3 rounded-lg shadow-sm border border-green-100 flex flex-col items-center min-w-[100px]">
                        <span className="text-xs text-green-600 uppercase font-bold">Al Día</span>
                        <span className="text-xl font-bold text-green-700">{safeCount}</span>
                    </div>
                </div>
            </div>

            {/* Filtros */}
            <div className="bg-white p-4 rounded-xl shadow-sm border border-slate-200">
                {/* MODIFICADO: items-end para alinear abajo inputs y botón */}
                <div className="flex flex-col md:flex-row gap-4 items-end">
                    
                    {/* Buscador */}
                    <div className="w-full md:w-64">
                        <label className="text-xs font-semibold text-slate-500 mb-1 block">Buscar</label>
                        <div className="relative">
                            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
                            <input 
                                type="text" 
                                placeholder="Nombre o DNI..." 
                                className="w-full pl-10 pr-4 py-2 bg-slate-50 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500/20 text-sm"
                                value={searchTerm}
                                onChange={(e) => setSearchTerm(e.target.value)}
                            />
                        </div>
                    </div>

                    {/* Sede */}
                    {/* MODIFICADO: relative para contener mensajes absolutos */}
                    <div className="w-full md:w-48 relative">
                        <label className="text-xs font-semibold text-slate-500 mb-1 block">Sede</label>
                        <div className="relative">
                            <MapPin className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
                            <select 
                                className="w-full pl-10 pr-4 py-2 bg-slate-50 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500/20 text-sm appearance-none disabled:bg-slate-100 disabled:text-slate-400 disabled:cursor-not-allowed"
                                value={selectedSede}
                                onChange={handleSedeChange}
                                disabled={sedeDisabled}
                            >
                                <option value="">Todas las Sedes</option>
                                {sedes.map(s => <option key={s.id} value={s.name}>{s.name}</option>)}
                            </select>
                        </div>
                        {sedeDisabled && (
                            <p className="absolute top-full left-0 w-full text-[10px] text-slate-400 mt-1 ml-1 truncate z-10">
                                Restringido a: {user?.sede}
                            </p>
                        )}
                    </div>

                    {/* Unidad de Negocio */}
                    {/* MODIFICADO: relative y mensajes absolutos */}
                    <div className="w-full md:w-48 relative">
                        <label className="text-xs font-semibold text-slate-500 mb-1 block">Unidad de Negocio</label>
                        <div className="relative">
                            <Store className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
                            <select 
                                className="w-full pl-10 pr-4 py-2 bg-slate-50 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500/20 text-sm appearance-none disabled:bg-slate-100 disabled:text-slate-400 disabled:cursor-not-allowed"
                                value={selectedBusinessUnit}
                                onChange={(e) => setSelectedBusinessUnit(e.target.value)}
                                disabled={businessUnitDisabled}
                            >
                                <option value="">Todas</option>
                                {businessUnits.map(bu => <option key={bu.id} value={bu.name}>{bu.name}</option>)}
                            </select>
                        </div>
                        
                        {/* Mensajes Flotantes (Absolute) */}
                        {!selectedSede && (
                            <p className="absolute top-full left-0 w-full text-[10px] text-slate-400 mt-1 ml-1 z-10">
                                Seleccione una sede primero
                            </p>
                        )}
                        {businessUnits.length === 0 && selectedSede && (
                            <p className="absolute top-full left-0 w-full text-[10px] text-amber-500 mt-1 ml-1 z-10">
                                No hay unidades disponibles
                            </p>
                        )}
                        {!isGlobalAdmin && user?.business_unit && (
                            <p className="absolute top-full left-0 w-full text-[10px] text-slate-400 mt-1 ml-1 truncate z-10">
                                Restringido a: {user?.business_unit}
                            </p>
                        )}
                    </div>

                    {/* Estado */}
                    <div className="w-full md:w-48">
                        <label className="text-xs font-semibold text-slate-500 mb-1 block">Estado</label>
                        <div className="relative">
                            <Filter className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
                            <select 
                                className="w-full pl-10 pr-4 py-2 bg-slate-50 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500/20 text-sm appearance-none"
                                value={statusFilter}
                                onChange={(e) => setStatusFilter(e.target.value)}
                            >
                                <option value="all">Todos</option>
                                <option value="safe">Al Día</option>
                                <option value="warning">Alerta (+15 días)</option>
                                <option value="danger">Crítico (+30 días)</option>
                            </select>
                        </div>
                    </div>

                    {/* Botón Limpiar Filtros */}
                    {/* MODIFICADO: Simplificado para alinearse correctamente con items-end */}
                    {hasActiveFilters && (
                        <div className="w-full md:w-auto">
                            <button
                                onClick={handleClearFilters}
                                className="w-full md:w-auto px-4 py-2 text-sm font-medium text-slate-600 bg-slate-100 hover:bg-slate-200 border border-slate-300 rounded-lg transition-colors flex items-center justify-center gap-2 h-[38px]"
                            >
                                <Filter size={16} />
                                Limpiar Filtros
                            </button>
                        </div>
                    )}
                </div>
            </div>

            {/* Tabla */}
            <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden min-h-[600px]">
                <div className="overflow-x-auto">
                    <table className="w-full text-sm text-left text-slate-600">
                        <thead className="text-xs text-slate-500 uppercase bg-slate-50 border-b border-slate-200">
                            <tr>
                                <th className="px-6 py-4 font-bold w-[20%]">Empleado</th>
                                <th className="px-6 py-4 font-bold w-[15%]">Sede / Cargo</th>
                                <th className="px-6 py-4 font-bold w-[10%]">Unidad de Negocio</th>
                                <th className="px-6 py-4 font-bold text-center w-[10%]">Ingreso</th>
                                <th className="px-6 py-4 font-bold text-center w-[8%]">Ganados</th>
                                <th className="px-6 py-4 font-bold text-center w-[8%]">Consumidos</th>
                                <th className="px-6 py-4 font-bold text-center w-[8%]">Saldo</th>
                                <th className="px-6 py-4 font-bold text-center w-[12%]">Estado</th>
                                <th className="px-6 py-4 text-right w-[9%]">Acción</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100">
                            {loading ? (
                                <tr>
                                    <td colSpan="9" className="px-6 py-8 text-center text-slate-400">
                                        <div className="flex justify-center items-center gap-2">
                                            <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-blue-600"></div>
                                            Cargando datos...
                                        </div>
                                    </td>
                                </tr>
                            ) : filteredData.length === 0 ? (
                                <tr>
                                    <td colSpan="9" className="px-6 py-8 text-center text-slate-400">
                                        No se encontraron registros.
                                    </td>
                                </tr>
                            ) : (
                                filteredData.map((emp) => (
                                    <tr key={emp.employee_id} className="hover:bg-slate-50 transition-colors">
                                        <td className="px-6 py-4 font-medium text-slate-900">
                                            {emp.full_name}
                                        </td>
                                        <td className="px-6 py-4">
                                            <div className="flex flex-col">
                                                <span className="font-medium text-slate-700">{emp.sede}</span>
                                                <span className="text-xs text-slate-400">{emp.position}</span>
                                            </div>
                                        </td>
                                        <td className="px-6 py-4 text-slate-600">
                                            {emp.business_unit || '-'}
                                        </td>
                                        <td className="px-6 py-4 text-center text-slate-500">
                                            {emp.entry_date}
                                            <div className="text-xs text-slate-400">({emp.years_service} años)</div>
                                        </td>
                                        <td className="px-6 py-4 text-center font-bold text-blue-600 bg-blue-50/50 rounded-lg">
                                            {Math.trunc(emp.earned_days || 0)}
                                        </td>
                                        <td className="px-6 py-4 text-center text-slate-600">
                                            {Math.trunc(parseFloat(emp.legacy_taken || 0) + parseFloat(emp.app_taken || 0))}
                                        </td>
                                        <td className="px-6 py-4 text-center">
                                            <span className={`px-3 py-1 rounded-lg font-bold ${
                                                emp.balance >= 0 ? 'bg-slate-100 text-slate-800' : 'bg-red-100 text-red-700'
                                            }`}>
                                                {Math.trunc(emp.balance || 0)}
                                            </span>
                                        </td>
                                        <td className="px-6 py-4 text-center">
                                            <div className="flex justify-center">
                                                {getStatusBadge(emp.status)}
                                            </div>
                                        </td>
                                        <td className="px-6 py-4 text-right">
                                            <div className="flex items-center justify-end gap-2">
                                                <button 
                                                    onClick={() => handleOpenCalendar(emp)}
                                                    className="p-1.5 text-slate-500 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-colors border border-transparent hover:border-blue-100"
                                                    title="Ver Calendario"
                                                >
                                                    <Calendar size={18} />
                                                </button>
                                                <button 
                                                    onClick={() => handleOpenKardex(emp)}
                                                    className="text-blue-600 hover:text-blue-800 font-medium text-xs border border-blue-200 hover:bg-blue-50 px-3 py-1.5 rounded-lg transition-colors"
                                                >
                                                    Ver Detalle
                                                </button>
                                            </div>
                                        </td>
                                    </tr>
                                ))
                            )}
                        </tbody>
                    </table>
                </div>
            </div>

            {/* Modal Kardex */}
            <Modal
                isOpen={isModalOpen}
                onClose={() => setIsModalOpen(false)}
                title="Kardex de Vacaciones"
                cancelText="Cerrar"
                showCancel={true}
            >
                {selectedEmployee && (
                    <div className="space-y-6">
                        <div className="bg-slate-50 p-4 rounded-lg border border-slate-200 flex justify-between items-center">
                            <div>
                                <h3 className="font-bold text-lg text-slate-800">{selectedEmployee.full_name}</h3>
                                <p className="text-sm text-slate-500 flex items-center gap-2">
                                    <Briefcase size={14} /> {selectedEmployee.position}
                                    <span className="text-slate-300">|</span>
                                    <Calendar size={14} /> Ingreso: {selectedEmployee.entry_date}
                                </p>
                            </div>
                            <div className="text-right">
                                <span className="block text-xs text-slate-400 uppercase font-bold">Saldo Actual</span>
                                <span className={`text-2xl font-bold ${
                                    selectedEmployee.balance >= 0 ? 'text-blue-600' : 'text-red-600'
                                }`}>
                                    {Math.trunc(selectedEmployee.balance || 0)}
                                </span>
                            </div>
                        </div>

                        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                            <div className="p-4 rounded-lg border border-blue-100 bg-blue-50">
                                <div className="flex items-center gap-2 mb-2 text-blue-700 font-bold text-sm">
                                    <Calculator size={16} /> Días Ganados
                                </div>
                                <div className="text-2xl font-bold text-blue-800">{Math.trunc(selectedEmployee.earned_days || 0)}</div>
                                <p className="text-xs text-blue-600 mt-1">
                                    (Antigüedad / 360) * 30
                                </p>
                            </div>
                            
                            <div className="p-4 rounded-lg border border-slate-200 bg-white">
                                <div className="flex items-center gap-2 mb-2 text-slate-600 font-bold text-sm">
                                    <Clock size={16} /> Consumo Histórico
                                </div>
                                <div className="text-2xl font-bold text-slate-700">{selectedEmployee.legacy_taken}</div>
                                <p className="text-xs text-slate-500 mt-1">
                                    Migración Excel
                                </p>
                            </div>

                            <div className="p-4 rounded-lg border border-purple-100 bg-purple-50">
                                <div className="flex items-center gap-2 mb-2 text-purple-700 font-bold text-sm">
                                    <Calendar size={16} /> Consumo App
                                </div>
                                <div className="text-2xl font-bold text-purple-800">{selectedEmployee.app_taken}</div>
                                <p className="text-xs text-purple-600 mt-1">
                                    Solicitudes Aprobadas
                                </p>
                            </div>
                        </div>

                        <div className="bg-slate-50 p-4 rounded-lg border border-slate-200 text-sm text-slate-600">
                            <h4 className="font-bold mb-2 flex items-center gap-2">
                                <Calculator size={14} /> Fórmula de Cálculo
                            </h4>
                            <p className="font-mono bg-white p-2 rounded border border-slate-200 text-xs">
                                SALDO = (GANADOS) - (HISTÓRICO + APP)
                            </p>
                            <p className="font-mono bg-white p-2 rounded border border-slate-200 text-xs mt-2">
                                {Math.trunc(selectedEmployee.balance || 0)} = ({Math.trunc(selectedEmployee.earned_days || 0)}) - ({Math.trunc(selectedEmployee.legacy_taken || 0)} + {Math.trunc(selectedEmployee.app_taken || 0)})
                            </p>
                        </div>
                    </div>
                )}
            </Modal>

            {/* Modal Calendario */}
            <Modal
                isOpen={isCalendarOpen}
                onClose={() => setIsCalendarOpen(false)}
                title={calendarEmployee ? `Calendario de Vacaciones - ${calendarEmployee.full_name}` : "Calendario de Vacaciones"}
                cancelText="Cerrar"
                showCancel={true}
            >
                {calendarEmployee && (
                    <VacationCalendar employeeId={calendarEmployee.employee_id} />
                )}
            </Modal>
        </div>
    )
}