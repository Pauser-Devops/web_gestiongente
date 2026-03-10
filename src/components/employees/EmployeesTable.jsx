import {
  Users, Briefcase, Mail, Phone, CreditCard,
  MapPin, Store, Calendar, Eye, Edit2, UserMinus, Trash2
} from 'lucide-react'
import { toSecureUrl } from '../../lib/supabase'

export default function EmployeesTable({
  loading,
  employees,
  filteredEmployees,
  positionAreaMap,
  handleViewProfile,
  navigate,
  setTerminatingEmployee,
  openDeleteModal,
  canManage,
  searchTerm,
  activeFiltersCount,
  clearFilters
}) {
  const getAvatarColor = (name) => {
    const colors = [
      'from-blue-400 to-blue-600', 'from-violet-400 to-violet-600',
      'from-emerald-400 to-emerald-600', 'from-amber-400 to-amber-600',
      'from-rose-400 to-rose-600', 'from-cyan-400 to-cyan-600',
      'from-indigo-400 to-indigo-600', 'from-teal-400 to-teal-600',
    ]
    return colors[name ? name.charCodeAt(0) % colors.length : 0]
  }

  return (
    <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
      <div className="overflow-x-auto">
        <table className="w-full" style={{ minWidth: '860px' }}>
          <thead>
            <tr className="border-b border-gray-100 bg-gray-50/80">
              <th className="px-5 py-3 text-left" style={{ width: '27%' }}><span className="text-[11px] font-bold text-gray-400 uppercase tracking-wider">Colaborador</span></th>
              <th className="px-5 py-3 text-left" style={{ width: '23%' }}><span className="text-[11px] font-bold text-gray-400 uppercase tracking-wider">Contacto</span></th>
              <th className="px-5 py-3 text-left" style={{ width: '18%' }}><span className="text-[11px] font-bold text-gray-400 uppercase tracking-wider">Sede / Área</span></th>
              <th className="px-5 py-3 text-left" style={{ width: '13%' }}><span className="text-[11px] font-bold text-gray-400 uppercase tracking-wider">Ingreso</span></th>
              <th className="px-5 py-3 text-left" style={{ width: '10%' }}><span className="text-[11px] font-bold text-gray-400 uppercase tracking-wider">Estado</span></th>
              <th className="px-5 py-3 text-left" style={{ width: '9%' }}><span className="text-[11px] font-bold text-gray-400 uppercase tracking-wider">Acciones</span></th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              Array.from({ length: 5 }).map((_, i) => (
                <tr key={i} className="border-b border-gray-50">
                  <td className="px-5 py-3.5">
                    <div className="flex items-center gap-3">
                      <div className="w-9 h-9 rounded-full bg-gray-100 animate-pulse flex-shrink-0" />
                      <div className="space-y-1.5">
                        <div className="h-3 w-36 bg-gray-100 rounded animate-pulse" />
                        <div className="h-2.5 w-24 bg-gray-100 rounded animate-pulse" />
                      </div>
                    </div>
                  </td>
                  {[1,2,3,4,5].map(j => <td key={j} className="px-5 py-3.5"><div className="h-3 w-20 bg-gray-100 rounded animate-pulse" /></td>)}
                </tr>
              ))
            ) : filteredEmployees.length === 0 ? (
              <tr>
                <td colSpan="6" className="px-6 py-16 text-center">
                  <div className="flex flex-col items-center gap-3">
                    <div className="w-14 h-14 rounded-2xl bg-gray-100 flex items-center justify-center"><Users size={24} className="text-gray-400" /></div>
                    <div>
                      <p className="font-semibold text-gray-700 text-sm">Sin resultados</p>
                      <p className="text-gray-400 text-xs mt-1">Intenta ajustar los filtros de búsqueda</p>
                    </div>
                    {(searchTerm || activeFiltersCount > 0) && (
                      <button onClick={clearFilters}
                        className="text-xs text-blue-600 font-semibold hover:underline">Limpiar filtros</button>
                    )}
                  </div>
                </td>
              </tr>
            ) : (
              filteredEmployees.map((emp, idx) => (
                <tr key={emp.id} className={`border-b border-gray-50 hover:bg-blue-50/30 transition-colors ${idx % 2 === 0 ? '' : 'bg-gray-50/30'}`}>
                  {/* Colaborador */}
                  <td className="px-5 py-5" style={{ width: '27%' }}>
                    <div className="flex items-center gap-3">
                      <div className="relative flex-shrink-0">
                        {emp.profile_picture_url
                          ? <img src={toSecureUrl(emp.profile_picture_url)} alt={emp.full_name} className="w-9 h-9 rounded-full object-cover ring-2 ring-white shadow-sm" />
                          : <div className={`w-9 h-9 rounded-full bg-gradient-to-br ${getAvatarColor(emp.full_name)} flex items-center justify-center text-white font-bold text-sm shadow-sm`}>{emp.full_name.charAt(0)}</div>
                        }
                        <span className={`absolute -bottom-0.5 -right-0.5 w-2.5 h-2.5 rounded-full border-2 border-white ${emp.is_active ? 'bg-emerald-500' : 'bg-gray-300'}`} />
                      </div>
                      <div className="min-w-0">
                        <p className="text-sm font-semibold text-gray-900 truncate leading-snug">{emp.full_name}</p>
                        <div className="flex items-center gap-1 mt-0.5">
                          <Briefcase size={11} className="text-blue-500 flex-shrink-0" />
                          <span className="text-xs text-blue-600 font-medium truncate">{emp.position}</span>
                        </div>
                        <span className="inline-block mt-1 px-1.5 py-px rounded text-[10px] font-semibold bg-gray-100 text-gray-500 uppercase tracking-wide">{emp.employee_type || 'OPERATIVO'}</span>
                      </div>
                    </div>
                  </td>
                  {/* Contacto */}
                  <td className="px-5 py-5" style={{ width: '23%' }}>
                    <div className="space-y-1">
                      <div className="flex items-center gap-1.5 min-w-0">
                        <Mail size={12} className="text-gray-300 flex-shrink-0" />
                        <span className="text-xs text-gray-600 truncate" title={emp.email}>{emp.email || <span className="text-gray-300">—</span>}</span>
                      </div>
                      <div className="flex items-center gap-1.5">
                        <Phone size={12} className="text-gray-300 flex-shrink-0" />
                        <span className="text-xs text-gray-600">{emp.phone || <span className="text-gray-300">—</span>}</span>
                      </div>
                      <div className="flex items-center gap-1.5">
                        <CreditCard size={12} className="text-gray-300 flex-shrink-0" />
                        <span className="text-xs font-mono text-gray-500">{emp.dni}</span>
                      </div>
                    </div>
                  </td>
                  {/* Sede / Área */}
                  <td className="px-5 py-5" style={{ width: '18%' }}>
                    <div className="space-y-1">
                      <div className="flex items-center gap-1.5">
                        <MapPin size={12} className="text-gray-300 flex-shrink-0" />
                        <span className="text-xs font-semibold text-gray-700">{emp.sede}</span>
                      </div>
                      {emp.business_unit && (
                        <div className="flex items-center gap-1.5">
                          <Store size={12} className="text-gray-300 flex-shrink-0" />
                          <span className="text-xs text-gray-500">{emp.business_unit}</span>
                        </div>
                      )}
                      {positionAreaMap[emp.position] && (
                        <span className="inline-block px-1.5 py-px rounded text-[10px] font-medium bg-blue-50 text-blue-500 border border-blue-100">{positionAreaMap[emp.position]}</span>
                      )}
                    </div>
                  </td>
                  {/* Ingreso */}
                  <td className="px-5 py-5" style={{ width: '13%' }}>
                    <div className="flex items-center gap-1.5">
                      <Calendar size={12} className="text-gray-300 flex-shrink-0" />
                      <span className="text-xs text-gray-600">
                        {emp.entry_date ? new Date(emp.entry_date + 'T00:00:00').toLocaleDateString('es-PE', { day: '2-digit', month: 'short', year: 'numeric' }) : <span className="text-gray-300">—</span>}
                      </span>
                    </div>
                  </td>
                  {/* Estado */}
                  <td className="px-5 py-5" style={{ width: '10%' }}>
                    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-semibold border ${emp.is_active ? 'bg-emerald-50 text-emerald-700 border-emerald-200' : 'bg-gray-100 text-gray-500 border-gray-200'}`}>
                      <span className={`w-1.5 h-1.5 rounded-full ${emp.is_active ? 'bg-emerald-500' : 'bg-gray-400'}`} />
                      {emp.is_active ? 'Activo' : 'Inactivo'}
                    </span>
                  </td>
                  {/* Acciones */}
                  <td className="px-5 py-5" style={{ width: '9%' }}>
                    <div className="flex items-center gap-1.5">
                      <button onClick={() => handleViewProfile(emp)} title="Ver perfil"
                        className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-blue-50 text-blue-600 border border-blue-100 hover:bg-blue-100 hover:border-blue-200 transition-all text-xs font-semibold">
                        <Eye size={13} /><span>Ver</span>
                      </button>
                      {canManage && (
                        <>
                          <button onClick={() => navigate(`/edit-employee/${emp.id}`)} title="Editar"
                            className="p-1.5 rounded-lg bg-amber-50 text-amber-600 border border-amber-100 hover:bg-amber-100 hover:border-amber-200 transition-all">
                            <Edit2 size={13} />
                          </button>
                          <button onClick={() => setTerminatingEmployee(emp)} title="Dar de Baja"
                            className="p-1.5 rounded-lg bg-orange-50 text-orange-600 border border-orange-100 hover:bg-orange-100 hover:border-orange-200 transition-all">
                            <UserMinus size={13} />
                          </button>
                          <button onClick={() => openDeleteModal(emp.id)} title="Eliminar"
                            className="p-1.5 rounded-lg bg-red-50 text-red-500 border border-red-100 hover:bg-red-100 hover:border-red-200 transition-all">
                            <Trash2 size={13} />
                          </button>
                        </>
                      )}
                    </div>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
      {!loading && filteredEmployees.length > 0 && (
        <div className="px-5 py-2.5 border-t border-gray-100 bg-gray-50/60 flex items-center justify-between">
          <p className="text-xs text-gray-400">
            <span className="font-semibold text-gray-600">{filteredEmployees.length}</span> de{' '}
            <span className="font-semibold text-gray-600">{employees.length}</span> colaboradores
          </p>
          <p className="text-xs text-gray-400">
            {employees.filter(e => e.is_active).length} activos · {employees.filter(e => !e.is_active).length} inactivos
          </p>
        </div>
      )}
    </div>
  )
}
