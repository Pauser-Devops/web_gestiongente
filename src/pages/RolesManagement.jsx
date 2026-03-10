import { useState, useEffect } from 'react'
import { toSecureUrl } from '../lib/supabase'
import { 
  Shield, 
  Users, 
  Smartphone, 
  Monitor, 
  Plus, 
  Search, 
  Check, 
  AlertCircle,
  MoreVertical,
  Trash2,
  Edit2
} from 'lucide-react'
import { 
  getRoles, 
  updateRole, 
  createRole, 
  getUsersByRole, 
  assignRoleToUser,
  searchUsers
} from '../services/roles'
import { getEmployees } from '../services/employees' // Fallback si searchUsers falla o para lista completa

export default function RolesManagement() {
  const [roles, setRoles] = useState([])
  const [selectedRole, setSelectedRole] = useState(null)
  const [roleUsers, setRoleUsers] = useState([])
  const [loading, setLoading] = useState(true)
  const [loadingUsers, setLoadingUsers] = useState(false)
  
  // Estado para modal de creación
  const [showCreateModal, setShowCreateModal] = useState(false)
  const [newRoleName, setNewRoleName] = useState('')

  // Estado para asignar usuario
  const [searchTerm, setSearchTerm] = useState('')
  const [searchResults, setSearchResults] = useState([])
  const [isSearching, setIsSearching] = useState(false)

  useEffect(() => {
    loadRoles()
  }, [])

  useEffect(() => {
    if (selectedRole) {
      loadRoleUsers(selectedRole)
    } else {
      setRoleUsers([])
    }
  }, [selectedRole])

  const loadRoles = async () => {
    setLoading(true)
    const { data, error } = await getRoles()
    if (!error && data) {
      setRoles(data)
      if (!selectedRole && data.length > 0) {
        setSelectedRole(data[0])
      }
    }
    setLoading(false)
  }

  const loadRoleUsers = async (role) => {
    setLoadingUsers(true)
    const { data, error } = await getUsersByRole(role.id, role.name)
    if (!error) {
      setRoleUsers(data || [])
    } else {
        console.error("Error cargando usuarios:", error)
        // Manejar el caso de error vaciando la lista o mostrando mensaje
        setRoleUsers([])
    }
    setLoadingUsers(false)
  }

  const handlePermissionChange = async (roleId, field, value) => {
    // Actualización optimista
    setRoles(prev => prev.map(r => r.id === roleId ? { ...r, [field]: value } : r))
    if (selectedRole?.id === roleId) {
        setSelectedRole(prev => ({ ...prev, [field]: value }))
    }

    const { error } = await updateRole(roleId, { [field]: value })
    if (error) {
      console.error('Error actualizando permiso:', error)
      // Revertir en caso de error
      loadRoles() 
      alert('Error al actualizar permiso')
    }
  }

  const handleCreateRole = async () => {
    if (!newRoleName.trim()) return
    const { data, error } = await createRole({ 
        name: newRoleName,
        web_access: false,
        mobile_access: false 
    })
    
    if (data) {
        setRoles(prev => [...prev, data])
        setNewRoleName('')
        setShowCreateModal(false)
        setSelectedRole(data)
    } else {
        alert('Error al crear rol')
    }
  }

  const handleUserSearch = async (term) => {
    setSearchTerm(term)
    if (term.length > 2) {
        setIsSearching(true)
        const { data } = await searchUsers(term)
        setSearchResults(data || [])
        setIsSearching(false)
    } else {
        setSearchResults([])
    }
  }

  const handleAssignUser = async (userId) => {
    if (!selectedRole) return
    if (!confirm(`¿Asignar usuario al rol ${selectedRole.name}?`)) return

    const { error } = await assignRoleToUser(userId, selectedRole.id)
    if (!error) {
        loadRoleUsers(selectedRole)
        setSearchTerm('')
        setSearchResults([])
        alert('Usuario asignado correctamente')
    } else {
        alert('Error al asignar usuario')
    }
  }

  const handleMoveUser = async (userId, targetRoleId) => {
      // Esta función se usaría si arrastramos o seleccionamos desde un dropdown en la lista de usuarios
      // Por simplicidad, implementaremos un dropdown en cada usuario de la lista
  }

  return (
    <div className="h-[calc(100vh-8rem)] flex flex-col md:flex-row gap-6">
      
      {/* PANEL IZQUIERDO: LISTA DE ROLES */}
      <div className="w-full md:w-1/3 flex flex-col gap-4">
        <div className="flex justify-between items-center">
            <h2 className="text-2xl font-bold text-gray-800 flex items-center gap-2">
                <Shield className="text-blue-600" /> Permisos
            </h2>
            <button 
                onClick={() => setShowCreateModal(true)}
                className="p-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
                title="Crear Nuevo Rol"
            >
                <Plus size={20} />
            </button>
        </div>

        <div className="flex-1 bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden flex flex-col">
            <div className="overflow-y-auto flex-1 p-2 space-y-2">
                {roles.map(role => (
                    <div 
                        key={role.id}
                        onClick={() => setSelectedRole(role)}
                        className={`
                            p-4 rounded-lg cursor-pointer border transition-all duration-200
                            ${selectedRole?.id === role.id 
                                ? 'bg-blue-50 border-blue-200 shadow-sm' 
                                : 'bg-white border-transparent hover:bg-gray-50 border-gray-100'}
                        `}
                    >
                        <div className="flex justify-between items-start mb-3">
                            <span className={`font-bold ${selectedRole?.id === role.id ? 'text-blue-800' : 'text-gray-700'}`}>
                                {role.name}
                            </span>
                            {/* Opciones de rol (editar nombre, borrar) podrían ir aquí */}
                        </div>

                        <div className="flex gap-2">
                            {/* Toggle Web */}
                            <button 
                                onClick={(e) => {
                                    e.stopPropagation()
                                    handlePermissionChange(role.id, 'web_access', !role.web_access)
                                }}
                                className={`
                                    flex-1 flex items-center justify-center gap-1 py-1.5 rounded text-xs font-medium border transition-colors
                                    ${role.web_access 
                                        ? 'bg-emerald-100 text-emerald-800 border-emerald-200' 
                                        : 'bg-gray-100 text-gray-400 border-gray-200'}
                                `}
                            >
                                <Monitor size={14} />
                                Web
                            </button>

                            {/* Toggle Mobile */}
                            <button 
                                onClick={(e) => {
                                    e.stopPropagation()
                                    handlePermissionChange(role.id, 'mobile_access', !role.mobile_access)
                                }}
                                className={`
                                    flex-1 flex items-center justify-center gap-1 py-1.5 rounded text-xs font-medium border transition-colors
                                    ${role.mobile_access 
                                        ? 'bg-purple-100 text-purple-800 border-purple-200' 
                                        : 'bg-gray-100 text-gray-400 border-gray-200'}
                                `}
                            >
                                <Smartphone size={14} />
                                App
                            </button>
                        </div>
                    </div>
                ))}
            </div>
        </div>
      </div>

      {/* PANEL DERECHO: DETALLE Y USUARIOS */}
      <div className="w-full md:w-2/3 flex flex-col gap-4">
        {selectedRole ? (
            <>
                <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-200">
                    <div className="flex justify-between items-start mb-6">
                        <div>
                            <h3 className="text-xl font-bold text-gray-800">{selectedRole.name}</h3>
                            <p className="text-sm text-gray-500">
                                {roleUsers.length} usuarios con este rol
                            </p>
                        </div>
                        
                        {/* Buscador para agregar usuario */}
                        <div className="relative w-72">
                            <div className="relative">
                                <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={18} />
                                <input 
                                    type="text" 
                                    placeholder="Buscar usuario para asignar..."
                                    className="w-full pl-10 pr-4 py-2 bg-gray-50 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                                    value={searchTerm}
                                    onChange={(e) => handleUserSearch(e.target.value)}
                                />
                            </div>
                            
                            {/* Resultados de búsqueda */}
                            {searchResults.length > 0 && (
                                <div className="absolute top-full left-0 right-0 mt-2 bg-white rounded-lg shadow-xl border border-gray-100 z-50 max-h-60 overflow-y-auto">
                                    {searchResults.map(user => (
                                        <div 
                                            key={user.id}
                                            onClick={() => handleAssignUser(user.id)}
                                            className="p-3 hover:bg-blue-50 cursor-pointer border-b last:border-0 border-gray-50 flex justify-between items-center"
                                        >
                                            <span className="text-sm font-medium text-gray-700">{user.full_name}</span>
                                            {user.role_id === selectedRole.id ? (
                                                <span className="text-xs text-green-600 bg-green-100 px-2 py-0.5 rounded">Asignado</span>
                                            ) : (
                                                <Plus size={16} className="text-blue-600" />
                                            )}
                                        </div>
                                    ))}
                                </div>
                            )}
                        </div>
                    </div>

                    {/* Lista de Usuarios */}
                    <div className="space-y-2 max-h-[60vh] overflow-y-auto pr-2 custom-scrollbar">
                        {loadingUsers ? (
                            <div className="text-center py-10 text-gray-400">Cargando usuarios...</div>
                        ) : roleUsers.length === 0 ? (
                            <div className="text-center py-10 border-2 border-dashed border-gray-200 rounded-lg">
                                <Users className="mx-auto text-gray-300 mb-2" size={32} />
                                <p className="text-gray-500">No hay usuarios asignados a este rol</p>
                            </div>
                        ) : (
                            roleUsers.map(user => (
                                <div key={user.id} className="flex items-center justify-between p-3 bg-gray-50 rounded-lg hover:bg-white hover:shadow-sm transition-all border border-transparent hover:border-gray-200 group">
                                    <div className="flex items-center gap-3">
                                        <div className="w-10 h-10 rounded-full bg-blue-100 flex items-center justify-center text-blue-700 font-bold text-sm">
                                            {user.profile_picture_url ? (
                                                <img src={toSecureUrl(user.profile_picture_url)} className="w-full h-full rounded-full object-cover" />
                                            ) : (
                                                user.full_name.substring(0, 2).toUpperCase()
                                            )}
                                        </div>
                                        <div>
                                            <p className="font-semibold text-gray-800 text-sm">{user.full_name}</p>
                                            <p className="text-xs text-gray-500">{user.position || 'Sin cargo definido'}</p>
                                        </div>
                                    </div>
                                    
                                    <div className="flex items-center gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                                        <select 
                                            className="text-xs border border-gray-300 rounded px-2 py-1 bg-white focus:outline-none focus:border-blue-500"
                                            onChange={(e) => {
                                                if (confirm(`¿Mover usuario a ${e.target.options[e.target.selectedIndex].text}?`)) {
                                                    assignRoleToUser(user.id, e.target.value).then(() => {
                                                        loadRoleUsers(selectedRole) // Recargar lista actual
                                                    })
                                                } else {
                                                    e.target.value = selectedRole.id // Revertir
                                                }
                                            }}
                                            value={selectedRole.id}
                                        >
                                            {roles.map(r => (
                                                <option key={r.id} value={r.id}>{r.name}</option>
                                            ))}
                                        </select>
                                    </div>
                                </div>
                            ))
                        )}
                    </div>
                </div>
            </>
        ) : (
            <div className="h-full flex items-center justify-center bg-gray-50 rounded-xl border border-gray-200 border-dashed">
                <p className="text-gray-400">Selecciona un rol para ver detalles</p>
            </div>
        )}
      </div>

      {/* Modal Crear Rol */}
      {showCreateModal && (
          <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
              <div className="bg-white p-6 rounded-xl shadow-xl w-96">
                  <h3 className="text-lg font-bold mb-4">Crear Nuevo Rol</h3>
                  <input 
                      type="text" 
                      className="w-full border border-gray-300 rounded-lg p-2 mb-4 focus:ring-2 focus:ring-blue-500 outline-none"
                      placeholder="Nombre del rol (Ej. Supervisor)"
                      value={newRoleName}
                      onChange={(e) => setNewRoleName(e.target.value)}
                      autoFocus
                  />
                  <div className="flex justify-end gap-2">
                      <button 
                          onClick={() => setShowCreateModal(false)}
                          className="px-4 py-2 text-gray-600 hover:bg-gray-100 rounded-lg"
                      >
                          Cancelar
                      </button>
                      <button 
                          onClick={handleCreateRole}
                          className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
                      >
                          Crear
                      </button>
                  </div>
              </div>
          </div>
      )}
    </div>
  )
}
