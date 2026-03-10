import { useState, useRef } from 'react'
import { useAuth } from '../context/AuthContext'
import { uploadProfilePicture, updateUserProfilePicture } from '../services/profile'
import { toSecureUrl } from '../lib/supabase'
import { 
  Menu, 
  Bell, 
  Search, 
  User, 
  LogOut, 
  Settings, 
  Camera, 
  ChevronDown 
} from 'lucide-react'
import { Link } from 'react-router-dom'

export default function Navbar({ setSidebarOpen, isCollapsed }) {
  const { user, signOut, refreshProfile } = useAuth()
  const [showUserMenu, setShowUserMenu] = useState(false)
  const fileInputRef = useRef(null)
  const [isUploading, setIsUploading] = useState(false)

  const handleFileChange = async (e) => {
    const file = e.target.files[0]
    if (!file) return

    if (!user?.employee_id) {
        alert('Error: No se encontró ID de empleado para asociar la imagen.')
        return
    }

    try {
        setIsUploading(true)
        const { publicUrl, error: uploadError } = await uploadProfilePicture(user.employee_id, file)
        if (uploadError) throw uploadError

        const { error: dbError } = await updateUserProfilePicture(user.employee_id, publicUrl)
        if (dbError) throw dbError

        if (refreshProfile) refreshProfile()
        
    } catch (error) {
        console.error('Error uploading profile picture:', error)
        alert('Error al subir la foto de perfil')
    } finally {
        setIsUploading(false)
        if (fileInputRef.current) fileInputRef.current.value = ''
    }
  }

  return (
    <header className={`
      bg-white border-b border-gray-200 h-16 flex items-center justify-between px-4 lg:px-8 sticky top-0 z-20
      ${isCollapsed ? 'lg:pl-20' : 'lg:pl-64'} transition-all duration-300
    `}>
      {/* Left: Mobile Menu Toggle & Title */}
      <div className="flex items-center gap-4">
        <button
          onClick={() => setSidebarOpen(true)}
          className="p-2 -ml-2 rounded-md text-gray-600 hover:bg-gray-100 lg:hidden"
        >
          <Menu size={24} />
        </button>
        {/* <h2 className="text-xl font-semibold text-gray-800 hidden sm:block">Panel de Control</h2> */}
      </div>

      {/* Right: Actions & User Profile */}
      <div className="flex items-center gap-4 ml-auto">
        {/* Notifications (Placeholder) */}
        {/* <button className="p-2 text-gray-500 hover:bg-gray-100 rounded-full relative">
          <Bell size={20} />
          <span className="absolute top-2 right-2 w-2 h-2 bg-red-500 rounded-full border-2 border-white"></span>
        </button> */}

        {/* User Dropdown */}
        <div className="relative">
          <button 
            onClick={() => setShowUserMenu(!showUserMenu)}
            className="flex items-center gap-3 p-1.5 rounded-full hover:bg-gray-50 transition-colors border border-transparent hover:border-gray-200"
          >
            <div className="text-right hidden md:block mr-1">
              <p className="text-sm font-bold text-gray-800 leading-tight">
                {user?.full_name || 'Usuario'}
              </p>
              
              <div className="flex flex-wrap items-center justify-end gap-2 mt-1">
                  <p className="text-xs text-blue-600 font-bold tracking-wide">
                    {user?.position || user?.role || 'Personal'}
                  </p>
                  
                  {/* Información Contextual: Sede / Unidad / Área */}
                  {(user?.sede || user?.business_unit || user?.area_name) && (
                    <div className="flex items-center gap-1.5 pl-2 border-l border-gray-300">
                        {user?.sede && (
                            <span className="text-[10px] font-bold text-slate-600">
                                {user.sede}
                            </span>
                        )}
                        {(user?.business_unit || user?.area_name) && (
                            <>
                                <span className="text-gray-300 text-[10px]">•</span>
                                <span className="text-[10px] font-semibold text-slate-500">
                                    {[user?.business_unit, user?.area_name].filter(Boolean).join(' / ')}
                                </span>
                            </>
                        )}
                    </div>
                  )}
              </div>
            </div>
            
            <div className="relative">
              <div className="w-10 h-10 rounded-full overflow-hidden border border-gray-200 shadow-sm bg-gray-100">
                {user?.profile?.profile_picture_url ? (
                  <img 
                    src={toSecureUrl(user.profile.profile_picture_url)}
                    alt="Perfil" 
                    className="w-full h-full object-cover"
                  />
                ) : (
                  <div className="w-full h-full flex items-center justify-center text-gray-400">
                    <User size={20} />
                  </div>
                )}
              </div>
              {isUploading && (
                <div className="absolute inset-0 bg-black/50 rounded-full flex items-center justify-center">
                  <div className="w-3 h-3 border-2 border-white/50 border-t-white rounded-full animate-spin"></div>
                </div>
              )}
            </div>
            <ChevronDown size={16} className="text-gray-400 hidden sm:block" />
          </button>

          {/* Dropdown Menu */}
          {showUserMenu && (
            <>
              <div 
                className="fixed inset-0 z-10" 
                onClick={() => setShowUserMenu(false)}
              />
              <div className="absolute right-0 mt-2 w-64 bg-white rounded-xl shadow-lg border border-gray-100 py-2 z-20 animate-in fade-in zoom-in-95 duration-200">
                <div className="px-4 py-3 border-b border-gray-100 mb-2 md:hidden">
                  <p className="font-bold text-gray-800">{user?.full_name}</p>
                  <p className="text-xs text-gray-500">{user?.email}</p>
                  {(user?.sede || user?.business_unit) && (
                      <p className="text-[10px] text-gray-400 mt-1">
                          {[user?.sede, user?.business_unit].filter(Boolean).join(' • ')}
                      </p>
                  )}
                </div>

                <button 
                  onClick={() => fileInputRef.current?.click()}
                  className="w-full px-4 py-2 text-left text-sm text-gray-700 hover:bg-gray-50 flex items-center gap-2"
                >
                  <Camera size={16} className="text-blue-500" />
                  Cambiar Foto de Perfil
                </button>

                {/* <Link 
                  to="/profile" 
                  className="w-full px-4 py-2 text-left text-sm text-gray-700 hover:bg-gray-50 flex items-center gap-2"
                  onClick={() => setShowUserMenu(false)}
                >
                  <Settings size={16} className="text-gray-500" />
                  Configuración de Cuenta
                </Link> */}

                <div className="border-t border-gray-100 my-1"></div>

                <button 
                  onClick={signOut}
                  className="w-full px-4 py-2 text-left text-sm text-red-600 hover:bg-red-50 flex items-center gap-2 font-medium"
                >
                  <LogOut size={16} />
                  Cerrar Sesión
                </button>
              </div>
            </>
          )}

          {/* Hidden File Input */}
          <input 
            type="file" 
            ref={fileInputRef} 
            className="hidden" 
            accept="image/png, image/jpeg, image/jpg, image/webp"
            onChange={handleFileChange}
          />
        </div>
      </div>
    </header>
  )
}
