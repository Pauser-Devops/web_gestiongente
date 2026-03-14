import React, { useState } from 'react'
import { useAuth } from '../context/AuthContext'
import { useToast } from '../context/ToastContext'
import * as XLSX from '@e965/xlsx'
import { 
    FileText, 
    Download, 
    Users, 
    Clock, 
    Calendar, 
    Briefcase,
    Filter,
    Table,
    ChevronDown,
    UserMinus, // Icono para bajas
    X // Icono para limpiar filtros
} from 'lucide-react'
import { 
    getEmployeesReport, 
    getAttendanceReport, 
    getNewHiresReport, 
    getVacationBalanceReport,
    getTerminationsReport
} from '../services/reports'
import { getAreas } from '../services/areas'
import { getBusinessUnits } from '../services/organization'

export default function ReportsCenter() {
    const { user } = useAuth()
    const { showToast } = useToast()
    const [loading, setLoading] = useState(false)
    const [activeTab, setActiveTab] = useState('employees') // employees, attendance, hires, vacations

    // Filtros Generales
    const [selectedSede, setSelectedSede] = useState(user?.sede || 'all')
    const [selectedBusinessUnit, setSelectedBusinessUnit] = useState(user?.business_unit || 'all')
    const [selectedArea, setSelectedArea] = useState('all')
    const [areas, setAreas] = useState([])
    const [businessUnits, setBusinessUnits] = useState([])

    // Cargar Áreas y Unidades de Negocio
    React.useEffect(() => {
        getAreas().then(({ data }) => {
            if (data) setAreas(data)
        })
        getBusinessUnits().then(({ data }) => {
            if (data) setBusinessUnits(data)
        })
    }, [])
    
    // Helper robusto para fecha Perú UTC-5 (independiente del navegador)
    const getPeruDate = () => {
        const now = new Date();
        // Obtener UTC en milisegundos
        const utc = now.getTime() + (now.getTimezoneOffset() * 60000);
        // Offset Perú es -5 horas (independientemente del horario de verano que no tiene)
        const peruTime = new Date(utc + (3600000 * -5));
        
        const year = peruTime.getFullYear();
        const month = String(peruTime.getMonth() + 1).padStart(2, '0');
        const day = String(peruTime.getDate()).padStart(2, '0');
        return `${year}-${month}-${day}`;
    }

    // Filtros Específicos
    const [dateRange, setDateRange] = useState({
        start: getPeruDate(),
        end: getPeruDate()
    })
    const [selectedMonth, setSelectedMonth] = useState({
        year: new Date().getFullYear(),
        month: new Date().getMonth() + 1
    })

    const [terminationsRange, setTerminationsRange] = useState({
        start: getPeruDate(),
        end: getPeruDate()
    })

    // ── FILTRADO DE SEGURIDAD ──
    const normalize = (str) => str ? str.trim().normalize("NFD").replace(/[\u0300-\u036f]/g, "").toUpperCase() : "";
    const userPosition = normalize(user?.position);
    const userRole = normalize(user?.role);

    const isGlobalAdmin =
        user?.role === 'ADMIN' ||
        user?.role === 'SUPER ADMIN' ||
        user?.role === 'JEFE_RRHH' ||
        (user?.permissions && user?.permissions['*']) ||
        // ANALISTA DE GENTE Y GESTIÓN (con o sin PART TIME) de ADM. CENTRAL + ADMINISTRACIÓN → ve todo
        (userPosition.includes('ANALISTA DE GENTE') &&
         normalize(user?.sede || '').includes('ADM') && normalize(user?.sede || '').includes('CENTRAL') &&
         normalize(user?.business_unit || '').includes('ADMINISTRACI'));

    // ── SOBREESCRIBIR PERMISOS PARA JEFE DE GENTE Y GESTIÓN ──
    const isJefeGyG = userRole.includes('JEFE DE GENTE Y GESTION') || userPosition.includes('JEFE DE GENTE Y GESTION');

    const canSelectSede = isGlobalAdmin && !user?.sede
    const canViewFilters = isGlobalAdmin || isJefeGyG || userRole === 'GERENTE';

    // Sede a usar en llamadas a la API:
    // - Admin / JefeGyG: respeta el selector (puede ser null para ver todo)
    // - Otros: fuerza la sede del usuario (nunca null si tiene sede)
    const apiSede = (isGlobalAdmin || isJefeGyG)
        ? (selectedSede === 'all' ? null : selectedSede)
        : (user?.sede || null);

    // Permitir selección de sede si es Admin O Jefe GyG
    const canSelectSedeFinal = canSelectSede || isJefeGyG;

    // Función para limpiar filtros
    const handleClearFilters = () => {
        if (canSelectSedeFinal) {
            setSelectedSede('all');
        } else {
            // Si no puede seleccionar sede, la reseteamos a su sede por defecto si por error cambió
            setSelectedSede(user?.sede || 'all');
        }
        setSelectedBusinessUnit('all');
        setSelectedArea('all');
    }

    const handleExport = async (type) => {
        setLoading(true)
        try {
            let data = []
            let fileName = ''
            let sheetName = ''
            
            // Determinar sufijo de sede para el nombre del archivo
            // Usamos selectedSede que es el estado del filtro visual
            const currentSedeFilter = selectedSede === 'all' ? null : selectedSede;
            const sedeSuffix = (!currentSedeFilter) ? 'GENERAL' : currentSedeFilter.toUpperCase().replace(/\s+/g, '_')

            // Helper para filtrar en memoria por Unidad de Negocio y Área
            // Normalizamos ambos lados para evitar errores por mayúsculas/tildes/espacios
            const filterInMemory = (list) => {
                if (!list) return []
                return list.filter(item => {
                    // 1. Filtro Business Unit
                    if (selectedBusinessUnit !== 'all') {
                        const itemBU = normalize(item.business_unit || '')
                        const filterBU = normalize(selectedBusinessUnit)
                        if (itemBU !== filterBU) return false
                    }

                    // 2. Filtro Area
                    if (selectedArea !== 'all') {
                        // Manejar si area_name es objeto (employees) o string (otros)
                        let itemArea = ''
                        if (item.area_name && typeof item.area_name === 'object') {
                            itemArea = item.area_name.area_name || ''
                        } else {
                            itemArea = item.area_name || ''
                        }
                        
                        const iArea = normalize(itemArea)
                        const fArea = normalize(selectedArea)
                        
                        if (iArea !== fArea) return false
                    }
                    return true
                })
            }

            switch (type) {
                case 'employees':
                    // TRAEMOS TODO DE LA SEDE (businessUnit = null) Y FILTRAMOS EN MEMORIA
                    // Esto corrige el problema de que el backend sea muy estricto o case-sensitive
                    const { data: empData, error: empError } = await getEmployeesReport(
                        apiSede,
                        null // selectedBusinessUnit -> NULL para traer todo y filtrar localmente
                    )
                    
                    if (empError || !empData) {
                        throw new Error('No se pudieron cargar los datos de empleados')
                    }

                    // Aplicar filtros robustos en memoria
                    const filteredEmployees = filterInMemory(empData);

                    data = filteredEmployees.map(emp => ({
                        'DNI': emp.dni,
                        'Nombre Completo': emp.full_name,
                        'Cargo': emp.position,
                        'Área': emp.area_name?.area_name || 'Sin Área', // Se mantiene la estructura { area_name: "Nombre" } que viene del servicio
                        'Sede': emp.sede,
                        'Unidad Negocio': emp.business_unit || '-',
                        'Fecha Ingreso': emp.entry_date,
                        'Tipo': emp.employee_type,
                        'Email': emp.email,
                        'Celular': emp.phone,
                        'Dirección': emp.address,
                        'Distrito': emp.district,
                        'Estado Civil': emp.civil_status,
                        'Hijos': emp.children_count,
                        'AFP/ONP': emp.pension_system,
                        'CUSPP': emp.cuspp,
                        'Banco': emp.bank_name,
                        'Cuenta': emp.bank_account,
                        'CCI': emp.cci_account,
                        'Estado': emp.is_active ? 'ACTIVO' : 'INACTIVO'
                    }))
                    fileName = `Maestro_Empleados_${sedeSuffix}_${getPeruDate()}.xlsx`
                    sheetName = 'Empleados'
                    break

                case 'attendance':
                    // 1. ESTRATEGIA ROBUSTA ANT-ZONA HORARIA
                    // Ampliamos el rango de búsqueda (-1 día al inicio, +1 día al final)
                    const qStart = new Date(dateRange.start);
                    qStart.setDate(qStart.getDate() - 1);
                    const queryStartStr = qStart.toISOString().split('T')[0];
                    
                    const qEnd = new Date(dateRange.end);
                    qEnd.setDate(qEnd.getDate() + 1);
                    const queryEndStr = qEnd.toISOString().split('T')[0];

                    // Obtener datos con rango ampliado
                    // Usamos el estado selectedSede directamente, confiando en que la UI ya restringió si era necesario
                    // Para Jefe GyG, selectedSede es libre.
                    const { data: rawAttData, error: attError } = await getAttendanceReport(
                        queryStartStr,
                        queryEndStr,
                        apiSede
                    )

                    if (attError || !rawAttData) {
                        throw new Error('No se pudieron cargar los datos de asistencia')
                    }

                    // FILTRADO EXACTO EN MEMORIA (String vs String)
                    let attData = rawAttData.filter(item => {
                        return item.work_date >= dateRange.start && item.work_date <= dateRange.end;
                    });

                    // 2. Obtener lista de empleados para el cruce (Roster)
                    // TRAEMOS TODO DE LA SEDE (businessUnit = null) Y FILTRAMOS EN MEMORIA
                    const { data: allEmployees, error: empError2 } = await getEmployeesReport(
                        apiSede,
                        null
                    )

                    if (empError2 || !allEmployees) {
                        throw new Error('No se pudo cargar la lista de empleados para el reporte')
                    }

                    // Filtrar Roster por BU y Área usando el helper robusto
                    const rosterEmployees = filterInMemory(allEmployees);

                    // 3. Generar rango de fechas (Iteración segura usando UTC)
                    const dates = []
                    // Parseamos como UTC explícitamente agregando T00:00:00Z si es necesario, 
                    // o mejor aún, trabajamos con los componentes de la fecha para evitar confusiones.
                    
                    const startParts = dateRange.start.split('-').map(Number); // [2026, 2, 17]
                    const endParts = dateRange.end.split('-').map(Number);     // [2026, 2, 17]
                    
                    // Creamos fechas usando UTC para evitar que el navegador reste horas
                    let currentIter = new Date(Date.UTC(startParts[0], startParts[1] - 1, startParts[2]));
                    const endIter = new Date(Date.UTC(endParts[0], endParts[1] - 1, endParts[2]));

                    while (currentIter <= endIter) {
                        dates.push(new Date(currentIter))
                        currentIter.setUTCDate(currentIter.getUTCDate() + 1)
                    }

                    // 4. Indexar asistencias existentes para búsqueda rápida: date_string -> employee_id -> record
                    const attendanceMap = {}
                    attData.forEach(att => {
                        if (!attendanceMap[att.work_date]) {
                            attendanceMap[att.work_date] = {}
                        }
                        attendanceMap[att.work_date][att.employee_id] = att
                    })

                    // 5. Construir reporte completo (Cross-Join: Fechas x Empleados)
                    data = []
                    
                    // Ordenar fechas descendente
                    dates.sort((a, b) => b - a).forEach(d => {
                        const dateStr = d.toISOString().split('T')[0]
                        
                        rosterEmployees.forEach(emp => {
                            // Buscar si existe registro
                            const record = attendanceMap[dateStr]?.[emp.id]
                            
                            // Helpers (reutilizados)
                            const formatTime = (timeStr) => {
                                if (!timeStr) return '-'
                                try {
                                    const date = new Date(timeStr)
                                    if (isNaN(date.getTime())) return timeStr
                                    return date.toLocaleTimeString('es-PE', {
                                        timeZone: 'America/Lima',
                                        hour: '2-digit',
                                        minute: '2-digit',
                                        hour12: true
                                    }).toUpperCase()
                                } catch (e) {
                                    return timeStr
                                }
                            }

                            const getStatusText = (item) => {
                                if (!item) return 'AUSENCIA'; // Si no hay registro es ausencia implícita
                                const t = item.record_type;
                                if (t === 'ASISTENCIA') return item.is_late ? 'TARDANZA' : 'PUNTUAL';
                                if (t === 'FALTA JUSTIFICADA' || t === 'AUSENCIA SIN JUSTIFICAR') return 'AUSENCIA';
                                if (t === 'DESCANSO MÉDICO') return 'DESCANSO MÉDICO';
                                if (t === 'LICENCIA CON GOCE') return 'LICENCIA';
                                if (t === 'VACACIONES') return 'VACACIONES';
                                return t || 'AUSENTE';
                            };

                            const getLabel = (item) => {
                                const status = getStatusText(item);
                                const t = item?.record_type;
                                if (status === 'AUSENCIA' || 
                                    ['AUSENCIA', 'INASISTENCIA', 'FALTA JUSTIFICADA', 'AUSENCIA SIN JUSTIFICAR', 'FALTA_INJUSTIFICADA'].includes(t) ||
                                    item?.status === 'absent') {
                                    return 'AUSENTISMO';
                                }
                                return 'ASISTENCIA';
                            };

                            if (record) {
                                // Caso: Registro existente
                                data.push({
                                    'Fecha': record.work_date ? record.work_date.split('-').reverse().join('/') : '-', // DD/MM/YYYY
                                    'DNI': record.employees?.dni || emp.dni,
                                    'Empleado': record.employees?.full_name || emp.full_name,
                                    'Sede': record.employees?.sede || emp.sede,
                                    'Ingreso': formatTime(record.check_in),
                                    'Salida': formatTime(record.check_out),
                                    'Estado': getStatusText(record),
                                    'Tipo': record.record_type,
                                    'AUSENTISMO': getLabel(record),
                                    'Validado': record.is_validated ? 'SÍ' : 'NO'
                                })
                            } else {
                                // Caso: Ausencia implícita (No hay registro)
                                data.push({
                                    'Fecha': dateStr.split('-').reverse().join('/'), // DD/MM/YYYY
                                    'DNI': emp.dni,
                                    'Empleado': emp.full_name,
                                    'Sede': emp.sede,
                                    'Ingreso': '-',
                                    'Salida': '-',
                                    'Estado': 'AUSENCIA',
                                    'Tipo': 'AUSENCIA',
                                    'AUSENTISMO': 'AUSENTISMO',
                                    'Validado': 'NO'
                                })
                            }
                        })
                    })
                    
                    fileName = `Asistencias_${sedeSuffix}_${dateRange.start}_al_${dateRange.end}.xlsx`
                    sheetName = 'Asistencias'
                    break

                case 'terminations':
                    const tStart = `${terminationsRange.start}T00:00:00`
                    const tEnd = `${terminationsRange.end}T23:59:59`
                    
                    // TRAEMOS TODO DE LA SEDE (businessUnit = null) Y FILTRAMOS EN MEMORIA
                    const { data: termData, error: termError } = await getTerminationsReport(
                        tStart,
                        tEnd,
                        apiSede,
                        null // selectedBusinessUnit -> NULL
                    )
                    
                    if (termError || !termData) {
                        throw new Error('No se pudieron cargar los datos de bajas')
                    }
                    
                    // Filtrar por BU y Área en memoria usando helper robusto
                    const filteredTerms = filterInMemory(termData);

                    data = filteredTerms.map(t => ({
                        'DNI': t.dni,
                        'Nombre Completo': t.full_name,
                        'Cargo': t.position,
                        'Área': t.area_name,
                        'Sede': t.sede,
                        'Unidad Negocio': t.business_unit || '-',
                        'Fecha Ingreso': t.entry_date,
                        'Fecha Baja': t.termination_date ? t.termination_date.split('T')[0] : '-',
                        'Motivo': t.termination_reason || '-',
                        'Documento(s)': t.termination_document_url || '-',
                        'Email': t.email,
                        'Celular': t.phone
                    }))
                    
                    fileName = `Reporte_Bajas_${sedeSuffix}_${terminationsRange.start}_al_${terminationsRange.end}.xlsx`
                    sheetName = 'Bajas'
                    break

                case 'hires':
                    const { data: hiresData } = await getNewHiresReport(
                        selectedMonth.year,
                        selectedMonth.month,
                        apiSede
                    )

                    // Filtrar por BU y Área en memoria usando helper robusto
                    const filteredHires = filterInMemory(hiresData);
                    
                    data = filteredHires.map(h => ({
                        'DNI': h.dni,
                        'Nombre Completo': h.full_name,
                        'Cargo': h.position,
                        'Área': h.area_name || '-',
                        'Sede': h.sede,
                        'Unidad Negocio': h.business_unit || '-',
                        'Fecha Ingreso': h.entry_date
                    }))
                    fileName = `Nuevos_Ingresos_${sedeSuffix}_${selectedMonth.month}_${selectedMonth.year}.xlsx`
                    sheetName = 'Ingresos'
                    break

                case 'vacations':
                    const { data: vacData } = await getVacationBalanceReport(
                        apiSede
                    )
                    
                    // Filtrar por BU y Área en memoria usando helper robusto
                    const filteredVac = filterInMemory(vacData);

                    data = filteredVac.map(v => {
                        // Calcular años de servicio automáticamente
                        let yearsService = v.years_service;
                        if (v.entry_date) {
                            const entry = new Date(v.entry_date);
                            const today = new Date();
                            let years = today.getFullYear() - entry.getFullYear();
                            const m = today.getMonth() - entry.getMonth();
                            if (m < 0 || (m === 0 && today.getDate() < entry.getDate())) {
                                years--;
                            }
                            yearsService = Math.max(0, years);
                        }

                        return {
                            'DNI': v.dni,
                            'Empleado': v.full_name,
                            'Cargo': v.position,
                            'Área': v.area_name || '-',
                            'Sede': v.sede,
                            'Unidad Negocio': v.business_unit || '-',
                            'Fecha Ingreso': v.entry_date,
                            'Años Servicio': yearsService,
                            'Días Ganados': Math.trunc(v.earned_days || 0),
                            'Días Gozados': Math.trunc(parseFloat(v.legacy_taken || 0) + parseFloat(v.app_taken || 0)),
                            'Saldo Actual': Math.trunc(v.balance || 0),
                            'Estado': (() => {
                                const s = (v.status || '').toLowerCase();
                                if (s === 'danger') return 'CRÍTICO';
                                if (s === 'warning') return 'ADVERTENCIA';
                                if (s === 'safe' || s === 'success') return 'NORMAL';
                                return (v.status || '-').toUpperCase();
                            })()
                        }
                    })
                    fileName = `Saldos_Vacaciones_${sedeSuffix}_${getPeruDate()}.xlsx`
                    sheetName = 'Vacaciones'
                    break
            }

            if (!data || data.length === 0) {
                showToast('No hay datos para exportar con los filtros seleccionados', 'warning')
                return
            }

            // Generar Excel
            const wb = XLSX.utils.book_new()
            const ws = XLSX.utils.json_to_sheet(data)
            
            // Auto-width columnas (simple)
            const colWidths = Object.keys(data[0]).map(key => ({ wch: Math.max(key.length, 15) }))
            ws['!cols'] = colWidths

            XLSX.utils.book_append_sheet(wb, ws, sheetName)
            XLSX.writeFile(wb, fileName)
            
            showToast('Reporte descargado correctamente', 'success')

        } catch (error) {
            console.error('Export error:', error)
            showToast('Error generando el reporte', 'error')
        } finally {
            setLoading(false)
        }
    }

    return (
        <div className="space-y-6 max-w-7xl mx-auto p-4 sm:p-6 lg:p-8">
            <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
                <div>
                    <h1 className="text-3xl font-bold text-gray-900 flex items-center gap-2">
                        <FileText className="text-blue-600" />
                        Centro de Reportes
                    </h1>
                    <p className="text-gray-600 mt-2">
                        Descarga reportes detallados y consolidados de toda la gestión
                    </p>
                </div>
            </div>

            {/* Selector de Filtros Avanzados */}
            {canViewFilters && (
                <div className="bg-white p-4 rounded-xl shadow-sm border border-gray-200 flex flex-wrap items-center gap-4">
                    <div className="flex items-center gap-2">
                        <Filter className="text-gray-400" />
                        <span className="text-sm font-medium text-gray-700">Filtros:</span>
                    </div>
                    
                    {/* Sede */}
                    <div className="flex flex-col">
                        <label className="text-xs text-gray-500 mb-1">Sede</label>
                        <select
                            value={selectedSede}
                            onChange={(e) => setSelectedSede(e.target.value)}
                            disabled={!canSelectSedeFinal}
                            className={`border-gray-300 rounded-md text-sm focus:ring-blue-500 focus:border-blue-500 min-w-[140px] ${!canSelectSedeFinal ? 'bg-gray-50 text-gray-500 cursor-not-allowed' : ''}`}
                        >
                            <option value="all">Todas las Sedes</option>
                            <option value="ADM.CENTRAL">ADM.CENTRAL</option>
                            <option value="LIMA">Lima</option>
                            <option value="TRUJILLO">Trujillo</option>
                            <option value="CHIMBOTE">Chimbote</option>
                            <option value="HUARAZ">Huaraz</option>
                            <option value="HUACHO">Huacho</option>
                            <option value="CHINCHA">Chincha</option>
                            <option value="ICA">Ica</option>
                            <option value="DESAGUADERO">Desaguadero</option>
                        </select>
                    </div>

                    {/* Business Unit */}
                    <div className="flex flex-col">
                        <label className="text-xs text-gray-500 mb-1">Unidad de Negocio</label>
                        <select
                            value={selectedBusinessUnit}
                            onChange={(e) => setSelectedBusinessUnit(e.target.value)}
                            className="border-gray-300 rounded-md text-sm focus:ring-blue-500 focus:border-blue-500 min-w-[160px]"
                        >
                            <option value="all">Todas</option>
                            {businessUnits.map(bu => (
                                <option key={bu.id} value={bu.name}>{bu.name}</option>
                            ))}
                        </select>
                    </div>

                    {/* Area */}
                    <div className="flex flex-col">
                        <label className="text-xs text-gray-500 mb-1">Área</label>
                        <select
                            value={selectedArea}
                            onChange={(e) => setSelectedArea(e.target.value)}
                            className="border-gray-300 rounded-md text-sm focus:ring-blue-500 focus:border-blue-500 min-w-[200px] max-w-[250px]"
                        >
                            <option value="all">Todas</option>
                            {areas.map(area => (
                                <option key={area.id} value={area.name}>{area.name}</option>
                            ))}
                        </select>
                    </div>

                    {/* Botón Limpiar Filtros */}
                    <button
                        onClick={handleClearFilters}
                        className="flex items-center gap-1 px-3 py-2 text-sm text-gray-600 bg-gray-100 hover:bg-gray-200 rounded-md transition-colors ml-auto md:ml-0"
                        title="Limpiar todos los filtros"
                    >
                        <X size={16} />
                        Limpiar
                    </button>
                </div>
            )}

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-2 gap-6">
                
                {/* CARD 1: MAESTRO DE EMPLEADOS */}
                <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden hover:shadow-md transition-shadow">
                    <div className="p-6 border-b border-gray-100 bg-gray-50/50">
                        <div className="flex items-center gap-3 mb-2">
                            <div className="p-2 bg-blue-100 rounded-lg text-blue-600">
                                <Users size={24} />
                            </div>
                            <h3 className="text-lg font-bold text-gray-900">Maestro de Empleados</h3>
                        </div>
                        <p className="text-sm text-gray-500">
                            Listado completo de personal con datos personales, laborales, bancarios y de contacto.
                        </p>
                    </div>
                    <div className="p-6 space-y-4">
                        <div className="flex items-center justify-between text-sm text-gray-600 bg-blue-50 p-3 rounded-lg">
                            <span>Total registros estimados:</span>
                            <span className="font-bold">Todos</span>
                        </div>
                        <button
                            onClick={() => handleExport('employees')}
                            disabled={loading}
                            className="w-full flex items-center justify-center gap-2 px-4 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors font-medium disabled:opacity-50"
                        >
                            {loading ? 'Generando...' : 'Descargar Excel'}
                            <Download size={18} />
                        </button>
                    </div>
                </div>

                {/* CARD 2: ASISTENCIAS */}
                <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden hover:shadow-md transition-shadow">
                    <div className="p-6 border-b border-gray-100 bg-gray-50/50">
                        <div className="flex items-center gap-3 mb-2">
                            <div className="p-2 bg-green-100 rounded-lg text-green-600">
                                <Clock size={24} />
                            </div>
                            <h3 className="text-lg font-bold text-gray-900">Reporte de Asistencias</h3>
                        </div>
                        <p className="text-sm text-gray-500">
                            Detalle diario de marcas de entrada/salida, tardanzas y validaciones.
                        </p>
                    </div>
                    <div className="p-6 space-y-4">
                        <div className="grid grid-cols-2 gap-4">
                            <div>
                                <label className="block text-xs font-medium text-gray-500 mb-1">Desde</label>
                                <input 
                                    type="date" 
                                    value={dateRange.start}
                                    onChange={(e) => setDateRange(prev => ({...prev, start: e.target.value}))}
                                    className="w-full border-gray-300 rounded-lg text-sm"
                                />
                            </div>
                            <div>
                                <label className="block text-xs font-medium text-gray-500 mb-1">Hasta</label>
                                <input 
                                    type="date" 
                                    value={dateRange.end}
                                    onChange={(e) => setDateRange(prev => ({...prev, end: e.target.value}))}
                                    className="w-full border-gray-300 rounded-lg text-sm"
                                />
                            </div>
                        </div>
                        <button
                            onClick={() => handleExport('attendance')}
                            disabled={loading}
                            className="w-full flex items-center justify-center gap-2 px-4 py-3 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors font-medium disabled:opacity-50"
                        >
                            {loading ? 'Generando...' : 'Descargar Excel'}
                            <Download size={18} />
                        </button>
                    </div>
                </div>

                {/* CARD 3: SALDOS DE VACACIONES */}
                <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden hover:shadow-md transition-shadow">
                    <div className="p-6 border-b border-gray-100 bg-gray-50/50">
                        <div className="flex items-center gap-3 mb-2">
                            <div className="p-2 bg-purple-100 rounded-lg text-purple-600">
                                <Briefcase size={24} />
                            </div>
                            <h3 className="text-lg font-bold text-gray-900">Saldos de Vacaciones</h3>
                        </div>
                        <p className="text-sm text-gray-500">
                            Consolidado de días ganados, gozados y saldos pendientes por empleado.
                        </p>
                    </div>
                    <div className="p-6 space-y-4">
                        <div className="flex items-center justify-between text-sm text-gray-600 bg-purple-50 p-3 rounded-lg">
                            <span>Incluye semáforo de estado:</span>
                            <span className="font-bold text-purple-700">Sí</span>
                        </div>
                        <button
                            onClick={() => handleExport('vacations')}
                            disabled={loading}
                            className="w-full flex items-center justify-center gap-2 px-4 py-3 bg-purple-600 text-white rounded-lg hover:bg-purple-700 transition-colors font-medium disabled:opacity-50"
                        >
                            {loading ? 'Generando...' : 'Descargar Excel'}
                            <Download size={18} />
                        </button>
                    </div>
                </div>

                {/* CARD 4: NUEVOS INGRESOS */}
                <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden hover:shadow-md transition-shadow">
                    <div className="p-6 border-b border-gray-100 bg-gray-50/50">
                        <div className="flex items-center gap-3 mb-2">
                            <div className="p-2 bg-orange-100 rounded-lg text-orange-600">
                                <Users size={24} />
                            </div>
                            <h3 className="text-lg font-bold text-gray-900">Nuevos Ingresos</h3>
                        </div>
                        <p className="text-sm text-gray-500">
                            Listado mensual de personal incorporado a la empresa.
                        </p>
                    </div>
                    <div className="p-6 space-y-4">
                        <div className="grid grid-cols-2 gap-4">
                            <div>
                                <label className="block text-xs font-medium text-gray-500 mb-1">Mes</label>
                                <select 
                                    value={selectedMonth.month}
                                    onChange={(e) => setSelectedMonth(prev => ({...prev, month: e.target.value}))}
                                    className="w-full border-gray-300 rounded-lg text-sm"
                                >
                                    {['Enero','Febrero','Marzo','Abril','Mayo','Junio','Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre'].map((m, i) => (
                                        <option key={i} value={i+1}>{m}</option>
                                    ))}
                                </select>
                            </div>
                            <div>
                                <label className="block text-xs font-medium text-gray-500 mb-1">Año</label>
                                <select 
                                    value={selectedMonth.year}
                                    onChange={(e) => setSelectedMonth(prev => ({...prev, year: e.target.value}))}
                                    className="w-full border-gray-300 rounded-lg text-sm"
                                >
                                    <option value={2024}>2024</option>
                                    <option value={2025}>2025</option>
                                    <option value={2026}>2026</option>
                                </select>
                            </div>
                        </div>
                        <button
                            onClick={() => handleExport('hires')}
                            disabled={loading}
                            className="w-full flex items-center justify-center gap-2 px-4 py-3 bg-orange-600 text-white rounded-lg hover:bg-orange-700 transition-colors font-medium disabled:opacity-50"
                        >
                            {loading ? 'Generando...' : 'Descargar Excel'}
                            <Download size={18} />
                        </button>
                    </div>
                </div>

                {/* CARD 5: BAJAS */}
                <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden hover:shadow-md transition-shadow">
                    <div className="p-6 border-b border-gray-100 bg-gray-50/50">
                        <div className="flex items-center gap-3 mb-2">
                            <div className="p-2 bg-red-100 rounded-lg text-red-600">
                                <UserMinus size={24} />
                            </div>
                            <h3 className="text-lg font-bold text-gray-900">Reporte de Bajas</h3>
                        </div>
                        <p className="text-sm text-gray-500">
                            Listado de personal cesado, incluyendo motivo y fecha de baja.
                        </p>
                    </div>
                    <div className="p-6 space-y-4">
                        <div className="grid grid-cols-2 gap-4">
                            <div>
                                <label className="block text-xs font-medium text-gray-500 mb-1">Desde</label>
                                <input 
                                    type="date" 
                                    value={terminationsRange.start}
                                    onChange={(e) => setTerminationsRange(prev => ({...prev, start: e.target.value}))}
                                    className="w-full border-gray-300 rounded-lg text-sm"
                                />
                            </div>
                            <div>
                                <label className="block text-xs font-medium text-gray-500 mb-1">Hasta</label>
                                <input 
                                    type="date" 
                                    value={terminationsRange.end}
                                    onChange={(e) => setTerminationsRange(prev => ({...prev, end: e.target.value}))}
                                    className="w-full border-gray-300 rounded-lg text-sm"
                                />
                            </div>
                        </div>
                        <button
                            onClick={() => handleExport('terminations')}
                            disabled={loading}
                            className="w-full flex items-center justify-center gap-2 px-4 py-3 bg-red-600 text-white rounded-lg hover:bg-red-700 transition-colors font-medium disabled:opacity-50"
                        >
                            {loading ? 'Generando...' : 'Descargar Excel'}
                            <Download size={18} />
                        </button>
                    </div>
                </div>

            </div>
        </div>
    )
}
