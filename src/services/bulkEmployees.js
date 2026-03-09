import { supabase } from '../lib/supabase'

const cleanPayload = (data) =>
    data.map(({ id, isValid, ...rest }) => ({
        ...rest,
        is_active: rest.is_active !== undefined ? rest.is_active : true,
    }))

export const bulkImportEmployees = async (data) => {
    const payload = cleanPayload(data)

    // Intento 1: RPC
    const { data: rpcResult, error: rpcError } = await supabase.rpc('bulk_import_employees', {
        p_data: payload
    })

    // Si el RPC funcionó correctamente (success_count > 0), retornar
    if (!rpcError && rpcResult?.success_count > 0) {
        return { data: rpcResult, error: null }
    }

    // Si el RPC existe pero falló internamente (success_count = 0 con errores), usar upsert directo
    if (!rpcError && rpcResult?.success_count === 0 && rpcResult?.errors?.length > 0) {
        console.warn('[bulkImport] RPC falló internamente (bug SQL), usando upsert directo...', rpcResult.errors[0])
    } else if (rpcError) {
        const isRpcMissing = rpcError.message?.includes('function') || rpcError.code === '42883' || rpcError.code === 'PGRST202'
        if (!isRpcMissing) {
            return { data: null, error: rpcError }
        }
        console.warn('[bulkImport] RPC no encontrado, usando upsert directo...')
    }

    // Fallback: upsert directo en lotes de 50
    const BATCH_SIZE = 50
    let successCount = 0
    const errors = []

    for (let i = 0; i < payload.length; i += BATCH_SIZE) {
        const batch = payload.slice(i, i + BATCH_SIZE)
        const { data: upsertData, error: upsertError } = await supabase
            .from('employees')
            .upsert(batch, { onConflict: 'dni', ignoreDuplicates: false })
            .select('id')

        console.log(`[bulkImport] Upsert lote ${Math.floor(i / BATCH_SIZE) + 1}:`, upsertData?.length, 'insertados', upsertError || '')

        if (upsertError) {
            errors.push(`Lote ${Math.floor(i / BATCH_SIZE) + 1}: ${upsertError.message}`)
        } else {
            successCount += upsertData?.length ?? 0
        }
    }

    if (successCount === 0 && errors.length === 0) {
        return {
            data: null,
            error: { message: 'No se insertó ningún registro. Verifica los permisos RLS de la tabla employees en Supabase (falta política INSERT).' }
        }
    }

    return {
        data: { success_count: successCount, errors },
        error: errors.length === payload.length ? { message: errors.join(' | ') } : null
    }
}
