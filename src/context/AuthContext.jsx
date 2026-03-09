import { createContext, useContext, useEffect, useState, useRef } from 'react'
import { supabase } from '../lib/supabase'

const AuthContext = createContext({})

export const useAuth = () => useContext(AuthContext)

export const AuthProvider = ({ children }) => {
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
      console.log('Auth State Change:', event)
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

  const fetchProfile = async (authUser) => {
    // Si ya tenemos el usuario cargado y es el mismo, evitamos recargar (opcional, pero ayuda a la estabilidad)
    // if (user && user.id === authUser.id) return; 

    try {
      console.log('Buscando perfil para:', authUser.email);

      // --- CASO ESPECIAL: SUPER ADMIN (admin@pauser.com) ---
      if (authUser.email === 'admin@pauser.com') {
          console.log('⚡ SUPER ADMIN SYSTEM DETECTADO');
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
           const { data: simpleEmployee, error: simpleError } = await supabase
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
            alert('Tu cuenta ha sido desactivada. Contacta a RRHH.');
            await supabase.auth.signOut();
            setUser(null);
            setSession(null);
            return;
        }

        // VALIDACIÓN DE ACCESO WEB
        // Si tiene un rol asignado y ese rol tiene web_access = false, denegar acceso
        if (employeeData.roles && employeeData.roles.web_access === false) {
            console.error('Acceso denegado: El rol del usuario no tiene permisos para Web');
            alert('Tu rol actual no tiene permisos para acceder a la plataforma Web.');
            await supabase.auth.signOut();
            setUser(null);
            setSession(null);
            return;
        }

        // Combinar datos de auth y empleado
        const roleName = employeeData.roles?.name || employeeData.role || employeeData.employee_type;
        
        // Cargar permisos RBAC de módulos
        let modulePermissions = {};
        if (roleName) {
            const { data: permsData } = await supabase
                .from('role_modules')
                .select('module_key, can_read, can_write, can_delete')
                .eq('role_name', roleName);
            
            if (permsData && permsData.length > 0) {
                modulePermissions = permsData.reduce((acc, curr) => {
                    acc[curr.module_key] = {
                        read: curr.can_read,
                        write: curr.can_write,
                        delete: curr.can_delete
                    };
                    return acc;
                }, {});
            } else if (roleName === 'ADMIN' || roleName === 'SUPER ADMIN') {
                // Fallback para ADMIN si no hay registros en role_modules: Acceso total
                modulePermissions = { 
                    '*': { read: true, write: true, delete: true } 
                };
            }

            // --- REGLA DE EXCEPCIÓN: ANALISTA DE GENTE Y GESTIÓN (ADM. CENTRAL) Y JEFE DE RRHH ---
            // Si es Analista de CyG Y su sede es ADM. CENTRAL, O si es JEFE DE GENTE/RRHH, otorgar permisos de SUPER ADMIN implícitos
            // Verificamos por nombre de rol, código de rol o cargo directo
            const positionUpper = employeeData.position ? employeeData.position.toUpperCase() : '';
            const roleUpper = roleName ? roleName.toUpperCase() : '';

            if ((roleUpper === 'ANALISTA DE GENTE Y GESTION' || roleUpper === 'ANALISTA_RRHH' || positionUpper === 'ANALISTA DE GENTE Y GESTIÓN') && 
                employeeData.sede === 'ADM. CENTRAL' && 
                employeeData.business_unit === 'ADMINISTRACION') {
                console.log('⚡ ACCESO VIP DETECTADO: Analista ADM. CENTRAL -> Permisos Totales');
                modulePermissions = { 
                    '*': { read: true, write: true, delete: true } 
                };
            }
            
            // Regla para JEFE DE RRHH / JEFE DE GENTE Y GESTIÓN / GERENTE
            if (roleUpper === 'JEFE_RRHH' || 
                positionUpper.includes('JEFE DE GENTE') || 
                positionUpper.includes('GERENTE') ||
                positionUpper.includes('GERENTE GENERAL')) {
                 console.log('⚡ ACCESO VIP DETECTADO: JEFE/GERENTE -> Permisos Totales');
                 modulePermissions = { 
                    '*': { read: true, write: true, delete: true } 
                };
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
        console.log('Usuario Final Configurado:', finalUser);
        setUser(finalUser)
      } else {
        console.warn('Perfil NO encontrado en ninguna búsqueda');
        // Fallback rápido
        setUser({
            ...authUser,
            employee_id: authUser.id,
            role: 'ADMIN', // Fallback temporal
            full_name: authUser.email.split('@')[0],
            profile: null
        })
      }
    } catch (err) {
      console.error('Error fetching profile:', err)
      setUser(authUser)
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
