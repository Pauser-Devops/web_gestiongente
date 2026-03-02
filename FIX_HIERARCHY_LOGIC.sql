-- ==============================================================================
-- CORRECCIÓN DE LÓGICA DE JERARQUÍA (PRIORIDAD DE ASIGNACIÓN MANUAL)
-- Fecha: 02/03/2026
-- Descripción: Actualiza la función get_signing_authority para garantizar que
-- si un empleado tiene un supervisor_id asignado, este tenga prioridad sobre
-- cualquier regla de texto (legacy).
-- ==============================================================================

-- 1. Asegurar que la columna existe (Idempotente)
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='employees' AND column_name='supervisor_id') THEN
        ALTER TABLE public.employees ADD COLUMN supervisor_id UUID REFERENCES public.employees(id);
    END IF;
END $$;

-- 2. Actualizar función de autoridad de firma con PRIORIDAD ESTRICTA
CREATE OR REPLACE FUNCTION public.get_signing_authority(p_employee_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_requester RECORD;
    v_signer RECORD;
    v_rule TEXT;
    v_pos TEXT;
BEGIN
    -- Obtener datos del solicitante
    SELECT * INTO v_requester FROM public.employees WHERE id = p_employee_id;
    
    IF v_requester IS NULL THEN
        RAISE EXCEPTION 'Employee not found';
    END IF;

    -- ==================================================================================
    -- PRIORIDAD 1: SUPERVISOR ASIGNADO MANUALMENTE (Base de Datos)
    -- ==================================================================================
    IF v_requester.supervisor_id IS NOT NULL THEN
        -- Buscar al supervisor asignado
        SELECT * INTO v_signer 
        FROM public.employees 
        WHERE id = v_requester.supervisor_id 
        AND is_active = true;
        
        -- Si existe y está activo, ÉL ES LA AUTORIDAD, sin importar el cargo del solicitante.
        IF v_signer IS NOT NULL THEN
            RETURN jsonb_build_object(
                'found', true,
                'rule', 'DIRECT: SUPERVISOR ASIGNADO MANUALMENTE',
                'full_name', v_signer.full_name,
                'dni', v_signer.dni,
                'position', v_signer.position,
                'is_direct', true
            );
        END IF;
    END IF;

    -- ==================================================================================
    -- PRIORIDAD 2: REGLAS DE TEXTO (LEGACY / FALLBACK)
    -- Solo se ejecutan si NO hay supervisor asignado o el asignado está inactivo
    -- ==================================================================================
    
    -- Normalizar cargo
    v_pos := UPPER(v_requester.position);

    -- ... (Aquí pegamos las reglas legacy existentes para mantener compatibilidad) ...

    -------------------------------------------------------------------------
    -- AREA: MEJORA CONTÍNUA
    -------------------------------------------------------------------------
    IF v_pos LIKE '%ESPECIALISTA DE DESARROLLO%'
       OR v_pos LIKE '%ESPECIALISTA DE PROCESOS%'
       OR v_pos LIKE '%ASISTENTE DE DESARROLLO%'
       OR v_pos LIKE '%TRAINEE DE DESARROLLO%'
       THEN
        v_rule := 'MEJORA CONTINUA: STAFF -> GERENTE GENERAL';
        SELECT * INTO v_signer FROM public.employees WHERE position ILIKE '%GERENTE GENERAL%' AND is_active = true LIMIT 1;

    -------------------------------------------------------------------------
    -- AREA: JEFATURAS (REGLA QUE PODRÍA ESTAR CAUSANDO EL CONFLICTO)
    -------------------------------------------------------------------------
    ELSIF v_pos LIKE '%JEFE DE OPERACIONES%'
       OR v_pos LIKE '%JEFE COMERCIAL%'
       OR v_pos LIKE '%JEFE DE GENTE Y GESTIÓN%'
       OR v_pos LIKE '%JEFE DE ADMINISTRACIÓN Y FINANZAS%'
       THEN
        v_rule := 'JEFATURAS: JEFE AREA -> GERENTE GENERAL';
        SELECT * INTO v_signer FROM public.employees WHERE position ILIKE '%GERENTE GENERAL%' AND is_active = true LIMIT 1;

    -------------------------------------------------------------------------
    -- AREA: GENTE Y GESTIÓN
    -------------------------------------------------------------------------
    ELSIF v_pos LIKE '%ANALISTA DE SEGURIDAD Y SALUD%' THEN
        v_rule := 'GENTE: ANALISTA SST -> COORDINADOR SST';
        SELECT * INTO v_signer FROM public.employees WHERE position ILIKE '%COORDINADOR DE SEGURIDAD Y SALUD%' AND is_active = true LIMIT 1;

    ELSIF v_pos LIKE '%ANALISTA DE GENTE Y GESTIÓN%' OR v_pos LIKE '%ANALISTA DE RECLUTAMIENTO%' OR v_pos LIKE '%COORDINADOR DE SEGURIDAD Y SALUD%' THEN
        v_rule := 'GENTE: STAFF -> JEFE GENTE Y GESTION';
        
        -- Regla Específica para Analistas de Gente en Sedes
        -- Deben reportar al Jefe de Gente y Gestión, pero si no hay uno específico, buscar al Gerente de Gente y Gestión
        -- O al jefe inmediato si está definido.
        -- En este caso, buscaremos explícitamente al JEFE DE GENTE Y GESTIÓN.
        SELECT * INTO v_signer FROM public.employees WHERE position ILIKE '%JEFE DE GENTE Y GESTIÓN%' AND is_active = true LIMIT 1;
        
        -- Fallback: Si no hay Jefe de Gente, buscar al GERENTE DE GENTE Y GESTIÓN
        IF v_signer IS NULL THEN
             SELECT * INTO v_signer FROM public.employees WHERE position ILIKE '%GERENTE DE GENTE Y GESTIÓN%' AND is_active = true LIMIT 1;
        END IF;

    -------------------------------------------------------------------------
    -- AREA: ADMINISTRACIÓN Y FINANZAS
    -------------------------------------------------------------------------
    ELSIF v_pos LIKE '%ANALISTA DE CAJA Y BANCOS%' THEN
        v_rule := 'FINANZAS: CAJA -> SUPERVISOR TESORERIA';
        SELECT * INTO v_signer FROM public.employees WHERE position ILIKE '%SUPERVISOR DE TESORERÍA%' AND is_active = true LIMIT 1;

    ELSIF v_pos LIKE '%ANALISTA ADMINISTRATIVO Y PROCESOS%' OR v_pos LIKE '%CAJERO%' THEN
        v_rule := 'FINANZAS: ANALISTA/CAJERO -> SUPERVISOR PLANEAMIENTO';
        SELECT * INTO v_signer FROM public.employees WHERE position ILIKE '%SUPERVISOR DE PLANEAMIENTO FINANCIERO%' AND is_active = true LIMIT 1;

    ELSIF v_pos LIKE '%SUPERVISOR DE PLANEAMIENTO FINANCIERO%' OR v_pos LIKE '%SUPERVISOR DE TESORERÍA%' OR v_pos LIKE '%ANALISTA DE GESTIÓN ADMINISTRATIVA%' OR v_pos LIKE '%ANALISTA DE CONTROL FINANCIERO%' OR v_pos LIKE '%ANALISTA REVENUE%' OR v_pos LIKE '%ANALISTA DE COSTOS%' THEN
        v_rule := 'FINANZAS: SUPERVISOR/ANALISTA -> JEFE ADM Y FINANZAS';
        SELECT * INTO v_signer FROM public.employees WHERE position ILIKE '%JEFE DE ADMINISTRACIÓN Y FINANZAS%' AND is_active = true LIMIT 1;

    -------------------------------------------------------------------------
    -- AREA: COMERCIAL
    -------------------------------------------------------------------------
    ELSIF v_pos LIKE '%VENDEDOR%' OR v_pos LIKE '%TELEVENTAS%' OR v_pos LIKE '%AUTOVENTAS%' THEN
        v_rule := 'COMERCIAL: VENDEDOR -> SUPERVISOR VENTAS';
        SELECT * INTO v_signer FROM public.employees WHERE position ILIKE '%SUPERVISOR DE VENTAS%' AND sede = v_requester.sede AND is_active = true LIMIT 1;
        -- Fallback
        IF v_signer IS NULL THEN
             SELECT * INTO v_signer FROM public.employees WHERE position ILIKE '%SUPERVISOR DE VENTAS%' AND is_active = true LIMIT 1;
        END IF;

    ELSIF v_pos LIKE '%MERCADERISTA%' THEN
        v_rule := 'COMERCIAL: MERCADERISTA -> SUPERVISOR TRADE';
        SELECT * INTO v_signer FROM public.employees WHERE position ILIKE '%SUPERVISOR TRADE MARKETING%' AND sede = v_requester.sede AND is_active = true LIMIT 1;
        -- Fallback
        IF v_signer IS NULL THEN
             SELECT * INTO v_signer FROM public.employees WHERE position ILIKE '%SUPERVISOR TRADE MARKETING%' AND is_active = true LIMIT 1;
        END IF;

    ELSIF v_pos LIKE '%SUPERVISOR DE VENTAS%' OR v_pos LIKE '%SUPERVISOR TRADE%' THEN
        v_rule := 'COMERCIAL: SUPERVISOR -> JEFE VENTAS';
        SELECT * INTO v_signer FROM public.employees WHERE position ILIKE '%JEFE DE VENTAS%' AND is_active = true LIMIT 1;

    ELSIF v_pos LIKE '%JEFE DE VENTAS%' OR v_pos LIKE '%ANALISTA COMERCIAL%' THEN
        v_rule := 'COMERCIAL: JEFE/ANALISTA -> JEFE COMERCIAL';
        SELECT * INTO v_signer FROM public.employees WHERE position ILIKE '%JEFE COMERCIAL%' AND is_active = true LIMIT 1;

    -------------------------------------------------------------------------
    -- AREA: OPERACIONES
    -------------------------------------------------------------------------
    ELSIF v_pos LIKE '%ANALISTA DE OPERACIONES%' OR v_pos LIKE '%COORDINADOR DE OPERACIONES%' THEN
        v_rule := 'OPERACIONES: STAFF -> JEFE';
        SELECT * INTO v_signer FROM public.employees WHERE position ILIKE '%JEFE DE OPERACIONES%' AND is_active = true LIMIT 1;

    ELSIF v_pos LIKE '%SUPERVISOR DE OPERACIONES%' THEN
        v_rule := 'OPERACIONES: SUPERVISOR -> COORDINADOR';
        SELECT * INTO v_signer FROM public.employees WHERE position ILIKE '%COORDINADOR DE OPERACIONES%' AND sede = v_requester.sede AND is_active = true LIMIT 1;
        -- Fallback
        IF v_signer IS NULL THEN
            SELECT * INTO v_signer FROM public.employees WHERE position ILIKE '%COORDINADOR DE OPERACIONES%' AND is_active = true LIMIT 1;
        END IF;

    -------------------------------------------------------------------------
    -- DEFAULT / GENERICO
    -------------------------------------------------------------------------
    ELSE
        v_rule := 'DEFAULT: USER -> SUPERVISOR OPERACIONES';
        SELECT * INTO v_signer FROM public.employees WHERE position ILIKE '%SUPERVISOR DE OPERACIONES%' AND sede = v_requester.sede AND business_unit = v_requester.business_unit AND is_active = true LIMIT 1;

        -- Fallback 1: Supervisor in same Sede
        IF v_signer IS NULL THEN
            v_rule := 'DEFAULT: USER -> SUPERVISOR OP (FALLBACK SEDE)';
            SELECT * INTO v_signer FROM public.employees WHERE position ILIKE '%SUPERVISOR DE OPERACIONES%' AND sede = v_requester.sede AND is_active = true LIMIT 1;
        END IF;

        -- Fallback 2: Coordinator in same Sede
        IF v_signer IS NULL THEN
            v_rule := 'DEFAULT: USER -> COORDINADOR OP (FALLBACK)';
            SELECT * INTO v_signer FROM public.employees WHERE position ILIKE '%COORDINADOR DE OPERACIONES%' AND sede = v_requester.sede AND is_active = true LIMIT 1;
        END IF;
    END IF;

    -- Si se encontró un firmante (sea por legacy o default)
    IF v_signer IS NOT NULL THEN
        RETURN jsonb_build_object(
            'found', true,
            'rule', v_rule,
            'full_name', v_signer.full_name,
            'dni', v_signer.dni,
            'position', v_signer.position,
            'is_direct', false
        );
    END IF;
    
    -- Si llegamos aquí sin signer, retornamos Representante Legal
    RETURN jsonb_build_object(
        'found', false,
        'rule', 'NO_SIGNER_FOUND_V6',
        'full_name', 'GIANCARLO URBINA GAITAN',
        'dni', '18161904',
        'position', 'REPRESENTANTE LEGAL'
    );
END;
$$;
