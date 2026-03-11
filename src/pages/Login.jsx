import { useState, useEffect } from 'react'
import { useNavigate, useLocation } from 'react-router-dom'
import { signInWithEmail } from '../services/auth'
import { useAuth } from '../context/AuthContext'
import { Mail, Lock, Eye, EyeOff, Sparkles, Shield, Zap } from 'lucide-react'
import pauserLogo from '../assets/pauser_logo.png'

export default function Login() {
  const navigate = useNavigate()
  const location = useLocation()
  const { session } = useAuth()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)

  const from = location.state?.from?.pathname || "/"

  useEffect(() => {
    if (session) {
      navigate(from, { replace: true })
    }
  }, [session, navigate, from])

  const handleLogin = async (e) => {
    e.preventDefault()
    setLoading(true)
    setError(null)

    if (!email || !password) {
      setError('Por favor ingrese correo y contraseña')
      setLoading(false)
      return
    }

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
    if (!emailRegex.test(email.trim())) {
      setError('El formato del correo electrónico no es válido')
      setLoading(false)
      return
    }

    if (password.length < 6) {
      setError('La contraseña debe tener al menos 6 caracteres')
      setLoading(false)
      return
    }

    try {
      const { data, error } = await signInWithEmail(email, password)

      if (error) throw error
      
    } catch (err) {
      if (err.message.includes('Invalid login credentials')) {
        setError('Correo o contraseña incorrectos.')
      } else if (err.message.includes('Email not confirmed')) {
        setError('Por favor verifica tu correo electrónico antes de ingresar.')
      } else {
        setError(err.message || 'Error al iniciar sesión')
      }
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen h-screen flex relative overflow-hidden bg-white">
      {/* Fondo animado con gradientes - Colores Pauser */}
      <div className="absolute inset-0 bg-gradient-to-br from-blue-600 via-white to-red-500">
        <div className="absolute inset-0 opacity-20">
          <div className="absolute top-0 left-1/4 w-96 h-96 bg-yellow-400 rounded-full mix-blend-multiply filter blur-3xl animate-blob"></div>
          <div className="absolute top-0 right-1/4 w-96 h-96 bg-red-500 rounded-full mix-blend-multiply filter blur-3xl animate-blob animation-delay-2000"></div>
          <div className="absolute bottom-0 left-1/3 w-96 h-96 bg-blue-500 rounded-full mix-blend-multiply filter blur-3xl animate-blob animation-delay-4000"></div>
        </div>
      </div>

      {/* Grid pattern overlay */}
      <div className="absolute inset-0 bg-[url('data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iNjAiIGhlaWdodD0iNjAiIHhtbG5zPSJodHRwOi8vd3d3LnczLm9yZy8yMDAwL3N2ZyI+PGRlZnM+PHBhdHRlcm4gaWQ9ImdyaWQiIHdpZHRoPSI2MCIgaGVpZ2h0PSI2MCIgcGF0dGVyblVuaXRzPSJ1c2VyU3BhY2VPblVzZSI+PHBhdGggZD0iTSAxMCAwIEwgMCAwIDAgMTAiIGZpbGw9Im5vbmUiIHN0cm9rZT0iYmxhY2siIHN0cm9rZS13aWR0aD0iMC41IiBvcGFjaXR5PSIwLjA1Ii8+PC9wYXR0ZXJuPjwvZGVmcz48cmVjdCB3aWR0aD0iMTAwJSIgaGVpZ2h0PSIxMDAlIiBmaWxsPSJ1cmwoI2dyaWQpIi8+PC9zdmc+')] opacity-30"></div>

      <div className="relative z-10 flex w-full h-full">
        {/* Panel Izquierdo - Branding */}
        <div className="hidden lg:flex lg:w-1/2 xl:w-3/5 relative">
          <div className="flex flex-col justify-between p-8 xl:p-12 text-slate-900 w-full my-auto">
            {/* Logo y marca */}
            <div className="space-y-6">
              <div className="inline-block animate-fade-in">
                <img 
                  src={pauserLogo} 
                  alt="Pauser" 
                  className="h-20 xl:h-24 w-auto drop-shadow-2xl"
                />
              </div>

              {/* Título principal con animación */}
              <div className="space-y-3 animate-slide-up">
                <h1 className="text-5xl xl:text-6xl font-bold leading-none tracking-tight text-slate-900">
                  Bienvenidos a WebPlataform
                  <span className="block text-4xl xl:text-5xl mt-2">de Gente y Gestión</span>
                </h1>
                <p className="text-lg xl:text-xl text-slate-700 max-w-xl leading-relaxed font-medium">
                  Plataforma empresarial que revoluciona la administración de personal, 
                  control de asistencias y procesos de recursos humanos.
                </p>
              </div>

              {/* Features con iconos */}
              <div className="grid grid-cols-1 gap-3 max-w-lg pt-4 animate-fade-in-delayed">
                <div className="flex items-start gap-3 p-3 rounded-2xl bg-white/80 backdrop-blur-sm border-2 border-blue-200 hover:border-blue-400 hover:bg-white transition-all duration-300 group shadow-md hover:shadow-xl">
                  <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-blue-600 to-blue-700 flex items-center justify-center flex-shrink-0 group-hover:scale-110 transition-transform shadow-lg">
                    <Sparkles className="w-5 h-5 text-white" />
                  </div>
                  <div>
                    <h3 className="font-bold text-slate-900 text-sm mb-0.5">Automatización Inteligente</h3>
                    <p className="text-xs text-slate-600">Optimice procesos y reduzca carga administrativa</p>
                  </div>
                </div>

                <div className="flex items-start gap-3 p-3 rounded-2xl bg-white/80 backdrop-blur-sm border-2 border-red-200 hover:border-red-400 hover:bg-white transition-all duration-300 group shadow-md hover:shadow-xl">
                  <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-red-500 to-red-600 flex items-center justify-center flex-shrink-0 group-hover:scale-110 transition-transform shadow-lg">
                    <Shield className="w-5 h-5 text-white" />
                  </div>
                  <div>
                    <h3 className="font-bold text-slate-900 text-sm mb-0.5">Seguridad Empresarial</h3>
                    <p className="text-xs text-slate-600">Protección de datos y cumplimiento normativo</p>
                  </div>
                </div>

                <div className="flex items-start gap-3 p-3 rounded-2xl bg-white/80 backdrop-blur-sm border-2 border-yellow-200 hover:border-yellow-400 hover:bg-white transition-all duration-300 group shadow-md hover:shadow-xl">
                  <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-yellow-500 to-yellow-600 flex items-center justify-center flex-shrink-0 group-hover:scale-110 transition-transform shadow-lg">
                    <Zap className="w-5 h-5 text-white" />
                  </div>
                  <div>
                    <h3 className="font-bold text-slate-900 text-sm mb-0.5">Análisis en Tiempo Real</h3>
                    <p className="text-xs text-slate-600">Métricas y reportes instantáneos</p>
                  </div>
                </div>
              </div>
            </div>

            {/* Stats en la parte inferior */}
            <div className="grid grid-cols-3 gap-6 pt-6 border-t-2 border-slate-300 animate-fade-in-delayed mt-6">
              <div className="group cursor-default">
                <div className="text-3xl font-bold bg-gradient-to-r from-blue-600 to-blue-700 bg-clip-text text-transparent mb-1 group-hover:scale-110 transition-transform inline-block">
                  24/7
                </div>
                <div className="text-xs text-slate-700 font-bold uppercase tracking-wide">Disponibilidad</div>
              </div>
              <div className="group cursor-default">
                <div className="text-3xl font-bold bg-gradient-to-r from-red-500 to-red-600 bg-clip-text text-transparent mb-1 group-hover:scale-110 transition-transform inline-block">
                  100%
                </div>
                <div className="text-xs text-slate-700 font-bold uppercase tracking-wide">Seguro</div>
              </div>
              <div className="group cursor-default">
                <div className="text-3xl font-bold bg-gradient-to-r from-yellow-500 to-yellow-600 bg-clip-text text-transparent mb-1 group-hover:scale-110 transition-transform inline-block">
                  ∞
                </div>
                <div className="text-xs text-slate-700 font-bold uppercase tracking-wide">Escalable</div>
              </div>
            </div>
          </div>
        </div>

        {/* Panel Derecho - Formulario */}
        <div className="flex-1 flex items-center justify-center p-4 sm:p-6">
          <div className="w-full max-w-md">
            {/* Card del formulario con glassmorphism */}
            <div className="bg-white/95 backdrop-blur-xl rounded-3xl shadow-2xl border-2 border-blue-200 p-6 sm:p-8 animate-slide-up-right">
              {/* Logo móvil */}
              <div className="lg:hidden mb-6">
                <img 
                  src={pauserLogo} 
                  alt="Pauser" 
                  className="h-14 w-auto"
                />
              </div>

              {/* Header */}
              <div className="mb-6">
                <h2 className="text-2xl sm:text-3xl font-bold text-slate-900 mb-1 tracking-tight">
                  Iniciar Sesión
                </h2>
                <p className="text-slate-600 font-medium text-sm">
                  Ingrese sus credenciales para continuar
                </p>
              </div>

              {/* Error Alert */}
              {error && (
                <div className="mb-5 p-3 bg-red-50 border-l-4 border-red-500 rounded-xl animate-shake">
                  <p className="text-sm text-red-800 font-medium">{error}</p>
                </div>
              )}

              {/* Formulario */}
              <form onSubmit={handleLogin} className="space-y-4">
                {/* Email */}
                <div className="space-y-1.5">
                  <label htmlFor="email" className="block text-xs font-bold text-slate-700 uppercase tracking-wide">
                    Correo electrónico
                  </label>
                  <div className="relative group">
                    <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none transition-all duration-200 group-focus-within:text-blue-600">
                      <Mail className="h-4 w-4 text-slate-400 group-focus-within:text-blue-600" />
                    </div>
                    <input
                      id="email"
                      type="email"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      placeholder="correo@empresa.com"
                      className="block w-full pl-10 pr-4 py-3 bg-slate-50 border-2 border-slate-200 rounded-xl text-slate-900 placeholder-slate-400 focus:outline-none focus:bg-white focus:border-blue-600 focus:ring-4 focus:ring-blue-500/20 transition-all duration-200 font-medium text-sm"
                    />
                  </div>
                </div>

                {/* Contraseña */}
                <div className="space-y-1.5">
                  <label htmlFor="password" className="block text-xs font-bold text-slate-700 uppercase tracking-wide">
                    Contraseña
                  </label>
                  <div className="relative group">
                    <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none transition-all duration-200">
                      <Lock className="h-4 w-4 text-slate-400 group-focus-within:text-blue-600" />
                    </div>
                    <input
                      id="password"
                      type={showPassword ? "text" : "password"}
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      placeholder="••••••••"
                      className="block w-full pl-10 pr-12 py-3 bg-slate-50 border-2 border-slate-200 rounded-xl text-slate-900 placeholder-slate-400 focus:outline-none focus:bg-white focus:border-blue-600 focus:ring-4 focus:ring-blue-500/20 transition-all duration-200 font-medium text-sm"
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword(!showPassword)}
                      className="absolute inset-y-0 right-0 pr-3 flex items-center text-slate-400 hover:text-slate-700 focus:outline-none transition-colors"
                    >
                      {showPassword ? (
                        <EyeOff className="h-4 w-4" />
                      ) : (
                        <Eye className="h-4 w-4" />
                      )}
                    </button>
                  </div>
                </div>

                {/* Opciones */}
                <div className="flex items-center justify-between pt-1">
                  <label className="flex items-center cursor-pointer group">
                    <input
                      type="checkbox"
                      className="w-4 h-4 text-blue-600 border-2 border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 cursor-pointer transition-all"
                    />
                    <span className="ml-2 text-xs text-slate-700 group-hover:text-slate-900 transition-colors font-medium">
                      Recordarme
                    </span>
                  </label>
                  <a href="#" className="text-xs font-bold text-blue-600 hover:text-blue-700 transition-colors hover:underline">
                    ¿Olvidó su contraseña?
                  </a>
                </div>

                {/* Botón Submit con colores Pauser */}
                <button
                  type="submit"
                  disabled={loading}
                  className="relative w-full bg-gradient-to-r from-blue-600 to-blue-700 hover:from-blue-700 hover:to-blue-800 text-white font-bold py-3.5 px-6 rounded-xl transition-all duration-300 flex items-center justify-center gap-2 disabled:opacity-60 disabled:cursor-not-allowed shadow-xl shadow-blue-500/40 hover:shadow-2xl hover:shadow-blue-600/50 hover:scale-[1.02] active:scale-[0.98] group overflow-hidden mt-5"
                >
                  <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/20 to-transparent -translate-x-full group-hover:translate-x-full transition-transform duration-1000"></div>
                  {loading ? (
                    <div className="w-5 h-5 border-3 border-white/30 border-t-white rounded-full animate-spin"></div>
                  ) : (
                    <>
                      <span className="text-sm tracking-wide">INGRESAR</span>
                      <svg className="w-4 h-4 group-hover:translate-x-1 transition-transform" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M13 7l5 5m0 0l-5 5m5-5H6" />
                      </svg>
                    </>
                  )}
                </button>
              </form>

              {/* Footer */}
              <div className="mt-6 pt-5 border-t border-slate-200">
                <p className="text-xs text-center text-slate-500 font-medium">
                  © 2026 Pauser Distribuciones. Todos los derechos reservados.
                </p>
              </div>
            </div>
          </div>
        </div>
      </div>

      <style>{`
        @keyframes blob {
          0%, 100% { transform: translate(0, 0) scale(1); }
          25% { transform: translate(20px, -50px) scale(1.1); }
          50% { transform: translate(-20px, 20px) scale(0.9); }
          75% { transform: translate(50px, 50px) scale(1.05); }
        }

        @keyframes fade-in {
          from { opacity: 0; }
          to { opacity: 1; }
        }

        @keyframes slide-up {
          from { 
            opacity: 0;
            transform: translateY(30px);
          }
          to { 
            opacity: 1;
            transform: translateY(0);
          }
        }

        @keyframes slide-up-right {
          from { 
            opacity: 0;
            transform: translateX(30px) translateY(30px);
          }
          to { 
            opacity: 1;
            transform: translateX(0) translateY(0);
          }
        }

        @keyframes shake {
          0%, 100% { transform: translateX(0); }
          25% { transform: translateX(-5px); }
          75% { transform: translateX(5px); }
        }

        .animate-blob {
          animation: blob 7s infinite;
        }

        .animation-delay-2000 {
          animation-delay: 2s;
        }

        .animation-delay-4000 {
          animation-delay: 4s;
        }

        .animate-fade-in {
          animation: fade-in 1s ease-out;
        }

        .animate-fade-in-delayed {
          animation: fade-in 1s ease-out 0.3s both;
        }

        .animate-slide-up {
          animation: slide-up 0.8s ease-out 0.2s both;
        }

        .animate-slide-up-right {
          animation: slide-up-right 0.6s ease-out;
        }

        .animate-shake {
          animation: shake 0.4s ease-out;
        }
      `}</style>
    </div>
  )
}