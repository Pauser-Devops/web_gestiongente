import { useState, useEffect } from 'react'
import { useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { createEmployee, getEmployeeById, updateEmployee } from '../services/employees'
import { getSedes, getOrganizationStructure } from '../services/organization'
import { getPositions } from '../services/positions'
import { Save, User, Phone, Mail, MapPin, Briefcase, Calendar, FileText, Store, Users } from 'lucide-react'

export default function RegisterEmployee() {
  const navigate = useNavigate()
  const { id } = useParams() 
  const [searchParams] = useSearchParams()
  const { user } = useAuth()
  const isEditing = Boolean(id) 

  // Determinar si la sede debe estar bloqueada (No es Admin, no tiene permiso global y tiene sede asignada)
  const isSedeLocked = user?.sede && 
    !['SUPER ADMIN', 'ADMIN'].includes(user?.role?.toUpperCase()) && 
    !(user?.permissions && user?.permissions['*'])

  const initialSede = searchParams.get('sede') || ''
  const initialBusiness = searchParams.get('business') || ''

  const [loading, setLoading] = useState(false)
  const [success, setSuccess] = useState(false)
  const [error, setError] = useState(null)
  const [errors, setErrors] = useState({}) // Estado para errores de validación
  
  // Listas dinámicas
  const [locationsList, setLocationsList] = useState([])
  const [departmentsList, setDepartmentsList] = useState([])
  const [positionsList, setPositionsList] = useState([])

  const [formData, setFormData] = useState({
    sede: initialSede,
    business_unit: initialBusiness,
    location_id: null,
    department_id: null,
    document_type: 'DNI',
    dni: '',
    full_name: '',
    entry_date: '',
    position: '',
    job_position_id: null,
    role_id: '', // Mantenemos role_id como job_position_id por compatibilidad, pero en UI se usa como select value
    phone: '',
    email: '',
    birth_date: '',
    address: '',
    employee_type: ''
  })

  // Función de validación
  const validateForm = () => {
    const newErrors = {}
    
    if (!formData.sede) newErrors.sede = 'La sede es obligatoria'
    if (!formData.business_unit) newErrors.business_unit = 'La unidad de negocio es obligatoria'
    
    if (!formData.dni) {
      newErrors.dni = `El ${formData.document_type} es obligatorio`
    } else {
        if (formData.document_type === 'DNI' && !/^\d{8}$/.test(formData.dni)) {
            newErrors.dni = 'El DNI debe tener 8 dígitos numéricos'
        } else if (formData.document_type === 'CE' && !/^\d{9,12}$/.test(formData.dni)) {
             newErrors.dni = 'El CE debe tener entre 9 y 12 dígitos numéricos'
        }
    }

    if (!formData.full_name) {
      newErrors.full_name = 'El nombre completo es obligatorio'
    } else if (formData.full_name.length < 5) {
      newErrors.full_name = 'El nombre debe tener al menos 5 caracteres'
    }

    if (!formData.entry_date) newErrors.entry_date = 'La fecha de ingreso es obligatoria'
    
    if (!formData.role_id) newErrors.role_id = 'El puesto es obligatorio'

    if (!formData.phone) {
      newErrors.phone = 'El celular es obligatorio'
    } else if (!/^\d{9}$/.test(formData.phone)) {
      newErrors.phone = 'El celular debe tener 9 dígitos'
    }

    if (!formData.email) {
      newErrors.email = 'El correo es obligatorio'
    } else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(formData.email)) {
      newErrors.email = 'El formato del correo no es válido'
    }

    if (!formData.birth_date) {
        newErrors.birth_date = 'La fecha de nacimiento es obligatoria'
    } else {
        const birth = new Date(formData.birth_date)
        const ageDifMs = Date.now() - birth.getTime()
        const ageDate = new Date(ageDifMs) 
        if (Math.abs(ageDate.getUTCFullYear() - 1970) < 18) {
             newErrors.birth_date = 'El empleado debe ser mayor de 18 años'
        }
    }

    if (!formData.address) newErrors.address = 'La dirección es obligatoria'

    setErrors(newErrors)
    return Object.keys(newErrors).length === 0
  }

  // 0. Auto-asignar Sede para usuarios restringidos
  useEffect(() => {
    if (!isEditing && isSedeLocked && user?.sede && formData.sede !== user.sede) {
        setFormData(prev => ({
            ...prev,
            sede: user.sede,
            business_unit: '' // Resetear unidad de negocio para forzar selección válida
        }))
    }
  }, [isEditing, isSedeLocked, user])

  // 1. Cargar Sedes y Estructura Organizacional
  useEffect(() => {
    const fetchData = async () => {
        try {
            // Cargar Sedes
            const { data: sedesData } = await getSedes()
            if (sedesData) setLocationsList(sedesData)

            // Cargar Estructura para filtrar unidades
            const { data: structureData } = await getOrganizationStructure()
            // Guardamos la estructura global en una referencia o estado si es necesario
            // Para simplificar, usaremos esto directamente en el efecto de cambio de sede
            if (structureData) {
                window._orgStructure = structureData // Hack temporal o usar estado
            }
        } catch (error) {
            console.error("Error loading structure:", error)
        }
    }
    fetchData()
  }, [])

  // 2. Cargar Unidades (Departments) cuando cambia la Sede
  useEffect(() => {
    if (formData.sede && locationsList.length > 0) {
        const selectedLoc = locationsList.find(l => l.name === formData.sede)
        
        if (selectedLoc) {
            // Actualizar ID si no está
            if (!formData.location_id || formData.location_id !== selectedLoc.id) {
                setFormData(prev => ({ ...prev, location_id: selectedLoc.id }))
            }

            // Filtrar Unidades Disponibles usando la Estructura
            const fetchUnits = async () => {
                let structureData = window._orgStructure
                if (!structureData) {
                    const { data } = await getOrganizationStructure()
                    structureData = data
                    window._orgStructure = data
                }

                if (structureData) {
                    // Filtrar unidades asociadas a esta sede
                    const availableUnits = structureData
                        .filter(item => item.sedes?.id === selectedLoc.id && item.business_units)
                        .map(item => ({
                            id: item.business_units.id,
                            name: item.business_units.name
                        }))
                    
                    // Eliminar duplicados si los hubiera
                    const uniqueUnits = [...new Map(availableUnits.map(item => [item['id'], item])).values()]
                    
                    setDepartmentsList(uniqueUnits)

                    // Auto-asignar si solo hay una opción
                    if (uniqueUnits.length === 1 && !formData.business_unit) {
                         setFormData(prev => ({
                            ...prev,
                            business_unit: uniqueUnits[0].name,
                            department_id: uniqueUnits[0].id
                        }))
                    }
                }
            }
            fetchUnits()
        }
    } else {
        setDepartmentsList([])
    }
  }, [formData.sede, locationsList])

  // 3. Cargar Posiciones (Carga todas las disponibles por ahora)
  useEffect(() => {
    if (formData.business_unit) {
         // Cargamos todos los cargos disponibles
         // TODO: Filtrar por Unidad de Negocio cuando se establezca la relación en la BD
         getPositions().then(({ data }) => {
             if (data) setPositionsList(data)
         })
    } else {
        setPositionsList([])
    }
  }, [formData.business_unit])


  // Cargar datos si estamos en modo edición
  useEffect(() => {
    if (isEditing) {
      loadEmployeeData()
    }
  }, [id])

  // Actualizar formData si cambian los parámetros de URL
  useEffect(() => {
    if (!isEditing && (initialSede || initialBusiness)) {
      setFormData(prev => ({
        ...prev,
        sede: initialSede,
        business_unit: initialBusiness
      }))
    }
  }, [initialSede, initialBusiness, isEditing])

  const loadEmployeeData = async () => {
    setLoading(true)
    try {
      const { data, error } = await getEmployeeById(id)
      if (error) throw error
      if (data) {
        setFormData({
          sede: data.sede || '',
          business_unit: data.business_unit || '',
          location_id: data.location_id || null, // Si existe en DB
          department_id: data.department_id || null, // Si existe en DB
          employee_type: data.employee_type || '',
          document_type: data.document_type || 'DNI',
          dni: data.dni || '',
          full_name: data.full_name || '',
          entry_date: data.entry_date || '',
          position: data.position || '',
          job_position_id: data.job_position_id || null,
          role_id: data.role_id || '',
          phone: data.phone || '',
          email: data.email || '',
          birth_date: data.birth_date || '',
          address: data.address || ''
        })
      }
    } catch (err) {
      setError('Error al cargar datos del empleado: ' + err.message)
    } finally {
      setLoading(false)
    }
  }

  const handleChange = (e) => {
    const { name, value } = e.target
    
    // Clear error when user types
    if (errors[name]) {
      setErrors(prev => ({ ...prev, [name]: null }))
    }
    
    if (name === 'sede') {
      // Buscar ID de la sede seleccionada
      const selectedLoc = locationsList.find(l => l.name === value)
      setFormData(prev => ({ 
        ...prev, 
        sede: value,
        location_id: selectedLoc ? selectedLoc.id : null, // Mantenemos location_id para compatibilidad con backend
        business_unit: '', // Reset negocio
        department_id: null,
        position: '', // Reset puesto
        job_position_id: null,
        role_id: ''
      }))
    } else if (name === 'business_unit') {
      const selectedDept = departmentsList.find(d => d.name === value)
      setFormData(prev => ({ 
        ...prev, 
        business_unit: value,
        department_id: selectedDept ? selectedDept.id : null, // Mantenemos department_id para compatibilidad
        position: '', // Reset puesto
        job_position_id: null,
        role_id: ''
      }))
    } else if (name === 'role_id') {
       // value es el ID del job_position
       const selectedPos = positionsList.find(r => r.id.toString() === value)
       setFormData(prev => ({
           ...prev,
           role_id: value, // Guardamos value en role_id TEMPORALMENTE para que el Select refleje la selección visualmente
           job_position_id: value, // Guardamos ID del cargo real
           position: selectedPos ? selectedPos.name : '', // Guardamos Nombre
           employee_type: selectedPos ? selectedPos.employee_type : '' // Auto-asignar tipo
       }))
    } else {
      setFormData(prev => ({ ...prev, [name]: value }))
    }
  }

  const handleCancel = () => {
    navigate(-1) 
  }

  const handleSubmit = async (e) => {
    e.preventDefault()
    
    if (!validateForm()) {
        return
    }

    setLoading(true)
    setError(null)
    setSuccess(false)

    try {
      const dataToSave = {
        ...formData,
        full_name: formData.full_name?.toUpperCase(),
        address: formData.address?.toUpperCase(),
        role_id: null,       // FK con tabla 'roles' — no usada aquí
        location_id: null,   // locations usa BIGINT; sedes usa UUID — incompatibles, no enviar
        department_id: null  // departments usa BIGINT; business_units usa UUID — incompatibles, no enviar
      }
      
      // Ya no eliminamos employee_type porque SÍ es columna de employees
      // delete dataToSave.employee_type

      if (isEditing) {
        await updateEmployee(id, dataToSave)
        setSuccess(true)
        // Redirigir después de 1 segundo para dar feedback visual
        setTimeout(() => {
            navigate(-1)
        }, 1000)
      } else {
        await createEmployee(dataToSave)
        setSuccess(true)
        // Redirigir después de 1 segundo
        setTimeout(() => {
            navigate(-1)
        }, 1000)
      }
    } catch (err) {
      console.error(err)
      setError(err.message || 'Error al guardar empleado')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="max-w-4xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-800">
            {isEditing ? 'Editar Empleado' : 'Registrar Nuevo Empleado'}
          </h1>
          <p className="text-gray-500 text-sm mt-1">
            {isEditing ? 'Modifique los datos necesarios del personal.' : 'Complete todos los campos para dar de alta al personal.'}
          </p>
        </div>
      </div>

      <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
        {success && (
          <div className="bg-green-50 text-green-700 p-4 border-b border-green-100 flex items-center gap-2">
            <div className="w-2 h-2 rounded-full bg-green-600"></div>
            {isEditing ? 'Datos actualizados correctamente.' : 'Empleado registrado exitosamente.'}
          </div>
        )}

        {error && (
          <div className="bg-red-50 text-red-700 p-4 border-b border-red-100 flex items-center gap-2">
            <div className="w-2 h-2 rounded-full bg-red-600"></div>
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit} className="p-6 md:p-8" data-gramm="false" data-gramm_editor="false" data-enable-grammarly="false">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            
            {/* Sede */}
            <div className="space-y-2">
              <label className="text-sm font-semibold text-gray-700 flex items-center gap-2">
                <MapPin size={16} className="text-blue-500" /> Sede / Ciudad
              </label>
              <select
                name="sede"
                value={formData.sede}
                onChange={handleChange}
                required
                disabled={isSedeLocked}
                className={`w-full p-3 border rounded-lg focus:outline-none focus:ring-2 transition-all bg-gray-50/50 disabled:bg-gray-100 disabled:text-gray-500 disabled:cursor-not-allowed ${errors.sede ? 'border-red-300 focus:ring-red-200' : 'border-gray-200 focus:ring-blue-500/20 focus:border-blue-500'}`}
              >
                <option value="">Seleccione una sede</option>
                {locationsList.map(loc => (
                  <option key={loc.id} value={loc.name}>{loc.name}</option>
                ))}
              </select>
              {errors.sede && <p className="text-red-500 text-xs mt-1">{errors.sede}</p>}
            </div>

            {/* Unidad de Negocio (Dinámica) */}
            <div className="space-y-2">
              <label className="text-sm font-semibold text-gray-700 flex items-center gap-2">
                <Store size={16} className="text-blue-500" /> Unidad de Negocio
              </label>
              <select
                name="business_unit"
                value={formData.business_unit}
                onChange={handleChange}
                required
                disabled={!formData.sede}
                className={`w-full p-3 border rounded-lg focus:outline-none focus:ring-2 transition-all bg-gray-50/50 disabled:bg-gray-100 disabled:text-gray-400 ${errors.business_unit ? 'border-red-300 focus:ring-red-200' : 'border-gray-200 focus:ring-blue-500/20 focus:border-blue-500'}`}
              >
                <option value="">Seleccione negocio</option>
                {departmentsList.map(dept => (
                  <option key={dept.id} value={dept.name}>{dept.name}</option>
                ))}
              </select>
              {errors.business_unit && <p className="text-red-500 text-xs mt-1">{errors.business_unit}</p>}
            </div>


            {/* Tipo de Documento y Número */}
            <div className="space-y-4">
              <div className="flex gap-6 items-center p-1">
                 <label className="flex items-center gap-2 cursor-pointer group">
                    <div className={`w-5 h-5 rounded-full border flex items-center justify-center ${formData.document_type === 'DNI' ? 'border-blue-600' : 'border-gray-300 group-hover:border-blue-400'}`}>
                        {formData.document_type === 'DNI' && <div className="w-3 h-3 rounded-full bg-blue-600"></div>}
                    </div>
                    <input 
                        type="radio" 
                        name="document_type" 
                        value="DNI" 
                        checked={formData.document_type === 'DNI'} 
                        onChange={handleChange}
                        className="hidden"
                    />
                    <span className={`text-sm font-medium ${formData.document_type === 'DNI' ? 'text-blue-700' : 'text-gray-600'}`}>DNI</span>
                 </label>

                 <label className="flex items-center gap-2 cursor-pointer group">
                    <div className={`w-5 h-5 rounded-full border flex items-center justify-center ${formData.document_type === 'CE' ? 'border-blue-600' : 'border-gray-300 group-hover:border-blue-400'}`}>
                        {formData.document_type === 'CE' && <div className="w-3 h-3 rounded-full bg-blue-600"></div>}
                    </div>
                    <input 
                        type="radio" 
                        name="document_type" 
                        value="CE" 
                        checked={formData.document_type === 'CE'} 
                        onChange={handleChange}
                        className="hidden"
                    />
                    <span className={`text-sm font-medium ${formData.document_type === 'CE' ? 'text-blue-700' : 'text-gray-600'}`}>Carnét de Extranjería</span>
                 </label>
              </div>

              <div className="space-y-2">
                <label className="text-sm font-semibold text-gray-700 flex items-center gap-2">
                    <FileText size={16} className="text-blue-500" /> 
                    {formData.document_type === 'DNI' ? 'Número de DNI' : 'Número de CE'}
                </label>
                <input
                    type="text"
                    name="dni"
                    value={formData.dni}
                    onChange={(e) => {
                        // Permitir solo números
                        const val = e.target.value.replace(/\D/g, '')
                        handleChange({ target: { name: 'dni', value: val } })
                    }}
                    maxLength={formData.document_type === 'DNI' ? 8 : 12}
                    placeholder={formData.document_type === 'DNI' ? "12345678" : "000000000"}
                    required
                    className={`w-full p-3 border rounded-lg focus:outline-none focus:ring-2 transition-all ${errors.dni ? 'border-red-300 focus:ring-red-200' : 'border-gray-200 focus:ring-blue-500/20 focus:border-blue-500'}`}
                />
                {errors.dni && <p className="text-red-500 text-xs mt-1">{errors.dni}</p>}
              </div>
            </div>

            {/* Apellidos y Nombres */}
            <div className="md:col-span-2 space-y-2">
              <label className="text-sm font-semibold text-gray-700 flex items-center gap-2">
                <User size={16} className="text-blue-500" /> Apellidos y Nombres
              </label>
              <input
                type="text"
                name="full_name"
                value={formData.full_name}
                onChange={handleChange}
                placeholder="PEREZ LOPEZ JUAN CARLOS"
                required
                className={`w-full p-3 border rounded-lg focus:outline-none focus:ring-2 transition-all uppercase ${errors.full_name ? 'border-red-300 focus:ring-red-200' : 'border-gray-200 focus:ring-blue-500/20 focus:border-blue-500'}`}
              />
              {errors.full_name && <p className="text-red-500 text-xs mt-1">{errors.full_name}</p>}
            </div>

            {/* Fecha de Ingreso */}
            <div className="space-y-2">
              <label className="text-sm font-semibold text-gray-700 flex items-center gap-2">
                <Calendar size={16} className="text-blue-500" /> Fecha de Ingreso
              </label>
              <input
                type="date"
                name="entry_date"
                value={formData.entry_date}
                onChange={handleChange}
                required
                className={`w-full p-3 border rounded-lg focus:outline-none focus:ring-2 transition-all ${errors.entry_date ? 'border-red-300 focus:ring-red-200' : 'border-gray-200 focus:ring-blue-500/20 focus:border-blue-500'}`}
              />
              {errors.entry_date && <p className="text-red-500 text-xs mt-1">{errors.entry_date}</p>}
            </div>

            {/* Puesto (Seleccionable Dinámicamente) */}
            <div className="space-y-2">
              <label className="text-sm font-semibold text-gray-700 flex items-center gap-2">
                <Briefcase size={16} className="text-blue-500" /> Puesto / Cargo
              </label>
              <select
                name="role_id"
                value={formData.role_id || ''}
                onChange={handleChange}
                required
                disabled={!formData.business_unit}
                className={`w-full p-3 border rounded-lg focus:outline-none focus:ring-2 transition-all bg-gray-50/50 disabled:bg-gray-100 disabled:text-gray-400 ${errors.role_id ? 'border-red-300 focus:ring-red-200' : 'border-gray-200 focus:ring-blue-500/20 focus:border-blue-500'}`}
              >
                <option value="">Seleccione un puesto</option>
                {positionsList.map(pos => (
                  <option key={pos.id} value={pos.id}>{pos.name}</option>
                ))}
              </select>
              <input type="hidden" name="position" value={formData.position} />
              {errors.role_id && <p className="text-red-500 text-xs mt-1">{errors.role_id}</p>}
            </div>

            {/* Celular */}
            <div className="space-y-2">
              <label className="text-sm font-semibold text-gray-700 flex items-center gap-2">
                <Phone size={16} className="text-blue-500" /> Celular
              </label>
              <input
                type="tel"
                name="phone"
                value={formData.phone}
                onChange={handleChange}
                placeholder="999888777"
                required
                className={`w-full p-3 border rounded-lg focus:outline-none focus:ring-2 transition-all ${errors.phone ? 'border-red-300 focus:ring-red-200' : 'border-gray-200 focus:ring-blue-500/20 focus:border-blue-500'}`}
              />
              {errors.phone && <p className="text-red-500 text-xs mt-1">{errors.phone}</p>}
            </div>

            {/* Correo Corporativo */}
            <div className="space-y-2">
              <label className="text-sm font-semibold text-gray-700 flex items-center gap-2">
                <Mail size={16} className="text-blue-500" /> Correo Corporativo
              </label>
              <input
                type="email"
                name="email"
                value={formData.email}
                onChange={handleChange}
                placeholder="usuario@pauserdistribuciones.com"
                required
                className={`w-full p-3 border rounded-lg focus:outline-none focus:ring-2 transition-all ${errors.email ? 'border-red-300 focus:ring-red-200' : 'border-gray-200 focus:ring-blue-500/20 focus:border-blue-500'}`}
              />
              {errors.email && <p className="text-red-500 text-xs mt-1">{errors.email}</p>}
            </div>

            {/* Cumpleaños */}
            <div className="space-y-2">
              <label className="text-sm font-semibold text-gray-700 flex items-center gap-2">
                <Calendar size={16} className="text-blue-500" /> Cumpleaños
              </label>
              <input
                type="date"
                name="birth_date"
                value={formData.birth_date}
                onChange={handleChange}
                required
                className={`w-full p-3 border rounded-lg focus:outline-none focus:ring-2 transition-all ${errors.birth_date ? 'border-red-300 focus:ring-red-200' : 'border-gray-200 focus:ring-blue-500/20 focus:border-blue-500'}`}
              />
              {errors.birth_date && <p className="text-red-500 text-xs mt-1">{errors.birth_date}</p>}
            </div>

            {/* Dirección */}
            <div className="md:col-span-2 space-y-2">
              <label className="text-sm font-semibold text-gray-700 flex items-center gap-2">
                <MapPin size={16} className="text-blue-500" /> Dirección
              </label>
              <input
                type="text"
                name="address"
                value={formData.address}
                onChange={handleChange}
                placeholder="Calle, Número, Distrito, Provincia"
                required
                className={`w-full p-3 border rounded-lg focus:outline-none focus:ring-2 transition-all uppercase ${errors.address ? 'border-red-300 focus:ring-red-200' : 'border-gray-200 focus:ring-blue-500/20 focus:border-blue-500'}`}
              />
              {errors.address && <p className="text-red-500 text-xs mt-1">{errors.address}</p>}
            </div>

          </div>

          <div className="mt-8 pt-6 border-t border-gray-100 flex items-center justify-end gap-4">
            <button
              type="button"
              onClick={handleCancel}
              className="px-6 py-2.5 text-sm font-medium text-gray-600 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors"
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={loading}
              className={`flex items-center gap-2 px-6 py-2.5 text-sm font-bold text-white bg-blue-600 rounded-lg hover:bg-blue-700 transition-all shadow-sm ${loading ? 'opacity-70 cursor-not-allowed' : ''}`}
            >
              {loading ? (
                <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin"></div>
              ) : (
                <Save size={18} />
              )}
              {isEditing ? 'Actualizar Empleado' : 'Guardar Empleado'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
