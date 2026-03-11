import { supabase } from '../lib/supabase'

export const getSigningAuthority = async (employeeId) => {
  try {
    const { data, error } = await supabase.rpc('get_signing_authority', {
      p_employee_id: employeeId
    })

    if (error) throw error
    return { data, error: null }
  } catch (error) {
    console.error('Error fetching signing authority:', error)
    return { data: null, error }
  }
}

export const getPapeletaById = async (id) => {
  try {
    const { data, error } = await supabase
      .from('vacation_requests')
      .select(`
        *,
        employees!vacation_requests_employee_id_fkey (
          full_name,
          dni,
          position,
          sede,
          email
        )
      `)
      .eq('id', id)
      .single()

    if (error) throw error
    return { data, error: null }
  } catch (error) {
    console.error('Error fetching papeleta:', error)
    return { data: null, error }
  }
}

export const updateRequestStatus = async (id, status, userId) => {
  try {
    const updateData = { 
      status: status,
      validated_by: userId,
      validated_at: new Date().toISOString() // Ahora sí guardamos la fecha
    }

    const { data, error } = await supabase
      .from('vacation_requests')
      .update(updateData)
      .eq('id', id)
      .select()

    if (error) throw error
    return { data, error: null }
  } catch (error) {
    console.error('Error updating request status:', error)
    return { data: null, error }
  }
}

export const getRequests = async () => {
  try {
    // 1. Intentar traer todo con Join explícito
    const { data, error } = await supabase
      .from('vacation_requests')
      .select(`
        *,
        employees!vacation_requests_employee_id_fkey (
          full_name,
          dni,
          position,
          sede,
          business_unit,
          profile_picture_url,
          email
        ),
        approver:employees!vacation_requests_validated_by_fkey (
          full_name,
          sede,
          business_unit,
          position
        )
      `)
      .order('created_at', { ascending: false })

    if (error) {
      console.error('Supabase error fetching requests:', error)
      throw error
    }

    return { data, error: null }
  } catch (error) {
    console.error('Error fetching requests:', error)
    return { data: [], error }
  }
}
