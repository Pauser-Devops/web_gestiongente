import { supabase } from '../lib/supabase'

export const createEmployee = async (employeeData) => {
  const { data, error } = await supabase
    .from('employees')
    .insert([employeeData])
    .select()

  if (error) {
    console.error("Error creating employee in Supabase:", error)
    throw error // Re-lanzar para que el catch del componente lo atrape
  }
  
  return { data, error: null }
}

export const getEmployees = async () => {
  const { data, error } = await supabase
    .from('employees')
    .select('*')
    .order('created_at', { ascending: false })
  
  return { data, error }
}

// Obtener un solo empleado por ID
export const getEmployeeById = async (id) => {
  const { data, error } = await supabase
    .from('employees')
    .select('*')
    .eq('id', id)
    .single()
  
  return { data, error }
}

// Actualizar empleado
export const updateEmployee = async (id, employeeData) => {
  const { data, error } = await supabase
    .from('employees')
    .update(employeeData)
    .eq('id', id)
    .select()
  
  return { data, error }
}

// Eliminar empleado
export const deleteEmployee = async (id) => {
  const { error } = await supabase
    .from('employees')
    .delete()
    .eq('id', id)
  
  return { error }
}

// -----------------------------------------------------------------------------
// HIERARCHY MANAGEMENT (SUPERVISORES)
// -----------------------------------------------------------------------------

/**
 * Asignar supervisor masivamente a un grupo de empleados
 * @param {string} supervisorId - UUID del supervisor
 * @param {string[]} employeeIds - Array de UUIDs de empleados
 */
export const assignSupervisorBulk = async (supervisorId, employeeIds) => {
  try {
    const { data, error } = await supabase.rpc('assign_supervisor_bulk', {
      p_supervisor_id: supervisorId,
      p_employee_ids: employeeIds
    })

    if (error) throw error
    return { data, error: null }
  } catch (error) {
    console.error('Error in assignSupervisorBulk:', error)
    return { data: null, error }
  }
}

/**
 * Obtener empleados con información de su supervisor actual
 */
export const getEmployeesWithSupervisor = async () => {
  try {
    // Usar RPC segura para obtener nombres de jefes incluso si RLS los oculta
    const { data, error } = await supabase.rpc('get_employees_hierarchy_data')

    if (error) throw error

    // Enriquecimiento manual de Áreas (Position -> Area)
    const { data: positions } = await supabase
      .from('job_positions')
      .select('name, areas(name)')
    
    const positionAreaMap = {}
    if (positions) {
      positions.forEach(pos => {
        if (pos.name) {
          positionAreaMap[pos.name] = pos.areas?.name || 'Sin Área'
        }
      })
    }

    const enrichedData = data.map(emp => ({
      ...emp,
      position: emp.emp_position, // Mapear de vuelta para compatibilidad
      area_name: positionAreaMap[emp.emp_position] || 'Sin Área',
      // Mapear estructura plana de RPC a objeto supervisor anidado para compatibilidad
      supervisor: emp.supervisor_id ? {
        id: emp.supervisor_id,
        full_name: emp.supervisor_name || 'Usuario Inactivo/Borrado',
        position: emp.sup_position
      } : null
    }))

    return { data: enrichedData, error: null }
  } catch (error) {
    console.error('Error fetching employees with supervisor:', error)
    return { data: null, error }
  }
}
