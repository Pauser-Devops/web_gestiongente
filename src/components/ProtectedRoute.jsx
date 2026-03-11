import { Navigate, Outlet } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'

/**
 * Componente de Ruta Protegida con RBAC
 * @param {string} module - Clave del módulo requerido (ej: 'attendance', 'requests')
 * @param {string} requiredAction - Acción requerida ('read', 'write', 'delete'). Default: 'read'
 */
export const ProtectedRoute = ({ module, requiredAction = 'read', children }) => {
  const { user, loading } = useAuth()

  if (loading) {
      return (
        <div className="min-h-screen flex items-center justify-center bg-gray-50">
            <div className="text-center">
                <div className="w-8 h-8 border-4 border-blue-600 border-t-transparent rounded-full animate-spin mx-auto mb-4"></div>
                <p className="text-gray-500 font-medium">Verificando permisos...</p>
            </div>
        </div>
      )
  }

  // Doble verificación: Si hay sesión pero no usuario, esperar o mostrar error, no redirigir inmediatamente para evitar loop
  if (!user) {
      // Si el AuthContext dice que no está cargando pero no hay usuario, entonces realmente no hay sesión válida
      return <Navigate to="/login" replace />
  }

  // 1. Bypass para Super Admin / Admin
  // (Aunque deberían tener sus permisos en la tabla, esto es un fail-safe)
  const role = user.role?.toUpperCase()
  if (role === 'ADMIN' || role === 'SUPER ADMIN') {
      return children ? children : <Outlet />
  }
  
  // 2. Verificación de Permisos por Módulo
  if (module) {
      const perms = user.permissions || {};

      // Buscar permisos específicos o comodín '*'
      const modulePerms = perms[module] || perms['*'];

      if (!modulePerms) {
          // RBAC: módulo sin permisos
          return <AccessDeniedView moduleName={module} />
      }

      if (!modulePerms[requiredAction]) {
          // RBAC: acción sin permisos
          return <AccessDeniedView moduleName={module} action={requiredAction} />
      }
  }

  // Acceso concedido
  return children ? children : <Outlet />
}

const AccessDeniedView = ({ moduleName, action }) => (
    <div className="min-h-[60vh] flex flex-col items-center justify-center p-8 text-center">
        <div className="bg-red-50 p-6 rounded-full mb-6">
            <svg className="w-12 h-12 text-red-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
            </svg>
        </div>
        <h2 className="text-2xl font-bold text-gray-800 mb-2">Acceso Restringido</h2>
        <p className="text-gray-600 max-w-md mx-auto mb-6">
            No tienes los permisos necesarios para {action === 'write' ? 'editar' : 'ver'} el módulo de <span className="font-semibold text-gray-800">{moduleName || 'esta sección'}</span>.
        </p>
        <button 
            onClick={() => window.history.back()}
            className="px-6 py-2 bg-gray-800 text-white rounded-lg hover:bg-gray-700 transition-colors font-medium"
        >
            Volver Atrás
        </button>
    </div>
)

export default ProtectedRoute
