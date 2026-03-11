import { createContext, useContext, useEffect, useState, useRef } from 'react'
import { supabase } from '../lib/supabase'
import { useToast } from './ToastContext'

const AuthContext = createContext({})

export const useAuth = () => useContext(AuthContext)

export const AuthProvider = ({ children }) => {
  const { showToast } = useToast()
  const [session, setSession] = useState(null)
  const [user, setUser] = useState(null)
  const [loading, setLoading] = useState(true)
  const userRef = useRef(null) // Referencia para evitar re-loading innecesarios

  useEffect(() => {
    userRef.current = user
  }, [user])

  useEffect(() => {
    let mounted = true;

    // 1. Get initial session
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (!mounted) return;
      
      setSession(session)
      if (session?.user) {
        fetchProfile(session.user)
      } else {
        setUser(null)
        setLoading(false)
      }
    })

    // 2. Listen for changes
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange(async (event, session) => {
      // Auth State Change: event
      if (!mounted) return;

      if (event === 'SIGNED_OUT' || event === 'USER_DELETED') {
        // Limpieza inmediata
        setSession(null)
        setUser(null)
        setLoading(false)
      } else if (event === 'SIGNED_IN' || event === 'TOKEN_REFRESHED') {
        setSession(session)
        // Cargar perfil del usuario si hay sesión
        if (session?.user) {
             // Solo activar loading si NO es un refresco de token Y no tenemos usuario cargado
             // Esto evita que la pantalla parpadee o se reinicie el estado al minimizar/restaurar la ventana
             
             // CORRECCIÓN: Evitar recargar perfil en TOKEN_REFRESHED si ya tenemos usuario
             // Esto previene que la app se refresque sola al minimizar/restaurar navegador
             const isTokenRefresh = event === 'TOKEN_REFRESHED';
             const hasUserLoaded = !!userRef.current;

             if (!isTokenRefresh || !hasUserLoaded) {
                 if (!hasUserLoaded) {
                     setLoading(true);
                 }
                 // Llamar a fetchProfile para asegurar datos frescos y completos
                 fetchProfile(session.user);
             }
        }
      } 
    })

    return () => {
        mounted = false;
        subscription.unsubscribe()
    }
  }, [])

  // Extrae la categoría genérica de un rol específico para el fallback en role_modules.
  // Ejemplo: "JEFE DE OPERACIONES" → "JEFE", "ANALISTA COMERCIAL" → "ANALISTA"
  const getRoleCategory = (roleName) => {
    if (!roleName) return null
    const name = roleName.toUpperCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    if (name.startsWith('JEFE')) return 'JEFE'
    if (name.startsWith('GERENTE')) return 'GERENTE'
    if (name.startsWith('SUPERVISOR')) return 'SUPERVISOR'
    if (name.startsWith('COORDINADOR')) return 'COORDINADOR'
    if (name.startsWith('ANALISTA')) return 'ANALISTA'
    return null
  }

  const fetchProfile = async (authUser) => {
    // Si ya tenemos el usuario cargado y es el mismo, evitamos recargar (opcional, pero ayuda a la estabilidad)
    // if (user && user.id === authUser.id) return; 

    try {
      // Buscando perfil de usuario

      // --- CASO ESPECIAL: SUPER ADMIN (admin@pauser.com) ---
      if (authUser.email === 'admin@pauser.com') {
          // Super Admin detectado
          const superAdminUser = {
              ...authUser,
              id: authUser.id, // ID de Auth
              email: 'admin@pauser.com',
              role: 'SUPER ADMIN',
              position: 'SISTEMAS',
              full_name: 'Super Administrador',
              sede: null, // Sede null = Global
              business_unit: null,
              permissions: { '*': { read: true, write: true, delete: true } }
          };
          setUser(superAdminUser);
          setLoading(false);
          return;
      }
      
      // INTENTO 1: Consulta Directa a tabla employees
      let employeeData = null;
      
      // Intentamos traer también la info del rol si existe la relación
       // Usamos try/catch silencioso para la query por si la tabla roles aun no existe o no está vinculada
       try {
           // IMPORTANTE: Primero obtenemos el empleado simple para evitar recursión en RLS si la hay
           const { data: simpleEmployee } = await supabase
             .from('employees')
             .select('*, role_id') // Solo traemos role_id primero
             .ilike('email', authUser.email)
             .maybeSingle();
             
           if (simpleEmployee) {
               employeeData = simpleEmployee;
               
               // Si tiene role_id, hacemos fetch manual del rol (2 pasos) para romper cualquier ciclo de query compleja
               if (simpleEmployee.role_id) {
                   const { data: roleData } = await supabase
                     .from('roles')
                     .select('*')
                     .eq('id', simpleEmployee.role_id)
                     .single();
                   
                   if (roleData) {
                       employeeData.roles = roleData;
                   }
               }
           }
       } catch (e) {
           console.error('Error auth manual:', e);
           // Fallback final
           employeeData = { email: authUser.email };
       }
      
      /* Bloque anterior reemplazado por la lógica de arriba más robusta */

      if (employeeData) {
        // VALIDACIÓN DE USUARIO ACTIVO (NUEVO)
        if (employeeData.is_active === false) {
            console.error('Acceso denegado: Usuario inactivo (Baja)');
            showToast('Tu cuenta ha sido desactivada. Contacta a RRHH.', 'error');
            await supabase.auth.signOut();
            setUser(null);
            setSession(null);
            return;
        }

        // VALIDACIÓN DE ACCESO WEB
        // Si tiene un rol asignado y ese rol tiene web_access = false, denegar acceso
        if (employeeData.roles && employeeData.roles.web_access === false) {
            console.error('Acceso denegado: El rol del usuario no tiene permisos para Web');
            showToast('Tu rol actual no tiene permisos para acceder a la plataforma Web.', 'error');
            await supabase.auth.signOut();
            setUser(null);
            setSession(null);
            return;
        }

        // Combinar datos de auth y empleado
        // Prioridad: rol relacional (FK) > campo role legado > employee_type
        const roleName = employeeData.roles?.name || employeeData.role || employeeData.employee_type;
        const roleNameUpper = roleName ? roleName.toUpperCase() : null;
        // position suele tener el cargo exacto registrado en role_modules;
        // se usa como segundo intento cuando el campo `role` tiene un valor legado sin coincidencia
        const positionUpper = employeeData.position ? employeeData.position.toUpperCase() : null;

        const buildPerms = (rows) => rows.reduce((acc, curr) => {
            acc[curr.module_key] = {
                read: curr.can_read,
                write: curr.can_write,
                delete: curr.can_delete
            };
            return acc;
        }, {});

        const queryRoleModules = async (name) => {
            if (!name) return null;
            const { data } = await supabase
                .from('role_modules')
                .select('module_key, can_read, can_write, can_delete')
                .ilike('role_name', name);
            return data && data.length > 0 ? data : null;
        };

        // Cargar permisos RBAC de módulos
        let modulePermissions = {};
        if (roleNameUpper || positionUpper) {
            // Intento 1: por nombre de rol (campo role / roles.name)
            let rows = await queryRoleModules(roleNameUpper);

            // Intento 2: por posición/cargo si el intento 1 falla y es diferente al rol
            if (!rows && positionUpper && positionUpper !== roleNameUpper) {
                rows = await queryRoleModules(positionUpper);
            }

            if (rows) {
                modulePermissions = buildPerms(rows);
            } else {
                // Fallback: categoría genérica (JEFE, GERENTE, SUPERVISOR, etc.)
                // Intentar con position primero ya que suele ser más específico
                const category = getRoleCategory(positionUpper) || getRoleCategory(roleNameUpper);
                if (category) {
                    const categoryRows = await queryRoleModules(category);
                    if (categoryRows) {
                        modulePermissions = buildPerms(categoryRows);
                    }
                }
                // Roles administrativos sin entrada → acceso total
                const effectiveRole = positionUpper || roleNameUpper || '';
                if (!Object.keys(modulePermissions).length &&
                    (effectiveRole === 'ADMIN' || effectiveRole === 'SUPER ADMIN' || effectiveRole === 'ADMINISTRADOR GENERAL' ||
                     roleNameUpper === 'ADMIN' || roleNameUpper === 'SUPER ADMIN' || roleNameUpper === 'ADMINISTRADOR GENERAL')) {
                    modulePermissions = { '*': { read: true, write: true, delete: true } };
                }
            }
        }

        const finalUser = {
          ...authUser,
          employee_id: employeeData.id,
          role: roleName, // Priorizar rol relacional
          role_details: employeeData.roles || {}, // Detalles del rol (tabla roles)
          permissions: modulePermissions, // Permisos RBAC granular
          full_name: employeeData.full_name,
          position: employeeData.position,
          sede: employeeData.sede,
          business_unit: employeeData.business_unit,
          profile: employeeData
        };
        // Usuario configurado correctamente
        setUser(finalUser)
      } else {
        // Usuario autenticado en Supabase Auth pero sin registro en employees → acceso denegado
        // Acceso denegado: sin perfil en employees
        await supabase.auth.signOut();
        setUser(null);
        setSession(null);
      }
    } catch (err) {
      console.error('Error fetching profile:', err)
      await supabase.auth.signOut();
      setUser(null);
      setSession(null);
    } finally {
      setLoading(false)
    }
  }

  const value = {
    session,
    user,
    loading,
    signOut: async () => {
      setUser(null)
      setSession(null)
      return await supabase.auth.signOut()
    },
    // Exponer función para recargar perfil manualmente si es necesario
    refreshProfile: async () => {
        if (session?.user) await fetchProfile(session.user)
    }
  }

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}
