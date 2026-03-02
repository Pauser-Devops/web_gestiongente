-- ==============================================================================
-- REPARACIÓN DE AUDITORÍA Y PERMISOS DE JERARQUÍA
-- ==============================================================================

-- 1. Asegurar permisos en la tabla de auditoría
ALTER TABLE public.hierarchy_audit_log ENABLE ROW LEVEL SECURITY;

-- Política para que los Admins/RRHH puedan VER los logs
DROP POLICY IF EXISTS "Admins ver auditoria jerarquia" ON public.hierarchy_audit_log;
CREATE POLICY "Admins ver auditoria jerarquia" ON public.hierarchy_audit_log
FOR SELECT
USING (
    EXISTS (
        SELECT 1 FROM public.employees e
        WHERE e.email = auth.jwt() ->> 'email'
        AND (
            e.role IN ('ADMIN', 'SUPER ADMIN', 'JEFE_RRHH') OR
            e.position ILIKE '%GERENTE%' OR
            e.position ILIKE '%JEFE DE GENTE%'
        )
    )
);

-- Política para permitir INSERT (necesario aunque la función sea Security Definer para evitar problemas de RLS heredados)
DROP POLICY IF EXISTS "System insert logs" ON public.hierarchy_audit_log;
CREATE POLICY "System insert logs" ON public.hierarchy_audit_log
FOR INSERT
WITH CHECK (true); -- Permitir inserción interna

-- 2. Redefinir la función RPC para asegurar que escribe en el log
CREATE OR REPLACE FUNCTION public.assign_supervisor_bulk(
    p_supervisor_id UUID,
    p_employee_ids UUID[],
    p_reason TEXT DEFAULT 'Asignación Masiva'
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER -- Ejecuta con permisos de superusuario/admin
SET search_path = public -- Seguridad: forzar esquema public
AS $$
DECLARE
    v_changer_id UUID;
    v_count INT := 0;
    v_emp_id UUID;
    v_old_sup UUID;
BEGIN
    v_changer_id := auth.uid();

    FOREACH v_emp_id IN ARRAY p_employee_ids
    LOOP
        -- Obtener supervisor anterior
        SELECT supervisor_id INTO v_old_sup FROM public.employees WHERE id = v_emp_id;
        
        -- Si hay cambio real (o si no tenía supervisor)
        IF v_old_sup IS DISTINCT FROM p_supervisor_id THEN
            -- 1. Actualizar Empleado
            UPDATE public.employees 
            SET supervisor_id = p_supervisor_id
            WHERE id = v_emp_id;
            
            -- 2. Insertar en Auditoría (Forzando la inserción)
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
        'updated_count', v_count,
        'message', 'Proceso completado correctamente'
    );
EXCEPTION WHEN OTHERS THEN
    -- Capturar errores para diagnóstico
    RAISE EXCEPTION 'Error en assign_supervisor_bulk: %', SQLERRM;
END;
$$;

-- 3. Verificación rápida (Opcional: Crea un log dummy para probar que la tabla funciona)
-- INSERT INTO public.hierarchy_audit_log (employee_id, change_reason) 
-- VALUES ((SELECT id FROM employees LIMIT 1), 'TEST_LOG_INIT');
