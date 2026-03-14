import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { useToast } from '../context/ToastContext'
import { getPendingValidations, validateAttendance } from '../services/attendance'
import { supabase } from '../lib/supabase'
import { CheckCircle, XCircle, Clock, MapPin, FileText, AlertCircle } from 'lucide-react'
import Modal from '../components/ui/Modal'

export default function AttendanceValidation() {
    const { user } = useAuth()
    const { showToast } = useToast()
    const [attendances, setAttendances] = useState([])
    const [loading, setLoading] = useState(true)
    const [filter, setFilter] = useState('pending')
    const [validating, setValidating] = useState(null)
    const [modalConfig, setModalConfig] = useState({ isOpen: false, title: '', message: '', type: 'info', onConfirm: null, showInput: false })
    const [modalInput, setModalInput] = useState('')
    const navigate = useNavigate()

    useEffect(() => {
        // Verificar permisos al montar
        if (user) {
            const allowedRoles = ['ANALISTA_RRHH', 'JEFE_RRHH', 'ADMIN', 'SUPERVISOR_VENTAS', 'JEFE_VENTAS', 'SUPERVISOR_OPERACIONES', 'COORDINADOR_OPERACIONES']
            const userRole = user.role || user.employee_type // Fallback
            
            // También verificar por cargo (position) por si acaso el role interno no se actualizó
            const userPosition = user.position ? user.position.toUpperCase() : ''
            const isHR = userPosition.includes('ANALISTA DE GENTE') || 
                        userPosition.includes('JEFE DE ÁREA') || 
                        userPosition.includes('JEFE DE GENTE')

            if (!allowedRoles.includes(userRole) && !isHR) {
                showToast('No tiene permisos para acceder a esta página', 'error')
                navigate('/')
                return
            }
            
            loadAttendances()
        }
    }, [user, navigate])

    async function loadAttendances() {
        try {
            setLoading(true)
            const data = await getPendingValidations(user.employee_id)
            setAttendances(data)
        } catch (error) {
            console.error('Error cargando asistencias:', error)
            showToast('Error cargando asistencias: ' + error.message, 'error')
        } finally {
            setLoading(false)
        }
    }

    const openValidationModal = (attendanceId, approved) => {
        setModalInput('')
        setModalConfig({
            isOpen: true,
            title: approved ? 'Aprobar Asistencia' : 'Rechazar Asistencia',
            message: approved ? '¿Desea agregar alguna nota opcional?' : 'Indique la razón del rechazo:',
            type: approved ? 'info' : 'warning',
            showInput: true,
            inputPlaceholder: approved ? 'Nota opcional...' : 'Razón del rechazo...',
            confirmText: approved ? 'Aprobar' : 'Rechazar',
            onConfirm: () => handleValidate(attendanceId, approved)
        })
    }

    async function handleValidate(attendanceId, approved) {
        const notes = modalInput

        if (!approved && !notes) {
            showToast('Debe indicar la razón del rechazo', 'warning')
            return
        }

        try {
            setValidating(attendanceId)
            await validateAttendance({
                attendanceId,
                supervisorId: user.employee_id,
                approved,
                notes
            })

            showToast(approved ? 'Asistencia validada correctamente' : 'Asistencia rechazada', 'success')

            // Notificar al empleado (best-effort)
            try {
                const attendanceRecord = attendances.find(a => a.attendance_id === attendanceId)
                // employee_id puede venir del RPC o necesitar una consulta directa
                let employeeId = attendanceRecord?.employee_id
                if (!employeeId) {
                    const { data: attRow } = await supabase
                        .from('attendance')
                        .select('employee_id')
                        .eq('id', attendanceId)
                        .single()
                    employeeId = attRow?.employee_id
                }
                if (employeeId) {
                    const workDate = attendanceRecord?.work_date
                        ? new Date(attendanceRecord.work_date).toLocaleDateString('es-PE')
                        : 'la fecha registrada'
                    await supabase.from('notifications').insert({
                        employee_id: employeeId,
                        title: approved ? 'Tu asistencia fue validada' : 'Tu asistencia fue rechazada',
                        message: approved
                            ? `Tu registro de asistencia del ${workDate} fue validado por tu supervisor.`
                            : `Tu registro de asistencia del ${workDate} fue rechazado. Motivo: ${notes || 'sin especificar'}.`,
                        type: approved ? 'SUCCESS' : 'WARNING',
                        metadata: { attendance_id: attendanceId, approved, notes },
                    })
                }
            } catch (_) { /* no bloquear la acción principal */ }
            setModalConfig(prev => ({ ...prev, isOpen: false }))
            loadAttendances()
        } catch (error) {
            console.error('Error validando:', error)
            showToast('Error: ' + error.message, 'error')
        } finally {
            setValidating(null)
        }
    }

    function formatDate(dateString) {
        return new Date(dateString).toLocaleDateString('es-ES', {
            weekday: 'long',
            year: 'numeric',
            month: 'long',
            day: 'numeric'
        })
    }

    function formatTime(dateString) {
        if (!dateString) return '-'
        return new Date(dateString).toLocaleTimeString('es-ES', {
            hour: '2-digit',
            minute: '2-digit'
        })
    }

    if (loading) {
        return (
            <div className="flex items-center justify-center min-h-screen">
                <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
            </div>
        )
    }

    return (
        <div className="p-6">
            <div className="mb-6">
                <h1 className="text-3xl font-bold text-gray-900">Validar Asistencias</h1>
                <p className="text-gray-600 mt-2">
                    Revise y valide las asistencias de su equipo
                </p>
            </div>

            {/* Estadísticas */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
                <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4">
                    <div className="flex items-center justify-between">
                        <div>
                            <p className="text-sm text-yellow-600 font-medium">Pendientes</p>
                            <p className="text-2xl font-bold text-yellow-700">{attendances.length}</p>
                        </div>
                        <Clock className="h-8 w-8 text-yellow-500" />
                    </div>
                </div>
            </div>

            {/* Lista de asistencias */}
            {attendances.length === 0 ? (
                <div className="bg-white rounded-lg shadow p-8 text-center">
                    <CheckCircle className="h-16 w-16 text-green-500 mx-auto mb-4" />
                    <h3 className="text-xl font-semibold text-gray-900 mb-2">
                        ¡Todo al día!
                    </h3>
                    <p className="text-gray-600">
                        No hay asistencias pendientes de validación
                    </p>
                </div>
            ) : (
                <div className="space-y-4">
                    {attendances.map((attendance) => (
                        <div
                            key={attendance.attendance_id}
                            className="bg-white rounded-lg shadow-md p-6 hover:shadow-lg transition-shadow"
                        >
                            <div className="flex items-start justify-between">
                                <div className="flex-1">
                                    {/* Empleado */}
                                    <div className="flex items-center mb-3">
                                        <div className="h-10 w-10 rounded-full bg-blue-100 flex items-center justify-center mr-3">
                                            <span className="text-blue-700 font-semibold">
                                                {attendance.employee_name.split(' ').map(n => n[0]).join('').slice(0, 2)}
                                            </span>
                                        </div>
                                        <div>
                                            <h3 className="font-semibold text-gray-900">
                                                {attendance.employee_name}
                                            </h3>
                                            <p className="text-sm text-gray-500">
                                                DNI: {attendance.employee_dni}
                                            </p>
                                        </div>
                                    </div>

                                    {/* Detalles */}
                                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
                                        <div>
                                            <p className="text-sm text-gray-500 mb-1">Fecha</p>
                                            <p className="font-medium">{formatDate(attendance.work_date)}</p>
                                        </div>
                                        <div>
                                            <p className="text-sm text-gray-500 mb-1">Tipo</p>
                                            <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${attendance.record_type === 'ASISTENCIA' ? 'bg-green-100 text-green-800' :
                                                    attendance.record_type === 'PERMISO' ? 'bg-yellow-100 text-yellow-800' :
                                                        attendance.record_type === 'VACACIONES' ? 'bg-blue-100 text-blue-800' :
                                                            'bg-gray-100 text-gray-800'
                                                }`}>
                                                {attendance.record_type}
                                            </span>
                                        </div>
                                        <div>
                                            <p className="text-sm text-gray-500 mb-1">Entrada</p>
                                            <p className="font-medium flex items-center">
                                                <Clock className="h-4 w-4 mr-1" />
                                                {formatTime(attendance.check_in)}
                                                {attendance.is_late && (
                                                    <span className="ml-2 text-xs text-red-600 font-semibold">TARDE</span>
                                                )}
                                            </p>
                                        </div>
                                        <div>
                                            <p className="text-sm text-gray-500 mb-1">Salida</p>
                                            <p className="font-medium flex items-center">
                                                <Clock className="h-4 w-4 mr-1" />
                                                {formatTime(attendance.check_out)}
                                            </p>
                                        </div>
                                    </div>

                                    {/* Notas */}
                                    {attendance.notes && (
                                        <div className="mb-4 p-3 bg-gray-50 rounded-lg">
                                            <p className="text-sm text-gray-500 mb-1 flex items-center">
                                                <FileText className="h-4 w-4 mr-1" />
                                                Notas
                                            </p>
                                            <p className="text-sm text-gray-700">{attendance.notes}</p>
                                        </div>
                                    )}

                                    {/* Evidencia */}
                                    {attendance.evidence_url && (
                                        <div className="mb-4">
                                            <a
                                                href={attendance.evidence_url}
                                                target="_blank"
                                                rel="noopener noreferrer"
                                                className="text-blue-600 hover:text-blue-800 text-sm flex items-center"
                                            >
                                                <FileText className="h-4 w-4 mr-1" />
                                                Ver evidencia adjunta
                                            </a>
                                        </div>
                                    )}
                                </div>

                                {/* Botones de acción */}
                                <div className="flex flex-col gap-2 ml-4">
                                    <button
                                        onClick={() => openValidationModal(attendance.attendance_id, true)}
                                        disabled={validating === attendance.attendance_id}
                                        className="flex items-center gap-2 px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                                    >
                                        <CheckCircle className="h-5 w-5" />
                                        Aprobar
                                    </button>
                                    <button
                                        onClick={() => openValidationModal(attendance.attendance_id, false)}
                                        disabled={validating === attendance.attendance_id}
                                        className="flex items-center gap-2 px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                                    >
                                        <XCircle className="h-5 w-5" />
                                        Rechazar
                                    </button>
                                </div>
                            </div>
                        </div>
                    ))}
                </div>
            )}

            <Modal
                isOpen={modalConfig.isOpen}
                onClose={() => setModalConfig(prev => ({ ...prev, isOpen: false }))}
                title={modalConfig.title}
                message={modalConfig.message}
                type={modalConfig.type}
                confirmText={modalConfig.confirmText}
                onConfirm={modalConfig.onConfirm}
                showCancel
            >
                {modalConfig.showInput && (
                    <div className="mt-4">
                        <textarea
                            value={modalInput}
                            onChange={(e) => setModalInput(e.target.value)}
                            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                            placeholder={modalConfig.inputPlaceholder}
                            rows={3}
                            autoFocus
                        />
                    </div>
                )}
            </Modal>
        </div>
    )
}
