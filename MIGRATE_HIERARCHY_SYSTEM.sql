-- ==============================================================================
-- MIGRACIÓN DE SISTEMA DE JERARQUÍA (ASIGNACIÓN DIRECTA DE SUPERVISORES)
-- Fecha: 02/03/2026
-- Descripción: Implementación de columna supervisor_id, tabla de auditoría y 
-- actualización de lógica de firmas para priorizar la asignación explícita.
-- ==============================================================================

BEGIN;

-- 1. Agregar columna supervisor_id a employees (Self-Referencing FK)
ALTER TABLE public.employees 
ADD COLUMN IF NOT EXISTS supervisor_id UUID REFERENCES public.employees(id);

-- Índice para búsquedas rápidas de "mi equipo"
CREATE INDEX IF NOT EXISTS idx_employees_supervisor_id ON public.employees(supervisor_id);

-- 2. Tabla de Auditoría de Cambios de Jerarquía
CREATE TABLE IF NOT EXISTS public.hierarchy_audit_log (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    employee_id UUID REFERENCES public.employees(id) NOT NULL,
    old_supervisor_id UUID REFERENCES public.employees(id),
    new_supervisor_id UUID REFERENCES public.employees(id),
    changed_by UUID REFERENCES auth.users(id), -- Usuario que hizo el cambio (SuperAdmin)
    changed_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    change_reason TEXT, -- "Asignación Masiva", "Corrección Individual", etc.
    filters_applied JSONB -- Guardar qué filtros se usaron si fue masivo (Sede, Area, etc.)
);

-- Habilitar RLS en auditoría
ALTER TABLE public.hierarchy_audit_log ENABLE ROW LEVEL SECURITY;

-- Política de lectura: Solo Admins
CREATE POLICY "Admins ver auditoria jerarquia" ON public.hierarchy_audit_log
FOR SELECT
USING (
    EXISTS (
        SELECT 1 FROM public.employees e
        WHERE e.email = auth.jwt() ->> 'email'
        AND e.role IN ('ADMIN', 'SUPER ADMIN', 'JEFE_RRHH')
    )
);

-- 3. Función RPC para Asignación Masiva (Bulk Update)
-- Esta función será llamada desde el "Mantenedor"
CREATE OR REPLACE FUNCTION public.assign_supervisor_bulk(
    p_supervisor_id UUID,
    p_employee_ids UUID[], -- Array de IDs de empleados a actualizar
    p_reason TEXT DEFAULT 'Asignación Masiva'
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_changer_id UUID;
    v_count INT := 0;
    v_emp_id UUID;
    v_old_sup UUID;
BEGIN
    v_changer_id := auth.uid();

    -- Iterar sobre los IDs para actualizar y auditar uno por uno (o hacer update masivo y log masivo)
    -- Para auditoría precisa, iteramos.
    FOREACH v_emp_id IN ARRAY p_employee_ids
    LOOP
        -- Obtener supervisor anterior
        SELECT supervisor_id INTO v_old_sup FROM public.employees WHERE id = v_emp_id;
        
        -- Si hay cambio real
        IF v_old_sup IS DISTINCT FROM p_supervisor_id THEN
            -- Update
            UPDATE public.employees 
            SET supervisor_id = p_supervisor_id
            WHERE id = v_emp_id;
            
            -- Audit
            INSERT INTO public.hierarchy_audit_log (
                employee_id, 
                old_supervisor_id, 
                new_supervisor_id, 
                changed_by, 
                change_reason
            ) VALUES (
                v_emp_id,
                v_old_sup,
                p_supervisor_id,
                v_changer_id,
                p_reason
            );
            
            v_count := v_count + 1;
        END IF;
    END LOOP;

    RETURN jsonb_build_object(
        'success', true,
        'updated_count', v_count
    );
END;
$$;

-- 4. Actualizar get_signing_authority (V6)
-- Prioridad 1: Supervisor Directo (supervisor_id)
-- Prioridad 2: Reglas de Texto (Legacy Logic)

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
    v_direct_sup_id UUID;
BEGIN
    -- Get requester details
    SELECT * INTO v_requester FROM public.employees WHERE id = p_employee_id;
    
    IF v_requester IS NULL THEN
        RAISE EXCEPTION 'Employee not found';
    END IF;

    -- 1. CHECK DIRECT SUPERVISOR (PRIORITY)
    IF v_requester.supervisor_id IS NOT NULL THEN
        SELECT * INTO v_signer 
        FROM public.employees 
        WHERE id = v_requester.supervisor_id 
        AND is_active = true;
        
        IF v_signer IS NOT NULL THEN
            v_rule := 'DIRECT: ASIGNACIÓN MANUAL (JEFE DIRECTO)';
            
            -- Log successful assignment
            INSERT INTO public.boleta_signing_logs (requester_id, signer_id, rule_applied)
            VALUES (p_employee_id, v_signer.id, v_rule);

            RETURN jsonb_build_object(
                'found', true,
                'rule', v_rule,
                'full_name', v_signer.full_name,
                'dni', v_signer.dni,
                'position', v_signer.position,
                'is_direct', true
            );
        END IF;
    END IF;

    -- 2. FALLBACK TO LEGACY TEXT RULES
    -- (Aquí pegamos toda la lógica V5 existente como respaldo)
    
    -- Normalize position for comparison
    v_pos := UPPER(v_requester.position);

    -------------------------------------------------------------------------
    -- AREA: MEJORA CONTÍNUA
    -- Reportan Directamente a GERENTE GENERAL
    -------------------------------------------------------------------------
    IF v_pos LIKE '%ESPECIALISTA DE DESARROLLO%'
       OR v_pos LIKE '%ESPECIALISTA DE PROCESOS%'
       OR v_pos LIKE '%ASISTENTE DE DESARROLLO%'
       OR v_pos LIKE '%TRAINEE DE DESARROLLO%'
       THEN
        v_rule := 'MEJORA CONTINUA: STAFF -> GERENTE GENERAL';
        SELECT * INTO v_signer 
        FROM public.employees 
        WHERE position ILIKE '%GERENTE GENERAL%' 
        AND is_active = true 
        LIMIT 1;

    -------------------------------------------------------------------------
    -- AREA: JEFATURAS (ACTUALIZADO V5)
    -- Los Jefes de Área reportan a GERENTE GENERAL (Antes Administrador General)
    -------------------------------------------------------------------------
    ELSIF v_pos LIKE '%JEFE DE OPERACIONES%'
       OR v_pos LIKE '%JEFE COMERCIAL%'
       OR v_pos LIKE '%JEFE DE GENTE Y GESTIÓN%'
       OR v_pos LIKE '%JEFE DE ADMINISTRACIÓN Y FINANZAS%'
       THEN
        v_rule := 'JEFATURAS: JEFE AREA -> GERENTE GENERAL';
        SELECT * INTO v_signer 
        FROM public.employees 
        WHERE position ILIKE '%GERENTE GENERAL%' 
        AND is_active = true 
        LIMIT 1;

    -------------------------------------------------------------------------
    -- AREA: GENTE Y GESTIÓN
    -------------------------------------------------------------------------

    -- RULE H1: ANALISTA SST -> COORDINADOR SST
    ELSIF v_pos LIKE '%ANALISTA DE SEGURIDAD Y SALUD%' THEN
        v_rule := 'GENTE: ANALISTA SST -> COORDINADOR SST';
        SELECT * INTO v_signer 
        FROM public.employees 
        WHERE position ILIKE '%COORDINADOR DE SEGURIDAD Y SALUD%' 
        AND is_active = true 
        LIMIT 1;

    -- RULE H2: STAFF GENTE / COORDINADOR SST -> JEFE DE GENTE
    ELSIF v_pos LIKE '%ANALISTA DE GENTE Y GESTIÓN%' 
       OR v_pos LIKE '%ANALISTA DE RECLUTAMIENTO%' 
       OR v_pos LIKE '%COORDINADOR DE SEGURIDAD Y SALUD%' 
       THEN
        v_rule := 'GENTE: STAFF -> JEFE GENTE Y GESTION';
        SELECT * INTO v_signer 
        FROM public.employees 
        WHERE position ILIKE '%JEFE DE GENTE Y GESTIÓN%' 
        AND is_active = true 
        LIMIT 1;

    -------------------------------------------------------------------------
    -- AREA: ADMINISTRACIÓN Y FINANZAS
    -------------------------------------------------------------------------

    -- RULE F1: ANALISTA DE CAJA Y BANCOS -> SUPERVISOR DE TESORERIA
    ELSIF v_pos LIKE '%ANALISTA DE CAJA Y BANCOS%' THEN
        v_rule := 'FINANZAS: CAJA -> SUPERVISOR TESORERIA';
        SELECT * INTO v_signer 
        FROM public.employees 
        WHERE position ILIKE '%SUPERVISOR DE TESORERÍA%' 
        AND is_active = true 
        LIMIT 1;

    -- RULE F2: ANALISTA ADMINISTRATIVO / CAJERO -> SUPERVISOR DE PLANEAMIENTO
    ELSIF v_pos LIKE '%ANALISTA ADMINISTRATIVO Y PROCESOS%' OR v_pos LIKE '%CAJERO%' THEN
        v_rule := 'FINANZAS: ANALISTA/CAJERO -> SUPERVISOR PLANEAMIENTO';
        SELECT * INTO v_signer 
        FROM public.employees 
        WHERE position ILIKE '%SUPERVISOR DE PLANEAMIENTO FINANCIERO%' 
        AND is_active = true 
        LIMIT 1;

    -- RULE F3: SUPERVISORES / ANALISTAS DIRECTOS -> JEFE DE ADMINISTRACION
    ELSIF v_pos LIKE '%SUPERVISOR DE PLANEAMIENTO FINANCIERO%' 
       OR v_pos LIKE '%SUPERVISOR DE TESORERÍA%' 
       OR v_pos LIKE '%ANALISTA DE GESTIÓN ADMINISTRATIVA%'
       OR v_pos LIKE '%ANALISTA DE CONTROL FINANCIERO%'
       OR v_pos LIKE '%ANALISTA REVENUE%'
       OR v_pos LIKE '%ANALISTA DE COSTOS%'
       THEN
        v_rule := 'FINANZAS: SUPERVISOR/ANALISTA -> JEFE ADM Y FINANZAS';
        SELECT * INTO v_signer 
        FROM public.employees 
        WHERE position ILIKE '%JEFE DE ADMINISTRACIÓN Y FINANZAS%' 
        AND is_active = true 
        LIMIT 1;

    -------------------------------------------------------------------------
    -- AREA: COMERCIAL
    -------------------------------------------------------------------------
    
    -- RULE C1: VENDEDORES -> SUPERVISOR DE VENTAS
    ELSIF v_pos LIKE '%VENDEDOR%' OR v_pos LIKE '%TELEVENTAS%' OR v_pos LIKE '%AUTOVENTAS%' THEN
        v_rule := 'COMERCIAL: VENDEDOR -> SUPERVISOR VENTAS';
        SELECT * INTO v_signer 
        FROM public.employees 
        WHERE position ILIKE '%SUPERVISOR DE VENTAS%' 
        AND sede = v_requester.sede
        AND is_active = true 
        LIMIT 1;

        -- Fallback
        IF v_signer IS NULL THEN
             v_rule := 'COMERCIAL: VENDEDOR -> SUPERVISOR VENTAS (FALLBACK)';
             SELECT * INTO v_signer 
             FROM public.employees 
             WHERE position ILIKE '%SUPERVISOR DE VENTAS%' 
             AND is_active = true 
             LIMIT 1;
        END IF;

    -- RULE C2: MERCADERISTA -> SUPERVISOR TRADE MARKETING
    ELSIF v_pos LIKE '%MERCADERISTA%' THEN
        v_rule := 'COMERCIAL: MERCADERISTA -> SUPERVISOR TRADE';
        SELECT * INTO v_signer 
        FROM public.employees 
        WHERE position ILIKE '%SUPERVISOR TRADE MARKETING%' 
        AND sede = v_requester.sede
        AND is_active = true 
        LIMIT 1;

         -- Fallback
        IF v_signer IS NULL THEN
             v_rule := 'COMERCIAL: MERCADERISTA -> SUPERVISOR TRADE (FALLBACK)';
             SELECT * INTO v_signer 
             FROM public.employees 
             WHERE position ILIKE '%SUPERVISOR TRADE MARKETING%' 
             AND is_active = true 
             LIMIT 1;
        END IF;

    -- RULE C3: SUPERVISORES -> JEFE DE VENTAS
    ELSIF v_pos LIKE '%SUPERVISOR DE VENTAS%' OR v_pos LIKE '%SUPERVISOR TRADE%' THEN
        v_rule := 'COMERCIAL: SUPERVISOR -> JEFE VENTAS';
        SELECT * INTO v_signer 
        FROM public.employees 
        WHERE position ILIKE '%JEFE DE VENTAS%' 
        AND is_active = true 
        LIMIT 1;

    -- RULE C4: JEFE DE VENTAS / ANALISTA COMERCIAL -> JEFE COMERCIAL
    ELSIF v_pos LIKE '%JEFE DE VENTAS%' OR v_pos LIKE '%ANALISTA COMERCIAL%' THEN
        v_rule := 'COMERCIAL: JEFE/ANALISTA -> JEFE COMERCIAL';
        SELECT * INTO v_signer 
        FROM public.employees 
        WHERE position ILIKE '%JEFE COMERCIAL%' 
        AND is_active = true 
        LIMIT 1;

    -------------------------------------------------------------------------
    -- AREA: OPERACIONES
    -------------------------------------------------------------------------

    -- RULE O1: ANALISTA/COORDINADOR -> JEFE DE OPERACIONES
    ELSIF v_pos LIKE '%ANALISTA DE OPERACIONES%' OR v_pos LIKE '%COORDINADOR DE OPERACIONES%' THEN
        v_rule := 'OPERACIONES: STAFF -> JEFE';
        SELECT * INTO v_signer 
        FROM public.employees 
        WHERE position ILIKE '%JEFE DE OPERACIONES%' 
        AND is_active = true 
        LIMIT 1;

    -- RULE O2: SUPERVISOR DE OPERACIONES -> COORDINADOR DE OPERACIONES
    ELSIF v_pos LIKE '%SUPERVISOR DE OPERACIONES%' THEN
        v_rule := 'OPERACIONES: SUPERVISOR -> COORDINADOR';
        SELECT * INTO v_signer 
        FROM public.employees 
        WHERE position ILIKE '%COORDINADOR DE OPERACIONES%' 
        AND sede = v_requester.sede
        AND is_active = true 
        LIMIT 1;
        
        -- Fallback
        IF v_signer IS NULL THEN
            v_rule := 'OPERACIONES: SUPERVISOR -> COORDINADOR (FALLBACK)';
            SELECT * INTO v_signer 
            FROM public.employees 
            WHERE position ILIKE '%COORDINADOR DE OPERACIONES%' 
            AND is_active = true 
            LIMIT 1;
        END IF;

    -------------------------------------------------------------------------
    -- DEFAULT / GENERICO
    -------------------------------------------------------------------------
    
    ELSE
        v_rule := 'DEFAULT: USER -> SUPERVISOR OPERACIONES';
        SELECT * INTO v_signer 
        FROM public.employees 
        WHERE position ILIKE '%SUPERVISOR DE OPERACIONES%' 
        AND sede = v_requester.sede
        AND business_unit = v_requester.business_unit
        AND is_active = true 
        LIMIT 1;

        -- Fallback 1: Supervisor in same Sede (ignore BU)
        IF v_signer IS NULL THEN
            v_rule := 'DEFAULT: USER -> SUPERVISOR OP (FALLBACK SEDE)';
            SELECT * INTO v_signer 
            FROM public.employees 
            WHERE position ILIKE '%SUPERVISOR DE OPERACIONES%' 
            AND sede = v_requester.sede
            AND is_active = true 
            LIMIT 1;
        END IF;

        -- Fallback 2: Coordinator in same Sede
        IF v_signer IS NULL THEN
            v_rule := 'DEFAULT: USER -> COORDINADOR OP (FALLBACK)';
            SELECT * INTO v_signer 
            FROM public.employees 
            WHERE position ILIKE '%COORDINADOR DE OPERACIONES%' 
            AND sede = v_requester.sede
            AND is_active = true 
            LIMIT 1;
        END IF;
    END IF;
    
    -- Si llegamos aquí sin signer (y sin supervisor directo), retornamos default
    RETURN jsonb_build_object(
        'found', false,
        'rule', 'NO_SIGNER_FOUND_V6',
        'full_name', 'GIANCARLO URBINA GAITAN', -- Default
        'dni', '18161904',
        'position', 'REPRESENTANTE LEGAL'
    );
END;
$$;

COMMIT;
