-- Migración de Unidades de Negocio: LIMA y DESAGUADERO (OPL -> MONDELEZ / BACKUS)
-- Fecha: 02/03/2026
-- Descripción: Actualización directa de business_unit en tabla 'employees'.
-- NOTA IMPORTANTE: Deshabilitamos el trigger de historial para evitar que se registren como "cambios de puesto".

BEGIN;

-- 0. Deshabilitar temporalmente el trigger de historial para evitar "ruido" en el log de cambios
ALTER TABLE public.employees DISABLE TRIGGER trg_log_job_changes;

-- 1. Actualizar LIMA: OPL -> MONDELEZ
UPDATE public.employees
SET business_unit = 'MONDELEZ'
WHERE sede = 'LIMA' 
  AND business_unit = 'OPL';

-- 2. Actualizar DESAGUADERO: OPL -> BACKUS
UPDATE public.employees
SET business_unit = 'BACKUS'
WHERE sede = 'DESAGUADERO' 
  AND business_unit = 'OPL';

-- 3. Reactivar el trigger de historial
ALTER TABLE public.employees ENABLE TRIGGER trg_log_job_changes;

-- 4. Verificar resultados (Opcional)
-- SELECT id, full_name, sede, business_unit FROM public.employees WHERE (sede = 'LIMA' AND business_unit = 'MONDELEZ') OR (sede = 'DESAGUADERO' AND business_unit = 'BACKUS');

COMMIT;
