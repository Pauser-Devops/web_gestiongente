import { createClient } from '@supabase/supabase-js'

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL
const supabaseKey = import.meta.env.VITE_SUPABASE_ANON_KEY

if (!supabaseUrl || !supabaseKey) {
  console.warn('Faltan las variables de entorno de Supabase. Asegúrate de configurar .env')
}

export const supabase = createClient(supabaseUrl || '', supabaseKey || '')

// Sanitiza URLs de storage que vengan con http:// (guardadas por la app móvil antes del fix)
// Reemplaza http://161.132.48.71:8000 → https://161.132.48.71:8443
export const toSecureUrl = (url) => {
  if (!url) return null
  return url.replace('http://161.132.48.71:8000', 'https://161.132.48.71:8443')
}
