-- Test get_signing_authority function for ALANYA SAENZ
DO $$
DECLARE
    v_emp_id UUID;
    v_result JSONB;
BEGIN
    SELECT id INTO v_emp_id FROM public.employees WHERE full_name ILIKE '%ALANYA SAENZ%' LIMIT 1;
    
    IF v_emp_id IS NOT NULL THEN
        v_result := public.get_signing_authority(v_emp_id);
        RAISE NOTICE 'Result for ALANYA SAENZ: %', v_result;
    ELSE
        RAISE NOTICE 'Employee not found';
    END IF;
END $$;
