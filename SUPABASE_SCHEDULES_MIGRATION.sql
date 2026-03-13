-- ============================================================
-- MIGRACIÓN: Gestión de Horarios
-- Ejecutar en Supabase SQL Editor
-- ============================================================

-- 1. Tabla de horarios base
CREATE TABLE IF NOT EXISTS public.work_schedules (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT NOT NULL,
    sede TEXT,
    business_unit TEXT,
    position TEXT,
    area TEXT,
    check_in_time TIME NOT NULL,
    check_out_time TIME NOT NULL,
    tolerance_minutes INT DEFAULT 0,
    bonus_start TIME,
    bonus_end TIME,
    is_active BOOLEAN DEFAULT true,
    created_by UUID REFERENCES public.employees(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 2. Tabla de asignaciones de horario por empleado
CREATE TABLE IF NOT EXISTS public.employee_schedule_assignments (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    employee_id UUID NOT NULL REFERENCES public.employees(id) ON DELETE CASCADE,
    schedule_id UUID NOT NULL REFERENCES public.work_schedules(id) ON DELETE CASCADE,
    valid_from DATE NOT NULL DEFAULT CURRENT_DATE,
    valid_to DATE,
    assigned_by UUID REFERENCES public.employees(id) ON DELETE SET NULL,
    notes TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Índices para performance
CREATE INDEX IF NOT EXISTS idx_esa_employee_id ON public.employee_schedule_assignments(employee_id);
CREATE INDEX IF NOT EXISTS idx_esa_schedule_id ON public.employee_schedule_assignments(schedule_id);
CREATE INDEX IF NOT EXISTS idx_esa_valid_from ON public.employee_schedule_assignments(valid_from);
CREATE INDEX IF NOT EXISTS idx_ws_sede ON public.work_schedules(sede);
CREATE INDEX IF NOT EXISTS idx_ws_business_unit ON public.work_schedules(business_unit);

-- 3. RLS: Lectura para todos los usuarios autenticados
ALTER TABLE public.work_schedules ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.employee_schedule_assignments ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "schedules_select" ON public.work_schedules;
CREATE POLICY "schedules_select" ON public.work_schedules
    FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "schedules_all_service" ON public.work_schedules;
CREATE POLICY "schedules_all_service" ON public.work_schedules
    FOR ALL TO service_role USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "assignments_select" ON public.employee_schedule_assignments;
CREATE POLICY "assignments_select" ON public.employee_schedule_assignments
    FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "assignments_all_service" ON public.employee_schedule_assignments;
CREATE POLICY "assignments_all_service" ON public.employee_schedule_assignments
    FOR ALL TO service_role USING (true) WITH CHECK (true);

-- Política para que usuarios autenticados puedan insertar/actualizar/borrar
-- (el control de permisos se maneja en la app web por rol)
DROP POLICY IF EXISTS "schedules_write_auth" ON public.work_schedules;
CREATE POLICY "schedules_write_auth" ON public.work_schedules
    FOR ALL TO authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "assignments_write_auth" ON public.employee_schedule_assignments;
CREATE POLICY "assignments_write_auth" ON public.employee_schedule_assignments
    FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- ============================================================
-- OPCIONAL: Registrar módulo 'schedules' en role_modules
-- Ajusta según los roles que existan en tu BD
-- ============================================================

-- INSERT INTO public.role_modules (role_name, module_key, can_read, can_write, can_delete)
-- VALUES
--   ('ADMIN', 'schedules', true, true, true),
--   ('SUPER ADMIN', 'schedules', true, true, true),
--   ('JEFE DE GENTE Y GESTIÓN', 'schedules', true, true, true),
--   ('ANALISTA DE GENTE Y GESTIÓN', 'schedules', true, false, false)
-- ON CONFLICT DO NOTHING;

-- ============================================================
-- Verificación
-- ============================================================
SELECT 'work_schedules creada' AS status WHERE EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'work_schedules'
);
SELECT 'employee_schedule_assignments creada' AS status WHERE EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'employee_schedule_assignments'
);
