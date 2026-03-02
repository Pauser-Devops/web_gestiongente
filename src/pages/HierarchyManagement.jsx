import React, { useState, useEffect } from 'react'
import { useAuth } from '../context/AuthContext'
import { useToast } from '../context/ToastContext'
import { 
    Users, 
    Search, 
    Filter, 
    CheckSquare, 
    Square, 
    Save, 
    UserPlus,
    Briefcase,
    MapPin,
    Building2,
    ShieldCheck,
    AlertCircle,
    ChevronRight,
    ArrowRight,
    Sparkles
} from 'lucide-react'
import { getEmployeesWithSupervisor, assignSupervisorBulk } from '../services/employees'
import { getSedes } from '../services/organization'
import { getBusinessUnits } from '../services/organization'
import { getAreas } from '../services/areas'

export default function HierarchyManagement() {
    const { user } = useAuth()
    const { showToast } = useToast()
    
    // Data States
    const [employees, setEmployees] = useState([])
    const [loading, setLoading] = useState(true)
    const [sedes, setSedes] = useState([])
    const [businessUnits, setBusinessUnits] = useState([])
    const [areas, setAreas] = useState([])

    // Helper
    const normalize = (str) => str ? str.toString().trim().normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase() : ""

    // Filter States
    const [filters, setFilters] = useState({
        search: '',
        sede: 'all',
        businessUnit: 'all',
        area: 'all',
        hasSupervisor: 'all' // all, yes, no
    })

    // Selection State
    const [selectedEmployees, setSelectedEmployees] = useState([])
    const [selectedSupervisor, setSelectedSupervisor] = useState(null)
    const [suggestedSupervisor, setSuggestedSupervisor] = useState(null)
    const [supervisorSearch, setSupervisorSearch] = useState('')
    const [isAssigning, setIsAssigning] = useState(false)

    // Load Initial Data
    useEffect(() => {
        loadData()
    }, [])

    // Suggestion Logic
    useEffect(() => {
        if (filters.area === 'all' && filters.sede === 'all') {
            setSuggestedSupervisor(null)
            return
        }

        // Find potential supervisors based on current filters
        const candidates = employees.filter(emp => {
            // Must be a boss type
            const pos = normalize(emp.position)
            const isBoss = (
                pos.includes('jefe') || 
                pos.includes('gerente') || 
                pos.includes('coordinador') || 
                pos.includes('supervisor') ||
                pos.includes('admin')
            )
            if (!isBoss) return false

            // Must match Sede (if selected)
            if (filters.sede !== 'all' && emp.sede !== filters.sede) return false

            // Must match Business Unit (if selected)
            if (filters.businessUnit !== 'all' && emp.business_unit !== filters.businessUnit) return false

            // Must match Area (if selected) OR be a high-level manager (Gerente)
            if (filters.area !== 'all') {
                const empArea = normalize(emp.area_name?.area_name || emp.area_name || '')
                const filterArea = normalize(filters.area)
                
                // Strict match for area, unless it's a General Manager
                if (empArea !== filterArea && !pos.includes('gerente general')) return false
            }

            return true
        })

        if (candidates.length === 0) {
            setSuggestedSupervisor(null)
            return
        }

        // Rank candidates
        const ranked = candidates.map(c => {
            let score = 0
            const pos = normalize(c.position)
            
            // Base score by rank
            if (pos.includes('gerente')) score += 4
            if (pos.includes('jefe')) score += 3
            if (pos.includes('coordinador')) score += 2
            if (pos.includes('supervisor')) score += 1
            
            // Contextual boost: if position title contains the filtered Area name
            // e.g. "Jefe de Logistica" matches area "Logistica" better than "Jefe de Operaciones"
            if (filters.area !== 'all') {
                const filterArea = normalize(filters.area)
                if (pos.includes(filterArea)) {
                    score += 5 // High boost for explicit title match
                }
            }

            return { ...c, score }
        })

        // Sort by score desc
        ranked.sort((a, b) => b.score - a.score)

        // Pick top 1 if score > 0
        if (ranked.length > 0 && ranked[0].score > 0) {
            setSuggestedSupervisor(ranked[0])
        } else {
            setSuggestedSupervisor(null)
        }

    }, [filters, employees])

    const loadData = async () => {
        setLoading(true)
        try {
            const [empRes, sedesRes, buRes, areasRes] = await Promise.all([
                getEmployeesWithSupervisor(),
                getSedes(),
                getBusinessUnits(),
                getAreas()
            ])

            if (empRes.data) setEmployees(empRes.data)
            if (sedesRes.data) setSedes(sedesRes.data)
            if (buRes.data) setBusinessUnits(buRes.data)
            if (areasRes.data) setAreas(areasRes.data)

        } catch (error) {
            console.error('Error loading hierarchy data:', error)
            showToast('Error cargando datos de jerarquía', 'error')
        } finally {
            setLoading(false)
        }
    }

    // Filter Logic

    const filteredEmployees = employees.filter(emp => {
        // Search
        if (filters.search) {
            const search = normalize(filters.search)
            const matchName = normalize(emp.full_name).includes(search)
            const matchDni = normalize(emp.dni).includes(search)
            const matchPos = normalize(emp.position).includes(search)
            if (!matchName && !matchDni && !matchPos) return false
        }

        // Sede
        if (filters.sede !== 'all' && emp.sede !== filters.sede) return false

        // Business Unit
        if (filters.businessUnit !== 'all' && emp.business_unit !== filters.businessUnit) return false

        // Area (Normalized)
        if (filters.area !== 'all') {
            const empArea = normalize(emp.area_name?.area_name || emp.area_name || '');
            const filterArea = normalize(filters.area);
            if (empArea !== filterArea) return false
        }

        // Has Supervisor
        if (filters.hasSupervisor === 'yes' && !emp.supervisor_id) return false
        if (filters.hasSupervisor === 'no' && emp.supervisor_id) return false

        return true
    })

    // Supervisor Candidates (Potential Bosses)
    // Filter out people who shouldn't be bosses (optional logic, for now anyone can be boss but we prioritize Jefes/Coords)
    // AND filter by selected Area/Sede/BusinessUnit if desired (optional UX enhancement)
    const supervisorCandidates = employees.filter(emp => {
        const pos = normalize(emp.position)
        const isBoss = (
            pos.includes('jefe') || 
            pos.includes('gerente') || 
            pos.includes('coordinador') || 
            pos.includes('supervisor') ||
            pos.includes('admin')
        )
        if (!isBoss) return false

        // Optional: Filter supervisors by selected Area if filter is active
        // This helps to find the "Jefe de Operaciones" when filtering Operaciones area
        if (filters.area !== 'all') {
            const empArea = normalize(emp.area_name?.area_name || emp.area_name || '');
            const filterArea = normalize(filters.area);
            // Allow if match area OR is Gerente General (always visible)
            if (empArea !== filterArea && !pos.includes('gerente general')) return false
        }

        return true
    })

    // Handlers
    const handleSelectAll = () => {
        if (selectedEmployees.length === filteredEmployees.length) {
            setSelectedEmployees([])
        } else {
            setSelectedEmployees(filteredEmployees.map(e => e.id))
        }
    }

    const handleToggleSelect = (id) => {
        if (selectedEmployees.includes(id)) {
            setSelectedEmployees(prev => prev.filter(e => e !== id))
        } else {
            setSelectedEmployees(prev => [...prev, id])
        }
    }

    const handleAssign = async () => {
        if (!selectedSupervisor) {
            showToast('Debes seleccionar un Supervisor primero', 'warning')
            return
        }
        if (selectedEmployees.length === 0) {
            showToast('Selecciona al menos un empleado para asignar', 'warning')
            return
        }

        // Validate circular dependency (simple check)
        if (selectedEmployees.includes(selectedSupervisor.id)) {
            showToast('Un supervisor no puede reportarse a sí mismo', 'error')
            return
        }

        if (!window.confirm(`¿Estás seguro de asignar a ${selectedSupervisor.full_name} como supervisor de ${selectedEmployees.length} empleados?`)) {
            return
        }

        setIsAssigning(true)
        try {
            const { error } = await assignSupervisorBulk(selectedSupervisor.id, selectedEmployees)
            
            if (error) throw error

            showToast('Asignación completada exitosamente', 'success')
            setSelectedEmployees([])
            setSelectedSupervisor(null)
            setSupervisorSearch('')
            loadData() // Refresh list

        } catch (error) {
            console.error('Assignment error:', error)
            showToast('Error al asignar supervisor', 'error')
        } finally {
            setIsAssigning(false)
        }
    }

    // Render Helpers
    const getInitials = (name) => {
        return name
            ?.split(' ')
            .map(n => n[0])
            .slice(0, 2)
            .join('')
            .toUpperCase() || 'EMP'
    }

    return (
        <div className="min-h-screen bg-gray-50 pb-20">
            {/* Header */}
            <div className="bg-white border-b border-gray-200 px-4 py-4 sticky top-0 z-10 w-full">
                <div className="w-full">
                    <div className="md:flex md:items-center md:justify-between">
                        <div className="flex-1 min-w-0">
                            <h2 className="text-2xl font-bold leading-7 text-gray-900 sm:text-3xl sm:truncate flex items-center gap-2">
                                <ShieldCheck className="text-blue-600" size={32} />
                                Gestión de Jerarquías
                            </h2>
                            <p className="mt-1 text-sm text-gray-500">
                                Asigna supervisores directos para la aprobación de documentos.
                            </p>
                        </div>
                        <div className="mt-4 flex md:mt-0 md:ml-4">
                            <button
                                onClick={handleAssign}
                                disabled={isAssigning || selectedEmployees.length === 0 || !selectedSupervisor}
                                className="ml-3 inline-flex items-center px-4 py-2 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 disabled:opacity-50 disabled:cursor-not-allowed"
                            >
                                {isAssigning ? 'Asignando...' : 'Guardar Asignación'}
                                <Save className="ml-2 -mr-1 h-4 w-4" />
                            </button>
                        </div>
                    </div>
                </div>
            </div>

            <div className="w-full px-4 py-6">
                <div className="flex flex-col lg:flex-row gap-6">
                    
                    {/* LEFT COLUMN: FILTERS & EMPLOYEE LIST */}
                    <div className="flex-1 min-w-0 space-y-4">
                        
                        {/* Filters Card */}
                        <div className="bg-white shadow rounded-lg p-4">
                            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                                <div className="col-span-1 md:col-span-2">
                                    <label className="block text-xs font-medium text-gray-500 mb-1">Buscar Empleado</label>
                                    <div className="relative">
                                        <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                                            <Search className="h-4 w-4 text-gray-400" />
                                        </div>
                                        <input
                                            type="text"
                                            className="focus:ring-blue-500 focus:border-blue-500 block w-full pl-10 sm:text-sm border-gray-300 rounded-md"
                                            placeholder="Nombre, DNI o Cargo..."
                                            value={filters.search}
                                            onChange={(e) => setFilters(prev => ({ ...prev, search: e.target.value }))}
                                        />
                                    </div>
                                </div>
                                
                                <div>
                                    <label className="block text-xs font-medium text-gray-500 mb-1">Sede</label>
                                    <select
                                        value={filters.sede}
                                        onChange={(e) => setFilters(prev => ({ ...prev, sede: e.target.value }))}
                                        className="mt-1 block w-full pl-3 pr-10 py-2 text-base border-gray-300 focus:outline-none focus:ring-blue-500 focus:border-blue-500 sm:text-sm rounded-md"
                                    >
                                        <option value="all">Todas</option>
                                        {sedes.map(s => <option key={s.id} value={s.name}>{s.name}</option>)}
                                    </select>
                                </div>

                                <div>
                                    <label className="block text-xs font-medium text-gray-500 mb-1">Unidad de Negocio</label>
                                    <select
                                        value={filters.businessUnit}
                                        onChange={(e) => setFilters(prev => ({ ...prev, businessUnit: e.target.value }))}
                                        className="mt-1 block w-full pl-3 pr-10 py-2 text-base border-gray-300 focus:outline-none focus:ring-blue-500 focus:border-blue-500 sm:text-sm rounded-md"
                                    >
                                        <option value="all">Todas</option>
                                        {businessUnits.map(b => <option key={b.id} value={b.name}>{b.name}</option>)}
                                    </select>
                                </div>

                                <div>
                                    <label className="block text-xs font-medium text-gray-500 mb-1">Área</label>
                                    <select
                                        value={filters.area}
                                        onChange={(e) => setFilters(prev => ({ ...prev, area: e.target.value }))}
                                        className="mt-1 block w-full pl-3 pr-10 py-2 text-base border-gray-300 focus:outline-none focus:ring-blue-500 focus:border-blue-500 sm:text-sm rounded-md"
                                    >
                                        <option value="all">Todas</option>
                                        {areas.map(a => <option key={a.id} value={a.name}>{a.name}</option>)}
                                    </select>
                                </div>
                                
                                <div>
                                    <label className="block text-xs font-medium text-gray-500 mb-1">Tiene Supervisor</label>
                                    <select
                                        value={filters.hasSupervisor}
                                        onChange={(e) => setFilters(prev => ({ ...prev, hasSupervisor: e.target.value }))}
                                        className="mt-1 block w-full pl-3 pr-10 py-2 text-base border-gray-300 focus:outline-none focus:ring-blue-500 focus:border-blue-500 sm:text-sm rounded-md"
                                    >
                                        <option value="all">Todos</option>
                                        <option value="yes">Sí, ya tiene</option>
                                        <option value="no">No tiene (Pendiente)</option>
                                    </select>
                                </div>
                            </div>
                        </div>

                        {/* Employee List Card */}
                        <div className="bg-white shadow rounded-lg overflow-hidden flex flex-col h-[600px]">
                            <div className="px-4 py-3 border-b border-gray-200 bg-gray-50 flex justify-between items-center">
                                <h3 className="text-sm font-medium text-gray-700 flex items-center gap-2">
                                    <Users size={16} />
                                    Resultados ({filteredEmployees.length})
                                </h3>
                                <button 
                                    onClick={handleSelectAll}
                                    className="text-xs text-blue-600 hover:text-blue-800 font-medium"
                                >
                                    {selectedEmployees.length === filteredEmployees.length ? 'Deseleccionar Todos' : 'Seleccionar Todos'}
                                </button>
                            </div>
                            
                            <div className="flex-1 overflow-y-auto p-2 space-y-1">
                                {loading ? (
                                    <div className="flex justify-center items-center h-full">
                                        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
                                    </div>
                                ) : filteredEmployees.length === 0 ? (
                                    <div className="text-center py-10 text-gray-500">
                                        No se encontraron empleados con estos filtros.
                                    </div>
                                ) : (
                                    filteredEmployees.map(emp => (
                                        <div 
                                            key={emp.id}
                                            onClick={() => handleToggleSelect(emp.id)}
                                            className={`
                                                flex items-center p-3 rounded-lg cursor-pointer transition-colors border
                                                ${selectedEmployees.includes(emp.id) 
                                                    ? 'bg-blue-50 border-blue-200' 
                                                    : 'bg-white border-transparent hover:bg-gray-50'}
                                            `}
                                        >
                                            <div className="flex-shrink-0 mr-3">
                                                {selectedEmployees.includes(emp.id) ? (
                                                    <CheckSquare className="h-5 w-5 text-blue-600" />
                                                ) : (
                                                    <Square className="h-5 w-5 text-gray-300" />
                                                )}
                                            </div>
                                            
                                            <div className="flex-1 min-w-0">
                                                <div className="flex items-center justify-between">
                                                    <p className="text-sm font-medium text-gray-900 truncate">
                                                        {emp.full_name}
                                                    </p>
                                                    {emp.supervisor_id && (
                                                        <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-green-100 text-green-800">
                                                            Tiene Jefe
                                                        </span>
                                                    )}
                                                </div>
                                                <div className="flex items-center text-xs text-gray-500 mt-0.5 space-x-2">
                                                    <span className="flex items-center gap-1">
                                                        <Briefcase size={10} /> {emp.position}
                                                    </span>
                                                    <span>•</span>
                                                    <span className="flex items-center gap-1">
                                                        <MapPin size={10} /> {emp.sede}
                                                    </span>
                                                </div>
                                                {emp.supervisor && (
                                                    <p className="text-xs text-gray-400 mt-1 flex items-center gap-1">
                                                        <ChevronRight size={10} />
                                                        Jefe actual: <span className="font-medium text-gray-600">{emp.supervisor.full_name}</span>
                                                    </p>
                                                )}
                                            </div>
                                        </div>
                                    ))
                                )}
                            </div>
                            
                            <div className="bg-gray-50 px-4 py-3 border-t border-gray-200 text-xs text-gray-500 flex justify-between">
                                <span>{selectedEmployees.length} seleccionados</span>
                                <span>Total: {filteredEmployees.length}</span>
                            </div>
                        </div>
                    </div>

                    {/* RIGHT COLUMN: SUPERVISOR SELECTION */}
                        <div className="w-full lg:w-96 xl:w-[450px] flex flex-col space-y-4 shrink-0">
                            <div className="bg-white shadow rounded-lg p-4 sticky top-24">
                                <h3 className="text-lg font-medium text-gray-900 mb-4 flex items-center gap-2">
                                    <UserPlus className="text-blue-600" />
                                    Asignar Nuevo Jefe
                                </h3>

                                {/* Suggestion Card */}
                                {suggestedSupervisor && !selectedSupervisor && (
                                    <div className="bg-gradient-to-r from-blue-50 to-indigo-50 border border-blue-200 rounded-lg p-4 mb-4 animate-fade-in">
                                        <div className="flex items-start gap-3">
                                            <div className="p-2 bg-blue-100 rounded-full text-blue-600">
                                                <Sparkles size={20} />
                                            </div>
                                            <div className="flex-1">
                                                <h4 className="text-sm font-bold text-gray-900">Sugerencia Automática</h4>
                                                <p className="text-xs text-gray-600 mt-1">
                                                    Basado en tus filtros, detectamos un posible líder:
                                                </p>
                                                
                                                <div className="flex items-center gap-2 mt-3 bg-white p-2 rounded border border-blue-100 shadow-sm">
                                                    <div className="h-8 w-8 rounded-full bg-gray-200 flex items-center justify-center text-xs font-bold text-gray-600">
                                                        {getInitials(suggestedSupervisor.full_name)}
                                                    </div>
                                                    <div className="flex-1 min-w-0">
                                                        <p className="text-sm font-medium text-gray-900 truncate">{suggestedSupervisor.full_name}</p>
                                                        <p className="text-xs text-gray-500 truncate">{suggestedSupervisor.position}</p>
                                                    </div>
                                                </div>

                                                <button 
                                                    onClick={() => {
                                                        setSelectedSupervisor(suggestedSupervisor)
                                                        setSupervisorSearch(suggestedSupervisor.full_name)
                                                    }}
                                                    className="mt-3 w-full flex items-center justify-center px-3 py-1.5 border border-transparent text-xs font-medium rounded text-white bg-blue-600 hover:bg-blue-700 shadow-sm transition-colors"
                                                >
                                                    Seleccionar este Supervisor
                                                </button>
                                            </div>
                                        </div>
                                    </div>
                                )}

                                <div className="mb-4">
                                    <label className="block text-sm font-medium text-gray-700 mb-2">
                                        Seleccionar Supervisor
                                    </label>
                                    <div className="relative">
                                        <Search className="absolute left-3 top-2.5 h-4 w-4 text-gray-400" />
                                        <input
                                            type="text"
                                            placeholder="Buscar jefe..."
                                            className="pl-9 w-full border-gray-300 rounded-md text-sm focus:ring-blue-500 focus:border-blue-500"
                                            list="supervisors-list"
                                            value={supervisorSearch}
                                            onChange={(e) => {
                                                const val = e.target.value
                                                setSupervisorSearch(val)
                                                const found = supervisorCandidates.find(s => s.full_name === val)
                                                if (found) setSelectedSupervisor(found)
                                                else if (val === '') setSelectedSupervisor(null)
                                            }}
                                        />
                                        <datalist id="supervisors-list">
                                            {supervisorCandidates.map(s => (
                                                <option key={s.id} value={s.full_name}>{s.position} - {s.sede}</option>
                                            ))}
                                        </datalist>
                                    </div>
                                </div>

                            {selectedSupervisor ? (
                                <div className="bg-blue-50 rounded-lg p-4 border border-blue-100">
                                    <div className="flex items-center gap-3">
                                        <div className="h-10 w-10 rounded-full bg-blue-200 flex items-center justify-center text-blue-700 font-bold">
                                            {getInitials(selectedSupervisor.full_name)}
                                        </div>
                                        <div>
                                            <p className="text-sm font-bold text-gray-900">{selectedSupervisor.full_name}</p>
                                            <p className="text-xs text-blue-700">{selectedSupervisor.position}</p>
                                            <p className="text-xs text-gray-500">{selectedSupervisor.sede}</p>
                                        </div>
                                    </div>
                                    
                                    <div className="mt-4 pt-4 border-t border-blue-200">
                                        <div className="flex items-center justify-between text-sm mb-2">
                                            <span className="text-gray-600">Se asignará a:</span>
                                            <span className="font-bold text-gray-900">{selectedEmployees.length} empleados</span>
                                        </div>
                                        <p className="text-xs text-gray-500 italic">
                                            Esta acción registrará el cambio en auditoría y afectará las nuevas solicitudes.
                                        </p>
                                    </div>
                                </div>
                            ) : (
                                <div className="bg-gray-50 rounded-lg p-8 border border-dashed border-gray-300 text-center">
                                    <UserPlus className="mx-auto h-8 w-8 text-gray-300 mb-2" />
                                    <p className="text-sm text-gray-500">Busca y selecciona un supervisor de la lista para ver los detalles.</p>
                                </div>
                            )}

                            <div className="mt-6 space-y-3">
                                <div className="flex items-start gap-2 text-xs text-amber-600 bg-amber-50 p-2 rounded">
                                    <AlertCircle size={14} className="mt-0.5 flex-shrink-0" />
                                    <p>Los empleados seleccionados dejarán de usar la asignación automática y reportarán directamente a este supervisor.</p>
                                </div>
                            </div>
                        </div>
                    </div>

                </div>
            </div>
        </div>
    )
}
