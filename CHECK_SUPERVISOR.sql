-- Script para identificar el jefe asignado de un empleado específico
-- Busca por nombre y muestra los detalles del empleado y de su supervisor

SELECT 
    e.id as employee_id,
    e.full_name as employee_name,
    e.dni as employee_dni,
    e.position as employee_position,
    e.sede as employee_sede,
    -- Información del Supervisor (Jefe)
    e.supervisor_id,
    s.full_name as supervisor_name,
    s.dni as supervisor_dni,
    s.position as supervisor_position,
    s.is_active as supervisor_active
FROM public.employees e
LEFT JOIN public.employees s ON e.supervisor_id = s.id
WHERE e.full_name ILIKE '%ALANYA SAENZ%'; -- Ajustar el nombre aquí según sea necesario
