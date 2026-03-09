import { useState, useRef } from 'react'
import * as XLSX from 'xlsx'
import { supabase } from '../lib/supabase'
import { bulkImportEmployees } from '../services/bulkEmployees'
import { Upload, FileSpreadsheet, CheckCircle, AlertTriangle, Save, RefreshCw, X, Building2 } from 'lucide-react'

export default function EmployeeExcelUpload({ onClose, onSuccess, defaultSede, defaultBusinessUnit }) {
    const [file, setFile] = useState(null)
    const [previewData, setPreviewData] = useState([])
    const [loading, setLoading] = useState(false)
    const [uploadResult, setUploadResult] = useState(null)
    const fileInputRef = useRef(null)

    // Estado para unidades de negocio disponibles
    const [availableBusinessUnits, setAvailableBusinessUnits] = useState([])
    const [selectedBusinessUnit, setSelectedBusinessUnit] = useState(defaultBusinessUnit || '')
    const [loadingBUs, setLoadingBUs] = useState(false)

    // Determina si hay que mostrar el selector de BU
    const needsBUSelection = !defaultBusinessUnit && availableBusinessUnits.length > 1
    const canImport = !needsBUSelection || selectedBusinessUnit !== ''

    const fetchBusinessUnitsForSede = async (sede) => {
        if (!sede) return
        setLoadingBUs(true)
        try {
            // Obtener BUs distintas de empleados activos en esa sede
            const { data } = await supabase
                .from('employees')
                .select('business_unit')
                .ilike('sede', sede)
                .eq('is_active', true)
                .not('business_unit', 'is', null)

            if (data && data.length > 0) {
                const unique = [...new Set(data.map(r => r.business_unit).filter(Boolean).map(s => s.trim().toUpperCase()))]
                    .sort()
                setAvailableBusinessUnits(unique)

                // Si solo hay 1, auto-asignar
                if (unique.length === 1) {
                    setSelectedBusinessUnit(unique[0])
                }
            }
        } catch (e) {
            console.error('Error fetching business units:', e)
        } finally {
            setLoadingBUs(false)
        }
    }

    const handleFileChange = (e) => {
        const selectedFile = e.target.files[0]
        if (selectedFile) {
            setFile(selectedFile)
            readExcel(selectedFile)
            // Si no hay BU fija, buscar las disponibles para la sede
            if (!defaultBusinessUnit && defaultSede) {
                fetchBusinessUnitsForSede(defaultSede)
            }
        }
    }

    const readExcel = (file) => {
        const reader = new FileReader()
        reader.onload = (e) => {
            const data = new Uint8Array(e.target.result)
            const workbook = XLSX.read(data, { type: 'array' })
            const sheetName = workbook.SheetNames[0]
            const sheet = workbook.Sheets[sheetName]

            const rawData = XLSX.utils.sheet_to_json(sheet, { header: 1, blankrows: false })
            if (rawData.length === 0) return

            // Smart Header Detection
            let headerRowIndex = 0;
            const possibleDniHeaders = ['DNI', 'DOCUMENTO', 'CODIGO', 'NUMERO DE DOCUMENTO DE IDENTIDAD'];
            for (let i = 0; i < Math.min(rawData.length, 50); i++) {
                const row = rawData[i];
                if (row.some(cell => cell && typeof cell === 'string' && possibleDniHeaders.includes(cell.toUpperCase().trim()))) {
                    headerRowIndex = i;
                    break;
                }
            }

            const headers = rawData[headerRowIndex];
            const rows = rawData.slice(headerRowIndex + 1);

            const jsonData = rows.map((row, index) => {
                const getVal = (colNames, excludeTerms = []) => {
                    const excludes = Array.isArray(excludeTerms) ? excludeTerms : [excludeTerms]
                    const colIndex = headers.findIndex(h =>
                        h &&
                        colNames.some(name => String(h).toUpperCase().trim().includes(name.toUpperCase())) &&
                        !excludes.some(ex => String(h).toUpperCase().includes(ex.toUpperCase()))
                    )
                    return colIndex !== -1 ? row[colIndex] : null
                }

                const rawDocType = getVal(['TIPO DE DOCUMENTO', 'TIPO DOC', 'TIPO'])
                const dni = getVal(['NUMERO DE DOCUMENTO', 'DNI', 'DOCUMENTO', 'N° DOC'], ['TIPO'])
                const fullName = getVal(['APELLIDOS Y NOMBRES', 'NOMBRES', 'NOMBRE COMPLETO'])
                const sedeExcel = getVal(['SEDE', 'UBICACION'])
                const sede = sedeExcel ? String(sedeExcel).trim() : (defaultSede || '')
                const position = getVal(['CARGO', 'PUESTO'])
                const entryDateRaw = getVal(['FECHA DE INGRESO', 'F. INGRESO'])
                const email = getVal(['CORREO', 'EMAIL'])
                const phone = getVal(['CELULAR', 'TELEFONO', 'MOVIL'])
                const birthDateRaw = getVal(['FECHA DE NACIMIENTO', 'NACIMIENTO', 'CUMPLEAÑOS'])
                const address = getVal(['DIRECCIÓN', 'DIRECCION', 'DOMICILIO'])

                let docType = 'DNI'
                if (rawDocType && String(rawDocType).toUpperCase().includes('EXTRANJER')) {
                    docType = 'CE'
                }

                return {
                    id: index,
                    dni: dni ? String(dni).trim() : '',
                    document_type: docType,
                    full_name: fullName ? String(fullName).trim() : '',
                    sede: sede ? String(sede).trim() : '',
                    business_unit: defaultBusinessUnit || '',
                    position: position ? String(position).trim() : '',
                    entry_date: parseExcelDate(entryDateRaw),
                    email: email ? String(email).trim() : '',
                    phone: phone ? String(phone).trim() : '',
                    birth_date: parseExcelDate(birthDateRaw),
                    address: address ? String(address).trim() : '',
                    isValid: Boolean(dni && fullName && String(dni).length >= 5)
                }
            }).filter(item => item.dni || item.full_name)

            setPreviewData(jsonData)
            setUploadResult(null)
        }
        reader.readAsArrayBuffer(file)
    }

    const parseExcelDate = (value) => {
        if (!value) return null
        if (typeof value === 'number') {
            const date = new Date(Math.round((value - 25569) * 86400 * 1000))
            return date.toISOString().split('T')[0]
        }
        const strVal = String(value).trim()
        if (/^\d{1,2}\/\d{1,2}\/\d{2,4}$/.test(strVal)) {
            let [day, month, year] = strVal.split('/')
            if (year.length === 2) year = '20' + year
            return `${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')}`
        }
        if (/^\d{4}-\d{2}-\d{2}$/.test(strVal)) return strVal
        return null
    }

    const handleUpload = async () => {
        if (previewData.length === 0) return
        if (!canImport) return

        // Inyectar la BU seleccionada en todos los registros
        const buToUse = selectedBusinessUnit || defaultBusinessUnit || ''

        setLoading(true)
        try {
            const payload = previewData
                .filter(item => item.isValid)
                .map(item => ({ ...item, business_unit: buToUse }))

            const { data, error } = await bulkImportEmployees(payload)
            if (error) throw error

            setUploadResult({ success: true, count: data.success_count, errors: data.errors })
            setFile(null)
            setPreviewData([])
            setSelectedBusinessUnit(defaultBusinessUnit || '')
            setAvailableBusinessUnits([])
            if (onSuccess) onSuccess()
        } catch (err) {
            console.error(err)
            setUploadResult({ success: false, message: err.message || 'Error desconocido' })
        } finally {
            setLoading(false)
        }
    }

    const clearFile = () => {
        setFile(null)
        setPreviewData([])
        setUploadResult(null)
        setSelectedBusinessUnit(defaultBusinessUnit || '')
        setAvailableBusinessUnits([])
        if (fileInputRef.current) fileInputRef.current.value = ''
    }

    // BU efectiva para mostrar en la tabla preview
    const effectiveBU = selectedBusinessUnit || defaultBusinessUnit || ''

    return (
        <div className="bg-white rounded-xl shadow-lg border border-gray-200 p-6 max-w-4xl w-full mx-auto my-8">
            <div className="flex justify-between items-center mb-6">
                <div>
                    <h2 className="text-xl font-bold text-gray-800">Importación Masiva de Empleados</h2>
                    <p className="text-gray-500 text-sm">
                        Carga empleados desde Excel (.xlsx)
                        {defaultSede && <span className="ml-2 font-semibold text-blue-600">· {defaultSede}</span>}
                    </p>
                </div>
                <button onClick={onClose} className="text-gray-400 hover:text-gray-600">
                    <X size={24} />
                </button>
            </div>

            {/* Zona de Carga */}
            {!file && !uploadResult && (
                <div
                    onClick={() => fileInputRef.current.click()}
                    className="border-2 border-dashed border-gray-300 rounded-xl p-12 text-center hover:bg-gray-50 cursor-pointer transition-colors"
                >
                    <div className="w-16 h-16 bg-blue-50 rounded-full flex items-center justify-center text-blue-600 mx-auto mb-4">
                        <Upload size={32} />
                    </div>
                    <h3 className="text-lg font-medium text-gray-700">Haz clic para subir tu Excel</h3>
                    <p className="text-gray-500 text-sm mt-2">
                        Columnas requeridas: <span className="font-mono bg-gray-100 px-1 rounded">DNI</span>, <span className="font-mono bg-gray-100 px-1 rounded">APELLIDOS Y NOMBRES</span>
                    </p>
                </div>
            )}

            {file && !uploadResult && (
                <div className="space-y-4">
                    <div className="flex items-center justify-between bg-blue-50 p-4 rounded-lg border border-blue-100">
                        <div className="flex items-center gap-3">
                            <FileSpreadsheet className="text-blue-600" size={24} />
                            <div>
                                <p className="font-medium text-gray-800">{file.name}</p>
                                <p className="text-xs text-gray-500">{(file.size / 1024).toFixed(2)} KB</p>
                            </div>
                        </div>
                        <button onClick={clearFile} className="text-red-500 hover:text-red-700 text-sm font-medium">
                            Eliminar
                        </button>
                    </div>

                    {/* Selector de Unidad de Negocio */}
                    {!defaultBusinessUnit && (
                        <div className={`rounded-lg border p-4 ${needsBUSelection ? 'border-orange-300 bg-orange-50' : 'border-green-200 bg-green-50'}`}>
                            <div className="flex items-start gap-3">
                                <Building2 size={20} className={needsBUSelection ? 'text-orange-600 mt-0.5 shrink-0' : 'text-green-600 mt-0.5 shrink-0'} />
                                <div className="flex-1">
                                    <p className={`text-sm font-semibold ${needsBUSelection ? 'text-orange-800' : 'text-green-800'}`}>
                                        {loadingBUs
                                            ? 'Cargando unidades de negocio...'
                                            : availableBusinessUnits.length === 1
                                                ? `Unidad de negocio detectada: ${availableBusinessUnits[0]}`
                                                : availableBusinessUnits.length > 1
                                                    ? 'Selecciona la unidad de negocio de estos empleados'
                                                    : 'Unidad de negocio'}
                                    </p>

                                    {/* 1 BU: ya auto-asignada, solo mostrar */}
                                    {!loadingBUs && availableBusinessUnits.length === 1 && (
                                        <p className="text-xs text-green-700 mt-1">
                                            Se asignará automáticamente a todos los empleados importados.
                                        </p>
                                    )}

                                    {/* Múltiples BUs: selector obligatorio */}
                                    {!loadingBUs && availableBusinessUnits.length > 1 && (
                                        <select
                                            value={selectedBusinessUnit}
                                            onChange={e => setSelectedBusinessUnit(e.target.value)}
                                            className="mt-2 w-full border border-orange-300 rounded-lg px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-orange-400"
                                        >
                                            <option value="">-- Selecciona una unidad de negocio --</option>
                                            {availableBusinessUnits.map(bu => (
                                                <option key={bu} value={bu}>{bu}</option>
                                            ))}
                                        </select>
                                    )}

                                    {/* Sin BUs en BD: input libre */}
                                    {!loadingBUs && availableBusinessUnits.length === 0 && (
                                        <input
                                            type="text"
                                            placeholder="Escribe la unidad de negocio (opcional)"
                                            value={selectedBusinessUnit}
                                            onChange={e => setSelectedBusinessUnit(e.target.value.toUpperCase())}
                                            className="mt-2 w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400"
                                        />
                                    )}
                                </div>
                            </div>
                        </div>
                    )}

                    {/* Aviso si hay BU seleccionada/fija */}
                    {defaultBusinessUnit && (
                        <div className="rounded-lg border border-blue-200 bg-blue-50 px-4 py-2 flex items-center gap-2">
                            <Building2 size={16} className="text-blue-600 shrink-0" />
                            <p className="text-sm text-blue-700">
                                Unidad de negocio: <strong>{defaultBusinessUnit}</strong>
                            </p>
                        </div>
                    )}

                    <div className="max-h-60 overflow-y-auto border rounded-lg">
                        <table className="w-full text-sm text-left">
                            <thead className="bg-gray-50 sticky top-0 text-xs uppercase text-gray-500 font-semibold">
                                <tr>
                                    <th className="px-4 py-2">Estado</th>
                                    <th className="px-4 py-2">Tipo Doc.</th>
                                    <th className="px-4 py-2">DNI</th>
                                    <th className="px-4 py-2">Nombre</th>
                                    <th className="px-4 py-2">Sede</th>
                                    <th className="px-4 py-2">U. Negocio</th>
                                    <th className="px-4 py-2">Cargo</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-gray-100">
                                {previewData.map((row) => (
                                    <tr key={row.id} className={!row.isValid ? 'bg-red-50' : ''}>
                                        <td className="px-4 py-2">
                                            {row.isValid
                                                ? <CheckCircle size={16} className="text-green-500" />
                                                : <AlertTriangle size={16} className="text-red-500" />
                                            }
                                        </td>
                                        <td className="px-4 py-2 text-xs text-gray-500">{row.document_type}</td>
                                        <td className="px-4 py-2 font-mono">{row.dni}</td>
                                        <td className="px-4 py-2">{row.full_name}</td>
                                        <td className="px-4 py-2">{row.sede}</td>
                                        <td className="px-4 py-2 text-xs font-semibold text-blue-600">
                                            {effectiveBU || <span className="text-gray-400 italic">sin asignar</span>}
                                        </td>
                                        <td className="px-4 py-2">{row.position}</td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>

                    {/* Aviso si falta BU obligatoria */}
                    {needsBUSelection && !selectedBusinessUnit && (
                        <p className="text-sm text-orange-700 font-medium flex items-center gap-1">
                            <AlertTriangle size={14} />
                            Debes seleccionar una unidad de negocio antes de importar.
                        </p>
                    )}

                    <div className="flex justify-end gap-3">
                        <button
                            onClick={clearFile}
                            className="px-4 py-2 text-gray-600 hover:bg-gray-100 rounded-lg font-medium"
                        >
                            Cancelar
                        </button>
                        <button
                            onClick={handleUpload}
                            disabled={loading || previewData.length === 0 || !canImport}
                            className="px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 flex items-center gap-2 font-medium"
                        >
                            {loading ? <RefreshCw className="animate-spin" size={18} /> : <Save size={18} />}
                            Importar {previewData.filter(d => d.isValid).length} Empleados
                        </button>
                    </div>
                </div>
            )}

            {uploadResult && (
                <div className={`p-6 rounded-lg border ${uploadResult.success ? 'bg-green-50 border-green-200' : 'bg-red-50 border-red-200'}`}>
                    <div className="flex items-start gap-4">
                        {uploadResult.success
                            ? <CheckCircle className="text-green-600 mt-1" size={24} />
                            : <AlertTriangle className="text-red-600 mt-1" size={24} />
                        }
                        <div className="flex-1">
                            <h3 className={`text-lg font-bold ${uploadResult.success ? 'text-green-800' : 'text-red-800'}`}>
                                {uploadResult.success ? 'Importación Completada' : 'Error en la Importación'}
                            </h3>
                            <p className="text-gray-600 mt-1">
                                {uploadResult.success
                                    ? <>Se procesaron correctamente <strong>{uploadResult.count}</strong> registros.</>
                                    : uploadResult.message
                                }
                            </p>

                            {uploadResult.errors && uploadResult.errors.length > 0 && (
                                <div className="mt-4 bg-white p-3 rounded border border-gray-200 max-h-40 overflow-y-auto">
                                    <p className="text-xs font-bold text-gray-500 uppercase mb-2">Errores detectados:</p>
                                    <ul className="text-xs text-red-600 space-y-1 list-disc pl-4">
                                        {uploadResult.errors.map((err, i) => (
                                            <li key={i}>{err}</li>
                                        ))}
                                    </ul>
                                </div>
                            )}

                            <div className="mt-6">
                                <button
                                    onClick={clearFile}
                                    className="px-4 py-2 bg-white border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 font-medium"
                                >
                                    Subir otro archivo
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            )}

            <input
                type="file"
                ref={fileInputRef}
                className="hidden"
                accept=".xlsx, .csv"
                onChange={handleFileChange}
            />
        </div>
    )
}
