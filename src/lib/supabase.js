import { createClient } from '@supabase/supabase-js'

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL
const supabaseKey = import.meta.env.VITE_SUPABASE_ANON_KEY

if (!supabaseUrl || !supabaseKey) {
  console.warn('Faltan las variables de entorno de Supabase. Asegúrate de configurar .env')
}

// Timeout global de 25 segundos para todas las llamadas a Supabase.
// Si el servidor Elastika no responde en ese tiempo, la petición se cancela
// y el caller recibe un error en lugar de un spinner infinito.
const TIMEOUT_MS = 25000

const fetchWithTimeout = (url, options = {}) => {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS)
  return fetch(url, { ...options, signal: controller.signal })
    .finally(() => clearTimeout(timer))
}

export const supabase = createClient(supabaseUrl || '', supabaseKey || '', {
  global: { fetch: fetchWithTimeout }
})

// Sanitiza URLs de storage guardadas por la app móvil con protocolo/puerto legacy
// http://161.132.48.71:8000 → https://161.132.48.71:8443
export const toSecureUrl = (url) => {
  if (!url || typeof url !== 'string') return null
  if (url.startsWith('https://')) return url
  return url.replace('http://161.132.48.71:8000', 'https://161.132.48.71:8443')
}
