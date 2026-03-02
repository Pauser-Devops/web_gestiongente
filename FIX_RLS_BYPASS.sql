-- ==============================================================================
-- CORRECCIÓN DE SEGURIDAD (BYPASS RLS PARA SUPERVISORES) - VERSIÓN CORREGIDA
-- ==============================================================================

-- 1. Crear función con SECURITY DEFINER que se salta RLS explícitamente
-- NOTA: "position" es palabra reservada, usamos "emp_position"
CREATE OR REPLACE FUNCTION public.get_supervisor_data_bypass_rls(p_supervisor_id UUID)
RETURNS TABLE (
    full_name TEXT,
    dni TEXT,
    emp_position TEXT 
)
LANGUAGE plpgsql
SECURITY DEFINER -- Esto es CLAVE: ejecuta como el creador (postgres), no como el usuario web
SET search_path = public
AS $$
BEGIN
    RETURN QUERY 
    SELECT e.full_name, e.dni, e.position 
    FROM public.employees e 
    WHERE e.id = p_supervisor_id;
END;
$$;

-- 2. Actualizar la función principal para usar este BYPASS
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
                'position', v_signer.emp_position, -- Aquí mapeamos emp_position de vuelta a position
                'is_direct', true,
                'debug_sup_id', v_supervisor_id
            );
        ELSE
            -- Si ni siquiera con bypass lo encuentra, el ID es inválido
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
