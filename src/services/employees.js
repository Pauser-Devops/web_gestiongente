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
    // Necesitamos obtener el área del empleado. El área está vinculada al cargo (job_positions).
    // Hacemos join con employees -> job_positions (por nombre) -> areas
    // Ojo: position en employees es texto plano desnormalizado, lo que complica el join directo si no es FK.
    // Asumiremos que tenemos que hacer un cruce manual o que la RPC lo maneje.
    // Para simplificar y ser robustos, traemos todo y cruzamos con getPositions si es necesario, 
    // pero mejor aún, intentemos traer el área si existe relación.
    
    // Si 'position' es solo texto, no podemos hacer join directo a job_positions fácil en una sola query sin FK.
    // Solución: Traeremos los empleados y luego enriquecemos con el área en el cliente usando el catálogo de cargos.
    
    const { data, error } = await supabase
      .from('employees')
      .select(`
        id, 
        full_name, 
        dni, 
        position, 
        sede, 
        business_unit, 
        profile_picture_url,
        supervisor_id,
        supervisor:employees!supervisor_id (
          id, full_name, position, sede
        )
      `)
      .eq('is_active', true)
      .order('full_name')

    if (error) throw error

    // Enriquecimiento manual de Áreas (Position -> Area)
    // Esto es necesario porque 'position' en employees no es FK
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
      area_name: positionAreaMap[emp.position] || 'Sin Área'
    }))

    return { data: enrichedData, error: null }
  } catch (error) {
    console.error('Error fetching employees with supervisor:', error)
    return { data: null, error }
  }
}
