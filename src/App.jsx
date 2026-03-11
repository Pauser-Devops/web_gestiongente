import { BrowserRouter as Router, Routes, Route, Navigate, useLocation, Outlet } from 'react-router-dom'
import { AuthProvider, useAuth } from './context/AuthContext'
import { ToastProvider } from './context/ToastContext'
import ProtectedRoute from './components/ProtectedRoute'
import Login from './pages/Login'
import Dashboard from './pages/Dashboard'
import RegisterEmployee from './pages/RegisterEmployee'
import EmployeesList from './pages/EmployeesList'
import AttendanceList from './pages/AttendanceList'
import RequestsList from './pages/RequestsList'
import CalendarRequests from './pages/CalendarRequests'
import RolesManagement from './pages/RolesManagement'
import PositionsManagement from './pages/PositionsManagement'
import AreasManagement from './pages/AreasManagement'
import MobileAccessConfig from './pages/MobileAccessConfig'
import MyTeam from './pages/MyTeam'
import VacationDashboard from './pages/VacationDashboard'
import VacationExcelUpload from './pages/VacationExcelUpload'
import ReportsCenter from './pages/ReportsCenter'
import PapeletaVacaciones from './components/PapeletaVacaciones'
import DashboardLayout from './layouts/DashboardLayout'
import EmployeeLifecycle from './pages/EmployeeLifecycle'
import OrganizationStructure from './pages/OrganizationStructure'
import HierarchyManagement from './pages/HierarchyManagement'

// Página 404
const NotFound = () => (
  <div className="min-h-screen flex flex-col items-center justify-center bg-gray-50 p-8 text-center">
    <div className="bg-white rounded-2xl shadow-lg p-10 max-w-md w-full">
      <div className="text-7xl font-bold text-blue-600 mb-2">404</div>
      <h1 className="text-2xl font-bold text-gray-800 mb-2">Página no encontrada</h1>
      <p className="text-gray-500 mb-6">La ruta que buscas no existe o fue movida.</p>
      <button
        onClick={() => window.history.back()}
        className="px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors font-medium"
      >
        Volver Atrás
      </button>
    </div>
  </div>
)

// Layout Wrapper para rutas privadas
const PrivateLayout = () => {
  const { session, loading } = useAuth()
  const location = useLocation()

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
      </div>
    )
  }

  if (!session) {
    return <Navigate to="/login" state={{ from: location }} replace />
  }

  return (
    <DashboardLayout>
      <Outlet />
    </DashboardLayout>
  )
}

function App() {
  return (
    <ToastProvider>
      <AuthProvider>
        <Router>
          <Routes>
            <Route path="/login" element={<Login />} />

            {/* Rutas Privadas con Layout Persistente */}
            <Route element={<PrivateLayout />}>
              <Route path="/" element={
                <ProtectedRoute module="dashboard">
                  <Dashboard />
                </ProtectedRoute>
              } />

              {/* Rutas de Empleados */}
              <Route path="/register-employee" element={
                <ProtectedRoute module="employees" requiredAction="write">
                  <RegisterEmployee />
                </ProtectedRoute>
              } />

              <Route path="/edit-employee/:id" element={
                <ProtectedRoute module="employees" requiredAction="write">
                  <RegisterEmployee />
                </ProtectedRoute>
              } />

              {/* Nueva ruta unificada de Empleados */}
              <Route path="/employees" element={
                <ProtectedRoute module="employees">
                  <EmployeesList />
                </ProtectedRoute>
              } />

              {/* Nueva vista dedicada para "Mi Equipo" (Supervisores/Coordinadores) */}
              <Route path="/my-team" element={
                <ProtectedRoute module="employees">
                  <MyTeam />
                </ProtectedRoute>
              } />

              <Route path="/employees/:sede" element={
                <ProtectedRoute module="employees">
                  <EmployeesList />
                </ProtectedRoute>
              } />

              {/* Ruta para ver lista de asistencias */}
              <Route path="/attendance-list" element={
                <ProtectedRoute module="attendance">
                  <AttendanceList />
                </ProtectedRoute>
              } />

              {/* Nueva ruta de Gestión de Altas y Bajas */}
              <Route path="/lifecycle" element={
                <ProtectedRoute module="lifecycle">
                  <EmployeeLifecycle />
                </ProtectedRoute>
              } />

              {/* Ruta para lista de solicitudes */}
              <Route path="/requests" element={
                <ProtectedRoute module="requests">
                  <RequestsList />
                </ProtectedRoute>
              } />

              {/* Ruta para calendario de solicitudes */}
              <Route path="/calendar" element={
                <ProtectedRoute module="calendar">
                  <CalendarRequests />
                </ProtectedRoute>
              } />

              {/* Ruta para gestión de roles */}
              <Route path="/roles" element={
                <ProtectedRoute module="settings">
                  <RolesManagement />
                </ProtectedRoute>
              } />

              {/* Gestión de Cargos */}
              <Route path="/positions" element={
                <ProtectedRoute module="config">
                  <PositionsManagement />
                </ProtectedRoute>
              } />

              {/* Gestión de Áreas */}
              <Route path="/areas" element={
                <ProtectedRoute module="config">
                  <AreasManagement />
                </ProtectedRoute>
              } />

              <Route path="/organization-structure" element={
                <ProtectedRoute module="settings" requiredAction="write">
                  <OrganizationStructure />
                </ProtectedRoute>
              } />

              {/* Gestión de Jerarquías (Supervisores Directos) */}
              <Route path="/hierarchy-management" element={
                <ProtectedRoute module="settings" requiredAction="write">
                  <HierarchyManagement />
                </ProtectedRoute>
              } />

              {/* Configuración de Acceso Móvil */}
              <Route path="/mobile-access-config" element={
                <ProtectedRoute module="settings">
                  <MobileAccessConfig />
                </ProtectedRoute>
              } />

              {/* Ruta para ver Papeleta de Vacaciones */}
              <Route path="/papeleta/:id" element={
                <ProtectedRoute module="requests">
                  <PapeletaVacaciones />
                </ProtectedRoute>
              } />

              {/* Rutas de Gestión de Vacaciones */}
              <Route path="/vacaciones" element={
                <ProtectedRoute module="vacations">
                  <VacationDashboard />
                </ProtectedRoute>
              } />
              
              <Route path="/vacaciones/carga-masiva" element={
                <ProtectedRoute module="vacations" requiredAction="write">
                  <VacationExcelUpload />
                </ProtectedRoute>
              } />

              {/* Centro de Reportes - Accesible para roles con permisos de lectura o Admin */}
              <Route path="/reports" element={
                <ProtectedRoute module="dashboard">
                  <ReportsCenter />
                </ProtectedRoute>
              } />
            </Route>

            {/* Ruta 404 */}
            <Route path="*" element={<NotFound />} />
          </Routes>
        </Router>
      </AuthProvider>
    </ToastProvider>
  )
}

export default App
