-- Migration to fix Hierarchy RPC and Papeleta PDF generation logic
-- Created: 2026-03-08

-- 1. RPC para obtener jerarquía con bypass de RLS y corrección de nombre de columna 'position'
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

-- 2. Función auxiliar para bypass RLS específico del supervisor
CREATE OR REPLACE FUNCTION public.get_supervisor_data_bypass_rls(p_supervisor_id UUID)
RETURNS TABLE (
    full_name TEXT,
    dni TEXT,
    emp_position TEXT 
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    RETURN QUERY 
    SELECT e.full_name, e.dni, e.position 
    FROM public.employees e 
    WHERE e.id = p_supervisor_id;
END;
$$;

-- 3. Función principal para determinar la autoridad firmante (Papeleta)
CREATE OR REPLACE FUNCTION public.get_signing_authority(p_employee_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_supervisor_id UUID;
    v_signer RECORD;
    v_requester_name TEXT;
BEGIN
    -- Obtener ID del supervisor
    SELECT supervisor_id, full_name INTO v_supervisor_id, v_requester_name
    FROM public.employees WHERE id = p_employee_id;
    
    IF NOT FOUND THEN RETURN jsonb_build_object('found', false, 'rule', 'EMPLOYEE_NOT_FOUND'); END IF;

    -- Si hay supervisor asignado
    IF v_supervisor_id IS NOT NULL THEN
        -- USAR LA FUNCIÓN BYPASS (Crítico para que funcione)
        SELECT * INTO v_signer FROM public.get_supervisor_data_bypass_rls(v_supervisor_id);
        
        IF v_signer IS NOT NULL THEN
            RETURN jsonb_build_object(
                'found', true,
                'rule', 'DIRECT_SUPERVISOR_MATCH_BYPASS',
                'full_name', v_signer.full_name,
                'dni', v_signer.dni,
                'position', v_signer.emp_position, -- Mapeo de vuelta
                'is_direct', true,
                'debug_sup_id', v_supervisor_id
            );
        ELSE
            -- Si ni siquiera con bypass lo encuentra
            RETURN jsonb_build_object(
                'found', false,
                'rule', 'SUPERVISOR_NOT_FOUND_EVEN_WITH_BYPASS',
                'full_name', 'GIANCARLO URBINA GAITAN',
                'dni', '18161904',
                'position', 'REPRESENTANTE LEGAL',
                'debug_sup_id', v_supervisor_id
            );
        END IF;
    END IF;

    -- Fallback
    RETURN jsonb_build_object(
        'found', false,
        'rule', 'NO_SUPERVISOR_ASSIGNED',
        'full_name', 'GIANCARLO URBINA GAITAN',
        'dni', '18161904',
        'position', 'REPRESENTANTE LEGAL',
        'debug_emp_name', v_requester_name
    );
END;
$$;
