-- ==============================================================================
-- CORRECCIÓN DEFINITIVA DE JERARQUÍA (RELAJANDO is_active)
-- ==============================================================================

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
    -- 1. Obtener explícitamente el supervisor_id
    SELECT supervisor_id, full_name 
    INTO v_supervisor_id, v_requester_name
    FROM public.employees 
    WHERE id = p_employee_id;
    
    IF NOT FOUND THEN
        RETURN jsonb_build_object('found', false, 'rule', 'EMPLOYEE_NOT_FOUND');
    END IF;

    -- 2. Verificar si tiene supervisor asignado
    IF v_supervisor_id IS NOT NULL THEN
        -- CORRECCIÓN: Quitamos el "AND is_active = true" temporalmente para probar
        -- Si el jefe existe, debe salir, aunque esté "inactivo" por error en RRHH.
        SELECT * INTO v_signer 
        FROM public.employees 
        WHERE id = v_supervisor_id; 
        
        IF v_signer IS NOT NULL THEN
            RETURN jsonb_build_object(
                'found', true,
                'rule', 'DIRECT_SUPERVISOR_MATCH',
                'full_name', v_signer.full_name,
                'dni', v_signer.dni,
                'position', v_signer.position,
                'is_direct', true,
                'debug_sup_id', v_supervisor_id
            );
        ELSE
            -- Si llegamos aquí, el ID existe en employees.supervisor_id pero NO en la tabla employees (integridad rota)
            RETURN jsonb_build_object(
                'found', false,
                'rule', 'SUPERVISOR_ID_NOT_EXIST_IN_DB',
                'full_name', 'GIANCARLO URBINA GAITAN',
                'dni', '18161904',
                'position', 'REPRESENTANTE LEGAL',
                'debug_sup_id', v_supervisor_id
            );
        END IF;
    END IF;

    -- 3. Fallback General
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
