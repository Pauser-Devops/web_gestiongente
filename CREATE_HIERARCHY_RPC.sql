-- ==============================================================================
-- RPC PARA OBTENER JERARQUÍA CON BYPASS DE RLS (VERSIÓN CORREGIDA)
-- ==============================================================================

CREATE OR REPLACE FUNCTION public.get_employees_hierarchy_data()
RETURNS TABLE (
    id UUID,
    full_name TEXT,
    dni TEXT,
    emp_position TEXT, -- Renombrado para evitar conflicto con palabra reservada 'position'
    sede TEXT,
    business_unit TEXT,
    profile_picture_url TEXT,
    supervisor_id UUID,
    supervisor_name TEXT,
    sup_position TEXT, -- Renombrado para consistencia
    is_active BOOLEAN
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    RETURN QUERY
    SELECT 
        e.id,
        e.full_name,
        e.dni,
        e.position AS emp_position,
        e.sede,
        e.business_unit,
        e.profile_picture_url,
        e.supervisor_id,
        s.full_name AS supervisor_name,
        s.position AS sup_position,
        e.is_active
    FROM public.employees e
    LEFT JOIN public.employees s ON e.supervisor_id = s.id
    WHERE e.is_active = true
    ORDER BY e.full_name;
END;
$$;
