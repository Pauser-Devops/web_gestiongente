  -- Migración de Unidad de Negocio: TRUJILLO (SNACKS -> MULTIMARCAS)
  -- Fecha: 27/02/2026

  BEGIN;

  -- 1. Actualizar registros de forma segura
  UPDATE public.employees
  SET business_unit = 'MULTIMARCAS'
  WHERE sede = 'TRUJILLO' 
    AND business_unit = 'SNACKS';

  -- 2. Verificar resultados (Opcional, para visualizar en consola)
  -- SELECT id, full_name, sede, business_unit FROM public.employees WHERE sede = 'TRUJILLO' AND business_unit = 'MULTIMARCAS';

  COMMIT;
