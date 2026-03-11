-- =============================================================================
-- DIAGNÓSTICO Y REPARACIÓN DEL CRON JOB DE FALTAS INJUSTIFICADAS
-- Ejecutar en el Editor SQL de Supabase (Dashboard → SQL Editor)
-- =============================================================================

-- PASO 1: Verificar si pg_cron está habilitado
SELECT * FROM pg_extension WHERE extname = 'pg_cron';
-- Si no devuelve filas → pg_cron NO está habilitado.
-- Habilítalo en: Dashboard → Database → Extensions → Buscar "pg_cron" → Enable

-- PASO 2: Ver los jobs cron actualmente configurados
-- (Solo funciona si pg_cron está habilitado)
SELECT
    jobid,
    jobname,
    schedule,
    command,
    nodename,
    active
FROM cron.job
ORDER BY jobid;

-- PASO 3: Ver el historial de ejecuciones recientes
-- (Muestra si el job corrió y si tuvo errores)
SELECT
    jobid,
    runid,
    job_pid,
    database,
    username,
    command,
    status,
    return_message,
    start_time,
    end_time
FROM cron.job_run_details
WHERE start_time > NOW() - INTERVAL '14 days'
ORDER BY start_time DESC
LIMIT 50;

-- =============================================================================
-- PASO 4: Verificar que la función de auto-ausencias existe y es correcta
-- =============================================================================
SELECT
    p.proname AS function_name,
    pg_get_functiondef(p.oid) AS function_def
FROM pg_proc p
JOIN pg_namespace n ON p.pronamespace = n.oid
WHERE n.nspname = 'public'
  AND p.proname = 'auto_mark_unjustified_absences';

-- =============================================================================
-- PASO 5: Recrear el cron job si no existe o fue eliminado
-- HORARIO: 23:30 UTC = 18:30 Perú (6:30 PM) - Después del cierre de jornada
-- Ajusta el horario si tu empresa usa un cierre diferente.
-- =============================================================================

-- Primero elimina el job viejo si existe (para evitar duplicados)
SELECT cron.unschedule('mark-absences-daily');

-- Crear el nuevo job
SELECT cron.schedule(
    'mark-absences-daily',     -- Nombre identificador del job
    '30 23 * * 1-5',           -- 23:30 UTC = 18:30 Perú, de Lunes a Viernes
    $$SELECT public.auto_mark_unjustified_absences()$$
);

-- Verificar que se creó correctamente
SELECT jobid, jobname, schedule, command, active
FROM cron.job
WHERE jobname = 'mark-absences-daily';

-- =============================================================================
-- PASO 6 (OPCIONAL): Ejecutar manualmente la función para marcar ausencias
-- de HOY (útil para recuperar los días que no corrió desde el 9 de Marzo)
-- ADVERTENCIA: Solo ejecuta esto si quieres marcar como ausente a quienes
-- no registraron asistencia en una fecha específica.
-- =============================================================================

-- Marcar ausencias del DÍA DE HOY:
-- SELECT public.auto_mark_unjustified_absences();

-- =============================================================================
-- PASO 7 (AVANZADO): Si necesitas marcar ausencias de días ANTERIORES
-- (ej. 10, 11, 12 de Marzo que no fueron procesados)
-- =============================================================================
-- Esta función procesa solo "today". Para días pasados, necesitarías una versión
-- con parámetro de fecha. Ejecuta el siguiente bloque para marcar un día específico:

/*
DO $$
DECLARE
    v_target_date date := '2026-03-10'; -- Cambia esta fecha por el día a reprocesar
    v_count integer;
BEGIN
    INSERT INTO public.attendance (
        employee_id, work_date, status, record_type,
        notes, absence_reason, validated, created_at, registered_by
    )
    SELECT
        e.id,
        v_target_date,
        'FALTA_INJUSTIFICADA',
        'AUSENCIA',
        'Falta injustificada automática (reprocesado)',
        'FALTA INJUSTIFICADA',
        true,
        NOW(),
        NULL
    FROM public.employees e
    WHERE e.is_active = true
    AND NOT EXISTS (
        SELECT 1 FROM public.attendance a
        WHERE a.employee_id = e.id
        AND a.work_date = v_target_date
    );

    GET DIAGNOSTICS v_count = ROW_COUNT;
    RAISE NOTICE 'Registros insertados para %: %', v_target_date, v_count;
END $$;
*/
