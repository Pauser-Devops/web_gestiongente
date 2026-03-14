-- =============================================================================
-- FIX: Separar permisos de Reports del módulo dashboard
-- PROBLEMA: La ruta /reports usaba module="dashboard", lo que permite que
--           cualquier rol con acceso al dashboard pueda entrar vía URL directa.
-- SOLUCIÓN: Asignar module_key='reports' solo a los roles que deben verlo.
-- =============================================================================
-- INSTRUCCIONES: Copiar y pegar COMPLETO en Supabase → SQL Editor
-- =============================================================================

-- Eliminar entradas de 'reports' existentes para evitar duplicados
DELETE FROM public.role_modules WHERE module_key = 'reports';

-- Otorgar acceso a Reports a los roles que corresponde
-- Ajusta los role_name según los valores exactos en tu tabla role_modules
INSERT INTO public.role_modules (role_name, module_key, can_read, can_write, can_delete)
VALUES
    -- Jefe de Gente y Gestión → acceso completo a reportes
    ('JEFE DE GENTE Y GESTIÓN',             'reports', true, false, false),
    ('JEFE DE GENTE Y GESTION',             'reports', true, false, false),

    -- Analista de Gente y Gestión (ADM. CENTRAL) → acceso a reportes
    ('ANALISTA DE GENTE Y GESTIÓN',         'reports', true, false, false),
    ('ANALISTA DE GENTE Y GESTION',         'reports', true, false, false),

    -- Gerente General → acceso a reportes
    ('GERENTE GENERAL',                     'reports', true, false, false),

    -- Roles administrativos de HR
    ('JEFE_RRHH',                           'reports', true, false, false),
    ('ADMIN',                               'reports', true, true,  false),
    ('SUPER ADMIN',                         'reports', true, true,  false)

    -- NOTA: NO incluir JEFE DE OPERACIONES ni otros JEFES/GERENTES de área
    -- Si un rol necesita acceso, agregar una línea aquí con su role_name exacto
;

-- Verificar qué quedó configurado
SELECT role_name, module_key, can_read, can_write, can_delete
FROM public.role_modules
WHERE module_key = 'reports'
ORDER BY role_name;
