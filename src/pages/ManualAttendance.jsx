import { useState, useEffect } from 'react'
import { useAuth } from '../context/AuthContext'
import { useNavigate } from 'react-router-dom'
import { getTeamAttendance, registerManualAttendance } from '../services/attendance'
import { supabase } from '../lib/supabase'
import { Calendar, Clock, User, FileText, Save } from 'lucide-react'

export default function ManualAttendance() {
    const { user } = useAuth()
    const navigate = useNavigate()
    const [employees, setEmployees] = useState([])
    const [loading, setLoading] = useState(true)
    const [submitting, setSubmitting] = useState(false)

    const [formData, setFormData] = useState({
        employeeId: '',
        workDate: new Date().toISOString().split('T')[0],
        checkIn: '08:00',
        checkOut: '17:00',
        recordType: 'ASISTENCIA',
        notes: ''
    })

    useEffect(() => {
        loadEmployees()
    }, [])

    async function loadEmployees() {
        try {
            setLoading(true)
            const data = await getTeamAttendance(user.employee_id)

            // Extraer empleados únicos
            const uniqueEmployees = {}
            data.forEach(member => {
                if (!uniqueEmployees[member.employee_id]) {
                    uniqueEmployees[member.employee_id] = {
                        id: member.employee_id,
                        name: member.full_name,
                        position: member.position
                    }
                }
            })

            setEmployees(Object.values(uniqueEmployees))
        } catch (error) {
            console.error('Error cargando empleados:', error)
            alert('Error cargando empleados: ' + error.message)
        } finally {
            setLoading(false)
        }
    }

    async function handleSubmit(e) {
        e.preventDefault()

        if (!formData.employeeId) {
            alert('Seleccione un empleado')
            return
        }

        try {
            setSubmitting(true)

            // Combinar fecha con horas
            const checkInDateTime = `${formData.workDate}T${formData.checkIn}:00`
            const checkOutDateTime = formData.checkOut
                ? `${formData.workDate}T${formData.checkOut}:00`
                : null

            await registerManualAttendance({
                employeeId: formData.employeeId,
                supervisorId: user.employee_id,
                workDate: formData.workDate,
                checkIn: checkInDateTime,
                checkOut: checkOutDateTime,
                recordType: formData.recordType,
                notes: formData.notes || null
            })

            // Notificar al empleado (best-effort)
            try {
                const workDateFormatted = new Date(formData.workDate + 'T00:00:00').toLocaleDateString('es-PE')
                await supabase.from('notifications').insert({
                    employee_id: formData.employeeId,
                    title: 'Asistencia registrada manualmente',
                    message: `Tu asistencia del ${workDateFormatted} fue registrada manualmente como ${formData.recordType}${formData.notes ? ': ' + formData.notes : ''}.`,
                    type: 'INFO',
                    metadata: { work_date: formData.workDate, record_type: formData.recordType },
                })
            } catch (_) { /* no bloquear la acción principal */ }

            alert('Registro manual creado correctamente')
            navigate('/')
        } catch (error) {
            console.error('Error registrando:', error)
            alert('Error: ' + error.message)
        } finally {
            setSubmitting(false)
        }
    }

    if (loading) {
        return (
            <div className="flex items-center justify-center min-h-screen">
                <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
            </div>
        )
    }

    return (
        <div className="p-6 max-w-3xl mx-auto">
            <div className="mb-6">
                <h1 className="text-3xl font-bold text-gray-900">Registro Manual de Asistencia</h1>
                <p className="text-gray-600 mt-2">
                    Registre asistencias manualmente para su equipo
                </p>
            </div>

            {/* Información */}
            <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 mb-6">
                <p className="text-sm text-blue-800">
                    ℹ️ Use esta función para registrar asistencias que no fueron marcadas automáticamente
                </p>
            </div>

            <form onSubmit={handleSubmit} className="bg-white rounded-lg shadow-md p-6 space-y-6">
                {/* Empleado */}
                <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                        <User className="inline h-4 w-4 mr-1" />
                        Empleado *
                    </label>
                    <select
                        value={formData.employeeId}
                        onChange={(e) => setFormData({ ...formData, employeeId: e.target.value })}
                        required
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                    >
                        <option value="">Seleccione un empleado</option>
                        {employees.map(emp => (
                            <option key={emp.id} value={emp.id}>
                                {emp.name} - {emp.position}
                            </option>
                        ))}
                    </select>
                </div>

                {/* Fecha */}
                <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                        <Calendar className="inline h-4 w-4 mr-1" />
                        Fecha *
                    </label>
                    <input
                        type="date"
                        value={formData.workDate}
                        onChange={(e) => setFormData({ ...formData, workDate: e.target.value })}
                        max={new Date().toISOString().split('T')[0]}
                        required
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                    />
                </div>

                {/* Horas */}
                <div className="grid grid-cols-2 gap-4">
                    <div>
                        <label className="block text-sm font-medium text-gray-700 mb-2">
                            <Clock className="inline h-4 w-4 mr-1" />
                            Hora de Entrada *
                        </label>
                        <input
                            type="time"
                            value={formData.checkIn}
                            onChange={(e) => setFormData({ ...formData, checkIn: e.target.value })}
                            required
                            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                        />
                    </div>
                    <div>
                        <label className="block text-sm font-medium text-gray-700 mb-2">
                            <Clock className="inline h-4 w-4 mr-1" />
                            Hora de Salida (Opcional)
                        </label>
                        <input
                            type="time"
                            value={formData.checkOut}
                            onChange={(e) => setFormData({ ...formData, checkOut: e.target.value })}
                            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                        />
                    </div>
                </div>

                {/* Tipo de Registro */}
                <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                        <FileText className="inline h-4 w-4 mr-1" />
                        Tipo de Registro *
                    </label>
                    <select
                        value={formData.recordType}
                        onChange={(e) => setFormData({ ...formData, recordType: e.target.value })}
                        required
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                    >
                        <option value="ASISTENCIA">Asistencia</option>
                        <option value="PERMISO">Permiso</option>
                        <option value="VACACIONES">Vacaciones</option>
                        <option value="LICENCIA">Licencia Médica</option>
                    </select>
                </div>

                {/* Notas */}
                <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                        <FileText className="inline h-4 w-4 mr-1" />
                        Notas (Opcional)
                    </label>
                    <textarea
                        value={formData.notes}
                        onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
                        rows={3}
                        placeholder="Agregue notas o comentarios..."
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                    />
                </div>

                {/* Botones */}
                <div className="flex gap-3">
                    <button
                        type="submit"
                        disabled={submitting}
                        className="flex-1 flex items-center justify-center gap-2 px-4 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors font-medium"
                    >
                        {submitting ? (
                            <>
                                <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-white"></div>
                                Registrando...
                            </>
                        ) : (
                            <>
                                <Save className="h-5 w-5" />
                                Registrar Asistencia
                            </>
                        )}
                    </button>
                    <button
                        type="button"
                        onClick={() => navigate('/')}
                        className="px-4 py-3 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 transition-colors font-medium"
                    >
                        Cancelar
                    </button>
                </div>
            </form>
        </div>
    )
}
