import { useState, useEffect, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase, toSecureUrl } from '../lib/supabase'
import { getPositions } from '../services/positions'
import { useAuth } from '../context/AuthContext'
import { useToast } from '../context/ToastContext'
import EmployeeProfileCard from '../components/EmployeeProfileCard'
import Modal from '../components/ui/Modal'
import { 
  Search, Users, MapPin, Building2, Briefcase, Eye, Mail, Phone, CreditCard,
  Calendar, Store
} from 'lucide-react'

export default function MyTeam() {
  const { user } = useAuth()
  const navigate = useNavigate()
  const [employees, setEmployees] = useState([])
  const [loading, setLoading] = useState(true)
  const [searchTerm, setSearchTerm] = useState('')
  const [positionAreaMap, setPositionAreaMap] = useState({})
  
  const [showProfileModal, setShowProfileModal] = useState(false)
  const [selectedEmployee, setSelectedEmployee] = useState(null)

  const normalize = (str) => str ? str.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toUpperCase() : ""
  const userPosition = normalize(user?.position)

  // Determinar Área del Supervisor/Jefe
  const userArea = useMemo(() => {
    // 0. Revisar Unidad de Negocio primero (Failsafe)
    // Si la persona pertenece a la unidad de RRHH/Gente, debe ver todo en su sede
    const bu = normalize(user?.business_unit)
    if (bu.includes('GENTE') || bu.includes('RRHH') || bu.includes('HUMANO') || bu.includes('TALENTO') || bu.includes('PERSONAS')) return null

    // 1. Prioridad: Roles de RRHH y Gente y Gestión (Ven todo dentro de su filtro de Sede/Unidad)
    // Se coloca al inicio para evitar que coincidan con otras palabras clave por error
    if (userPosition.includes('GENTE') || 
        userPosition.includes('RRHH') || 
        userPosition.includes('RECURSOS HUMANOS') ||
        userPosition.includes('TALENTO') ||
        userPosition.includes('HUMANO') ||
        userPosition.includes('CULTURA') ||
        userPosition.includes('BIENESTAR') ||
        userPosition.includes('SOCIAL') ||
        userPosition.includes('SELECCION') ||
        userPosition.includes('DESARROLLO') ||
        userPosition.includes('NOMINA') ||
        userPosition.includes('PLANILLA') ||
        userPosition.includes('COMPENSACION')) return null

    if (userPosition.includes('OPERACIONES')) return 'OPERACIONES'
    if (userPosition.includes('COMERCIAL') || userPosition.includes('VENTAS')) return 'COMERCIAL'
    if (userPosition.includes('ALMACEN') || userPosition.includes('LOGISTICA')) return 'ALMACEN'
    if (userPosition.includes('DISTRIBUCION') || userPosition.includes('TRANSPORTE')) return 'DISTRIBUCION'
    if (userPosition.includes('MANTENIMIENTO')) return 'MANTENIMIENTO'
    if (userPosition.includes('FINANZAS') || userPosition.includes('CONTABILIDAD')) return 'FINANZAS'
    // TI es peligroso como substring corto (ej. GES-TI-ON), ser más específico
    if (userPosition.includes('SISTEMAS') || userPosition.includes('TECNOLOGIA') || userPosition.includes('INFORMATICA') || userPosition.includes(' TI ') || userPosition.endsWith(' TI')) return 'SISTEMAS'
    
    return null
  }, [userPosition, user?.business_unit])

  useEffect(() => {
    if (user?.id) fetchMyTeam()
  }, [user?.id, user?.sede, user?.business_unit])

  const fetchMyTeam = async () => {
    setLoading(true)
    try {
      // 1. Obtener mapa de cargos -> áreas
      const { data: positionsData } = await getPositions()
      const areaMap = {}
      if (positionsData) {
        positionsData.forEach(pos => {
          if (pos.area_name && pos.area_name !== 'Sin Área Asignada') areaMap[pos.name] = pos.area_name
        })
      }
      setPositionAreaMap(areaMap)

      // 2. Consultar empleados filtrados estrictamente por Sede y Unidad del usuario
      let query = supabase.from('employees')
        .select('*')
        .eq('is_active', true)
        .order('full_name', { ascending: true })

      // Filtro Sede (Obligatorio)
      if (user?.sede) {
        // Manejar múltiples sedes si fuera el caso, aunque normalmente es una
        // Para MyTeam asumimos la sede principal del perfil
        query = query.eq('sede', user.sede)
      }

      // Filtro Unidad de Negocio (Obligatorio si el usuario la tiene)
      if (user?.business_unit) {
        query = query.eq('business_unit', user.business_unit.toUpperCase())
      }

      const { data, error } = await query
      if (error) throw error

      setEmployees(data || [])
    } catch (error) {
      console.error('Error fetching my team:', error)
    } finally {
      setLoading(false)
    }
  }

  const handleViewProfile = (emp) => {
    setSelectedEmployee({ ...emp, area_name: positionAreaMap[emp.position] })
    setShowProfileModal(true)
  }

  const getAvatarColor = (name) => {
    const colors = [
      'from-blue-400 to-blue-600', 'from-violet-400 to-violet-600',
      'from-emerald-400 to-emerald-600', 'from-amber-400 to-amber-600',
      'from-rose-400 to-rose-600', 'from-cyan-400 to-cyan-600',
      'from-indigo-400 to-indigo-600', 'from-teal-400 to-teal-600',
    ]
    return colors[name ? name.charCodeAt(0) % colors.length : 0]
  }

  // Filtrado final en cliente (Búsqueda + Área Estricta)
  const filteredEmployees = employees.filter(emp => {
    const matchesSearch = 
      emp.full_name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      emp.dni?.includes(searchTerm)
    
    // Filtrar por Área si el usuario tiene un área definida en su cargo
    const empArea = positionAreaMap[emp.position] || 'Sin Área'
    const matchesArea = userArea 
      ? normalize(empArea) === normalize(userArea)
      : true // Si no detectamos área en el cargo del usuario, mostramos todo lo de su sede/unidad

    return matchesSearch && matchesArea
  })

  return (
    <div className="min-h-screen bg-gray-50/60 p-6">
      <div className="max-w-7xl mx-auto space-y-6">
        
        {/* Header */}
        <div className="flex items-center gap-4">
          <div className="w-12 h-12 rounded-2xl bg-blue-600 flex items-center justify-center shadow-lg shadow-blue-200">
            <Users size={24} className="text-white" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Mi Equipo</h1>
            <p className="text-sm text-gray-500">
              {user?.sede} {user?.business_unit && `• ${user.business_unit}`} {userArea && `• ${userArea}`}
            </p>
          </div>
        </div>

        {/* Buscador */}
        <div className="bg-white p-4 rounded-xl border border-gray-200 shadow-sm">
          <div className="relative">
            <Search size={18} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-gray-400" />
            <input 
              type="text" 
              placeholder="Buscar colaborador por nombre o DNI..." 
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full pl-10 pr-4 py-3 bg-gray-50 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400 transition-all"
            />
          </div>
          <div className="mt-2 text-xs text-gray-400 px-1">
            Mostrando <span className="font-semibold text-gray-700">{filteredEmployees.length}</span> de {employees.length} colaboradores en tu unidad.
          </div>
        </div>

        {/* Grid de Tarjetas (Más amigable para "Mi Equipo") */}
        {loading ? (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {[1,2,3,4,5,6].map(i => (
              <div key={i} className="bg-white h-32 rounded-xl border border-gray-100 animate-pulse" />
            ))}
          </div>
        ) : filteredEmployees.length === 0 ? (
          <div className="text-center py-12">
            <div className="w-16 h-16 bg-gray-100 rounded-full flex items-center justify-center mx-auto mb-3">
              <Users size={24} className="text-gray-400" />
            </div>
            <h3 className="text-gray-900 font-medium">No se encontraron colaboradores</h3>
            <p className="text-gray-500 text-sm">No hay coincidencias con tu búsqueda o filtros.</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {filteredEmployees.map(emp => (
              <div key={emp.id} className="bg-white rounded-xl border border-gray-200 shadow-sm hover:shadow-md transition-all p-4 group">
                <div className="flex items-start justify-between">
                  <div className="flex items-center gap-3">
                    <div className="relative">
                      {emp.profile_picture_url ? (
                        <img src={toSecureUrl(emp.profile_picture_url)} alt={emp.full_name} className="w-12 h-12 rounded-full object-cover" />
                      ) : (
                        <div className={`w-12 h-12 rounded-full bg-gradient-to-br ${getAvatarColor(emp.full_name)} flex items-center justify-center text-white font-bold text-lg`}>
                          {emp.full_name.charAt(0)}
                        </div>
                      )}
                      <span className={`absolute -bottom-0.5 -right-0.5 w-3 h-3 rounded-full border-2 border-white ${emp.is_active ? 'bg-emerald-500' : 'bg-gray-300'}`} />
                    </div>
                    <div>
                      <h3 className="font-semibold text-gray-900 text-sm line-clamp-1" title={emp.full_name}>{emp.full_name}</h3>
                      <p className="text-xs text-blue-600 font-medium">{emp.position}</p>
                    </div>
                  </div>
                  <button 
                    onClick={() => handleViewProfile(emp)}
                    className="p-2 text-gray-400 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-colors"
                  >
                    <Eye size={18} />
                  </button>
                </div>
                
                <div className="mt-4 space-y-2">
                  <div className="flex items-center gap-2 text-xs text-gray-600">
                    <Mail size={14} className="text-gray-400" />
                    <span className="truncate">{emp.email || 'Sin correo'}</span>
                  </div>
                  <div className="flex items-center gap-2 text-xs text-gray-600">
                    <Phone size={14} className="text-gray-400" />
                    <span>{emp.phone || 'Sin teléfono'}</span>
                  </div>
                  <div className="flex items-center gap-2 text-xs text-gray-600">
                    <Calendar size={14} className="text-gray-400" />
                    <span>Ingreso: {emp.entry_date ? new Date(emp.entry_date).toLocaleDateString('es-PE') : '-'}</span>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      <Modal isOpen={showProfileModal} onClose={() => setShowProfileModal(false)} title="Perfil de Colaborador" showCancel={false} cancelText="Cerrar">
        <EmployeeProfileCard employee={selectedEmployee} />
      </Modal>
    </div>
  )
}
