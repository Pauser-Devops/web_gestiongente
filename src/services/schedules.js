import { supabase } from '../lib/supabase'

// ── Horarios base ────────────────────────────────────────────────────────────

export const getSchedules = async () => {
  const { data, error } = await supabase
    .from('work_schedules')
    .select('*')
    .order('created_at', { ascending: false })
  return { data, error }
}

export const createSchedule = async (scheduleData) => {
  const { data, error } = await supabase
    .from('work_schedules')
    .insert([scheduleData])
    .select()
    .single()
  return { data, error }
}

export const updateSchedule = async (id, updates) => {
  const { data, error } = await supabase
    .from('work_schedules')
    .update({ ...updates, updated_at: new Date().toISOString() })
    .eq('id', id)
    .select()
    .single()
  return { data, error }
}

export const deleteSchedule = async (id) => {
  const { data, error } = await supabase
    .from('work_schedules')
    .delete()
    .eq('id', id)
  return { data, error }
}

// ── Asignaciones ─────────────────────────────────────────────────────────────

export const getScheduleAssignments = async () => {
  const { data, error } = await supabase
    .from('employee_schedule_assignments')
    .select(`
      id, valid_from, valid_to, notes, created_at,
      employee:employee_id (id, full_name, dni, sede, business_unit, position),
      schedule:schedule_id (id, name, check_in_time, check_out_time)
    `)
    .is('valid_to', null)
    .order('created_at', { ascending: false })
  return { data, error }
}

export const getHistoricalAssignments = async (employeeIds = []) => {
  let query = supabase
    .from('employee_schedule_assignments')
    .select(`
      id, employee_id, valid_from, valid_to,
      schedule:schedule_id (id, name, check_in_time, check_out_time)
    `)
  if (employeeIds.length > 0) {
    query = query.in('employee_id', employeeIds)
  }
  const { data, error } = await query
  return { data, error }
}

export const assignScheduleToEmployees = async (employeeIds, scheduleId, assignedById, notes = null) => {
  const today = new Date().toISOString().split('T')[0]

  // Cerrar asignaciones abiertas de esos empleados
  await supabase
    .from('employee_schedule_assignments')
    .update({ valid_to: today })
    .in('employee_id', employeeIds)
    .is('valid_to', null)

  // Crear nuevas asignaciones
  const assignments = employeeIds.map((empId) => ({
    employee_id: empId,
    schedule_id: scheduleId,
    valid_from: today,
    assigned_by: assignedById,
    notes,
  }))

  const { data, error } = await supabase
    .from('employee_schedule_assignments')
    .insert(assignments)
    .select()
  return { data, error }
}

export const removeScheduleAssignment = async (assignmentId) => {
  const today = new Date().toISOString().split('T')[0]
  const { data, error } = await supabase
    .from('employee_schedule_assignments')
    .update({ valid_to: today })
    .eq('id', assignmentId)
  return { data, error }
}

// ── Horas extras ─────────────────────────────────────────────────────────────

export const getAttendanceForOvertime = async ({ startDate, endDate } = {}) => {
  const defaultStart = new Date()
  defaultStart.setDate(defaultStart.getDate() - 30)

  const from = startDate || defaultStart.toISOString().split('T')[0]
  const to = endDate || new Date().toISOString().split('T')[0]

  const { data, error } = await supabase
    .from('attendance')
    .select(`
      id, work_date, check_in, check_out, status, is_late,
      employee:employee_id (id, full_name, dni, sede, business_unit, position)
    `)
    .not('check_out', 'is', null)
    .gte('work_date', from)
    .lte('work_date', to)
    .order('work_date', { ascending: false })
    .limit(1000)

  return { data, error }
}

// ── Helpers ──────────────────────────────────────────────────────────────────

/**
 * Calcula minutos de horas extras dado un check_out (ISO) y una hora programada ('HH:MM:SS')
 */
export const calcOvertimeMinutes = (checkOutISO, scheduledCheckOutTime) => {
  if (!checkOutISO || !scheduledCheckOutTime) return 0

  const checkOut = new Date(checkOutISO)
  const checkOutPeru = checkOut.toLocaleTimeString('es-PE', {
    timeZone: 'America/Lima',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  })

  const toMins = (t) => {
    const [h, m] = t.substring(0, 5).split(':').map(Number)
    return h * 60 + m
  }

  const actual = toMins(checkOutPeru)
  const scheduled = toMins(scheduledCheckOutTime)

  return Math.max(0, actual - scheduled)
}

export const formatOvertimeHours = (minutes) => {
  if (!minutes || minutes <= 0) return '0h 0m'
  const h = Math.floor(minutes / 60)
  const m = minutes % 60
  return `${h}h ${m}m`
}
