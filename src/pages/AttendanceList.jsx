import { useState, useEffect, useRef } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../context/AuthContext'
import { useToast } from '../context/ToastContext'
import { Calendar, Clock, Filter, Search, CheckCircle, XCircle, AlertCircle, MapPin, X, ChevronLeft, ChevronRight, Download, Upload, FileSpreadsheet } from 'lucide-react'
import * as XLSX from '@e965/xlsx'
import Modal from '../components/ui/Modal'
import { bulkImportAttendance } from '../services/attendance'

// Constante para la clave de persistencia
const ATTENDANCE_FILTERS_KEY = 'attendance_list_filters'

export default function AttendanceList() {
    const { user } = useAuth()
    const { showToast } = useToast()
    const [attendances, setAttendances] = useState([])
    const [loading, setLoading] = useState(true)
    const [exporting, setExporting] = useState(false)
    const [selectedLocation, setSelectedLocation] = useState(null)
    const [reasonModal, setReasonModal] = useState(null)
    const [validationModal, setValidationModal] = useState(null)
    const [validationNotes, setValidationNotes] = useState('')
    const [validating, setValidating] = useState(false)
    
    // Importación Masiva
    const [isImportModalOpen, setIsImportModalOpen] = useState(false)
    const [importFile, setImportFile] = useState(null)
    const [importPreview, setImportPreview] = useState([])
    const [importLoading, setImportLoading] = useState(false)
    const [importResult, setImportResult] = useState(null)
    const fileInputRef = useRef(null)

    // Paginación
    const [currentPage, setCurrentPage] = useState(1)
    const [totalPages, setTotalPages] = useState(1)
    const [totalRecords, setTotalRecords] = useState(0)
    const PAGE_SIZE = 20

    // Helper para obtener fecha local del ORDENADOR en formato YYYY-MM-DD
    const getLocalDate = () => {
        const d = new Date()
        const year = d.getFullYear()
        const month = String(d.getMonth() + 1).padStart(2, '0')
        const day = String(d.getDate()).padStart(2, '0')
        return `${year}-${month}-${day}`
    }

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

    // Cargar filtros guardados
    const loadSavedFilters = () => {
        try {
            const saved = localStorage.getItem(ATTENDANCE_FILTERS_KEY)
            if (saved) {
                const parsed = JSON.parse(saved)
                if (parsed.userId === user?.id) {
                    return parsed.filters
                }
            }
        } catch (error) {
            console.error('Error cargando filtros:', error)
        }
        return null
    }

    // Guardar filtros
    const saveFilters = (filters) => {
        try {
            localStorage.setItem(ATTENDANCE_FILTERS_KEY, JSON.stringify({
                userId: user?.id,
                filters: filters,
                timestamp: Date.now()
            }))
        } catch (error) {
            console.error('Error guardando filtros:', error)
        }
    }

    // Inicializar filtros siempre con fecha actual
    const initializeFilters = () => {
        const savedFilters = loadSavedFilters()
        // Usar la fecha actual, preferiblemente de la zona horaria de Perú si es posible
        // Si no, usar la local del ordenador
        const today = getPeruDate()
        
        // Siempre usar la fecha actual como valor por defecto para las fechas
        // Ignoramos las fechas guardadas para evitar que al día siguiente se muestre el día anterior
        return {
            status: savedFilters?.status || 'all',
            dateFrom: today,
            dateTo: today,
            search: savedFilters?.search || ''
        }
    }

    const [filters, setFilters] = useState(initializeFilters())

    // Forzar actualización de fechas al cargar (si la fecha guardada/inicial difiere de hoy)
    useEffect(() => {
        const today = getPeruDate()
        if (filters.dateFrom !== today && filters.dateFrom === filters.dateTo) {
            // Solo actualizamos si las fechas son iguales (modo diario/default) y difieren de hoy
            // Esto corrige el caso donde la app se quedó abierta desde ayer
            setFilters(prev => ({
                ...prev,
                dateFrom: today,
                dateTo: today
            }))
        }
    }, []) // Solo al montar, para corregir estado inicial obsoleto

    // Guardar filtros cuando cambien
    useEffect(() => {
        if (user?.id) {
            saveFilters(filters)
        }
    }, [filters, user?.id])

    // Verificar permisos de validación (Solo RRHH)
    const canValidate = () => {
        if (!user) return false
        
        // Permisos por Rol (Admin, Jefe RRHH, Super Admin)
        if (user.role === 'ADMIN' || user.role === 'SUPER ADMIN' || user.role === 'JEFE_RRHH') return true
        
        // Permisos por Cargo (Legacy/Fallback)
        if (!user.position) return false
        
        const normalize = (str) => str.normalize("NFD").replace(/[\u0300-\u036f]/g, "").trim().toUpperCase();
        const userPosition = normalize(user.position);
        
        // Excepción: JEFE DE ADMINISTRACIÓN Y FINANZAS NO debe validar (solo lectura)
        if (userPosition.includes('ADMINISTRACION') || userPosition.includes('FINANZAS')) {
            return false;
        }
        
        const allowedPositions = [
            'ANALISTA DE GENTE Y GESTION',
            'JEFE DE AREA DE GENTE Y GESTION',
            'JEFE DE GENTE Y GESTION',
            'JEFE DE GENTE Y GESTIÓN',
            'ADMIN'
        ]
        
        return allowedPositions.some(pos => userPosition.includes(normalize(pos)))
    }

    const hasValidationPermission = canValidate()
    
    const isFirstRender = useRef(true)

    // Helper para aplicar filtros - CORREGIDO
    const applyFilters = (query, currentFilters) => {
        // Aplicar filtros de fecha PRIMERO (antes de los filtros de estado)
        if (currentFilters.dateFrom) {
            query = query.gte('work_date', currentFilters.dateFrom)
        }
        if (currentFilters.dateTo) {
            query = query.lte('work_date', currentFilters.dateTo)
        }
        
        // Luego aplicar filtros de estado
        if (currentFilters.status === 'on_time') {
            query = query.eq('record_type', 'ASISTENCIA').eq('is_late', false)
        } else if (currentFilters.status === 'late') {
            query = query.eq('record_type', 'ASISTENCIA').eq('is_late', true)
        } else if (currentFilters.status === 'absent') {
            // Para ausencias: NO aplicar filtro SQL aquí, lo haremos en memoria después
            // Esto es más confiable que usar operadores OR complejos en Supabase
            // El filtrado real se hará en la sección "Filtrado de seguridad"
        } else if (currentFilters.status === 'medical') {
            query = query.eq('record_type', 'DESCANSO MÉDICO')
        } else if (currentFilters.status === 'license') {
            query = query.eq('record_type', 'LICENCIA CON GOCE')
        } else if (currentFilters.status === 'vacation') {
            query = query.eq('record_type', 'VACACIONES')
        }
        
        return query
    }

    useEffect(() => {
        if (currentPage === 1) {
            loadAttendances(1)
        } else {
            setCurrentPage(1)
        }
    }, [filters])

    useEffect(() => {
        if (isFirstRender.current) {
            isFirstRender.current = false
            return
        }
        loadAttendances(currentPage)
    }, [currentPage])

    useEffect(() => {
        const subscription = supabase
            .channel('attendance_list_updates')
            .on(
                'postgres_changes',
                { event: '*', schema: 'public', table: 'attendance' },
                () => {
                    loadAttendances(currentPage)
                }
            )
            .subscribe()

        return () => {
            subscription.unsubscribe()
        }
    }, [currentPage, filters])

    async function loadAttendances(page = 1) {
        try {
            setLoading(true)
            
            const offset = (page - 1) * PAGE_SIZE
            const normalize = (str) => str ? str.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toUpperCase() : "";
            const userRole = normalize(user?.role);
            const userPosition = normalize(user?.position);

            const isGlobalAdmin = (
                userRole === 'ADMIN' ||
                userRole === 'SUPER ADMIN' ||
                userRole === 'JEFE_RRHH' ||
                userPosition.includes('JEFE DE GENTE') ||
                userPosition.includes('GERENTE GENERAL') ||
                // ANALISTA DE GENTE: solo admin global si es de ADM. CENTRAL + ADMINISTRACIÓN
                (userPosition.includes('ANALISTA DE GENTE') &&
                    normalize(user?.sede || '').includes('ADM') && normalize(user?.sede || '').includes('CENTRAL') &&
                    normalize(user?.business_unit || '').includes('ADMINISTRACI')) ||
                (user?.permissions && user?.permissions['*'])
            );
            
            const isBoss = userRole.includes('JEFE') || 
                           userRole.includes('GERENTE') || 
                           userPosition.includes('JEFE') || 
                           userPosition.includes('GERENTE') ||
                           userPosition.includes('COORDINADOR') ||
                           userPosition.includes('SUPERVISOR');

            // ANALISTA DE GENTE Y GESTIÓN: filtra por sede + unidad de negocio (no por área)
            const isAnalistaGente = userPosition.includes('ANALISTA DE GENTE');

            // Para web: JEFE/SUPERVISOR/COORDINADOR confían en el SQL (auth.email() activo).
            // El SQL get_daily_attendance_report ya aplica seguridad por area_id+sede para estos roles.
            // allowedIds solo se usa para roles que no son boss, no son admin y no son analista de gente.
            let allowedIds = null;
            if (!isGlobalAdmin && !isAnalistaGente && !isBoss) {
                 const { data: allowedEmployees } = await supabase.rpc('get_employees_by_user_area')
                 if (allowedEmployees) {
                     allowedIds = new Set(allowedEmployees.map(e => e.id))
                 } else {
                     allowedIds = new Set() // Sin acceso
                 }
            }

            // Forzar sede/unidad en el RPC para roles que no son boss ni admin
            // Boss (JEFE/SUPERVISOR/COORDINADOR): pasa sede+unidad null → SQL maneja seguridad
            // ANALISTA DE GENTE no-admin: fuerza su sede y unidad
            const shouldFilterBySede = !isGlobalAdmin && (!isBoss || isAnalistaGente) && user?.sede;
            const shouldFilterByUnit = !isGlobalAdmin && (!isBoss || isAnalistaGente) && user?.business_unit;

            // Detectar si estamos viendo un solo día (modo reporte diario / Roster)
            // IMPORTANTE: Solo usar modo Roster si el filtro de estado es general
            // Los estados específicos (medical, license, vacation) deben usar el modo histórico
            let isSingleDate = filters.dateFrom && filters.dateTo && (filters.dateFrom === filters.dateTo)
            let useRosterMode = isSingleDate && ['all', 'on_time', 'late', 'absent'].includes(filters.status)
            
            let reportData = []
            let totalRows = 0

            // MODO REPORTE DIARIO (Roster) - Solo para estados generales
            if (useRosterMode) {
                
                let rpcSede = null
                let rpcBusinessUnit = null
                
                // Si no es admin y no es jefe, optimizar restringiendo por Sede en RPC
                // Si es Jefe, dejamos Sede abierta (null) y filtramos en memoria por Área
                if (shouldFilterBySede) {
                    rpcSede = user.sede
                }
                if (shouldFilterByUnit) {
                    rpcBusinessUnit = user.business_unit
                }

                const { data: rpcData, error: rpcError } = await supabase.rpc('get_daily_attendance_report', {
                    p_date: filters.dateFrom,
                    p_sede: rpcSede,
                    p_business_unit: rpcBusinessUnit,
                    p_search: filters.search || null,
                    // Para 'absent' pasamos null y filtramos en memoria (más confiable)
                    p_status: (filters.status === 'all' || filters.status === 'absent') ? null : filters.status,
                    // CORRECCIÓN: Si estamos filtrando por Área (allowedIds) o status='absent',
                    // debemos traer MÁS registros para poder filtrar y paginar correctamente en cliente.
                    p_page: 1,  
                    p_limit: 1000 // Siempre traer bloque grande para permitir filtrado en cliente
                })

                if (rpcError) throw rpcError

                if (rpcData && rpcData.data) {
                    reportData = rpcData.data
                    // Si el RPC devuelve el total real de la query, usamos ese como base, 
                    // pero si vamos a filtrar, lo recalcularemos.
                    totalRows = rpcData.total || 0
                }

                // Obtener vacaciones activas para la fecha
                const { data: vacations } = await supabase
                    .from('vacation_requests')
                    .select('employee_id')
                    .eq('status', 'APROBADO')
                    .lte('start_date', filters.dateFrom)
                    .gte('end_date', filters.dateFrom)

                const vacationEmployeeIds = new Set(vacations?.map(v => v.employee_id) || [])

                let processedList = reportData.map(item => {
                    // Verificar si tiene vacaciones
                    const isOnVacation = vacationEmployeeIds.has(item.employee_id)
                    // Si tiene vacación y no ha marcado asistencia (o tiene falta injustificada automática), forzamos visualización de Vacaciones
                    const shouldShowVacation = isOnVacation && (!item.check_in || ['INASISTENCIA', 'FALTA_INJUSTIFICADA', 'AUSENCIA'].includes(item.record_type))

                    return {
                        id: item.attendance_id || `virtual-${item.employee_id}`,
                        employee_id: item.employee_id, // Guardamos ID crudo para referencias
                        work_date: filters.dateFrom,
                        check_in: item.check_in,
                        check_out: item.check_out,
                        is_late: item.is_late || false,
                        record_type: shouldShowVacation ? 'VACACIONES' : (item.record_type || (item.computed_status === 'absent' ? null : item.record_type)),
                        status: shouldShowVacation ? 'vacation' : item.computed_status,
                        validated: item.validated,
                        absence_reason: shouldShowVacation ? 'VACACIONES' : item.absence_reason,
                        location_in: item.location_in,
                        employees: {
                            full_name: item.full_name,
                            dni: item.dni,
                            position: item.position,
                            sede: item.sede,
                            business_unit: item.business_unit,
                            profile_picture_url: item.profile_picture_url
                        }
                    }
                })

                // Filtrado adicional en memoria para estado "absent" (medida de seguridad)
                if (filters.status === 'absent') {
                    processedList = processedList.filter(item => {
                        const isAbsenceType = ['AUSENCIA', 'INASISTENCIA', 'FALTA JUSTIFICADA', 'AUSENCIA SIN JUSTIFICAR', 'FALTA_INJUSTIFICADA'].includes(item.record_type)
                        const isImplicitAbsence = !item.check_in && !['DESCANSO MÉDICO', 'LICENCIA CON GOCE', 'VACACIONES', 'ASISTENCIA'].includes(item.record_type)
                        const isComputedAbsent = item.status === 'absent'
                        return isAbsenceType || isImplicitAbsence || isComputedAbsent
                    })
                    // No cortamos aquí, cortamos al final junto con el resto
                }

                setAttendances(processedList)
                
                // Filtrar por empleados permitidos si no es admin
                if (allowedIds) {
                    processedList = processedList.filter(item => allowedIds.has(item.employee_id))
                }
                
                // Paginación en memoria para Roster Mode
                totalRows = processedList.length
                
                // Guardar lista completa para estadísticas antes de paginar
                const fullListForStats = [...processedList]

                const start = (page - 1) * PAGE_SIZE
                processedList = processedList.slice(start, start + PAGE_SIZE)
                
                setAttendances(processedList)
                setTotalRecords(totalRows)
                setTotalPages(Math.ceil(totalRows / PAGE_SIZE))
                
                // Obtener estadísticas globales para el día seleccionado
                if (page === 1) {
                    // Siempre calcular stats desde la lista completa ya filtrada por seguridad.
                    // El RPC anterior devolvía totales globales (490) cuando rpcSede/Unit eran null,
                    // lo que causaba inconsistencia con la tabla (321 para JEFE DE ÁREA, etc.)
                    if (!isGlobalAdmin || (allowedIds && allowedIds.size > 0)) {
                        const total = fullListForStats.length
                        const onTime = fullListForStats.filter(i => i.record_type === 'ASISTENCIA' && !i.is_late).length
                        const late = fullListForStats.filter(i => i.record_type === 'ASISTENCIA' && i.is_late).length
                        const absent = fullListForStats.filter(i => {
                            const isAbsenceType = ['AUSENCIA', 'INASISTENCIA', 'FALTA JUSTIFICADA', 'AUSENCIA SIN JUSTIFICAR', 'FALTA_INJUSTIFICADA'].includes(i.record_type)
                            const isImplicitAbsence = !i.check_in && !['DESCANSO MÉDICO', 'LICENCIA CON GOCE', 'VACACIONES', 'ASISTENCIA'].includes(i.record_type)
                            const isComputedAbsent = i.status === 'absent'
                            return isAbsenceType || isImplicitAbsence || isComputedAbsent
                        }).length
                        setGlobalStats({ total, onTime, late, absent })
                    } else {
                        // Solo para admin global sin filtros: RPC es más eficiente
                        try {
                            const { data: statsData, error: statsError } = await supabase.rpc('get_daily_attendance_stats', {
                                p_date: filters.dateFrom,
                                p_sede: rpcSede,
                                p_business_unit: rpcBusinessUnit,
                                p_search: filters.search || null
                            })
                            if (!statsError && statsData) {
                                setGlobalStats({
                                    total: statsData.total,
                                    onTime: statsData.onTime,
                                    late: statsData.late,
                                    absent: statsData.absent
                                })
                            }
                        } catch (err) {
                            console.error('Stats fetch error:', err)
                        }
                    }
                }

                setLoading(false)
                return
            }

            // MODO HISTÓRICO (Rango de Fechas o Estados Específicos)
            // Se usa cuando:
            // - dateFrom != dateTo (rango de fechas)
            // - Estado específico: medical, license, vacation (incluso si dateFrom == dateTo)
            
            // CASO ESPECIAL: FILTRO DE VACACIONES
            // Como no se crean registros diarios en 'attendance' para vacaciones, consultamos 'vacation_requests'
            if (filters.status === 'vacation') {
                 const { data: vacationRequests, error: vacError } = await supabase
                    .from('vacation_requests')
                    .select(`
                        *,
                        employees!vacation_requests_employee_id_fkey (
                            full_name, dni, position, sede, business_unit, profile_picture_url
                        )
                    `)
                    .eq('status', 'APROBADO')
                    // Solapamiento de fechas: (start <= filtro_end) AND (end >= filtro_start)
                    .lte('start_date', filters.dateTo)
                    .gte('end_date', filters.dateFrom)
                
                 if (vacError) throw vacError

                 // Expandir rangos a días individuales
                 let expandedVacations = []
                 const fromDate = new Date(filters.dateFrom)
                 const toDate = new Date(filters.dateTo)
                 // Ajuste zona horaria simple (asumiendo fechas YYYY-MM-DD sin hora)
                 fromDate.setHours(0,0,0,0)
                 toDate.setHours(0,0,0,0)

                 vacationRequests.forEach(req => {
                     // Parsear fechas de solicitud (asegurando que se traten como locales o UTC consistente)
                     // req.start_date viene como YYYY-MM-DD string
                     const [sY, sM, sD] = req.start_date.split('-').map(Number)
                     const [eY, eM, eD] = req.end_date.split('-').map(Number)
                     
                     let current = new Date(sY, sM - 1, sD)
                     const end = new Date(eY, eM - 1, eD)
                     
                     // Ajustar inicio al rango del filtro si la vacación empezó antes
                     if (current < fromDate) current = new Date(fromDate)
                     
                     // Iterar día por día
                     while (current <= end && current <= toDate) {
                         const dateStr = `${current.getFullYear()}-${String(current.getMonth() + 1).padStart(2, '0')}-${String(current.getDate()).padStart(2, '0')}`
                         
                         expandedVacations.push({
                             id: `vac-${req.id}-${dateStr}`,
                             work_date: dateStr,
                             check_in: null,
                             check_out: null,
                             is_late: false,
                             record_type: 'VACACIONES',
                             status: 'vacation',
                             validated: true,
                             notes: req.notes,
                             absence_reason: 'VACACIONES',
                             evidence_url: null,
                             location_in: null,
                             validated_by: null,
                             employees: req.employees
                         })
                         current.setDate(current.getDate() + 1)
                     }
                 })

                 // Ordenar por fecha descendente
                 expandedVacations.sort((a, b) => b.work_date.localeCompare(a.work_date))
                 reportData = expandedVacations

            } else {
                // MODO HISTÓRICO NORMAL (Consulta a attendance)
                
                // Si no es admin global, filtramos por sede/unidad usando inner join
                const employeeJoinType = isGlobalAdmin ? 'employees!attendance_employee_id_fkey' : 'employees!attendance_employee_id_fkey!inner';
                
                let query = supabase
                    .from('attendance')
                    .select(`
                        *,
                        ${employeeJoinType} (
                            full_name,
                            dni,
                            position,
                            sede,
                            business_unit,
                            profile_picture_url
                        )
                    `, { count: 'exact' })

                if (!isGlobalAdmin) {
                     // MODO SEGURO: Usar allowedIds (Área)
                     if (allowedIds && allowedIds.size > 0) {
                          // Usar .in() para filtrar en la base de datos
                          query = query.in('employee_id', Array.from(allowedIds))
                     } else if (shouldFilterBySede || shouldFilterByUnit) {
                          // Fallback a filtro por Sede/Unidad
                          if (shouldFilterBySede) {
                              query = query.eq('employees.sede', user.sede)
                          }
                          if (shouldFilterByUnit) {
                              query = query.eq('employees.business_unit', user.business_unit)
                          }
                     } else if (isBoss) {
                          // Si es Jefe y allowedIds está vacío, significa que el RPC falló o no tiene gente.
                          // NO aplicar filtro de sede fallback, porque entonces vería ADM CENTRAL.
                          // Mejor mostrar vacío para evitar fuga de datos.
                          query = query.eq('id', '00000000-0000-0000-0000-000000000000') // ID imposible
                     } else if (user?.sede) {
                         // Fallback antiguo si no es Jefe (Analista, etc.)
                         query = query.eq('employees.sede', user.sede)
                     }
                 }

                // 1. Aplicar filtros de FECHA (usando variables locales con defaults)
                query = query.gte('work_date', filters.dateFrom)
                             .lte('work_date', filters.dateTo)

                // 2. Aplicar filtros de ESTADO manualmente (para asegurar orden correcto)
                if (filters.status === 'on_time') {
                    query = query.eq('record_type', 'ASISTENCIA').eq('is_late', false)
                } else if (filters.status === 'late') {
                    query = query.eq('record_type', 'ASISTENCIA').eq('is_late', true)
                } else if (filters.status === 'medical') {
                    query = query.eq('record_type', 'DESCANSO MÉDICO')
                } else if (filters.status === 'license') {
                    query = query.eq('record_type', 'LICENCIA CON GOCE')
                } else if (filters.status === 'vacation') {
                    query = query.eq('record_type', 'VACACIONES')
                }

                // 3. Ordenar AL FINAL (después de los filtros)
                query = query
                    .order('work_date', { ascending: false })
                    .order('check_in', { ascending: true })

                // Aplicar restricciones de paginación/límite
                if (isGlobalAdmin) {
                    if (filters.status !== 'all' && filters.status !== 'absent' && filters.status !== 'on_time' && filters.status !== 'late') {
                        query = query.limit(1000)
                    } else {
                        query = query.range(offset, offset + PAGE_SIZE - 1)
                    }
                } else {
                    query = query.limit(1000)
                }

                const { data, error, count: queryCount } = await query
                if (error) throw error
                
                reportData = data || []
                totalRows = queryCount || 0
            }
            
            let processedList = reportData.map(item => ({
                id: item.id,
                work_date: item.work_date,
                check_in: item.check_in,
                check_out: item.check_out,
                is_late: item.is_late,
                record_type: item.record_type,
                status: item.status || (item.check_in ? 'present' : 'absent'),
                validated: item.validated,
                notes: item.notes,
                absence_reason: item.absence_reason,
                evidence_url: item.evidence_url,
                location_in: item.location_in,
                validated_by: item.validated_by,
                employees: item.employees || {}
            }))

            // Filtrado de seguridad (igual que loadAttendances)
            // Ya filtramos por ID en la consulta SQL (modo histórico) o en memoria (roster).
            // Quitamos los filtros manuales redundantes para evitar conflictos
            /*
            if (!isGlobalAdmin) {
                if (user?.sede && !isBoss) {
                    processedList = processedList.filter(item => item.employees.sede === user.sede)
                }
            }
            */

            // Filtrado por búsqueda en memoria
            if (filters.search && filters.search.length > 0) {
                const searchLower = filters.search.toLowerCase()
                processedList = processedList.filter(item => 
                    item.employees?.full_name?.toLowerCase().includes(searchLower) ||
                    item.employees?.dni?.toLowerCase().includes(searchLower)
                )
            }

            // Filtrado por estado "absent" en memoria (más confiable que SQL complejo)
            if (filters.status === 'absent') {
                processedList = processedList.filter(item => {
                    // Es ausencia si:
                    const isAbsenceType = ['AUSENCIA', 'INASISTENCIA', 'FALTA JUSTIFICADA', 'AUSENCIA SIN JUSTIFICAR', 'FALTA_INJUSTIFICADA'].includes(item.record_type)
                    const isImplicitAbsence = !item.check_in && !['DESCANSO MÉDICO', 'LICENCIA CON GOCE', 'VACACIONES', 'ASISTENCIA'].includes(item.record_type)
                    return isAbsenceType || isImplicitAbsence
                })
            }

            let displayList = processedList
            
            // CORRECCIÓN PAGINACIÓN: Si hay filtrado en cliente, totalRows debe ser el length de la lista filtrada
            // El RPC devuelve total de la query, pero si filtramos en memoria, la paginación se rompe.
            // Si usamos allowedIds, SIEMPRE filtramos en SQL (query.in), así que el count es correcto.
            // PERO si filtramos por "search" o "status=absent" en memoria, debemos ajustar.
            
            const hasClientSideFiltering = 
                (filters.search && filters.search.length > 0) || 
                (filters.status === 'absent') ||
                useRosterMode ||
                filters.status === 'vacation';

            if (hasClientSideFiltering) {
                 totalRows = processedList.length
                 const start = (page - 1) * PAGE_SIZE
                 displayList = processedList.slice(start, start + PAGE_SIZE)
            } else {
                // Modo histórico normal (sin filtrado extra en memoria)
                // Aquí confiamos en el count de la query y el range
                if (isGlobalAdmin && (filters.status === 'all' || filters.status === 'absent')) {
                     // Admin paginó en SQL
                     displayList = processedList
                } else {
                     // Otros casos pueden requerir slice si la query trajo todo (limit 1000)
                     if (processedList.length > PAGE_SIZE) {
                         const start = (page - 1) * PAGE_SIZE
                         displayList = processedList.slice(start, start + PAGE_SIZE)
                     }
                }
            }

            setAttendances(displayList)
            setTotalRecords(totalRows)
            setTotalPages(Math.ceil(totalRows / PAGE_SIZE) || 1)

            // Calcular estadísticas simples para modo histórico
            const total = processedList.length
            const onTime = processedList.filter(i => i.record_type === 'ASISTENCIA' && !i.is_late).length
            const late = processedList.filter(i => i.record_type === 'ASISTENCIA' && i.is_late).length
            // Para ausencias: incluir registros sin check_in (excluyendo tipos específicos) O con record_type de ausencia
            const absent = processedList.filter(i => {
                const isAbsenceType = ['AUSENCIA', 'INASISTENCIA', 'FALTA JUSTIFICADA', 'AUSENCIA SIN JUSTIFICAR', 'FALTA_INJUSTIFICADA'].includes(i.record_type)
                const isImplicitAbsence = !i.check_in && !['DESCANSO MÉDICO', 'LICENCIA CON GOCE', 'VACACIONES', 'ASISTENCIA'].includes(i.record_type)
                // Si el status ya es 'absent' (calculado por RPC o frontend), contarlo
                const isComputedAbsent = i.status === 'absent'
                return isAbsenceType || isImplicitAbsence || isComputedAbsent
            }).length
            
            // CORRECCIÓN: Si estamos en modo Roster (Reporte Diario) y el RPC devolvió estadísticas, usarlas.
            // PERO si hemos filtrado por Área (allowedIds), debemos recalcular en base a processedList
            // para que las tarjetas (KPIs) coincidan con la tabla.
            
            // Si hay filtrado en cliente, SIEMPRE usar las stats calculadas localmente sobre processedList
            if (hasClientSideFiltering || (allowedIds && allowedIds.size > 0)) {
                 setGlobalStats({ total, onTime, late, absent })
            } else if (useRosterMode) {
                 // Si es Roster sin filtros extra, intentamos mantener las stats del RPC (si existen) o usamos las locales
                 // Como ya calculamos las locales arriba, podemos usarlas si preferimos consistencia absoluta.
                 setGlobalStats({ total, onTime, late, absent })
            } else {
                 setGlobalStats({ total, onTime, late, absent })
            }

        } catch (error) {
            console.error('Error cargando asistencias:', error)
            showToast('Error cargando asistencias: ' + error.message, 'error')
        } finally {
            setLoading(false)
        }
    }

    const [globalStats, setGlobalStats] = useState({
        total: 0,
        onTime: 0,
        late: 0,
        absent: 0
    })

    const exportToExcel = async () => {
        try {
            setExporting(true)
            
            let startDate = filters.dateFrom
            let endDate = filters.dateTo

            if (!startDate) startDate = getPeruDate()
            if (!endDate) endDate = getPeruDate()

            // Asegurarnos de que startDate sea una cadena simple YYYY-MM-DD para evitar problemas con XLSX
            // Si startDate es un objeto Date o tiene hora, lo limpiamos
            if (startDate instanceof Date) startDate = startDate.toISOString().split('T')[0];
            if (endDate instanceof Date) endDate = endDate.toISOString().split('T')[0];
            if (startDate.includes('T')) startDate = startDate.split('T')[0];
            if (endDate.includes('T')) endDate = endDate.split('T')[0];

            // 1. Determinar el modo de operación (Roster vs Histórico)

            const isGlobalAdmin = (
                user?.role === 'ADMIN' ||
                user?.role === 'SUPER ADMIN' ||
                user?.role === 'JEFE_RRHH' ||
                user?.position?.includes('JEFE DE GENTE') ||
                user?.position?.includes('GERENTE GENERAL') ||
                user?.position?.includes('ANALISTA DE GENTE') ||
                (user?.permissions && user?.permissions['*'])
            );

            const normalize = (str) => str ? str.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toUpperCase() : "";
            const userRole = normalize(user?.role);
            const userPosition = normalize(user?.position);
            
            const isBoss = userRole.includes('JEFE') || 
                           userRole.includes('GERENTE') || 
                           userPosition.includes('JEFE') || 
                           userPosition.includes('GERENTE') ||
                           userPosition.includes('COORDINADOR') ||
                           userPosition.includes('SUPERVISOR');

            let isSingleDate = startDate && endDate && (startDate === endDate)
            // Solo usar modo Roster si el filtro de estado es general (all, on_time, late, absent)
            let useRosterMode = isSingleDate && ['all', 'on_time', 'late', 'absent'].includes(filters.status)

            let exportData = []

            if (useRosterMode) {
                // MODO REPORTE DIARIO (Roster) - Trae a todos los empleados
                let rpcSede = null
                let rpcBusinessUnit = null
                
                if (!isGlobalAdmin) {
                    if (user?.sede && !isBoss) rpcSede = user.sede
                    if (user?.business_unit) rpcBusinessUnit = user.business_unit
                }

                const { data: rpcData, error: rpcError } = await supabase.rpc('get_daily_attendance_report', {
                    p_date: startDate,
                    p_sede: rpcSede,
                    p_business_unit: rpcBusinessUnit,
                    p_search: filters.search || null,
                    p_status: (filters.status === 'all' || filters.status === 'absent') ? null : filters.status,
                    p_page: 1,
                    p_limit: 10000 // Límite alto para exportar todo
                })

                if (rpcError) throw rpcError

                if (rpcData && rpcData.data) {
                    // Obtener vacaciones activas para la fecha (Igual que en loadAttendances)
                    const { data: vacations } = await supabase
                        .from('vacation_requests')
                        .select('employee_id')
                        .eq('status', 'APROBADO')
                        .lte('start_date', startDate)
                        .gte('end_date', startDate)

                    const vacationEmployeeIds = new Set(vacations?.map(v => v.employee_id) || [])

                    // Asegurar que la fecha usada en el reporte sea exactamente la solicitada
                    const reportDate = String(startDate); 

                    exportData = rpcData.data.map(item => {
                        // Lógica de vacaciones
                        const isOnVacation = vacationEmployeeIds.has(item.employee_id)
                        const shouldShowVacation = isOnVacation && (!item.check_in || ['INASISTENCIA', 'FALTA_INJUSTIFICADA', 'AUSENCIA'].includes(item.record_type))

                        return {
                            work_date: reportDate, // Usar variable local inmutable para la fecha
                            employees: {
                                full_name: item.full_name,
                                dni: item.dni,
                                position: item.position,
                                sede: item.sede,
                                business_unit: item.business_unit
                            },
                            check_in: item.check_in,
                            check_out: item.check_out,
                            is_late: item.is_late || false,
                            record_type: shouldShowVacation ? 'VACACIONES' : (item.record_type || (item.computed_status === 'absent' ? null : item.record_type)),
                            status: shouldShowVacation ? 'vacation' : item.computed_status,
                            validated: item.validated,
                            absence_reason: shouldShowVacation ? 'VACACIONES' : item.absence_reason,
                            notes: item.absence_reason // Usar absence_reason como notas/motivo si no hay notas
                        }
                    })
                }

                // Filtrado adicional en memoria para estado "absent" (igual que en loadAttendances)
                if (filters.status === 'absent') {
                    exportData = exportData.filter(item => {
                        const isAbsenceType = ['AUSENCIA', 'INASISTENCIA', 'FALTA JUSTIFICADA', 'AUSENCIA SIN JUSTIFICAR', 'FALTA_INJUSTIFICADA'].includes(item.record_type)
                        const isImplicitAbsence = !item.check_in && !['DESCANSO MÉDICO', 'LICENCIA CON GOCE', 'VACACIONES', 'ASISTENCIA'].includes(item.record_type)
                        const isComputedAbsent = item.status === 'absent'
                        return isAbsenceType || isImplicitAbsence || isComputedAbsent
                    })
                }

            } else if (filters.status === 'vacation') {
                // MODO HISTÓRICO - VACACIONES (Consulta a vacation_requests)
                const { data: vacationRequests, error: vacError } = await supabase
                    .from('vacation_requests')
                    .select(`
                        *,
                        employees!vacation_requests_employee_id_fkey (
                            full_name, dni, position, sede, business_unit, profile_picture_url
                        )
                    `)
                    .eq('status', 'APROBADO')
                    .lte('start_date', endDate)
                    .gte('end_date', startDate)
                
                 if (vacError) throw vacError

                 // Expandir rangos a días individuales
                 let expandedVacations = []
                 const fromDate = new Date(startDate)
                 const toDate = new Date(endDate)
                 fromDate.setHours(0,0,0,0)
                 toDate.setHours(0,0,0,0)

                 vacationRequests.forEach(req => {
                     const [sY, sM, sD] = req.start_date.split('-').map(Number)
                     const [eY, eM, eD] = req.end_date.split('-').map(Number)
                     
                     let current = new Date(sY, sM - 1, sD)
                     const end = new Date(eY, eM - 1, eD)
                     
                     if (current < fromDate) current = new Date(fromDate)
                     
                     while (current <= end && current <= toDate) {
                         const dateStr = `${current.getFullYear()}-${String(current.getMonth() + 1).padStart(2, '0')}-${String(current.getDate()).padStart(2, '0')}`
                         
                         expandedVacations.push({
                             work_date: dateStr,
                             employees: req.employees,
                             check_in: null,
                             check_out: null,
                             is_late: false,
                             record_type: 'VACACIONES',
                             status: 'vacation',
                             validated: true,
                             notes: req.notes,
                             absence_reason: 'VACACIONES'
                         })
                         current.setDate(current.getDate() + 1)
                     }
                 })

                 expandedVacations.sort((a, b) => b.work_date.localeCompare(a.work_date))
                 exportData = expandedVacations

            } else {
                // MODO HISTÓRICO - Solo registros existentes
                
                // ESTRATEGIA ROBUSTA ANT-ZONA HORARIA:
                // Ampliamos el rango de búsqueda SQL (-1 día al inicio, +1 día al final)
                // para asegurar que traemos los registros incluso si hay desfase de zona horaria.
                // Luego filtramos en memoria (JavaScript) por la fecha exacta (string match).
                
                const qStart = new Date(startDate);
                qStart.setDate(qStart.getDate() - 1);
                const queryStartStr = qStart.toISOString().split('T')[0];
                
                const qEnd = new Date(endDate);
                qEnd.setDate(qEnd.getDate() + 1);
                const queryEndStr = qEnd.toISOString().split('T')[0];

                // Si no es admin global, filtramos por sede/unidad usando inner join
                const employeeJoinType = isGlobalAdmin ? 'employees!attendance_employee_id_fkey' : 'employees!attendance_employee_id_fkey!inner';

                let query = supabase
                    .from('attendance')
                    .select(`
                        *,
                        ${employeeJoinType} (
                            full_name,
                            dni,
                            position,
                            sede,
                            business_unit
                        )
                    `)

                if (!isGlobalAdmin) {
                    if (shouldFilterBySede) {
                        query = query.eq('employees.sede', user.sede)
                    }
                    if (shouldFilterByUnit) {
                        query = query.eq('employees.business_unit', user.business_unit)
                    }
                }
                
                // Usamos el rango ampliado
                query = query
                    .gte('work_date', queryStartStr)
                    .lte('work_date', queryEndStr)
                    .order('work_date', { ascending: false })

                // Aplicar filtros básicos de estado
                if (filters.status === 'on_time') {
                    query = query.eq('record_type', 'ASISTENCIA').eq('is_late', false)
                } else if (filters.status === 'late') {
                    query = query.eq('record_type', 'ASISTENCIA').eq('is_late', true)
                } else if (filters.status === 'medical') {
                    query = query.eq('record_type', 'DESCANSO MÉDICO')
                } else if (filters.status === 'license') {
                    query = query.eq('record_type', 'LICENCIA CON GOCE')
                } else if (filters.status === 'vacation') {
                    query = query.eq('record_type', 'VACACIONES')
                }

                const { data, error } = await query
                if (error) throw error
                
                // FILTRADO EXACTO EN MEMORIA
                // Comparamos strings "YYYY-MM-DD" lexicográficamente. Esto no falla con zonas horarias.
                exportData = (data || []).filter(item => {
                    return item.work_date >= startDate && item.work_date <= endDate;
                });

                // Filtrado de seguridad (igual que loadAttendances)
                if (!isGlobalAdmin) {
                    if (shouldFilterBySede) {
                        exportData = exportData.filter(item => item.employees.sede === user.sede)
                    }
                    if (shouldFilterByUnit) {
                        exportData = exportData.filter(item => item.employees.business_unit === user.business_unit)
                    }
                }

                // Filtrado por búsqueda
                if (filters.search) {
                    const searchLower = filters.search.toLowerCase()
                    exportData = exportData.filter(item => 
                        item.employees?.full_name?.toLowerCase().includes(searchLower) || 
                        item.employees?.dni?.toLowerCase().includes(searchLower)
                    )
                }

                // Filtrado 'absent' en histórico
                if (filters.status === 'absent') {
                    exportData = exportData.filter(item => {
                        const isAbsenceType = ['AUSENCIA', 'INASISTENCIA', 'FALTA JUSTIFICADA', 'AUSENCIA SIN JUSTIFICAR', 'FALTA_INJUSTIFICADA'].includes(item.record_type)
                        const isImplicitAbsence = !item.check_in && !['DESCANSO MÉDICO', 'LICENCIA CON GOCE', 'VACACIONES', 'ASISTENCIA'].includes(item.record_type)
                        return isAbsenceType || isImplicitAbsence
                    })
                }
            }

            const formattedData = exportData.map(item => {
                const getStatusText = (i) => {
                    const t = i.record_type;
                    if (i.status === 'FALTA_INJUSTIFICADA') return 'AUSENCIA';
                    if (t === 'ASISTENCIA') return i.is_late ? 'TARDANZA' : 'PUNTUAL';
                    if (t === 'FALTA JUSTIFICADA' || t === 'AUSENCIA SIN JUSTIFICAR' || t === 'AUSENCIA' || t === 'FALTA_INJUSTIFICADA') return 'AUSENCIA';
                    if (t === 'DESCANSO MÉDICO') return 'DESCANSO MÉDICO';
                    if (t === 'LICENCIA CON GOCE') return 'LICENCIA';
                    if (t === 'VACACIONES') return 'VACACIONES';
                    return t || 'AUSENTE';
                };

                const getTypeText = (i) => {
                    const t = i.record_type;
                    if (t === 'ASISTENCIA') return 'Asistencia';
                    if (t === 'FALTA JUSTIFICADA') return 'Justificada';
                    if (t === 'AUSENCIA SIN JUSTIFICAR' || t === 'AUSENCIA' || t === 'FALTA_INJUSTIFICADA') return 'Injustificada';
                    if (t === 'DESCANSO MÉDICO') return 'General';
                    if (t === 'LICENCIA CON GOCE') return 'Con Goce';
                    if (t === 'VACACIONES') return 'Vacaciones';
                    return t || '-';
                };

                const getLabel = (i) => {
                    const t = i.record_type;
                    const status = getStatusText(i);
                    // Si el estado es AUSENCIA o el tipo es alguna variante de ausencia -> AUSENTISMO
                    if (status === 'AUSENCIA' || 
                        ['AUSENCIA', 'INASISTENCIA', 'FALTA JUSTIFICADA', 'AUSENCIA SIN JUSTIFICAR', 'FALTA_INJUSTIFICADA'].includes(t) ||
                        i.status === 'absent') {
                        return 'AUSENTISMO';
                    }
                    // Cualquier otro caso (ASISTENCIA, TARDANZA, DESCANSO MEDICO, LICENCIA, VACACIONES) -> ASISTENCIA
                    return 'ASISTENCIA';
                };

                return {
                    'Fecha': item.work_date ? item.work_date.split('-').reverse().join('/') : '-', // Formato DD/MM/YYYY para evitar problemas de zona horaria en Excel
                    'Empleado': item.employees?.full_name || 'Desconocido',
                    'DNI': item.employees?.dni || '',
                    'Cargo': item.employees?.position || '',
                    'Sede': item.employees?.sede || '',
                    'Hora Entrada': item.check_in ? new Date(item.check_in).toLocaleTimeString('es-PE', { timeZone: 'America/Lima', hour: '2-digit', minute: '2-digit', hour12: true }) : '-',
                    'Hora Salida': item.check_out ? new Date(item.check_out).toLocaleTimeString('es-PE', { timeZone: 'America/Lima', hour: '2-digit', minute: '2-digit', hour12: true }) : '-',
                    'Estado': getStatusText(item),
                    'Tipo': getTypeText(item),
                    'AUSENTISMO': getLabel(item),
                    'Validado': item.validated ? 'SÍ' : 'NO',
                    'Motivo/Notas': item.notes || item.absence_reason || ''
                };
            })

            const wb = XLSX.utils.book_new()
            const ws = XLSX.utils.json_to_sheet(formattedData)
            
            const wscols = [
                {wch: 12}, {wch: 30}, {wch: 12}, {wch: 20}, {wch: 15},
                {wch: 12}, {wch: 12}, {wch: 15}, {wch: 15}, {wch: 8}, {wch: 40}
            ]
            ws['!cols'] = wscols

            XLSX.utils.book_append_sheet(wb, ws, 'Asistencias')
            
            const fileName = `Reporte_Asistencias_${startDate}_al_${endDate}.xlsx`
            XLSX.writeFile(wb, fileName)

        } catch (error) {
            console.error('Error exportando:', error)
            showToast('Error al exportar: ' + error.message, 'error')
        } finally {
            setExporting(false)
        }
    }

    async function handleValidate() {
        if (!validationModal) return
        const supervisorId = user?.employee_id;
        if (!supervisorId) {
            showToast('No se encontró un perfil de empleado asociado. No puedes validar asistencias.', 'error')
            return
        }

        try {
            setValidating(true)
            const { data, error } = await supabase.rpc('supervisor_validate_attendance', {
                p_attendance_id: validationModal.attendanceId,
                p_supervisor_id: supervisorId,
                p_validated: validationModal.approved,
                p_notes: validationNotes || null
            })

            if (error) throw error
            if (data?.success === false) {
                throw new Error(data.message || 'Error validando asistencia')
            }

            await loadAttendances(currentPage)
            setValidationModal(null)
            setValidationNotes('')
            showToast(validationModal.approved ? 'Asistencia aprobada correctamente' : 'Asistencia rechazada', 'success')
        } catch (error) {
            console.error('Error validando:', error)
            showToast('Error: ' + error.message, 'error')
        } finally {
            setValidating(false)
        }
    }

    function getStatusBadge(attendance) {
        const type = attendance.record_type;
        const isLate = attendance.is_late;
        let badgeContent;

        if (type === 'ASISTENCIA') {
            if (isLate) {
                badgeContent = <span title="TARDANZA" className="px-2 py-1 text-xs font-semibold rounded-full bg-yellow-100 text-yellow-800 block truncate max-w-[100px] text-center">TARDANZA</span>
            } else {
                badgeContent = <span title="PUNTUAL" className="px-2 py-1 text-xs font-semibold rounded-full bg-green-100 text-green-800 block truncate max-w-[100px] text-center">PUNTUAL</span>
            }
        } else if (type === 'FALTA JUSTIFICADA' || type === 'AUSENCIA SIN JUSTIFICAR' || type === 'AUSENCIA' || type === 'FALTA_INJUSTIFICADA') {
             badgeContent = <span title="AUSENCIA" className="px-2 py-1 text-xs font-semibold rounded-full bg-red-100 text-red-800 block truncate max-w-[100px] text-center">AUSENCIA</span>
        } else if (type === 'DESCANSO MÉDICO') {
            badgeContent = <span title="DESCANSO MÉDICO" className="px-2 py-1 text-xs font-semibold rounded-full bg-blue-100 text-blue-800 block truncate max-w-[100px] text-center">DESCANSO MÉDICO</span>
        } else if (type === 'LICENCIA CON GOCE') {
             badgeContent = <span title="LICENCIA" className="px-2 py-1 text-xs font-semibold rounded-full bg-purple-100 text-purple-800 block truncate max-w-[100px] text-center">LICENCIA</span>
        } else if (type === 'VACACIONES') {
             badgeContent = <span title="VACACIONES" className="px-2 py-1 text-xs font-semibold rounded-full bg-orange-100 text-orange-800 block truncate max-w-[100px] text-center">VACACIONES</span>
        } else if (!attendance.check_in && !type) {
            badgeContent = <span title="AUSENCIA" className="px-2 py-1 text-xs font-semibold rounded-full bg-red-100 text-red-800 block truncate max-w-[100px] text-center">AUSENCIA</span>
        } else {
            const label = type || 'OTRO';
            badgeContent = <span title={label} className="px-2 py-1 text-xs font-semibold rounded-full bg-gray-100 text-gray-800 block truncate max-w-[100px] text-center">{label}</span>
        }
        return badgeContent;
    }

    function getRecordTypeBadge(attendance) {
        const type = attendance.record_type;
        const subcategory = attendance.subcategory;
        let label = type;
        let colorClass = 'bg-gray-100 text-gray-800';

        switch (type) {
            case 'ASISTENCIA':
                label = 'Asistencia';
                colorClass = 'bg-blue-50 text-blue-700';
                break;
            case 'FALTA JUSTIFICADA':
                label = 'Justificada';
                colorClass = 'bg-green-50 text-green-700';
                break;
            case 'AUSENCIA SIN JUSTIFICAR':
            case 'AUSENCIA':
            case 'FALTA_INJUSTIFICADA':
                label = 'Injustificada';
                colorClass = 'bg-red-50 text-red-700';
                break;
            case 'DESCANSO MÉDICO':
                label = subcategory || 'General';
                colorClass = 'bg-indigo-50 text-indigo-700';
                break;
            case 'LICENCIA CON GOCE':
                label = 'Con Goce';
                colorClass = 'bg-purple-50 text-purple-700';
                break;
             case 'VACACIONES':
                label = 'Vacaciones';
                colorClass = 'bg-orange-50 text-orange-700';
                break;
            default:
                label = type || '-';
        }
        return <span title={label} className={`px-2 py-1 text-xs font-semibold rounded-full ${colorClass} block truncate max-w-[120px] text-center`}>{label}</span>
    }

    function formatDate(dateString) {
        if (!dateString) return '';
        const [year, month, day] = dateString.split('-');
        const date = new Date(year, month - 1, day);
        return date.toLocaleDateString('es-ES', {
            weekday: 'short',
            year: 'numeric',
            month: 'short',
            day: 'numeric'
        })
    }

    function formatTime(dateString) {
        if (!dateString) return '-'
        return new Date(dateString).toLocaleTimeString('es-ES', {
            hour: '2-digit',
            minute: '2-digit',
            hour12: true
        })
    }

    const stats = {
        total: globalStats.total,
        onTime: globalStats.onTime,
        late: globalStats.late,
        absent: globalStats.absent
    }

    // Funciones de Importación
    const handleFileChange = (e) => {
        const file = e.target.files[0]
        if (file) {
            setImportFile(file)
            readExcel(file)
        }
    }

    const readExcel = (file) => {
        const reader = new FileReader()
        reader.onload = (e) => {
            const data = new Uint8Array(e.target.result)
            const workbook = XLSX.read(data, { type: 'array' })
            const sheetName = workbook.SheetNames[0]
            const sheet = workbook.Sheets[sheetName]
            const jsonData = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: '' })
            if (jsonData.length < 2) {
                showToast('El archivo parece estar vacío o sin cabeceras.', 'error')
                return
            }
            const rows = jsonData.slice(1).map((row, idx) => ({
                id: idx,
                dni: row[0],
                date: processExcelDate(row[1]),
                checkIn: processExcelTime(row[2]),
                checkOut: null,
                isValid: validateRow(row)
            }))
            setImportPreview(rows)
        }
        reader.readAsArrayBuffer(file)
    }

    const validateRow = (row) => row[0] && row[1]

    const processExcelDate = (excelDate) => {
        if (typeof excelDate === 'number') {
            const date = XLSX.SSF.parse_date_code(excelDate)
            return `${date.y}-${String(date.m).padStart(2, '0')}-${String(date.d).padStart(2, '0')}`
        }
        if (typeof excelDate === 'string') {
            const dateStr = excelDate.trim()
            const dmyMatch = dateStr.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})$/)
            if (dmyMatch) {
                return `${dmyMatch[3]}-${dmyMatch[2].padStart(2, '0')}-${dmyMatch[1].padStart(2, '0')}`
            }
            if (/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) return dateStr
        }
        return excelDate
    }
    
    const processExcelTime = (excelTime) => {
         if (!excelTime) return null
         if (typeof excelTime === 'number') {
             const totalSeconds = Math.floor(excelTime * 86400)
             const hours = Math.floor(totalSeconds / 3600)
             const minutes = Math.floor((totalSeconds % 3600) / 60)
             return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:00`
         }
         if (typeof excelTime === 'string') {
             const timeStr = excelTime.trim().toLowerCase()
             const match = timeStr.match(/^(\d{1,2})[:.](\d{2})\s*([ap])\.?\s*m\.?$/)
             if (match) {
                 let hours = parseInt(match[1])
                 const minutes = parseInt(match[2])
                 const meridiem = match[3]
                 if (meridiem === 'p' && hours < 12) hours += 12
                 if (meridiem === 'a' && hours === 12) hours = 0
                 return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:00`
             }
             if (/^\d{1,2}:\d{2}(:\d{2})?$/.test(timeStr)) return timeStr
         }
         return excelTime
    }

    const handleImport = async () => {
        if (importPreview.length === 0) return
        setImportLoading(true)
        try {
            const payload = importPreview
                .filter(row => row.isValid)
                .map(row => {
                    const dateStr = processExcelDate(row.date)
                    const timeStr = processExcelTime(row.checkIn)
                    let checkInTime = null
                    if (dateStr && timeStr) {
                        try {
                            const peruDate = new Date(`${dateStr}T${timeStr}-05:00`)
                            if (!isNaN(peruDate.getTime())) {
                                checkInTime = peruDate.toISOString().split('T')[1].split('.')[0]
                            }
                        } catch (e) {
                            checkInTime = timeStr
                        }
                    }
                    return {
                        dni: String(row.dni).trim(),
                        work_date: dateStr,
                        check_in: checkInTime,
                        check_out: null, 
                        record_type: 'ASISTENCIA',
                        sede: user?.sede || null 
                    }
                })

            const result = await bulkImportAttendance(payload)
            if (result.error_count > 0) {
                setImportResult({
                    success: result.imported_count > 0,
                    count: result.imported_count,
                    error_count: result.error_count,
                    errors: result.errors,
                    message: `Se importaron ${result.imported_count} registros. Hubo ${result.error_count} errores.`
                })
            } else {
                setImportResult({
                    success: true,
                    count: result.imported_count || payload.length,
                    message: 'Importación completada exitosamente'
                })
            }
            loadAttendances(1)
        } catch (error) {
            console.error('Error importando:', error)
            setImportResult({
                success: false,
                message: error.message || 'Error al procesar el archivo'
            })
        } finally {
            setImportLoading(false)
        }
    }

    const closeImportModal = () => {
        setIsImportModalOpen(false)
        setImportFile(null)
        setImportPreview([])
        setImportResult(null)
    }

    const handleDownloadTemplate = () => {
        const headers = [['DNI', 'FECHA (YYYY-MM-DD)', 'HORA INGRESO (HH:MM)']]
        const ws = XLSX.utils.aoa_to_sheet(headers)
        const wb = XLSX.utils.book_new()
        XLSX.utils.book_append_sheet(wb, ws, "Plantilla_Asistencias")
        XLSX.writeFile(wb, "plantilla_asistencias.xlsx")
    }

    // Limpiar filtros - CORREGIDO para volver a la fecha actual
    const handleClearFilters = () => {
        const today = getLocalDate()
        setFilters({
            status: 'all',
            search: '',
            dateFrom: today,
            dateTo: today
        })
    }

    // Detectar si hay filtros activos - CORREGIDO
    const hasActiveFilters = () => {
        const today = getLocalDate()
        return (
            filters.search !== '' || 
            filters.status !== 'all' || 
            filters.dateFrom !== today || 
            filters.dateTo !== today
        )
    }

    return (
        <div className="w-full">
            <div className="mb-6 flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
                <div>
                    <h1 className="text-3xl font-bold text-gray-900">Registro de Asistencias</h1>
                    <p className="text-gray-600 mt-2">
                        Visualiza y filtra todas las asistencias registradas
                    </p>
                </div>
                <div className="flex flex-col sm:flex-row md:flex-col items-start sm:items-center md:items-end gap-2 w-full md:w-auto">
                    <div className="flex gap-2 w-full">
                        <button
                            onClick={() => setIsImportModalOpen(true)}
                            className="flex items-center justify-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg shadow-sm hover:bg-blue-700 transition-colors flex-1 sm:flex-initial"
                        >
                            <Upload className="h-4 w-4" />
                            Importar
                        </button>
                        <button
                            onClick={exportToExcel}
                            disabled={exporting || loading}
                            className={`flex items-center justify-center gap-2 px-4 py-2 bg-green-600 text-white rounded-lg shadow-sm hover:bg-green-700 transition-colors flex-1 sm:flex-initial ${
                                (exporting || loading) ? 'opacity-50 cursor-not-allowed' : ''
                            }`}
                        >
                            {exporting ? (
                                <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin"></div>
                            ) : (
                                <Download className="h-4 w-4" />
                            )}
                            {exporting ? '...' : 'Exportar'}
                        </button>
                    </div>
                    {!hasValidationPermission && (
                        <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-3 max-w-sm flex items-start gap-3">
                            <AlertCircle className="h-5 w-5 text-yellow-600 shrink-0 mt-0.5" />
                            <div>
                                <p className="text-sm font-bold text-yellow-800">Modo Lectura</p>
                                <p className="text-xs text-yellow-700 mt-1">
                                    Solo RRHH puede validar asistencias.
                                </p>
                            </div>
                        </div>
                    )}
                </div>
            </div>

            {/* Estadísticas */}
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
                <div className="bg-white border border-gray-200 rounded-lg p-4">
                    <div className="flex items-center justify-between">
                        <div>
                            <p className="text-sm text-gray-600 font-medium">Total</p>
                            <p className="text-2xl font-bold text-gray-900">{stats.total}</p>
                        </div>
                        <Calendar className="h-8 w-8 text-gray-400" />
                    </div>
                </div>
                <div className="bg-green-50 border border-green-200 rounded-lg p-4">
                    <div className="flex items-center justify-between">
                        <div>
                            <p className="text-sm text-green-600 font-medium">Puntuales</p>
                            <p className="text-2xl font-bold text-green-700">{stats.onTime}</p>
                        </div>
                        <CheckCircle className="h-8 w-8 text-green-500" />
                    </div>
                </div>
                <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4">
                    <div className="flex items-center justify-between">
                        <div>
                            <p className="text-sm text-yellow-600 font-medium">Tardanzas</p>
                            <p className="text-2xl font-bold text-yellow-700">{stats.late}</p>
                        </div>
                        <AlertCircle className="h-8 w-8 text-yellow-500" />
                    </div>
                </div>
                <div className="bg-red-50 border border-red-200 rounded-lg p-4">
                    <div className="flex items-center justify-between">
                        <div>
                            <p className="text-sm text-red-600 font-medium">Ausencias</p>
                            <p className="text-2xl font-bold text-red-700">{stats.absent}</p>
                        </div>
                        <XCircle className="h-8 w-8 text-red-500" />
                    </div>
                </div>
            </div>

            {/* Filtros */}
            <div className="bg-white rounded-lg shadow-md p-4 mb-6">
                <div className="grid grid-cols-1 md:grid-cols-5 gap-4">
                    <div>
                        <label className="block text-sm font-medium text-gray-700 mb-2">
                            <Search className="inline h-4 w-4 mr-1" />
                            Buscar
                        </label>
                        <input
                            type="text"
                            placeholder="Nombre o DNI..."
                            value={filters.search}
                            onChange={(e) => setFilters({ ...filters, search: e.target.value })}
                            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                        />
                    </div>
                    <div>
                        <label className="block text-sm font-medium text-gray-700 mb-2">
                            <Filter className="inline h-4 w-4 mr-1" />
                            Estado
                        </label>
                        <select
                            value={filters.status}
                            onChange={(e) => setFilters({ ...filters, status: e.target.value })}
                            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                        >
                            <option value="all">Todos</option>
                            <option value="on_time">Puntuales</option>
                            <option value="late">Tardanzas</option>
                            <option value="absent">Ausencias (Todas)</option>
                            <option value="medical">Descanso Médico</option>
                            <option value="license">Licencia</option>
                            <option value="vacation">Vacaciones</option>
                        </select>
                    </div>
                    <div>
                        <label className="block text-sm font-medium text-gray-700 mb-2">Desde</label>
                        <input
                            type="date"
                            value={filters.dateFrom}
                            onChange={(e) => setFilters({ ...filters, dateFrom: e.target.value })}
                            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                        />
                    </div>
                    <div>
                        <label className="block text-sm font-medium text-gray-700 mb-2">Hasta</label>
                        <input
                            type="date"
                            value={filters.dateTo}
                            onChange={(e) => setFilters({ ...filters, dateTo: e.target.value })}
                            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                        />
                    </div>
                    
                    {/* Botón Limpiar Filtros */}
                    {hasActiveFilters() && (
                        <div className="flex items-end">
                            <button
                                onClick={handleClearFilters}
                                className="w-full px-4 py-2 text-sm font-medium text-slate-600 bg-slate-100 hover:bg-slate-200 border border-slate-300 rounded-lg transition-colors flex items-center justify-center gap-2"
                            >
                                <X size={16} />
                                Limpiar
                            </button>
                        </div>
                    )}
                </div>
            </div>

            {/* Lista de asistencias */}
            {loading ? (
                <div className="flex items-center justify-center py-12">
                    <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
                </div>
            ) : attendances.length === 0 ? (
                <div className="bg-white rounded-lg shadow p-8 text-center">
                    <Calendar className="h-16 w-16 text-gray-400 mx-auto mb-4" />
                    <h3 className="text-xl font-semibold text-gray-900 mb-2">No se encontraron asistencias</h3>
                    <p className="text-gray-600">Intenta ajustar los filtros de búsqueda o el rango de fechas</p>
                </div>
            ) : (
                <div className="bg-white rounded-t-lg shadow-md overflow-hidden border-b border-gray-200">
                    <div className="overflow-x-auto">
                        <table className="min-w-full divide-y divide-gray-200">
                            <thead className="bg-gray-50">
                                <tr>
                                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider w-[300px]">Empleado</th>
                                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Fecha</th>
                                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Entrada</th>
                                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider w-[120px]">Estado</th>
                                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider w-[160px]">Tipo</th>
                                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Motivo</th>
                                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Validado</th>
                                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Ubicación</th>
                                </tr>
                            </thead>
                            <tbody className="bg-white divide-y divide-gray-200">
                                {attendances.map((attendance) => (
                                    <tr key={attendance.id} className="hover:bg-gray-50">
                                        <td className="px-6 py-4 whitespace-nowrap max-w-[300px]">
                                            <div className="truncate">
                                                <div className="text-sm font-medium text-gray-900 truncate" title={attendance.employees?.full_name}>{attendance.employees?.full_name}</div>
                                                <div className="text-sm text-gray-500 truncate" title={`${attendance.employees?.dni} • ${attendance.employees?.position}`}>{attendance.employees?.dni} • {attendance.employees?.position}</div>
                                            </div>
                                        </td>
                                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">{formatDate(attendance.work_date)}</td>
                                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                                            <div className="flex items-center">
                                                <Clock className="h-4 w-4 mr-1 text-gray-400" />
                                                {formatTime(attendance.check_in)}
                                            </div>
                                        </td>
                                        <td className="px-6 py-4 whitespace-nowrap">{getStatusBadge(attendance)}</td>
                                        <td className="px-6 py-4 whitespace-nowrap">{getRecordTypeBadge(attendance)}</td>
                                        <td className="px-6 py-4 whitespace-nowrap">
                                            {(() => {
                                                const hasNotes = attendance.notes || attendance.absence_reason;
                                                const hasEvidence = attendance.evidence_url;
                                                
                                                if (!hasNotes && !hasEvidence) return <span className="text-sm text-gray-400">-</span>;

                                                return (
                                                    <div className="flex flex-col gap-1">
                                                        {hasNotes && (
                                                            <div className="text-sm text-gray-700 max-w-[200px] truncate" title={attendance.absence_reason || attendance.notes}>
                                                                {attendance.absence_reason || attendance.notes}
                                                            </div>
                                                        )}
                                                        <button
                                                            onClick={() => setReasonModal({
                                                                employee: attendance.employees?.full_name,
                                                                notes: attendance.absence_reason || attendance.notes,
                                                                evidence: attendance.evidence_url
                                                            })}
                                                            className="text-blue-600 hover:text-blue-800 text-xs font-medium flex items-center gap-1 w-fit"
                                                        >
                                                            <AlertCircle className="h-3 w-3" />
                                                            Ver Detalle
                                                        </button>
                                                    </div>
                                                );
                                            })()}
                                        </td>
                                        <td className="px-6 py-4 whitespace-nowrap">
                                            {attendance.validated ? (
                                                <div className="flex items-center gap-2">
                                                    <CheckCircle className="h-5 w-5 text-green-500" />
                                                    <span className="text-xs text-gray-500">Validado</span>
                                                </div>
                                            ) : attendance.validated_by ? (
                                                <div className="flex items-center gap-2">
                                                    <XCircle className="h-5 w-5 text-red-500" />
                                                    <span className="text-xs text-red-500">Rechazado</span>
                                                </div>
                                            ) : (
                                                <div className="flex items-center gap-2">
                                                    <button
                                                        onClick={() => hasValidationPermission && setValidationModal({
                                                            attendanceId: attendance.id,
                                                            employeeName: attendance.employees?.full_name,
                                                            approved: true
                                                        })}
                                                        className={`flex items-center gap-1 px-2 py-1 text-xs rounded transition-colors ${
                                                            hasValidationPermission 
                                                                ? 'bg-green-100 text-green-700 hover:bg-green-200' 
                                                                : 'bg-gray-100 text-gray-400 cursor-not-allowed opacity-50'
                                                        }`}
                                                        title={hasValidationPermission ? "Aprobar" : "Requiere permisos de RRHH"}
                                                        disabled={!hasValidationPermission}
                                                    >
                                                        <CheckCircle className="h-4 w-4" />
                                                        Aprobar
                                                    </button>
                                                    <button
                                                        onClick={() => hasValidationPermission && setValidationModal({
                                                            attendanceId: attendance.id,
                                                            employeeName: attendance.employees?.full_name,
                                                            approved: false
                                                        })}
                                                        className={`flex items-center gap-1 px-2 py-1 text-xs rounded transition-colors ${
                                                            hasValidationPermission 
                                                                ? 'bg-red-100 text-red-700 hover:bg-red-200' 
                                                                : 'bg-gray-100 text-gray-400 cursor-not-allowed opacity-50'
                                                        }`}
                                                        title={hasValidationPermission ? "Rechazar" : "Requiere permisos de RRHH"}
                                                        disabled={!hasValidationPermission}
                                                    >
                                                        <XCircle className="h-4 w-4" />
                                                        Rechazar
                                                    </button>
                                                </div>
                                            )}
                                        </td>
                                        <td className="px-6 py-4 whitespace-nowrap">
                                            {(() => {
                                                try {
                                                    if (attendance.location_in) {
                                                        const location = typeof attendance.location_in === 'string'
                                                            ? JSON.parse(attendance.location_in)
                                                            : attendance.location_in;

                                                        if (location?.lat && location?.lng) {
                                                            return (
                                                                <button
                                                                    onClick={() => setSelectedLocation({
                                                                        lat: location.lat,
                                                                        lng: location.lng,
                                                                        employee: attendance.employees?.full_name,
                                                                        date: attendance.work_date,
                                                                        time: attendance.check_in
                                                                    })}
                                                                    className="flex items-center gap-1 px-3 py-1 text-sm bg-blue-100 text-blue-700 rounded-lg hover:bg-blue-200 transition-colors"
                                                                >
                                                                    <MapPin className="h-4 w-4" />
                                                                    Ver Mapa
                                                                </button>
                                                            );
                                                        }
                                                    }
                                                } catch (e) {
                                                    console.error('Error parsing location:', e);
                                                }
                                                return <span className="text-sm text-gray-400">Sin ubicación</span>;
                                            })()}
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                </div>
            )}

            {/* Paginación */}
            {!loading && attendances.length > 0 && (
                <div className="flex items-center justify-between bg-white px-4 py-3 sm:px-6 rounded-b-lg shadow-md mb-6">
                    <div className="flex flex-1 justify-between sm:hidden">
                        <button
                            onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                            disabled={currentPage === 1}
                            className="relative inline-flex items-center rounded-md border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50"
                        >
                            Anterior
                        </button>
                        <button
                            onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
                            disabled={currentPage === totalPages}
                            className="relative ml-3 inline-flex items-center rounded-md border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50"
                        >
                            Siguiente
                        </button>
                    </div>
                    <div className="hidden sm:flex sm:flex-1 sm:items-center sm:justify-between">
                        <div>
                            <p className="text-sm text-gray-700">
                                Mostrando <span className="font-medium">{(currentPage - 1) * PAGE_SIZE + 1}</span> a <span className="font-medium">{Math.min(currentPage * PAGE_SIZE, totalRecords)}</span> de <span className="font-medium">{totalRecords}</span> resultados
                            </p>
                        </div>
                        <div>
                            <nav className="isolate inline-flex -space-x-px rounded-md shadow-sm" aria-label="Pagination">
                                <button
                                    onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                                    disabled={currentPage === 1}
                                    className="relative inline-flex items-center rounded-l-md px-2 py-2 text-gray-400 ring-1 ring-inset ring-gray-300 hover:bg-gray-50 focus:z-20 focus:outline-offset-0 disabled:opacity-50"
                                >
                                    <span className="sr-only">Anterior</span>
                                    <ChevronLeft className="h-5 w-5" aria-hidden="true" />
                                </button>
                                <span className="relative inline-flex items-center px-4 py-2 text-sm font-semibold text-gray-900 ring-1 ring-inset ring-gray-300 focus:outline-offset-0">
                                    Página {currentPage} de {totalPages}
                                </span>
                                <button
                                    onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
                                    disabled={currentPage === totalPages}
                                    className="relative inline-flex items-center rounded-r-md px-2 py-2 text-gray-400 ring-1 ring-inset ring-gray-300 hover:bg-gray-50 focus:z-20 focus:outline-offset-0 disabled:opacity-50"
                                >
                                    <span className="sr-only">Siguiente</span>
                                    <ChevronRight className="h-5 w-5" aria-hidden="true" />
                                </button>
                            </nav>
                        </div>
                    </div>
                </div>
            )}

            {/* Modal de Motivo */}
            {reasonModal && (
                <div className="fixed inset-0 bg-black/30 backdrop-blur-sm z-50 flex items-center justify-center p-4 transition-all">
                    <div className="bg-white rounded-lg shadow-2xl max-w-md w-full border border-gray-100 transform scale-100 transition-all">
                        <div className="p-6">
                            <div className="flex justify-between items-center mb-4">
                                <h3 className="text-lg font-semibold text-gray-900">Detalle de Justificación</h3>
                                <button onClick={() => setReasonModal(null)} className="text-gray-400 hover:text-gray-500">
                                    <X className="h-5 w-5" />
                                </button>
                            </div>
                            <p className="text-sm text-gray-600 mb-4">
                                Empleado: <span className="font-semibold">{reasonModal.employee}</span>
                            </p>
                            <div className="mb-4">
                                <h4 className="text-sm font-medium text-gray-700 mb-2">Motivo / Notas:</h4>
                                <div className="bg-gray-50 p-3 rounded-lg border border-gray-200 text-sm text-gray-800">
                                    {reasonModal.notes || 'Sin notas adicionales'}
                                </div>
                            </div>
                            {reasonModal.evidence && (
                                <div className="mb-6">
                                    <h4 className="text-sm font-medium text-gray-700 mb-2">Evidencia Adjunta:</h4>
                                    <a href={reasonModal.evidence} target="_blank" rel="noopener noreferrer" className="flex items-center gap-2 p-3 bg-blue-50 text-blue-700 rounded-lg border border-blue-100 hover:bg-blue-100 transition-colors">
                                        <CheckCircle className="h-5 w-5" />
                                        <span className="font-medium">Ver Archivo de Evidencia</span>
                                    </a>
                                </div>
                            )}
                            <div className="flex justify-end">
                                <button onClick={() => setReasonModal(null)} className="px-4 py-2 bg-gray-800 text-white rounded-lg hover:bg-gray-900 transition-colors">
                                    Cerrar
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            )}

            {/* Modal de Validación */}
            {validationModal && (
                <div className="fixed inset-0 bg-black/30 backdrop-blur-sm z-50 flex items-center justify-center p-4 transition-all">
                    <div className="bg-white rounded-lg shadow-2xl max-w-md w-full border border-gray-100 transform scale-100 transition-all">
                        <div className="p-6">
                            <h3 className="text-lg font-semibold text-gray-900 mb-4">
                                {validationModal.approved ? '✓ Aprobar Asistencia' : '✗ Rechazar Asistencia'}
                            </h3>
                            <p className="text-sm text-gray-600 mb-4">
                                Empleado: <span className="font-semibold">{validationModal.employeeName}</span>
                            </p>
                            <div className="mb-4">
                                <label className="block text-sm font-medium text-gray-700 mb-2">
                                    {validationModal.approved ? 'Notas (opcional)' : 'Motivo del rechazo *'}
                                </label>
                                <textarea
                                    value={validationNotes}
                                    onChange={(e) => setValidationNotes(e.target.value)}
                                    rows={3}
                                    placeholder={validationModal.approved ? 'Agregar comentarios...' : 'Indique el motivo del rechazo...'}
                                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                                />
                            </div>
                            <div className="flex gap-3">
                                <button
                                    onClick={() => { setValidationModal(null); setValidationNotes(''); }}
                                    className="flex-1 px-4 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 transition-colors"
                                    disabled={validating}
                                >
                                    Cancelar
                                </button>
                                <button
                                    onClick={handleValidate}
                                    disabled={validating || (!validationModal.approved && !validationNotes)}
                                    className={`flex-1 px-4 py-2 text-white rounded-lg transition-colors ${validationModal.approved ? 'bg-green-600 hover:bg-green-700' : 'bg-red-600 hover:bg-red-700'} disabled:opacity-50 disabled:cursor-not-allowed`}
                                >
                                    {validating ? 'Procesando...' : 'Confirmar'}
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            )}

            {/* Modal de Mapa */}
            {selectedLocation && (
                <div className="fixed inset-0 bg-black/30 backdrop-blur-sm z-50 flex items-center justify-center p-4 transition-all">
                    <div className="bg-white rounded-lg shadow-2xl max-w-4xl w-full max-h-[90vh] overflow-hidden border border-gray-100 transform scale-100 transition-all">
                        <div className="flex items-center justify-between p-4 border-b border-gray-200">
                            <div>
                                <h3 className="text-lg font-semibold text-gray-900">Ubicación de Registro</h3>
                                <p className="text-sm text-gray-600 mt-1">
                                    {selectedLocation.employee} • {formatDate(selectedLocation.date)} {formatTime(selectedLocation.time)}
                                </p>
                            </div>
                            <button onClick={() => setSelectedLocation(null)} className="p-2 hover:bg-gray-100 rounded-lg transition-colors">
                                <X className="h-5 w-5 text-gray-500" />
                            </button>
                        </div>
                        <div className="p-4">
                            <div className="mb-4 p-3 bg-gray-50 rounded-lg">
                                <p className="text-sm text-gray-600">
                                    <span className="font-semibold">Coordenadas:</span> {selectedLocation.lat.toFixed(6)}, {selectedLocation.lng.toFixed(6)}
                                </p>
                                <a href={`https://www.google.com/maps?q=${selectedLocation.lat},${selectedLocation.lng}`} target="_blank" rel="noopener noreferrer" className="text-sm text-blue-600 hover:text-blue-800 mt-1 inline-flex items-center">
                                    <MapPin className="h-4 w-4 mr-1" />
                                    Abrir en Google Maps
                                </a>
                            </div>
                            <div className="w-full h-96 rounded-lg overflow-hidden border border-gray-200">
                                <iframe width="100%" height="100%" frameBorder="0" style={{ border: 0 }} src={`https://www.google.com/maps/embed/v1/place?key=AIzaSyBFw0Qbyq9zTFTd-tUY6dZWTgaQzuU17R8&q=${selectedLocation.lat},${selectedLocation.lng}&zoom=16`} allowFullScreen title="Mapa de ubicación" />
                            </div>
                        </div>
                        <div className="p-4 border-t border-gray-200 flex justify-end">
                            <button onClick={() => setSelectedLocation(null)} className="px-4 py-2 bg-gray-600 text-white rounded-lg hover:bg-gray-700 transition-colors">
                                Cerrar
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* Modal Importación */}
            <Modal
                isOpen={isImportModalOpen}
                onClose={closeImportModal}
                title="Importar Asistencias Masivas"
                showCancel={true}
                cancelText="Cerrar"
                onConfirm={importResult?.success ? closeImportModal : (importPreview.length > 0 && !importResult ? handleImport : null)}
                confirmText={importResult?.success ? "Finalizar" : (importLoading ? "Importando..." : "Importar Datos")}
                type="info"
            >
                <div className="space-y-6">
                    {!importResult ? (
                        <>
                            <div className="flex justify-between items-center">
                                <p className="text-sm text-slate-500">Carga un archivo Excel con las asistencias.</p>
                                <button onClick={handleDownloadTemplate} className="text-xs text-blue-600 hover:text-blue-800 font-medium underline">Descargar Plantilla</button>
                            </div>
                            <div className={`border-2 border-dashed rounded-xl p-8 text-center transition-all ${importFile ? 'border-blue-200 bg-blue-50/30' : 'border-slate-300 hover:border-blue-400 hover:bg-slate-50'}`}>
                                {!importFile ? (
                                    <div onClick={() => fileInputRef.current.click()} className="cursor-pointer flex flex-col items-center gap-3">
                                        <div className="w-12 h-12 bg-blue-100 rounded-full flex items-center justify-center text-blue-600">
                                            <Upload size={24} />
                                        </div>
                                        <h3 className="text-sm font-semibold text-slate-700">Clic para subir Excel</h3>
                                        <p className="text-xs text-slate-400">Soporta .xlsx, .xls</p>
                                    </div>
                                ) : (
                                    <div className="flex flex-col items-center gap-2">
                                        <FileSpreadsheet size={32} className="text-green-600" />
                                        <h3 className="text-sm font-bold text-slate-800">{importFile.name}</h3>
                                        <button onClick={() => { setImportFile(null); setImportPreview([]); }} className="text-xs text-red-500 hover:text-red-700 font-medium mt-1">Cambiar archivo</button>
                                    </div>
                                )}
                                <input type="file" ref={fileInputRef} className="hidden" accept=".xlsx, .xls" onChange={handleFileChange} />
                            </div>
                            {importPreview.length > 0 && (
                                <div className="space-y-2">
                                    <h4 className="text-sm font-bold text-slate-700">Vista Previa ({importPreview.length} registros)</h4>
                                    <div className="max-h-60 overflow-y-auto border border-slate-200 rounded-lg">
                                        <table className="w-full text-xs text-left">
                                            <thead className="bg-slate-50 text-slate-500 sticky top-0">
                                                <tr>
                                                    <th className="px-3 py-2">DNI</th>
                                                    <th className="px-3 py-2">Fecha</th>
                                                    <th className="px-3 py-2">Entrada</th>
                                                    <th className="px-3 py-2">Estado</th>
                                                </tr>
                                            </thead>
                                            <tbody className="divide-y divide-slate-100">
                                                {importPreview.slice(0, 100).map((row, i) => (
                                                    <tr key={i} className={row.isValid ? '' : 'bg-red-50'}>
                                                        <td className="px-3 py-2 font-mono">{row.dni}</td>
                                                        <td className="px-3 py-2">{row.date}</td>
                                                        <td className="px-3 py-2">{row.checkIn || '-'}</td>
                                                        <td className="px-3 py-2">
                                                            {row.isValid ? <CheckCircle size={14} className="text-green-500" /> : <XCircle size={14} className="text-red-500" />}
                                                        </td>
                                                    </tr>
                                                ))}
                                                {importPreview.length > 100 && (
                                                    <tr>
                                                        <td colSpan="5" className="px-3 py-2 text-center text-slate-400 italic">... y {importPreview.length - 100} más ...</td>
                                                    </tr>
                                                )}
                                            </tbody>
                                        </table>
                                    </div>
                                </div>
                            )}
                        </>
                    ) : (
                        <div className={`p-6 rounded-lg ${importResult.success && !importResult.error_count ? 'bg-green-50 border border-green-200' : 'bg-orange-50 border border-orange-200'}`}>
                            <div className="text-center">
                                {importResult.success && !importResult.error_count ? <CheckCircle className="w-12 h-12 text-green-500 mx-auto mb-3" /> : <AlertCircle className="w-12 h-12 text-orange-500 mx-auto mb-3" />}
                                <h3 className={`text-lg font-bold mb-1 ${importResult.success && !importResult.error_count ? 'text-green-800' : 'text-orange-800'}`}>
                                    {importResult.success && !importResult.error_count ? '¡Importación Exitosa!' : 'Resultado de la Importación'}
                                </h3>
                                <p className={`text-sm ${importResult.success && !importResult.error_count ? 'text-green-600' : 'text-orange-700'}`}>{importResult.message}</p>
                                {importResult.success && <p className="text-xs text-green-700 mt-2">Se procesaron {importResult.count} registros correctamente.</p>}
                            </div>
                            {importResult.errors && importResult.errors.length > 0 && (
                                <div className="mt-4 text-left">
                                    <h4 className="text-xs font-bold text-orange-800 uppercase mb-2">Detalle de Errores:</h4>
                                    <div className="bg-white border border-orange-200 rounded p-3 max-h-40 overflow-y-auto">
                                        <ul className="list-disc list-inside text-xs text-red-600 space-y-1">
                                            {importResult.errors.map((err, idx) => <li key={idx}>{err}</li>)}
                                        </ul>
                                    </div>
                                </div>
                            )}
                        </div>
                    )}
                </div>
            </Modal>
        </div>
    )
}