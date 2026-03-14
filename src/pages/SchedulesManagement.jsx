import { useState, useEffect, useMemo, useCallback } from 'react'
import { useAuth } from '../context/AuthContext'
import { useToast } from '../context/ToastContext'
import {
  Clock, Plus, Edit2, Trash2, Users, X, Check,
  AlertCircle, TrendingUp, Search, ChevronDown, Eye,
  Calendar, MapPin, Briefcase, LayoutGrid, UserCheck,
  ClockIcon
} from 'lucide-react'
import {
  getSchedules, createSchedule, updateSchedule, deleteSchedule,
  getScheduleAssignments, assignScheduleToEmployees, removeScheduleAssignment,
  getAttendanceForOvertime, getHistoricalAssignments,
  calcOvertimeMinutes, formatOvertimeHours
} from '../services/schedules'
import { getOrganizationStructure } from '../services/organization'
import { getEmployees } from '../services/employees'

// ── Cargos con derecho a HE ───────────────────────────────────────────────────
const OT_POSITIONS = ['AUXILIAR DE ALMACEN', 'AUXILIAR DE ALMACÉN', 'MONTACARGUISTA', 'CONFERENTE', 'COMPAGINADOR']
const qualifiesForOT = (position) => {
  const pos = (position || '').toUpperCase()
  return OT_POSITIONS.some((p) => pos === p) || (pos.includes('AUXILIAR') && pos.includes('ALMAC'))
}

// ── Helpers ──────────────────────────────────────────────────────────────────
const normalize = (str) =>
  str ? str.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toUpperCase() : ''

const formatTime = (t) => {
  if (!t) return '—'
  return t.substring(0, 5)
}

// Calcula el rango de bono automático: 10 min antes de check_in_time
const calcBonusRange = (checkInTime) => {
  if (!checkInTime) return null
  const [h, m] = checkInTime.split(':').map(Number)
  const totalMin = h * 60 + m
  const start = totalMin - 10
  const sh = String(Math.floor(start / 60)).padStart(2, '0')
  const sm = String(start % 60).padStart(2, '0')
  const eh = String(h).padStart(2, '0')
  const em = String(m).padStart(2, '0')
  return `${sh}:${sm} – ${eh}:${em}`
}

const toPeruTime = (isoStr) => {
  if (!isoStr) return '—'
  return new Date(isoStr).toLocaleTimeString('es-PE', {
    timeZone: 'America/Lima',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  })
}

const EMPTY_SCHEDULE = {
  name: '',
  shift: '',
  schedule_type: 'REGULAR',
  work_days: [1, 2, 3, 4, 5, 6],
  sede: '',
  business_unit: '',
  position: '',
  area: '',
  check_in_time: '07:00',
  check_out_time: '17:00',
  tolerance_minutes: 0,
  has_bonus: true,
  bonus_start: '06:30',
  bonus_end: '06:50',
  is_active: true,
}

// ── Componente principal ──────────────────────────────────────────────────────
export default function SchedulesManagement() {
  const { user } = useAuth()
  const { showToast } = useToast()

  // Permisos
  const userPosition = normalize(user?.position)
  const isAdmin = !!(user?.permissions?.['*'])
  const isJefeGente =
    userPosition.includes('JEFE DE GENTE') || userPosition.includes('GENTE Y GESTION')
  const isAnalistaGente =
    userPosition.includes('ANALISTA DE GENTE') || userPosition.includes('ANALISTA GENTE')
  const canWrite = isAdmin || isJefeGente

  // Tab activo
  const [activeTab, setActiveTab] = useState('schedules')

  // ── Data ──────────────────────────────────────────────────────────────────
  const [schedules, setSchedules] = useState([])
  const [assignments, setAssignments] = useState([])
  const [employees, setEmployees] = useState([])
  const [attendance, setAttendance] = useState([])
  const [historicalAssignments, setHistoricalAssignments] = useState([])
  const [sedes, setSedes] = useState([])
  const [businessUnits, setBusinessUnits] = useState([])

  const [loadingSchedules, setLoadingSchedules] = useState(true)
  const [loadingAssignments, setLoadingAssignments] = useState(false)
  const [loadingEmployees, setLoadingEmployees] = useState(false)
  const [loadingOvertime, setLoadingOvertime] = useState(false)

  // ── Modal horario ─────────────────────────────────────────────────────────
  const [modalOpen, setModalOpen] = useState(false)
  const [modalMode, setModalMode] = useState('create') // 'create' | 'edit'
  const [editingSchedule, setEditingSchedule] = useState(null)
  const [form, setForm] = useState(EMPTY_SCHEDULE)
  const [saving, setSaving] = useState(false)

  // ── Modal confirmación borrado ────────────────────────────────────────────
  const [deleteConfirm, setDeleteConfirm] = useState(null) // schedule object

  // ── Filtros tab horarios ──────────────────────────────────────────────────
  const [filterSede, setFilterSede] = useState('')
  const [filterUnit, setFilterUnit] = useState('')
  const [filterSearch, setFilterSearch] = useState('')

  // ── Asignaciones ─────────────────────────────────────────────────────────
  const [selectedEmployees, setSelectedEmployees] = useState(new Set())
  const [selectedScheduleId, setSelectedScheduleId] = useState('')
  const [assignNotes, setAssignNotes] = useState('')
  const [assigningSaving, setAssigningSaving] = useState(false)
  const [assignFilterSede, setAssignFilterSede] = useState('')
  const [assignFilterUnit, setAssignFilterUnit] = useState('')
  const [assignFilterSearch, setAssignFilterSearch] = useState('')
  const [assignmentFilterSede, setAssignmentFilterSede] = useState('')

  // ── Horas extras ─────────────────────────────────────────────────────────
  const [otStartDate, setOtStartDate] = useState(() => {
    const d = new Date()
    d.setDate(d.getDate() - 30)
    return d.toISOString().split('T')[0]
  })
  const [otEndDate, setOtEndDate] = useState(new Date().toISOString().split('T')[0])
  const [otFilterSede, setOtFilterSede] = useState('')
  const [otFilterSearch, setOtFilterSearch] = useState('')

  // ── Carga inicial ─────────────────────────────────────────────────────────
  useEffect(() => {
    loadSchedules()
    loadOrgStructure()
  }, [])

  useEffect(() => {
    if (activeTab === 'assignments') loadAssignmentsData()
    if (activeTab === 'overtime') loadOvertimeData()
  }, [activeTab])

  const loadSchedules = async () => {
    setLoadingSchedules(true)
    const { data, error } = await getSchedules()
    if (error) showToast('Error al cargar horarios', 'error')
    else setSchedules(data || [])
    setLoadingSchedules(false)
  }

  const loadOrgStructure = async () => {
    const { data } = await getOrganizationStructure()
    if (data) {
      const sedesSet = new Set()
      const unitsSet = new Set()
      data.forEach((item) => {
        if (item.sedes?.name) sedesSet.add(item.sedes.name)
        if (item.business_units?.name) unitsSet.add(item.business_units.name)
      })
      setSedes([...sedesSet].sort())
      setBusinessUnits([...unitsSet].sort())
    }
  }

  const loadAssignmentsData = async () => {
    setLoadingAssignments(true)
    setLoadingEmployees(true)
    const [assignRes, empRes] = await Promise.all([
      getScheduleAssignments(),
      getEmployees(),
    ])
    if (assignRes.error) showToast('Error al cargar asignaciones', 'error')
    else setAssignments(assignRes.data || [])
    if (empRes.error) showToast('Error al cargar empleados', 'error')
    else setEmployees((empRes.data || []).filter((e) => e.is_active !== false))
    setLoadingAssignments(false)
    setLoadingEmployees(false)
  }

  const loadOvertimeData = async () => {
    setLoadingOvertime(true)
    const [attRes, assignRes] = await Promise.all([
      getAttendanceForOvertime({ startDate: otStartDate, endDate: otEndDate }),
      getScheduleAssignments(),
    ])
    if (attRes.error) showToast('Error al cargar asistencias', 'error')
    else setAttendance(attRes.data || [])

    if (!assignRes.error) {
      const empIds = (attRes.data || []).map((a) => a.employee?.id).filter(Boolean)
      if (empIds.length > 0) {
        const { data: hist } = await getHistoricalAssignments(empIds)
        setHistoricalAssignments(hist || [])
      }
    }
    setLoadingOvertime(false)
  }

  // ── CRUD Horarios ─────────────────────────────────────────────────────────
  const openCreate = () => {
    setModalMode('create')
    setForm(EMPTY_SCHEDULE)
    setEditingSchedule(null)
    setModalOpen(true)
  }

  const openEdit = (schedule) => {
    setModalMode('edit')
    setEditingSchedule(schedule)
    const hasBonus = !!(schedule.bonus_start && schedule.bonus_end)
    setForm({
      name: schedule.name || '',
      shift: schedule.shift || '',
      schedule_type: schedule.schedule_type || 'REGULAR',
      work_days: schedule.work_days || [1, 2, 3, 4, 5, 6],
      sede: schedule.sede || '',
      business_unit: schedule.business_unit || '',
      position: schedule.position || '',
      area: schedule.area || '',
      check_in_time: formatTime(schedule.check_in_time),
      check_out_time: formatTime(schedule.check_out_time),
      tolerance_minutes: schedule.tolerance_minutes || 0,
      has_bonus: hasBonus,
      bonus_start: hasBonus ? formatTime(schedule.bonus_start) : '06:30',
      bonus_end: hasBonus ? formatTime(schedule.bonus_end) : '06:50',
      is_active: schedule.is_active !== false,
    })
    setModalOpen(true)
  }

  const handleSave = async () => {
    if (!form.name.trim()) return showToast('El nombre es obligatorio', 'error')
    if (!form.check_in_time) return showToast('La hora de entrada es obligatoria', 'error')
    if (!form.check_out_time) return showToast('La hora de salida es obligatoria', 'error')

    setSaving(true)
    const payload = {
      name: form.name.trim(),
      shift: form.shift || null,
      schedule_type: form.schedule_type || 'REGULAR',
      work_days: form.work_days?.length ? form.work_days : [1, 2, 3, 4, 5, 6],
      sede: form.sede || null,
      business_unit: form.business_unit || null,
      position: form.position || null,
      area: form.area || null,
      check_in_time: form.check_in_time + ':00',
      check_out_time: form.check_out_time + ':00',
      tolerance_minutes: parseInt(form.tolerance_minutes) || 0,
      bonus_start: null,
      bonus_end: null,
      is_active: form.is_active,
    }

    let error
    if (modalMode === 'create') {
      ;({ error } = await createSchedule({ ...payload, created_by: user?.employee_id || null }))
    } else {
      ;({ error } = await updateSchedule(editingSchedule.id, payload))
    }

    if (error) {
      showToast('Error al guardar horario: ' + error.message, 'error')
    } else {
      showToast(modalMode === 'create' ? 'Horario creado' : 'Horario actualizado', 'success')
      setModalOpen(false)
      loadSchedules()
    }
    setSaving(false)
  }

  const handleDelete = async () => {
    if (!deleteConfirm) return
    const { error } = await deleteSchedule(deleteConfirm.id)
    if (error) showToast('Error al eliminar: ' + error.message, 'error')
    else {
      showToast('Horario eliminado', 'success')
      setSchedules((prev) => prev.filter((s) => s.id !== deleteConfirm.id))
    }
    setDeleteConfirm(null)
  }

  // ── Asignaciones ─────────────────────────────────────────────────────────
  const filteredEmployees = useMemo(() => {
    return employees.filter((e) => {
      const matchSede = !assignFilterSede || normalize(e.sede).includes(normalize(assignFilterSede))
      const matchUnit = !assignFilterUnit || normalize(e.business_unit).includes(normalize(assignFilterUnit))
      const matchSearch =
        !assignFilterSearch ||
        normalize(e.full_name).includes(normalize(assignFilterSearch)) ||
        (e.dni || '').includes(assignFilterSearch)
      return matchSede && matchUnit && matchSearch
    })
  }, [employees, assignFilterSede, assignFilterUnit, assignFilterSearch])

  const toggleEmployee = (id) => {
    setSelectedEmployees((prev) => {
      const next = new Set(prev)
      next.has(id) ? next.delete(id) : next.add(id)
      return next
    })
  }

  const toggleAllEmployees = () => {
    if (selectedEmployees.size === filteredEmployees.length) {
      setSelectedEmployees(new Set())
    } else {
      setSelectedEmployees(new Set(filteredEmployees.map((e) => e.id)))
    }
  }

  const handleAssign = async () => {
    if (selectedEmployees.size === 0) return showToast('Selecciona al menos un empleado', 'error')
    if (!selectedScheduleId) return showToast('Selecciona un horario', 'error')
    setAssigningSaving(true)
    const { error } = await assignScheduleToEmployees(
      [...selectedEmployees],
      selectedScheduleId,
      user?.employee_id || null,
      assignNotes || null
    )
    if (error) showToast('Error al asignar: ' + error.message, 'error')
    else {
      showToast(`Horario asignado a ${selectedEmployees.size} empleado(s)`, 'success')
      setSelectedEmployees(new Set())
      setSelectedScheduleId('')
      setAssignNotes('')
      loadAssignmentsData()
    }
    setAssigningSaving(false)
  }

  const handleRemoveAssignment = async (assignmentId) => {
    const { error } = await removeScheduleAssignment(assignmentId)
    if (error) showToast('Error al remover asignación', 'error')
    else {
      showToast('Asignación removida', 'success')
      loadAssignmentsData()
    }
  }

  // ── Horas extras (cálculo dinámico) ───────────────────────────────────────
  const overtimeRecords = useMemo(() => {
    return attendance
      .filter((rec) => qualifiesForOT(rec.employee?.position))
      .map((rec) => {
        // Buscar asignación vigente en la fecha del registro
        const empId = rec.employee?.id
        const workDate = rec.work_date

        const assignment = historicalAssignments.find(
          (a) =>
            a.employee_id === empId &&
            a.valid_from <= workDate &&
            (a.valid_to === null || a.valid_to >= workDate)
        )

        const otMins = assignment?.schedule
          ? calcOvertimeMinutes(rec.check_out, assignment.schedule.check_out_time)
          : 0

        return { ...rec, otMins, scheduledOut: assignment?.schedule?.check_out_time || null }
      })
      .filter((r) => {
        const matchSede = !otFilterSede || normalize(r.employee?.sede).includes(normalize(otFilterSede))
        const matchSearch =
          !otFilterSearch ||
          normalize(r.employee?.full_name).includes(normalize(otFilterSearch)) ||
          (r.employee?.dni || '').includes(otFilterSearch)
        return matchSede && matchSearch
      })
  }, [attendance, historicalAssignments, otFilterSede, otFilterSearch])

  const overtimeSummary = useMemo(() => {
    const withOT = overtimeRecords.filter((r) => r.otMins > 0)
    const totalMins = withOT.reduce((sum, r) => sum + r.otMins, 0)
    const uniqueEmps = new Set(withOT.map((r) => r.employee?.id)).size
    return { totalMins, uniqueEmps, count: withOT.length }
  }, [overtimeRecords])

  // ── Filtros tab horarios ──────────────────────────────────────────────────
  const filteredSchedules = useMemo(() => {
    return schedules.filter((s) => {
      const matchSede = !filterSede || normalize(s.sede || '').includes(normalize(filterSede))
      const matchUnit = !filterUnit || normalize(s.business_unit || '').includes(normalize(filterUnit))
      const matchSearch =
        !filterSearch ||
        normalize(s.name).includes(normalize(filterSearch)) ||
        normalize(s.position || '').includes(normalize(filterSearch)) ||
        normalize(s.area || '').includes(normalize(filterSearch))
      return matchSede && matchUnit && matchSearch
    })
  }, [schedules, filterSede, filterUnit, filterSearch])

  const filteredAssignments = useMemo(() => {
    return assignments.filter((a) => {
      return !assignmentFilterSede || normalize(a.employee?.sede || '').includes(normalize(assignmentFilterSede))
    })
  }, [assignments, assignmentFilterSede])

  // ── Render ────────────────────────────────────────────────────────────────
  const tabs = [
    { id: 'schedules', label: 'Horarios', icon: Clock },
    { id: 'assignments', label: 'Asignaciones', icon: Users },
    { id: 'overtime', label: 'Horas Extras', icon: TrendingUp },
  ]

  return (
    <div className="p-4 max-w-full">
      {/* Header */}
      <div className="flex items-start justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Gestión de Horarios</h1>
          <p className="text-sm text-gray-500 mt-1">
            {canWrite
              ? 'Administra horarios, asignaciones y horas extras del personal'
              : 'Visualiza los horarios y horas extras del personal'}
          </p>
        </div>
        {canWrite && activeTab === 'schedules' && (
          <button
            onClick={openCreate}
            className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-xl hover:bg-blue-700 transition-colors text-sm font-medium shadow-sm"
          >
            <Plus size={16} />
            Nuevo Horario
          </button>
        )}
      </div>

      {/* Tabs */}
      <div className="flex gap-1 bg-gray-100 p-1 rounded-xl mb-6 w-fit">
        {tabs.map((tab) => {
          const Icon = tab.icon
          return (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all ${
                activeTab === tab.id
                  ? 'bg-white text-blue-600 shadow-sm'
                  : 'text-gray-500 hover:text-gray-700'
              }`}
            >
              <Icon size={15} />
              {tab.label}
            </button>
          )
        })}
      </div>

      {/* ── TAB: HORARIOS ─────────────────────────────────────────────────── */}
      {activeTab === 'schedules' && (
        <div className="bg-white rounded-2xl shadow-sm border border-gray-100">
          {/* Filtros */}
          <div className="p-4 border-b border-gray-100 flex flex-wrap gap-3">
            <div className="relative flex-1 min-w-[180px]">
              <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
              <input
                type="text"
                placeholder="Buscar por nombre, cargo, área..."
                value={filterSearch}
                onChange={(e) => setFilterSearch(e.target.value)}
                className="w-full pl-9 pr-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
            <select
              value={filterSede}
              onChange={(e) => setFilterSede(e.target.value)}
              className="px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white"
            >
              <option value="">Todas las sedes</option>
              {sedes.map((s) => <option key={s} value={s}>{s}</option>)}
            </select>
            <select
              value={filterUnit}
              onChange={(e) => setFilterUnit(e.target.value)}
              className="px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white"
            >
              <option value="">Todas las unidades</option>
              {businessUnits.map((u) => <option key={u} value={u}>{u}</option>)}
            </select>
          </div>

          {/* Tabla */}
          {loadingSchedules ? (
            <div className="flex items-center justify-center py-20">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600" />
            </div>
          ) : filteredSchedules.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-20 text-gray-400">
              <Clock size={40} className="mb-3 opacity-30" />
              <p className="font-medium">No hay horarios registrados</p>
              {canWrite && (
                <p className="text-sm mt-1">Crea el primer horario con el botón superior</p>
              )}
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-gray-100 text-left">
                    <th className="px-4 py-3 font-semibold text-gray-600">Nombre</th>
                    <th className="px-4 py-3 font-semibold text-gray-600 text-center">Turno</th>
                    <th className="px-4 py-3 font-semibold text-gray-600">Sede</th>
                    <th className="px-4 py-3 font-semibold text-gray-600">Unidad</th>
                    <th className="px-4 py-3 font-semibold text-gray-600">Cargo</th>
                    <th className="px-4 py-3 font-semibold text-gray-600">Área</th>
                    <th className="px-4 py-3 font-semibold text-gray-600 text-center">Entrada</th>
                    <th className="px-4 py-3 font-semibold text-gray-600 text-center">Salida</th>
                    <th className="px-4 py-3 font-semibold text-gray-600 text-center">Tolerancia</th>
                    <th className="px-4 py-3 font-semibold text-gray-600 text-center">Bono</th>
                    <th className="px-4 py-3 font-semibold text-gray-600 text-center">Tipo</th>
                    <th className="px-4 py-3 font-semibold text-gray-600 text-center">Estado</th>
                    {canWrite && <th className="px-4 py-3 font-semibold text-gray-600 text-right">Acciones</th>}
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50">
                  {filteredSchedules.map((s) => (
                    <tr key={s.id} className="hover:bg-gray-50 transition-colors">
                      <td className="px-4 py-3 font-medium text-gray-800">{s.name}</td>
                      <td className="px-4 py-3 text-center">
                        {s.shift ? (
                          <span className={`px-2 py-0.5 rounded-full text-xs font-semibold ${
                            s.shift === 'MAÑANA' ? 'bg-yellow-100 text-yellow-800'
                            : s.shift === 'TARDE' ? 'bg-orange-100 text-orange-800'
                            : 'bg-indigo-100 text-indigo-800'
                          }`}>
                            {s.shift === 'MAÑANA' ? '☀ Mañana' : s.shift === 'TARDE' ? '🌤 Tarde' : '🌙 Noche'}
                          </span>
                        ) : <span className="text-gray-300 italic text-xs">—</span>}
                      </td>
                      <td className="px-4 py-3 text-gray-600">{s.sede || <span className="text-gray-300 italic">Todas</span>}</td>
                      <td className="px-4 py-3 text-gray-600">{s.business_unit || <span className="text-gray-300 italic">Todas</span>}</td>
                      <td className="px-4 py-3 text-gray-600">{s.position || <span className="text-gray-300 italic">Todos</span>}</td>
                      <td className="px-4 py-3 text-gray-600">{s.area || <span className="text-gray-300 italic">Todas</span>}</td>
                      <td className="px-4 py-3 text-center">
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 bg-blue-50 text-blue-700 rounded-lg font-mono text-xs font-semibold">
                          <Clock size={11} />
                          {formatTime(s.check_in_time)}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-center">
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 bg-purple-50 text-purple-700 rounded-lg font-mono text-xs font-semibold">
                          <Clock size={11} />
                          {formatTime(s.check_out_time)}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-center text-gray-600">
                        {s.tolerance_minutes ? `${s.tolerance_minutes} min` : '—'}
                      </td>
                      <td className="px-4 py-3 text-center text-xs">
                        {s.business_unit?.toUpperCase().includes('OPL')
                          ? <span className="text-green-700 font-semibold">{calcBonusRange(s.check_in_time)}</span>
                          : <span className="text-gray-300 italic">No aplica</span>}
                      </td>
                      <td className="px-4 py-3 text-center">
                        <span className={`px-2 py-0.5 rounded-full text-xs font-semibold ${
                          !s.schedule_type || s.schedule_type === 'REGULAR' ? 'bg-blue-50 text-blue-700'
                          : s.schedule_type === 'FERIADO' ? 'bg-red-100 text-red-700'
                          : 'bg-purple-100 text-purple-700'
                        }`}>
                          {!s.schedule_type || s.schedule_type === 'REGULAR' ? 'Regular'
                           : s.schedule_type === 'FERIADO'
                             ? `📅 ${s.holiday_name || 'Feriado'}`
                             : `🗓 ${s.holiday_name || 'Domingo'}`}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-center">
                        <span className={`px-2 py-0.5 rounded-full text-xs font-semibold ${
                          s.is_active !== false
                            ? 'bg-green-100 text-green-700'
                            : 'bg-gray-100 text-gray-500'
                        }`}>
                          {s.is_active !== false ? 'Activo' : 'Inactivo'}
                        </span>
                      </td>
                      {canWrite && (
                        <td className="px-4 py-3 text-right">
                          <div className="flex items-center justify-end gap-2">
                            <button
                              onClick={() => openEdit(s)}
                              className="p-1.5 text-gray-400 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-colors"
                              title="Editar"
                            >
                              <Edit2 size={15} />
                            </button>
                            <button
                              onClick={() => setDeleteConfirm(s)}
                              className="p-1.5 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                              title="Eliminar"
                            >
                              <Trash2 size={15} />
                            </button>
                          </div>
                        </td>
                      )}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* ── TAB: ASIGNACIONES ─────────────────────────────────────────────── */}
      {activeTab === 'assignments' && (
        <div className="space-y-5">
          {/* Panel de asignación (solo canWrite) */}
          {canWrite && (
            <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-5">
              <h2 className="font-semibold text-gray-800 mb-4 flex items-center gap-2">
                <UserCheck size={16} className="text-blue-600" />
                Asignar Horario a Empleados
              </h2>

              {/* Filtros de empleados */}
              <div className="flex flex-wrap gap-3 mb-4">
                <div className="relative flex-1 min-w-[180px]">
                  <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                  <input
                    type="text"
                    placeholder="Buscar empleado o DNI..."
                    value={assignFilterSearch}
                    onChange={(e) => setAssignFilterSearch(e.target.value)}
                    className="w-full pl-9 pr-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>
                <select
                  value={assignFilterSede}
                  onChange={(e) => setAssignFilterSede(e.target.value)}
                  className="px-3 py-2 border border-gray-200 rounded-lg text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                >
                  <option value="">Todas las sedes</option>
                  {sedes.map((s) => <option key={s} value={s}>{s}</option>)}
                </select>
                <select
                  value={assignFilterUnit}
                  onChange={(e) => setAssignFilterUnit(e.target.value)}
                  className="px-3 py-2 border border-gray-200 rounded-lg text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                >
                  <option value="">Todas las unidades</option>
                  {businessUnits.map((u) => <option key={u} value={u}>{u}</option>)}
                </select>
              </div>

              {/* Lista de empleados con checkboxes */}
              <div className="border border-gray-200 rounded-xl overflow-hidden mb-4">
                <div className="flex items-center gap-3 px-4 py-2 bg-gray-50 border-b border-gray-200">
                  <input
                    type="checkbox"
                    checked={filteredEmployees.length > 0 && selectedEmployees.size === filteredEmployees.length}
                    onChange={toggleAllEmployees}
                    className="rounded"
                  />
                  <span className="text-xs font-semibold text-gray-500">
                    EMPLEADO ({filteredEmployees.length})
                  </span>
                  <span className="text-xs font-semibold text-gray-500 ml-auto">
                    {selectedEmployees.size > 0 && (
                      <span className="text-blue-600">{selectedEmployees.size} seleccionados</span>
                    )}
                  </span>
                </div>
                <div className="max-h-56 overflow-y-auto divide-y divide-gray-50">
                  {loadingEmployees ? (
                    <div className="flex justify-center py-8">
                      <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-blue-600" />
                    </div>
                  ) : filteredEmployees.length === 0 ? (
                    <div className="text-center py-8 text-gray-400 text-sm">Sin resultados</div>
                  ) : (
                    filteredEmployees.map((emp) => (
                      <label
                        key={emp.id}
                        className="flex items-center gap-3 px-4 py-2.5 hover:bg-blue-50/50 cursor-pointer transition-colors"
                      >
                        <input
                          type="checkbox"
                          checked={selectedEmployees.has(emp.id)}
                          onChange={() => toggleEmployee(emp.id)}
                          className="rounded"
                        />
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium text-gray-800 truncate">{emp.full_name}</p>
                          <p className="text-xs text-gray-400">
                            {emp.dni} · {emp.position} · {emp.sede}
                          </p>
                        </div>
                        {assignments.find((a) => a.employee?.id === emp.id) && (
                          <span className="text-xs text-green-600 bg-green-50 px-2 py-0.5 rounded-full shrink-0">
                            {assignments.find((a) => a.employee?.id === emp.id)?.schedule?.name}
                          </span>
                        )}
                      </label>
                    ))
                  )}
                </div>
              </div>

              {/* Seleccionar horario + botón */}
              <div className="flex flex-wrap gap-3 items-end">
                <div className="flex-1 min-w-[200px]">
                  <label className="block text-xs font-semibold text-gray-600 mb-1.5">
                    Horario a asignar
                  </label>
                  <select
                    value={selectedScheduleId}
                    onChange={(e) => setSelectedScheduleId(e.target.value)}
                    className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                  >
                    <option value="">— Seleccionar horario —</option>
                    {schedules.filter((s) => s.is_active !== false).map((s) => (
                      <option key={s.id} value={s.id}>
                        {s.name} ({formatTime(s.check_in_time)} – {formatTime(s.check_out_time)})
                      </option>
                    ))}
                  </select>
                </div>
                <div className="flex-1 min-w-[180px]">
                  <label className="block text-xs font-semibold text-gray-600 mb-1.5">
                    Notas (opcional)
                  </label>
                  <input
                    type="text"
                    placeholder="Observaciones..."
                    value={assignNotes}
                    onChange={(e) => setAssignNotes(e.target.value)}
                    className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>
                <button
                  onClick={handleAssign}
                  disabled={assigningSaving || selectedEmployees.size === 0 || !selectedScheduleId}
                  className="px-4 py-2 bg-blue-600 text-white rounded-xl hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors text-sm font-medium flex items-center gap-2"
                >
                  {assigningSaving ? (
                    <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white" />
                  ) : (
                    <Check size={15} />
                  )}
                  Asignar Horario
                </button>
              </div>
            </div>
          )}

          {/* Tabla de asignaciones actuales */}
          <div className="bg-white rounded-2xl shadow-sm border border-gray-100">
            <div className="p-4 border-b border-gray-100 flex items-center justify-between flex-wrap gap-3">
              <h2 className="font-semibold text-gray-800 flex items-center gap-2">
                <Clock size={16} className="text-blue-600" />
                Asignaciones Vigentes
                <span className="text-xs bg-blue-100 text-blue-700 px-2 py-0.5 rounded-full font-semibold">
                  {filteredAssignments.length}
                </span>
              </h2>
              <select
                value={assignmentFilterSede}
                onChange={(e) => setAssignmentFilterSede(e.target.value)}
                className="px-3 py-2 border border-gray-200 rounded-lg text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                <option value="">Todas las sedes</option>
                {sedes.map((s) => <option key={s} value={s}>{s}</option>)}
              </select>
            </div>

            {loadingAssignments ? (
              <div className="flex justify-center py-16">
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600" />
              </div>
            ) : filteredAssignments.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-16 text-gray-400">
                <Users size={36} className="mb-2 opacity-30" />
                <p className="font-medium">Sin asignaciones activas</p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-gray-100 text-left">
                      <th className="px-4 py-3 font-semibold text-gray-600">Empleado</th>
                      <th className="px-4 py-3 font-semibold text-gray-600">Sede</th>
                      <th className="px-4 py-3 font-semibold text-gray-600">Unidad</th>
                      <th className="px-4 py-3 font-semibold text-gray-600">Horario Asignado</th>
                      <th className="px-4 py-3 font-semibold text-gray-600 text-center">Entrada</th>
                      <th className="px-4 py-3 font-semibold text-gray-600 text-center">Salida</th>
                      <th className="px-4 py-3 font-semibold text-gray-600">Desde</th>
                      {canWrite && <th className="px-4 py-3 font-semibold text-gray-600 text-right">Acciones</th>}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-50">
                    {filteredAssignments.map((a) => (
                      <tr key={a.id} className="hover:bg-gray-50 transition-colors">
                        <td className="px-4 py-3">
                          <p className="font-medium text-gray-800">{a.employee?.full_name}</p>
                          <p className="text-xs text-gray-400">{a.employee?.dni} · {a.employee?.position}</p>
                        </td>
                        <td className="px-4 py-3 text-gray-600">{a.employee?.sede}</td>
                        <td className="px-4 py-3 text-gray-600">{a.employee?.business_unit}</td>
                        <td className="px-4 py-3">
                          <span className="font-medium text-blue-700">{a.schedule?.name}</span>
                        </td>
                        <td className="px-4 py-3 text-center font-mono text-blue-600 font-semibold text-xs">
                          {formatTime(a.schedule?.check_in_time)}
                        </td>
                        <td className="px-4 py-3 text-center font-mono text-purple-600 font-semibold text-xs">
                          {formatTime(a.schedule?.check_out_time)}
                        </td>
                        <td className="px-4 py-3 text-gray-500 text-xs">{a.valid_from}</td>
                        {canWrite && (
                          <td className="px-4 py-3 text-right">
                            <button
                              onClick={() => handleRemoveAssignment(a.id)}
                              className="p-1.5 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                              title="Remover asignación"
                            >
                              <X size={15} />
                            </button>
                          </td>
                        )}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ── TAB: HORAS EXTRAS ─────────────────────────────────────────────── */}
      {activeTab === 'overtime' && (
        <div className="space-y-5">
          {/* Filtros */}
          <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-4 flex flex-wrap gap-3 items-end">
            <div>
              <label className="block text-xs font-semibold text-gray-600 mb-1.5">Desde</label>
              <input
                type="date"
                value={otStartDate}
                onChange={(e) => setOtStartDate(e.target.value)}
                className="px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-gray-600 mb-1.5">Hasta</label>
              <input
                type="date"
                value={otEndDate}
                onChange={(e) => setOtEndDate(e.target.value)}
                className="px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
            <select
              value={otFilterSede}
              onChange={(e) => setOtFilterSede(e.target.value)}
              className="px-3 py-2 border border-gray-200 rounded-lg text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              <option value="">Todas las sedes</option>
              {sedes.map((s) => <option key={s} value={s}>{s}</option>)}
            </select>
            <div className="relative flex-1 min-w-[180px]">
              <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
              <input
                type="text"
                placeholder="Buscar empleado o DNI..."
                value={otFilterSearch}
                onChange={(e) => setOtFilterSearch(e.target.value)}
                className="w-full pl-9 pr-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
            <button
              onClick={loadOvertimeData}
              disabled={loadingOvertime}
              className="px-4 py-2 bg-blue-600 text-white rounded-xl hover:bg-blue-700 disabled:opacity-50 transition-colors text-sm font-medium flex items-center gap-2"
            >
              {loadingOvertime ? (
                <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white" />
              ) : (
                <Search size={15} />
              )}
              Buscar
            </button>
          </div>

          {/* Info: cargos con derecho a HE */}
          <div className="bg-orange-50 border border-orange-200 rounded-2xl p-4 flex items-start gap-3">
            <div className="w-7 h-7 bg-orange-100 rounded-full flex items-center justify-center shrink-0 mt-0.5">
              <TrendingUp size={14} className="text-orange-600" />
            </div>
            <div>
              <p className="text-xs font-semibold text-orange-800">Cargos con derecho a Horas Extras</p>
              <p className="text-[10px] text-orange-700 mt-1">
                Solo se calculan HE para:{' '}
                <span className="font-bold">AUXILIAR DE ALMACÉN · MONTACARGUISTA · CONFERENTE · COMPAGINADOR</span>.
                Los demás cargos no generan horas extras independientemente de la hora de salida.
              </p>
            </div>
          </div>

          {/* Cards resumen */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-5">
              <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">Total Horas Extra</p>
              <p className="text-2xl font-bold text-blue-600">{formatOvertimeHours(overtimeSummary.totalMins)}</p>
              <p className="text-xs text-gray-400 mt-1">en el periodo seleccionado</p>
            </div>
            <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-5">
              <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">Empleados con HE</p>
              <p className="text-2xl font-bold text-purple-600">{overtimeSummary.uniqueEmps}</p>
              <p className="text-xs text-gray-400 mt-1">personas con horas extras</p>
            </div>
            <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-5">
              <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">Registros con HE</p>
              <p className="text-2xl font-bold text-orange-500">{overtimeSummary.count}</p>
              <p className="text-xs text-gray-400 mt-1">de {overtimeRecords.length} registros totales</p>
            </div>
          </div>

          {/* Tabla */}
          <div className="bg-white rounded-2xl shadow-sm border border-gray-100">
            <div className="p-4 border-b border-gray-100">
              <h2 className="font-semibold text-gray-800 flex items-center gap-2">
                <TrendingUp size={16} className="text-orange-500" />
                Detalle de Horas Extras por Empleado
              </h2>
            </div>

            {loadingOvertime ? (
              <div className="flex justify-center py-16">
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600" />
              </div>
            ) : overtimeRecords.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-16 text-gray-400">
                <TrendingUp size={36} className="mb-2 opacity-30" />
                <p className="font-medium">No hay registros en el periodo seleccionado</p>
                <p className="text-sm">Ajusta los filtros y presiona Buscar</p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-gray-100 text-left">
                      <th className="px-4 py-3 font-semibold text-gray-600">Empleado</th>
                      <th className="px-4 py-3 font-semibold text-gray-600">Sede</th>
                      <th className="px-4 py-3 font-semibold text-gray-600 text-center">Fecha</th>
                      <th className="px-4 py-3 font-semibold text-gray-600 text-center">Entrada</th>
                      <th className="px-4 py-3 font-semibold text-gray-600 text-center">Salida Real</th>
                      <th className="px-4 py-3 font-semibold text-gray-600 text-center">Salida Prog.</th>
                      <th className="px-4 py-3 font-semibold text-gray-600 text-center">Horas Extra</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-50">
                    {overtimeRecords.map((r) => (
                      <tr key={r.id} className={`hover:bg-gray-50 transition-colors ${r.otMins > 0 ? 'bg-orange-50/30' : ''}`}>
                        <td className="px-4 py-3">
                          <p className="font-medium text-gray-800">{r.employee?.full_name}</p>
                          <p className="text-xs text-gray-400">{r.employee?.dni} · {r.employee?.position}</p>
                        </td>
                        <td className="px-4 py-3 text-gray-600 text-xs">{r.employee?.sede}</td>
                        <td className="px-4 py-3 text-center text-gray-600 font-mono text-xs">{r.work_date}</td>
                        <td className="px-4 py-3 text-center font-mono text-blue-600 text-xs font-semibold">
                          {toPeruTime(r.check_in)}
                        </td>
                        <td className="px-4 py-3 text-center font-mono text-purple-600 text-xs font-semibold">
                          {toPeruTime(r.check_out)}
                        </td>
                        <td className="px-4 py-3 text-center font-mono text-gray-500 text-xs">
                          {r.scheduledOut ? formatTime(r.scheduledOut) : <span className="text-gray-300 italic">sin horario</span>}
                        </td>
                        <td className="px-4 py-3 text-center">
                          {r.otMins > 0 ? (
                            <span className="inline-flex items-center gap-1 px-2.5 py-1 bg-orange-100 text-orange-700 rounded-lg text-xs font-bold">
                              <TrendingUp size={11} />
                              {formatOvertimeHours(r.otMins)}
                            </span>
                          ) : (
                            <span className="text-gray-300 text-xs">—</span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ── MODAL: CREAR/EDITAR HORARIO ────────────────────────────────────── */}
      {modalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between p-6 border-b border-gray-100">
              <h2 className="text-lg font-bold text-gray-900">
                {modalMode === 'create' ? 'Nuevo Horario' : 'Editar Horario'}
              </h2>
              <button onClick={() => setModalOpen(false)} className="p-2 hover:bg-gray-100 rounded-xl transition-colors">
                <X size={18} className="text-gray-500" />
              </button>
            </div>

            <div className="p-6 space-y-4">
              {/* Nombre */}
              <div>
                <label className="block text-xs font-semibold text-gray-600 mb-1.5">Nombre del Horario *</label>
                <input
                  type="text"
                  placeholder="ej. Horario Operativo Lima"
                  value={form.name}
                  onChange={(e) => setForm({ ...form, name: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>

              {/* Turno */}
              <div>
                <label className="block text-xs font-semibold text-gray-600 mb-1.5">Turno</label>
                <div className="flex gap-2">
                  {['', 'MAÑANA', 'TARDE', 'NOCHE'].map((t) => (
                    <button
                      key={t}
                      type="button"
                      onClick={() => setForm({ ...form, shift: t })}
                      className={`flex-1 py-2 rounded-lg text-xs font-semibold border transition-colors ${
                        form.shift === t
                          ? t === 'MAÑANA' ? 'bg-yellow-100 border-yellow-400 text-yellow-800'
                          : t === 'TARDE'  ? 'bg-orange-100 border-orange-400 text-orange-800'
                          : t === 'NOCHE'  ? 'bg-indigo-100 border-indigo-400 text-indigo-800'
                          : 'bg-gray-100 border-gray-400 text-gray-700'
                          : 'bg-white border-gray-200 text-gray-400 hover:border-gray-300'
                      }`}
                    >
                      {t === '' ? 'Sin turno' : t === 'MAÑANA' ? '☀ Mañana' : t === 'TARDE' ? '🌤 Tarde' : '🌙 Noche'}
                    </button>
                  ))}
                </div>
              </div>

              {/* Tipo de horario */}
              <div>
                <label className="block text-xs font-semibold text-gray-600 mb-1.5">Tipo de Horario</label>
                <div className="flex gap-2">
                  {[
                    { value: 'REGULAR', label: 'Regular', desc: 'Lun–Sáb', color: 'blue' },
                    { value: 'FERIADO', label: 'Feriado', desc: 'Un día feriado', color: 'red' },
                    { value: 'DOMINGO', label: 'Domingo', desc: 'Un domingo', color: 'purple' },
                  ].map((t) => (
                    <button
                      key={t.value}
                      type="button"
                      onClick={() => setForm({ ...form, schedule_type: t.value,
                        work_days: t.value === 'DOMINGO' ? [7] : t.value === 'FERIADO' ? [] : [1,2,3,4,5,6]
                      })}
                      className={`flex-1 py-2 px-2 rounded-lg text-xs font-semibold border transition-colors text-center ${
                        form.schedule_type === t.value
                          ? t.color === 'blue'   ? 'bg-blue-100 border-blue-400 text-blue-800'
                          : t.color === 'red'    ? 'bg-red-100 border-red-400 text-red-800'
                          : 'bg-purple-100 border-purple-400 text-purple-800'
                          : 'bg-white border-gray-200 text-gray-400 hover:border-gray-300'
                      }`}
                    >
                      <div>{t.label}</div>
                      <div className="text-[10px] font-normal opacity-70">{t.desc}</div>
                    </button>
                  ))}
                </div>
                {form.schedule_type !== 'REGULAR' && (
                  <div className={`mt-2 px-3 py-2 rounded-lg text-xs flex items-center gap-2 ${
                    form.schedule_type === 'FERIADO' ? 'bg-red-50 text-red-700' : 'bg-purple-50 text-purple-700'
                  }`}>
                    <span className="font-bold">⚡</span>
                    {form.schedule_type === 'FERIADO'
                      ? 'Se asignará por un solo día feriado. Se actualiza automáticamente al siguiente feriado.'
                      : 'Se asignará por un solo domingo. Se actualiza automáticamente al siguiente domingo.'}
                  </div>
                )}
              </div>

              {/* Días laborables (solo para REGULAR) */}
              {form.schedule_type === 'REGULAR' && (
                <div>
                  <label className="block text-xs font-semibold text-gray-600 mb-1.5">Días Laborables</label>
                  <div className="flex gap-1.5">
                    {[
                      { v: 1, l: 'L' }, { v: 2, l: 'M' }, { v: 3, l: 'X' },
                      { v: 4, l: 'J' }, { v: 5, l: 'V' }, { v: 6, l: 'S' }, { v: 7, l: 'D' }
                    ].map((d) => {
                      const active = (form.work_days || []).includes(d.v)
                      return (
                        <button
                          key={d.v}
                          type="button"
                          onClick={() => {
                            const days = form.work_days || []
                            setForm({ ...form, work_days: active ? days.filter(x => x !== d.v) : [...days, d.v].sort() })
                          }}
                          className={`w-9 h-9 rounded-lg text-xs font-bold border transition-colors ${
                            active
                              ? d.v === 7 ? 'bg-orange-100 border-orange-400 text-orange-800'
                                          : 'bg-blue-100 border-blue-400 text-blue-800'
                              : 'bg-white border-gray-200 text-gray-400'
                          }`}
                        >
                          {d.l}
                        </button>
                      )
                    })}
                  </div>
                </div>
              )}

              {/* Sede y Unidad */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-gray-600 mb-1.5">Sede (opcional)</label>
                  <select
                    value={form.sede}
                    onChange={(e) => setForm({ ...form, sede: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                  >
                    <option value="">Todas las sedes</option>
                    {sedes.map((s) => <option key={s} value={s}>{s}</option>)}
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-semibold text-gray-600 mb-1.5">Unidad (opcional)</label>
                  <select
                    value={form.business_unit}
                    onChange={(e) => setForm({ ...form, business_unit: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                  >
                    <option value="">Todas las unidades</option>
                    {businessUnits.map((u) => <option key={u} value={u}>{u}</option>)}
                  </select>
                </div>
              </div>

              {/* Cargo y Área */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-gray-600 mb-1">Cargo (opcional)</label>
                  <p className="text-[10px] text-gray-400 mb-1.5">Solo como referencia — no asigna automáticamente</p>
                  <input
                    type="text"
                    placeholder="ej. CHOFER"
                    value={form.position}
                    onChange={(e) => setForm({ ...form, position: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-gray-600 mb-1">Área (opcional)</label>
                  <p className="text-[10px] text-gray-400 mb-1.5">Solo como referencia — no asigna automáticamente</p>
                  <input
                    type="text"
                    placeholder="ej. OPERACIONES"
                    value={form.area}
                    onChange={(e) => setForm({ ...form, area: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>
              </div>

              {/* Horas entrada/salida */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-gray-600 mb-1.5">Hora de Entrada *</label>
                  <input
                    type="time"
                    value={form.check_in_time}
                    onChange={(e) => setForm({ ...form, check_in_time: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-gray-600 mb-1.5">Hora de Salida *</label>
                  <input
                    type="time"
                    value={form.check_out_time}
                    onChange={(e) => setForm({ ...form, check_out_time: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>
              </div>

              {/* Tolerancia */}
              <div>
                <label className="block text-xs font-semibold text-gray-600 mb-1.5">
                  Tolerancia de Tardanza (minutos)
                </label>
                <input
                  type="number"
                  min="0"
                  max="60"
                  value={form.tolerance_minutes}
                  onChange={(e) => setForm({ ...form, tolerance_minutes: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>

              {/* Bono puntualidad — solo OPL, automático */}
              <div className="border border-yellow-200 rounded-xl p-4 bg-yellow-50/60">
                <div className="flex items-start gap-3">
                  <div className="w-7 h-7 bg-yellow-100 rounded-full flex items-center justify-center shrink-0 mt-0.5">
                    <span className="text-yellow-600 text-sm font-bold">★</span>
                  </div>
                  <div className="flex-1">
                    <p className="text-xs font-semibold text-yellow-800">Bono de Puntualidad — Automático</p>
                    <p className="text-[10px] text-yellow-700 mt-1 leading-relaxed">
                      Solo aplica a empleados con unidad de negocio <span className="font-bold">OPL</span>.
                      El rango se calcula automáticamente: <span className="font-bold">10 min antes</span> de la hora de entrada hasta la hora de entrada.
                    </p>
                    {form.check_in_time && (() => {
                      const [h, m] = form.check_in_time.split(':').map(Number)
                      const endTotal = h * 60 + m
                      const startTotal = endTotal - 10
                      const sh = String(Math.floor(startTotal / 60)).padStart(2, '0')
                      const sm = String(startTotal % 60).padStart(2, '0')
                      const eh = String(Math.floor(endTotal / 60)).padStart(2, '0')
                      const em = String(endTotal % 60).padStart(2, '0')
                      return (
                        <p className="mt-2 text-[11px] font-semibold text-yellow-800">
                          Rango calculado: <span className="bg-yellow-200 px-1.5 py-0.5 rounded font-mono">{sh}:{sm} — {eh}:{em}</span>
                        </p>
                      )
                    })()}
                  </div>
                </div>
              </div>

              {/* Estado */}
              <label className="flex items-center gap-3 cursor-pointer">
                <div
                  onClick={() => setForm({ ...form, is_active: !form.is_active })}
                  className={`w-10 h-5 rounded-full transition-colors ${form.is_active ? 'bg-blue-600' : 'bg-gray-300'}`}
                >
                  <div className={`w-4 h-4 bg-white rounded-full mt-0.5 transition-transform shadow-sm ${form.is_active ? 'translate-x-5' : 'translate-x-0.5'}`} />
                </div>
                <span className="text-sm text-gray-700 font-medium">Horario activo</span>
              </label>
            </div>

            <div className="flex gap-3 p-6 pt-0">
              <button
                onClick={() => setModalOpen(false)}
                className="flex-1 px-4 py-2 border border-gray-200 text-gray-700 rounded-xl hover:bg-gray-50 transition-colors text-sm font-medium"
              >
                Cancelar
              </button>
              <button
                onClick={handleSave}
                disabled={saving}
                className="flex-1 px-4 py-2 bg-blue-600 text-white rounded-xl hover:bg-blue-700 disabled:opacity-50 transition-colors text-sm font-medium flex items-center justify-center gap-2"
              >
                {saving ? (
                  <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white" />
                ) : (
                  <Check size={15} />
                )}
                {modalMode === 'create' ? 'Crear Horario' : 'Guardar Cambios'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── MODAL: CONFIRMACIÓN BORRADO ─────────────────────────────────────── */}
      {deleteConfirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4">
          <div className="bg-white rounded-2xl shadow-2xl p-6 max-w-sm w-full">
            <div className="flex items-start gap-4 mb-5">
              <div className="w-10 h-10 bg-red-100 rounded-full flex items-center justify-center shrink-0">
                <AlertCircle size={20} className="text-red-600" />
              </div>
              <div>
                <h3 className="font-bold text-gray-900">Eliminar Horario</h3>
                <p className="text-sm text-gray-500 mt-1">
                  ¿Eliminar <span className="font-semibold text-gray-800">"{deleteConfirm.name}"</span>?
                  Las asignaciones activas perderán su referencia.
                </p>
              </div>
            </div>
            <div className="flex gap-3">
              <button
                onClick={() => setDeleteConfirm(null)}
                className="flex-1 px-4 py-2 border border-gray-200 text-gray-700 rounded-xl hover:bg-gray-50 transition-colors text-sm font-medium"
              >
                Cancelar
              </button>
              <button
                onClick={handleDelete}
                className="flex-1 px-4 py-2 bg-red-600 text-white rounded-xl hover:bg-red-700 transition-colors text-sm font-medium"
              >
                Eliminar
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
