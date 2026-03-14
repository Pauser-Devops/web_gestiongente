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

  // 1. Obtener el horario nuevo para saber sus work_days y tipo
  const { data: newSchedule } = await supabase
    .from('work_schedules')
    .select('work_days, schedule_type, target_date')
    .eq('id', scheduleId)
    .single()

  const newWorkDays = newSchedule?.work_days || [1, 2, 3, 4, 5, 6]
  const isSpecial = newSchedule?.schedule_type !== 'REGULAR'
  const targetDate = newSchedule?.target_date

  // 2. Obtener asignaciones abiertas con sus work_days
  const { data: current } = await supabase
    .from('employee_schedule_assignments')
    .select('id, employee_id, schedule:schedule_id(work_days, schedule_type)')
    .in('employee_id', employeeIds)
    .is('valid_to', null)

  // 3. Cerrar solo las asignaciones que solapan en días con el nuevo horario
  //    - Si el nuevo es REGULAR: cerrar las que compartan algún día laborable
  //    - Si el nuevo es FERIADO/DOMINGO: no cerrar regulares, solo especiales del mismo tipo
  const toClose = (current || [])
    .filter((a) => {
      const existDays = a.schedule?.work_days || [1, 2, 3, 4, 5, 6]
      const existType = a.schedule?.schedule_type || 'REGULAR'
      if (isSpecial) return existType === newSchedule?.schedule_type  // solo cierra del mismo tipo especial
      return existDays.some((d) => newWorkDays.includes(d))           // cierra si comparten días
    })
    .map((a) => a.id)

  if (toClose.length > 0) {
    await supabase
      .from('employee_schedule_assignments')
      .update({ valid_to: today })
      .in('id', toClose)
  }

  // 4. Crear nuevas asignaciones
  //    Especiales: válidas solo el día del evento (valid_from = valid_to = target_date)
  //    Regulares:  válidas indefinidamente (valid_to = null)
  const validFrom = isSpecial && targetDate ? targetDate : today
  const validTo   = isSpecial && targetDate ? targetDate : null

  const assignments = employeeIds.map((empId) => ({
    employee_id: empId,
    schedule_id: scheduleId,
    valid_from:  validFrom,
    valid_to:    validTo,
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
