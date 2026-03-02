import { useState, useEffect, useCallback, useMemo } from 'react'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { getOrganizationStructure } from '../services/organization'
import {
  UserPlus,
  Users,
  Home,
  Settings,
  FileText,
  Briefcase,
  X,
  PanelLeftClose,
  ChevronDown,
  ChevronRight,
  MapPin,
  Store,
  Building2,
  Calendar,
  Shield,
  Plane,
  Clock,
  LayoutGrid,
  Smartphone,
  RefreshCw
} from 'lucide-react'

export default function Sidebar({ isOpen, setIsOpen, isCollapsed, setIsCollapsed }) {
  const { user } = useAuth()
  const location = useLocation()
  const navigate = useNavigate()
  
  // Estado para manejar SOLO UN menú expandido a la vez por nivel
  const [expandedMenus, setExpandedMenus] = useState({
    level0: null, // Solo 1 menú de nivel 0 puede estar abierto
    level1: null, // Solo 1 menú de nivel 1 puede estar abierto
  })
  
  // Detectar si estamos en móvil
  const [isMobile, setIsMobile] = useState(window.innerWidth < 1024)
  
  // Estado para el menú dinámico de estructura
  const [structureMenu, setStructureMenu] = useState([])

  // Cargar estructura dinámica para el menú
  useEffect(() => {
    const fetchStructure = async () => {
        try {
            const { data } = await getOrganizationStructure()
            if (data) {
                // Agrupar por Sede
                const grouped = {}
                data.forEach(item => {
                    if (!item.sedes?.name || !item.business_units?.name) return
                    const sedeName = item.sedes.name
                    const unitName = item.business_units.name
                    
                    if (!grouped[sedeName]) {
                        grouped[sedeName] = []
                    }
                    // Evitar duplicados
                    if (!grouped[sedeName].includes(unitName)) {
                        grouped[sedeName].push(unitName)
                    }
                })

                // Convertir a formato de menú
                const dynamicMenu = Object.keys(grouped).sort().map((sedeName, index) => {
                    // Slug simple para IDs
                    const sedeSlug = sedeName.toLowerCase().replace(/\s+/g, '-')
                    
                    return {
                        id: `dept-${sedeSlug}-${index}`,
                        label: sedeName,
                        icon: MapPin,
                        // Si la sede tiene unidades, crear submenú
                        submenu: grouped[sedeName].sort().map((unitName, uIndex) => {
                            const unitSlug = unitName.toLowerCase().replace(/\s+/g, '-')
                            return {
                                id: `unit-${sedeSlug}-${unitSlug}-${uIndex}`,
                                label: unitName,
                                icon: Store,
                                href: `/employees/${sedeName}?business=${unitName}`
                            }
                        })
                    }
                })
                
                setStructureMenu(dynamicMenu)
            }
        } catch (err) {
            console.error("Error loading sidebar structure:", err)
        }
    }
    fetchStructure()
  }, [])
  
  useEffect(() => {
    const handleResize = () => {
      const mobile = window.innerWidth < 1024
      setIsMobile(mobile)
      
      if (mobile && isCollapsed) {
        setIsCollapsed(false)
      }
    }
    
    window.addEventListener('resize', handleResize)
    return () => window.removeEventListener('resize', handleResize)
  }, [isCollapsed, setIsCollapsed])

  // Configuración de menús (memoizada para performance)
  const menuItems = useMemo(() => {
    // Lógica para determinar el enlace de "Equipo/Empleados"
    let employeesHref = '/employees' // Por defecto lleva a la lista global
    let employeesLabel = 'Empleados'
    let showEmployeesMenu = true // Por defecto visible
    
    // Si NO es Admin/SuperAdmin/JefeRRHH, redirigir a su sede
    const isGlobalAdmin = user?.role === 'ADMIN' || 
                          user?.role === 'SUPER ADMIN' || 
                          user?.role === 'JEFE_RRHH' || 
                          (user?.permissions && user?.permissions['*']) ||
                          // Excepción Part Time ADM CENTRAL
                          (user?.position?.includes('ANALISTA DE GENTE') && user?.position?.includes('PART TIME') && 
                           user?.sede === 'ADM. CENTRAL' && 
                           (user?.business_unit?.toUpperCase() === 'ADMINISTRACIÓN' || user?.business_unit?.toUpperCase() === 'ADMINISTRACION'))
    const isAnalyst = user?.role?.includes('ANALISTA') || user?.position?.includes('ANALISTA')
    
    // Nueva lógica: Determinar si es un JEFE que NO es JEFE DE GENTE DE GESTIÓN
    const normalize = (str) => str ? str.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toUpperCase() : "";
    const userRole = normalize(user?.role);
    const userPosition = normalize(user?.position);
    
    const isBoss = userRole.includes('JEFE') || 
                   userRole.includes('GERENTE') || 
                   userPosition.includes('JEFE') || 
                   userPosition.includes('GERENTE') ||
                   userPosition.includes('COORDINADOR') ||
                   userPosition.includes('SUPERVISOR');

    // Excepción específica: JEFE DE GENTE DE GESTIÓN sí puede ver reportes
    const isHRBoss = userPosition.includes('JEFE DE GENTE') || userPosition.includes('GENTE Y GESTION');
    
    const shouldHideReports = isBoss && !isHRBoss && !isGlobalAdmin;

    // Lógica para "Mi Equipo" (Empleados)
    // JEFES y GERENTES deben tener acceso GLOBAL (ver todas las sedes) -> /employees
    // SUPERVISORES, COORDINADORES y ANALISTAS -> /my-team (Nueva vista simplificada)
    // Corrección: Supervisores y Coordinadores NO deben tener acceso global, deben ir a "Mi Equipo"
    const hasGlobalTeamAccess = isGlobalAdmin || userRole.includes('JEFE') || userRole.includes('GERENTE') || userPosition.includes('JEFE') || userPosition.includes('GERENTE');

    if (!hasGlobalTeamAccess) {
        employeesLabel = 'Mi Equipo'
        employeesHref = '/my-team'
        
        // OCULTAR MENÚ PARA ANALISTAS DE GENTE Y GESTIÓN
        // MODIFICACIÓN: Ahora los Analistas SÍ deben ver Empleados (pero filtrado)
        // Se mantiene oculto solo si hay alguna razón específica, pero la solicitud dice que deben verlo.
        // if (isAnalyst) {
        //    showEmployeesMenu = false
        // }
    }

  const items = [
    { 
      id: 'home',
      icon: Home, 
      label: 'Inicio', 
      href: '/', 
      module: 'dashboard' 
    },
    ...((showEmployeesMenu) ? [{ 
      id: 'employees',
      icon: Users, 
      label: employeesLabel, 
      href: employeesHref, 
      module: 'employees' 
    }] : []),
    { 
      id: 'attendance',
      icon: Clock, 
      label: 'Asistencias', 
      href: '/attendance-list', 
      module: 'attendance' 
    },
    // Nuevo Módulo: Gestión de Altas y Bajas (Solo RRHH)
    {
      id: 'lifecycle',
      icon: RefreshCw,
      label: 'Gestión Altas/Bajas',
      href: '/lifecycle',
      module: 'lifecycle' // Requiere permiso especial o ser Admin/RRHH
    },
    // Ocultar Reportes si corresponde
    ...(!shouldHideReports ? [{
      id: 'reports',
      icon: FileText,
      label: 'Reportes',
      href: '/reports',
      module: 'dashboard'
    }] : []),
    { 
      id: 'requests',
      icon: FileText, 
      label: 'Solicitudes', 
      href: '/requests', 
      module: 'requests' 
    },
    { 
      id: 'vacations',
      icon: Plane, 
      label: 'Vacaciones', 
      href: '#',
      module: 'vacations',
      submenu: [
        { id: 'vac-monitor', label: 'Monitor / Kardex', href: '/vacaciones', icon: Plane },
        { id: 'vac-upload', label: 'Carga Masiva', href: '/vacaciones/carga-masiva', icon: FileText }
      ]
    },
    { 
      id: 'calendar',
      icon: Calendar, 
      label: 'Calendario', 
      href: '/calendar', 
      module: 'calendar' 
    },
    {
      id: 'departments',
      icon: Briefcase,
      label: 'Dptos / Sedes',
      href: '#',
      module: 'departments',
      submenu: structureMenu.length > 0 ? structureMenu : [
        // Fallback temporal mientras carga o si falla
        { id: 'dept-loading', label: 'Cargando...', icon: Clock, href: '#' }
      ]
    },
    /* COMENTADO POR SOLICITUD DE USUARIO (DOCUMENTOS)
    { 
      id: 'documents',
      icon: FileText, 
      label: 'Documentos', 
      href: '#', 
      module: 'documents' 
    },
    */
    { 
      id: 'settings',
      icon: Settings, 
      label: 'Configuración', 
      href: '#',
      module: 'settings',
      submenu: [
        { id: 'set-roles', label: 'Usuarios y Permisos', icon: Shield, href: '/roles' },
        { id: 'set-positions', label: 'Gestión de Cargos', icon: Briefcase, href: '/positions' },
        { id: 'set-areas', label: 'Gestión de Áreas', icon: LayoutGrid, href: '/areas' },
        { id: 'org-structure', label: 'Estructura Organizacional', icon: LayoutGrid, href: '/organization-structure' },
        { id: 'hierarchy-mgmt', label: 'Gestión de Jerarquías', icon: Shield, href: '/hierarchy-management' },
        { id: 'set-mobile-access', label: 'Acceso App Móvil', icon: Smartphone, href: '/mobile-access-config' }
      ]
    },
  ]
  return items
  }, [user, structureMenu])

  // Función recursiva mejorada para encontrar el item más específico (Best Match)
  const findActiveMenuItem = useCallback((items, path, search) => {
    let bestMatch = null
    let maxLen = -1

    const traverse = (itemList) => {
      for (const item of itemList) {
        // Verificar enlace directo
        if (item.href && item.href !== '#') {
          const [targetPath, targetQuery] = item.href.split('?')
          
          // Coincidencia exacta o prefijo (excluyendo raíz '/')
          const isPathMatch = path === targetPath || (targetPath !== '/' && path.startsWith(targetPath))
          
          if (isPathMatch) {
            // Si el target tiene query params, deben estar presentes en la URL actual
            if (targetQuery && !search.includes(targetQuery)) {
              // No coincide query param requerido
            } else {
              // Coincidencia válida - Guardar si es más específica (href más largo)
              // Priorizamos rutas con query params para mayor especificidad
              const score = item.href.length
              if (score > maxLen) {
                maxLen = score
                bestMatch = item.id
              }
            }
          }
        }
        
        // Verificar submenús recursivamente
        if (item.submenu) {
          traverse(item.submenu)
        }
      }
    }

    traverse(items)
    return bestMatch
  }, [])

  // Calcular el ID del item activo (Best Match)
  const activeItemId = useMemo(() => 
    findActiveMenuItem(menuItems, location.pathname, location.search),
    [findActiveMenuItem, menuItems, location.pathname, location.search]
  )

  // Función para expandir automáticamente el menú activo
  const expandActiveMenus = useCallback(() => {
    const activeId = findActiveMenuItem(menuItems, location.pathname, location.search)
    if (!activeId) return

    const newExpandedState = { level0: null, level1: null }

    // Buscar el menú padre en nivel 0
    for (const item of menuItems) {
      if (item.submenu) {
        // Verificar si el item activo está en submenu nivel 1
        if (item.submenu.some(sub => sub.id === activeId)) {
          newExpandedState.level0 = item.id
          break
        }
        
        // Verificar si está en submenu nivel 2
        for (const subItem of item.submenu) {
          if (subItem.submenu && subItem.submenu.some(subSub => subSub.id === activeId)) {
            newExpandedState.level0 = item.id
            newExpandedState.level1 = subItem.id
            break
          }
        }
      }
    }

    setExpandedMenus(newExpandedState)
  }, [menuItems, location.pathname, location.search, findActiveMenuItem])

  // Expandir automáticamente cuando cambia la ruta
  useEffect(() => {
    expandActiveMenus()
  }, [expandActiveMenus])

  // Toggle de menú mejorado - SOLO UN MENÚ ABIERTO POR NIVEL
  const toggleMenu = useCallback((itemId, level) => {
    if (isCollapsed) {
      setIsCollapsed(false)
      return
    }
    
    setExpandedMenus(prev => {
      const levelKey = `level${level}`
      
      // Si el menú ya está abierto, cerrarlo
      if (prev[levelKey] === itemId) {
        return {
          ...prev,
          [levelKey]: null,
          // Cerrar también niveles inferiores
          ...(level === 0 && { level1: null })
        }
      }
      
      // Abrir el nuevo menú y cerrar el anterior del mismo nivel
      return {
        ...prev,
        [levelKey]: itemId,
        // Si abrimos nivel 0, cerrar nivel 1
        ...(level === 0 && { level1: null })
      }
    })
  }, [isCollapsed, setIsCollapsed])

  // Navegación con cierre automático en móvil
  const handleNavigation = useCallback((href) => {
    if (!href || href === '#') return
    
    if (isMobile) {
      setIsOpen(false)
      setTimeout(() => navigate(href), 150)
    } else {
      navigate(href)
    }
  }, [isMobile, setIsOpen, navigate])

  // Filtrado de menú por RBAC (memoizado)
  const visibleMenuItems = useMemo(() => {
    const normalize = (str) => str ? str.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toUpperCase() : "";
    const userRole = normalize(user?.role);
    const userPosition = normalize(user?.position);

    const isAdmin = user?.role === 'ADMIN' || 
                    user?.role === 'SUPER ADMIN' || 
                    user?.role === 'JEFE_RRHH' || 
                    (user?.permissions && user?.permissions['*']) ||
                    // Excepción Part Time ADM CENTRAL
                    (userPosition.includes('ANALISTA DE GENTE') && userPosition.includes('PART TIME') && 
                     user?.sede === 'ADM. CENTRAL' && 
                     (user?.business_unit?.toUpperCase() === 'ADMINISTRACIÓN' || user?.business_unit?.toUpperCase() === 'ADMINISTRACION'))

    return menuItems.reduce((acc, item) => {
      // 1. Verificar si es Admin o tiene permiso explícito
      let hasModuleAccess = isAdmin || !item.module || 
                             (user?.permissions && user?.permissions[item.module]?.read)

      // 2. CORRECCIÓN ESPECÍFICA PARA VACACIONES Y EMPLEADOS (Analistas, Jefes y Supervisores deben ver)
      // Si el módulo es 'vacations' o 'employees' y no tiene permiso explícito pero es Analista/Jefe/Supervisor, dar acceso
      // ACTUALIZACIÓN: Se agregan 'dashboard', 'attendance', 'calendar', 'lifecycle', 'requests' para Analistas
      const allowedModulesForAnalyst = ['vacations', 'employees', 'dashboard', 'attendance', 'calendar', 'lifecycle', 'requests'];
      
      if (allowedModulesForAnalyst.includes(item.module) && !hasModuleAccess) {
          // Usamos las variables normalizadas (userRole, userPosition) definidas arriba para evitar problemas de mayúsculas/tildes
          const isAnalystOrBoss = userRole?.includes('ANALISTA') || 
                                  userRole?.includes('JEFE') || 
                                  userRole?.includes('SUPERVISOR') ||
                                  userPosition?.includes('ANALISTA') ||
                                  userPosition?.includes('JEFE') ||
                                  userPosition?.includes('GERENTE') ||
                                  userPosition?.includes('COORDINADOR') ||
                                  userPosition?.includes('SUPERVISOR');
                                  
          if (isAnalystOrBoss) hasModuleAccess = true;
      }

      if (!hasModuleAccess) return acc

      // Filtrado especial para departamentos
      if (item.module === 'departments' && !isAdmin && user?.sede) {
          // --- OPTIMIZACIÓN DE NAVEGACIÓN POR SEDE Y ROL ---
          // Implementación de filtrado dinámico y permisos por ubicación
          
          // 1. Definir roles con acceso global explícito (además de Admins)
          // Gerente General y TODOS los Jefes deben ver todo.
          // Solo restringimos a Coordinadores y Supervisores.
          const isBoss = userRole?.includes('JEFE') || 
                         userRole?.includes('GERENTE') || 
                         userPosition?.includes('JEFE') || 
                         userPosition?.includes('GERENTE');

          const hasGlobalAccess = isBoss || userPosition?.includes('GERENTE GENERAL');

          if (!hasGlobalAccess) {
              // Si NO es Jefe/Gerente (es decir, es Supervisor, Coordinador o Analista), aplicamos filtros
              // Normalizar sedes del usuario (soporte para múltiples sedes separadas por coma)
              const userSedes = user.sede.split(',').map(s => s.trim().toUpperCase());
              const userUnit = user.business_unit ? user.business_unit.toUpperCase() : null;

              const newItem = { ...item };
              
              if (newItem.submenu) {
                  // 2. Filtrar Nivel 1 (Sedes/Ciudades)
                  // Muestra solo las sedes que coinciden con la asignación del usuario
                  newItem.submenu = newItem.submenu.filter(cityItem => {
                      const cityLabel = cityItem.label.toUpperCase();
                      // Lógica de coincidencia flexible
                      return userSedes.some(us => 
                          us === cityLabel || 
                          us.includes(cityLabel) || 
                          cityLabel.includes(us)
                      );
                  });

                  // 3. Filtrar Nivel 2 (Unidades de Negocio)
                  // Si el usuario tiene una Unidad de Negocio específica asignada, filtramos los subitems
                  if (userUnit) {
                      newItem.submenu = newItem.submenu.map(cityItem => {
                          if (cityItem.submenu && cityItem.submenu.length > 0) {
                              const filteredSub = cityItem.submenu.filter(unitItem => {
                                  const unitLabel = unitItem.label.toUpperCase();
                                  return unitLabel === userUnit || unitLabel.includes(userUnit) || userUnit.includes(unitLabel);
                              });
                              
                              // Si encontramos coincidencias de unidad, restringimos la vista
                              if (filteredSub.length > 0) {
                                  return { ...cityItem, submenu: filteredSub };
                              }
                          }
                          return cityItem;
                      });
                  }
              }

              // 4. Validación Final
              // Solo mostrar el módulo si quedó alguna opción visible tras el filtrado
              if (newItem.submenu && newItem.submenu.length > 0) {
                  // Indicador visual de sede activa en el menú
                  newItem.label = `Dptos / Sedes`; 
                  // Podríamos añadir user.sede aquí, pero si es largo rompe el diseño.
                  // Usaremos un indicador de "Filtrado" implícito al ver solo lo suyo.
                  acc.push(newItem);
              }
          } else {
              // Acceso Global para Gerencia General
              acc.push(item);
          }
      } else {
        acc.push(item)
      }
      
      return acc
    }, [])
  }, [menuItems, user])

  return (
    <>
      {/* Overlay para móvil */}
      {isOpen && isMobile && (
        <div
          className="fixed inset-0 bg-black/30 backdrop-blur-sm z-20 lg:hidden transition-opacity duration-300"
          onClick={() => setIsOpen(false)}
        />
      )}

      {/* Sidebar */}
      <aside
        className={`
          fixed top-0 left-0 z-30 h-screen bg-white border-r border-gray-100 shadow-xl shadow-gray-200/50 
          transition-all duration-300 ease-[cubic-bezier(0.25,0.8,0.25,1)]
          overflow-y-auto overflow-x-hidden
          
          ${isOpen ? 'translate-x-0' : '-translate-x-full'}
          ${isMobile ? 'w-[280px]' : (isCollapsed ? 'w-20' : 'w-64')}
          ${!isMobile && 'lg:translate-x-0'}
        `}
        style={{
          scrollbarWidth: 'thin',
          scrollbarColor: '#e5e7eb transparent'
        }}
      >
        <div className="flex flex-col min-h-full">
          {/* Header */}
          <div className={`
            flex items-center h-20 px-6 mb-2 border-b border-gray-100
            ${isCollapsed && !isMobile ? 'justify-center' : 'justify-between'}
          `}>
            {(!isCollapsed || isMobile) && (
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 bg-blue-600 rounded-lg flex items-center justify-center shadow-lg shadow-blue-200">
                  <span className="text-white font-bold text-lg">P</span>
                </div>
                <span className="text-xl font-bold text-gray-800 tracking-tight">PAUSER</span>
              </div>
            )}
            
            {isCollapsed && !isMobile && (
              <div className="w-8 h-8 bg-blue-600 rounded-lg flex items-center justify-center shadow-lg shadow-blue-200">
                <span className="text-white font-bold text-lg">P</span>
              </div>
            )}

            <div className="flex items-center gap-2">
              {/* Botón colapsar (Desktop) */}
              {!isMobile && !isCollapsed && (
                <button
                  onClick={() => setIsCollapsed(true)}
                  className="p-2 rounded-xl text-gray-400 hover:bg-blue-50 hover:text-blue-600 transition-colors"
                  title="Colapsar menú"
                >
                  <PanelLeftClose size={20} />
                </button>
              )}

              {/* Botón expandir (Desktop colapsado) */}
              {!isMobile && isCollapsed && (
                <button
                  onClick={() => setIsCollapsed(false)}
                  className="absolute -right-3 top-8 bg-white border border-gray-200 p-1.5 rounded-full shadow-md text-gray-500 hover:text-blue-600 z-50 transition-colors"
                  title="Expandir menú"
                >
                  <ChevronRight size={14} />
                </button>
              )}

              {/* Botón cerrar (Móvil) */}
              {isMobile && (
                <button
                  onClick={() => setIsOpen(false)}
                  className="p-2 rounded-xl hover:bg-gray-100 text-gray-500 transition-colors active:scale-95"
                >
                  <X size={20} />
                </button>
              )}
            </div>
          </div>

          {/* Menú de Navegación */}
          <nav className="flex-1 px-4 py-4 space-y-1">
            {visibleMenuItems.map((item) => (
              <MenuItem 
                key={item.id} 
                item={item} 
                level={0}
                expandedMenus={expandedMenus}
                toggleMenu={toggleMenu}
                handleNavigation={handleNavigation}
                isCollapsed={isCollapsed}
                location={location}
                isMobile={isMobile}
                activeItemId={activeItemId}
              />
            ))}
          </nav>

          {/* Footer */}
          <div className="p-6 mt-auto text-center border-t border-gray-100">
            {(!isCollapsed || isMobile) && (
              <div className="bg-blue-50 rounded-2xl p-4 mb-4">
                <p className="text-xs font-semibold text-blue-800 mb-1">Pauser RRHH v2.0</p>
                <p className="text-[10px] text-blue-600/70">Gestión de Personal</p>
              </div>
            )}
            <p className="text-[10px] text-gray-300 font-medium">
              {isCollapsed && !isMobile ? 'v2.0' : '© 2026 Pauser Distribuciones'}
            </p>
          </div>
        </div>
      </aside>
    </>
  )
}

// Componente MenuItem extraído para evitar re-renderizados innecesarios
const MenuItem = ({ item, level = 0, parentId = null, expandedMenus, toggleMenu, handleNavigation, isCollapsed, location, isMobile, activeItemId }) => {
  const hasSubmenu = item.submenu && item.submenu.length > 0
  const levelKey = `level${level}`
  const isExpanded = expandedMenus[levelKey] === item.id
  const Icon = item.icon

  // Verificar si está activo (Usando el cálculo del padre para consistencia)
  const isActive = activeItemId === item.id

  // Estilos dinámicos
  const paddingLeft = level === 0 ? 'px-3' : level === 1 ? 'pl-6 pr-3' : 'pl-10 pr-3'
  const fontSize = level === 0 ? 'text-[15px]' : level === 1 ? 'text-[14px]' : 'text-[13px]'

  const commonClasses = `
    w-full flex items-center gap-3 py-2.5 rounded-xl transition-all duration-200 group relative
    ${paddingLeft}
    ${isCollapsed && level === 0 ? 'justify-center px-0' : ''}
    
    ${isActive 
      ? 'bg-blue-600 text-white shadow-md shadow-blue-200/50' 
      : hasSubmenu && isExpanded 
        ? 'bg-blue-50/80 text-blue-700 font-semibold' 
        : 'text-gray-600 hover:bg-gray-50 hover:text-gray-900'
    }
    
    active:scale-[0.98]
    ${!hasSubmenu && !isActive ? 'hover:translate-x-1' : ''}
  `

  const renderContent = () => (
    <>
      {/* Indicador visual para items activos en subniveles */}
      {level > 0 && isActive && (
        <div className="absolute left-0 top-1/2 -translate-y-1/2 w-1 h-6 rounded-r-full bg-blue-400" />
      )}

      {/* Icono */}
      {Icon && (
        <Icon
          size={level === 0 ? 22 : 18}
          className={`
            ${level === 0 ? 'min-w-[22px]' : 'min-w-[18px]'} 
            transition-colors
            ${isActive 
              ? 'text-white' 
              : isExpanded 
                ? 'text-blue-600' 
                : 'text-gray-400 group-hover:text-gray-600'
            }
          `}
          strokeWidth={isActive ? 2.5 : 2}
        />
      )}

      {!Icon && level > 0 && (
        <div className={`
          w-1.5 h-1.5 rounded-full mr-1 transition-colors
          ${isActive ? 'bg-white' : 'bg-gray-300 group-hover:bg-gray-400'}
        `} />
      )}

      {/* Label y Chevron */}
      {!isCollapsed && (
        <>
          <span className={`
            whitespace-nowrap flex-1 text-left ${fontSize} 
            ${isActive ? 'font-medium' : ''}
            ${isMobile && level > 1 ? 'truncate max-w-[150px]' : ''}
          `}>
            {item.label}
          </span>
          {hasSubmenu && (
            <ChevronDown 
              size={16}
              className={`
                transition-transform duration-200 shrink-0
                ${isExpanded ? 'rotate-180 text-blue-600' : 'text-gray-400'}
              `}
            />
          )}
        </>
      )}
    </>
  )

  const handleClick = (e) => {
    e.stopPropagation()
    if (hasSubmenu) {
      e.preventDefault()
      toggleMenu(item.id, level)
    }
  }

  return (
    <div className="w-full mb-1">
      {hasSubmenu ? (
        <button
          onClick={handleClick}
          className={commonClasses}
          title={isCollapsed ? item.label : ''}
        >
          {renderContent()}
        </button>
      ) : (
        <Link
          to={item.href}
          onClick={(e) => {
             e.stopPropagation()
             if (isMobile) {
                // Let handleNavigation handle the delay and closing
                e.preventDefault()
                handleNavigation(item.href)
             }
             // On desktop, Link handles navigation naturally
          }}
          className={commonClasses}
          title={isCollapsed ? item.label : ''}
        >
           {renderContent()}
        </Link>
      )}

      {/* Submenú recursivo */}
      {!isCollapsed && hasSubmenu && (
        <div className={`
          overflow-hidden transition-all duration-300 ease-in-out space-y-1 mt-1
          ${isExpanded ? 'max-h-[600px] opacity-100' : 'max-h-0 opacity-0'}
        `}>
          {item.submenu.map((subItem) => (
            <MenuItem 
              key={subItem.id} 
              item={subItem} 
              level={level + 1}
              parentId={item.id}
              expandedMenus={expandedMenus}
              toggleMenu={toggleMenu}
              handleNavigation={handleNavigation}
              isCollapsed={isCollapsed}
              location={location}
              isMobile={isMobile}
              activeItemId={activeItemId}
            />
          ))}
        </div>
      )}
    </div>
  )
}