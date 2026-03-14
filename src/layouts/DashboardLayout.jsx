import { useState } from 'react'
import { useLocation } from 'react-router-dom'
import Sidebar from '../components/Sidebar'
import Navbar from '../components/Navbar'

export default function DashboardLayout({ children }) {
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const [isCollapsed, setIsCollapsed] = useState(false)
  const location = useLocation()

  // Determinar si la vista requiere ancho completo
  // Se aplica específicamente para la vista de Monitor de Vacaciones (/vacaciones), Asistencias y Empleados
  const isFullWidthPage =
    location.pathname === '/vacaciones' ||
    location.pathname === '/attendance-list' ||
    location.pathname.startsWith('/employees') ||
    location.pathname === '/areas' ||
    location.pathname === '/schedules'

  return (
    <div className="min-h-screen bg-gray-50 flex">
      <Sidebar 
        isOpen={sidebarOpen} 
        setIsOpen={setSidebarOpen} 
        isCollapsed={isCollapsed}
        setIsCollapsed={setIsCollapsed}
      />

      <div className="flex-1 flex flex-col min-h-screen transition-all duration-300 ease-in-out w-full">
        <Navbar 
          setSidebarOpen={setSidebarOpen} 
          isCollapsed={isCollapsed}
        />

        <main className={`flex-1 p-6 md:p-8 ${isCollapsed ? 'lg:pl-20' : 'lg:pl-72'} transition-all duration-300`}>
          <div className={`${isFullWidthPage ? 'max-w-full' : 'max-w-7xl'} mx-auto w-full`}>
            {children}
          </div>
        </main>
      </div>
    </div>
  )
}
