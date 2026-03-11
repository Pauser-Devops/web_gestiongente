import { supabase } from '../lib/supabase'

// --- GESTIÓN DE ROLES ---

export const getRoles = async () => {
  const { data, error } = await supabase
    .from('roles')
    .select('*')
    .order('name')

  return { data, error }
}

export const createRole = async (roleData) => {
  const { data, error } = await supabase
    .from('roles')
    .insert([roleData])
    .select()
    .single()
  
  return { data, error }
}

export const updateRole = async (id, updates) => {
  const { data, error } = await supabase
    .from('roles')
    .update(updates)
    .eq('id', id)
    .select()
    .single()
  
  return { data, error }
}

export const deleteRole = async (id) => {
  const { error } = await supabase
    .from('roles')
    .delete()
    .eq('id', id)
  
  return { error }
}

// --- GESTIÓN DE USUARIOS POR ROL ---

export const getUsersByRole = async (roleId, roleName) => {
  // 1. Intentar buscar por ID de rol (Relación directa FK)
  let { data, error } = await supabase
    .from('employees')
    .select('id, full_name, email, position, profile_picture_url, role_id')
    .eq('role_id', roleId)
    .order('full_name')

  // 2. Si no hay resultados y tenemos nombre, buscar por coincidencia de texto en campos 'role' o 'position'
  // Esto es un fallback por si la FK role_id es nula pero el texto coincide
  if ((!data || data.length === 0) && roleName) {
      // Usamos .or con ilike para mayor flexibilidad
      const { data: dataByName, error: errorByName } = await supabase
        .from('employees')
        .select('id, full_name, email, position, profile_picture_url, role_id')
        .or(`role.eq.${roleName},position.eq.${roleName}`) 
        .order('full_name')
      
      if (dataByName && dataByName.length > 0) {
          data = dataByName;
          // Si encontramos por nombre, no consideramos el error anterior de ID
          error = errorByName; 
      }
  }
  
  return { data, error }
}

// Obtener usuarios SIN rol asignado (útil para asignar)
export const getUsersWithoutRole = async () => {
  const { data, error } = await supabase
    .from('employees')
    .select('id, full_name, email, position')
    .is('role_id', null)
    .order('full_name')

  return { data, error }
}

export const assignRoleToUser = async (userId, roleId) => {
  const { data, error } = await supabase
    .from('employees')
    .update({ role_id: roleId })
    .eq('id', userId)
    .select()
  
  return { data, error }
}

// Función auxiliar para buscar usuarios por nombre (para el selector)
export const searchUsers = async (query) => {
  const { data, error } = await supabase
    .from('employees')
    .select('id, full_name, role_id')
    .ilike('full_name', `%${query}%`)
    .limit(10)
    
  return { data, error }
}
