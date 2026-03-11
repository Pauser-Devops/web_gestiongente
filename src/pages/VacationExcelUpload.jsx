import { useState, useRef } from 'react'
import * as XLSX from '@e965/xlsx'
import { bulkUpdateVacations } from '../services/vacations'
import { Upload, FileSpreadsheet, CheckCircle, AlertTriangle, Save, RefreshCw, X, Download } from 'lucide-react'

export default function VacationExcelUpload() {
    const [file, setFile] = useState(null)
    const [previewData, setPreviewData] = useState([])
    const [loading, setLoading] = useState(false)
    const [uploadResult, setUploadResult] = useState(null)
    const fileInputRef = useRef(null)

    const handleDownloadTemplate = () => {
        const headers = [
            'SEDE',
            'DNI',
            'APELLIDOS Y NOMBRES',
            'FECHA DE INGRESO',
            'DIAS GANADOS',
            'DIAS GOZADOS',
            'DIAS PENDIENTES POR GOZAR'
        ];

        // Crear hoja de trabajo
        const ws = XLSX.utils.aoa_to_sheet([headers]);

        // Ajustar ancho de columnas para mejor visualización
        const wscols = [
            { wch: 15 }, // SEDE
            { wch: 15 }, // DNI
            { wch: 40 }, // APELLIDOS Y NOMBRES
            { wch: 20 }, // FECHA DE INGRESO
            { wch: 15 }, // DIAS GANADOS
            { wch: 15 }, // DIAS GOZADOS
            { wch: 25 }  // DIAS PENDIENTES POR GOZAR
        ];
        ws['!cols'] = wscols;

        // Crear libro y agregar la hoja
        const wb = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(wb, ws, "Plantilla_Carga");

        // Descargar archivo
        XLSX.writeFile(wb, "formato_carga_vacaciones.xlsx");
    };

    const handleFileChange = (e) => {
        const selectedFile = e.target.files[0]
        if (selectedFile) {
            setFile(selectedFile)
            readExcel(selectedFile)
        }
    }

const readExcel = (file) => {
        const reader = new FileReader()
        reader.onload = (e) => {
            const data = new Uint8Array(e.target.result)
            const workbook = XLSX.read(data, { type: 'array' })
            
            // ====================================================================
            // NUEVO: Lógica de selección inteligente de hoja
            // Buscamos cuál de todas las hojas tiene más registros válidos (DNIs)
            // ====================================================================
            let bestSheetName = workbook.SheetNames[0];
            let maxValidRows = 0;
            let bestRawData = [];

            console.log("🔎 Analizando hojas del Excel...");

            workbook.SheetNames.forEach(name => {
                const sheet = workbook.Sheets[name];
                
                // Leemos una muestra rápida
                const raw = XLSX.utils.sheet_to_json(sheet, { 
                    header: 1, 
                    blankrows: false,
                    defval: '' 
                });

                // Buscamos si tiene columna DNI en las primeras 20 filas
                let dniIdx = -1;
                let headerRowIdx = -1;

                for (let i = 0; i < Math.min(raw.length, 20); i++) {
                    const row = raw[i];
                    if (!Array.isArray(row)) continue;
                    
                    const idx = row.findIndex(cell => 
                        cell && String(cell).toUpperCase().includes('DNI')
                    );
                    
                    if (idx !== -1) {
                        dniIdx = idx;
                        headerRowIdx = i;
                        break;
                    }
                }

                if (dniIdx !== -1) {
                    // Contamos cuántos DNIs válidos tiene esta hoja
                    const validCount = raw.slice(headerRowIdx + 1).filter(r => {
                        const val = r[dniIdx];
                        return val && /^\d{8,12}$/.test(String(val).trim());
                    }).length;

                    console.log(`📄 Hoja "${name}": ${validCount} registros encontrados.`);

                    // Si esta hoja tiene más datos que la anterior, ¡es la ganadora!
                    if (validCount > maxValidRows) {
                        maxValidRows = validCount;
                        bestSheetName = name;
                        bestRawData = raw; // Guardamos los datos de la ganadora
                    }
                }
            });

            console.log(`✅ GANADORA: Hoja "${bestSheetName}" con ${maxValidRows} registros.`);
            alert(`Se detectó automáticamente la hoja "${bestSheetName}" con ${maxValidRows} empleados.`);

            // Usamos los datos de la hoja ganadora
            const rawData = bestRawData.length > 0 
                ? bestRawData 
                : XLSX.utils.sheet_to_json(workbook.Sheets[workbook.SheetNames[0]], { header: 1 });

            if (rawData.length === 0) {
                alert('⚠️ El archivo está vacío o no se pudo leer.');
                return;
            }

            // --- A PARTIR DE AQUÍ TODO SIGUE IGUAL (Lógica de Mapeo) ---
            // Solo asegurate de que las variables de abajo usen 'rawData'
            
            // 1. Detectar encabezados (reutilizamos lógica existente)
            let headerRowIndex = -1;
            const possibleDniHeaders = ['DNI', 'DOCUMENTO', 'CODIGO', 'ID'];
            
            for (let i = 0; i < Math.min(rawData.length, 50); i++) {
                const row = rawData[i];
                if (!row || !Array.isArray(row)) continue;
                const hasDniHeader = row.some(cell => {
                    if (!cell) return false;
                    return possibleDniHeaders.some(h => String(cell).toUpperCase().includes(h));
                });
                if (hasDniHeader) { headerRowIndex = i; break; }
            }

            if (headerRowIndex === -1) {
                alert('⚠️ No se encontró la columna "DNI".');
                return;
            }

            // 2. Construir cabeceras
            const primaryHeaders = rawData[headerRowIndex];
            const headers = primaryHeaders.map(h => h ? String(h).trim() : '');
            
            // 3. Buscar índices
            const findColIndex = (possibleNames) => {
                for (const name of possibleNames) {
                    const normalized = name.toUpperCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").trim();
                    const index = headers.findIndex(h => h && h.toUpperCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").includes(normalized));
                    if (index !== -1) return index;
                }
                return -1;
            };

            const dniColIndex = findColIndex(['DNI', 'DOCUMENTO']);
            const nombreColIndex = findColIndex(['APELLIDOS Y NOMBRES', 'NOMBRES', 'EMPLEADO']);
            const fechaIngresoColIndex = findColIndex(['INGRESO', 'FECHA DE INGRESO']); // Ajustado para tu Excel
            const diasGozadosColIndex = findColIndex(['DIAS GOZADOS', 'GOZADOS']);

            // 4. Mapear datos
            const allRows = rawData.slice(headerRowIndex + 1);
            const formatted = allRows.map((row, index) => {
                if (!row) return null;

                const dni = row[dniColIndex] ? String(row[dniColIndex]).trim() : '';
                if (!dni || !/^\d{8,12}$/.test(dni)) return null;

                const entryDate = parseExcelDate(fechaIngresoColIndex !== -1 ? row[fechaIngresoColIndex] : null);
                
                // Lógica robusta para días
                let legacyDays = 0;
                const diasRaw = diasGozadosColIndex !== -1 ? row[diasGozadosColIndex] : 0;
                if (diasRaw) {
                     const num = parseFloat(String(diasRaw).replace(',', '.'));
                     if (!isNaN(num)) legacyDays = Math.round(num);
                }

                return {
                    id: index,
                    dni: dni,
                    entry_date: entryDate,
                    legacy_days: legacyDays,
                    full_name: nombreColIndex !== -1 ? String(row[nombreColIndex]).trim() : 'DESCONOCIDO',
                    isValid: Boolean(dni && entryDate)
                };
            }).filter(item => item !== null);

            setPreviewData(formatted);
            setUploadResult(null);
        };
        reader.readAsArrayBuffer(file);
    };

    // Helper para parsear fechas de Excel
    const parseExcelDate = (value) => {
        if (!value) return null;
        
        // Si es número serial de Excel
        if (typeof value === 'number') {
            const date = new Date(Math.round((value - 25569) * 86400 * 1000));
            return date.toISOString().split('T')[0];
        }
        
        const strVal = String(value).trim();
        
        // Formato ISO YYYY-MM-DD
        if (/^\d{4}-\d{2}-\d{2}$/.test(strVal)) {
            return strVal;
        }

        // Formato DD/MM/YYYY
        if (/^\d{1,2}\/\d{1,2}\/\d{4}$/.test(strVal)) {
            const [day, month, year] = strVal.split('/');
            const pad = (n) => String(n).padStart(2, '0');
            return `${year}-${pad(month)}-${pad(day)}`;
        }

        // Intentar parseo genérico
        const date = new Date(strVal);
        if (!isNaN(date.getTime())) {
            return date.toISOString().split('T')[0];
        }

        return null;
    };

    const handleUpload = async () => {
        if (previewData.length === 0) return;

        setLoading(true);
        try {
            const payload = previewData
                .filter(item => item.isValid)
                .map(item => ({
                    dni: item.dni,
                    entry_date: item.entry_date,
                    legacy_days: item.legacy_days
                }));

            console.log(`Enviando ${payload.length} registros al servidor...`);

            const { data, error } = await bulkUpdateVacations(payload);
            
            if (error) throw error;

            setUploadResult({
                success: true,
                count: data.updated_count,
                errors: data.errors || []
            });
            
            setFile(null);
            setPreviewData([]);
        } catch (err) {
            console.error('❌ Error en upload:', err);
            setUploadResult({
                success: false,
                message: err.message
            });
        } finally {
            setLoading(false);
        }
    };

    const clearFile = () => {
        setFile(null);
        setPreviewData([]);
        setUploadResult(null);
        if (fileInputRef.current) fileInputRef.current.value = '';
    };

    return (
        <div className="max-w-5xl mx-auto space-y-8 p-6">
            <div className="flex justify-between items-center">
                <div>
                    <h1 className="text-2xl font-bold text-slate-800">Carga Masiva de Histórico</h1>
                    <p className="text-slate-500 text-sm">Actualiza fechas de ingreso y días consumidos (Excel)</p>
                </div>
                
                <button
                    onClick={handleDownloadTemplate}
                    className="flex items-center gap-2 px-4 py-2 bg-green-600 hover:bg-green-700 text-white rounded-lg text-sm font-medium transition-colors shadow-sm"
                >
                    <Download size={18} />
                    Descargar Formato
                </button>
            </div>

            {/* Zona de Carga */}
            <div className={`border-2 border-dashed rounded-xl p-10 text-center transition-all ${
                file ? 'border-blue-200 bg-blue-50/30' : 'border-slate-300 hover:border-blue-400 hover:bg-slate-50'
            }`}>
                {!file ? (
                    <div 
                        onClick={() => fileInputRef.current.click()}
                        className="cursor-pointer flex flex-col items-center gap-3"
                    >
                        <div className="w-16 h-16 bg-blue-100 rounded-full flex items-center justify-center text-blue-600">
                            <Upload size={32} />
                        </div>
                        <h3 className="text-lg font-semibold text-slate-700">Haz clic para subir tu Excel</h3>
                        <p className="text-slate-500 text-sm max-w-md">
                            Soporta archivos con filas vacías intercaladas. 
                            Columnas requeridas: <span className="font-mono bg-slate-100 px-1 rounded">DNI</span>, 
                            <span className="font-mono bg-slate-100 px-1 rounded ml-1">FECHA INGRESO</span>, 
                            <span className="font-mono bg-slate-100 px-1 rounded ml-1">DIAS GOZADOS</span>
                        </p>
                    </div>
                ) : (
                    <div className="flex flex-col items-center gap-4">
                        <FileSpreadsheet size={48} className="text-green-600" />
                        <div>
                            <h3 className="text-lg font-bold text-slate-800">{file.name}</h3>
                            <p className="text-slate-500 text-sm">{(file.size / 1024).toFixed(2)} KB</p>
                        </div>
                        <div className="flex gap-3 mt-2">
                            <button 
                                onClick={clearFile}
                                className="px-4 py-2 bg-white border border-slate-300 rounded-lg text-slate-600 hover:bg-slate-50 text-sm font-medium flex items-center gap-2"
                            >
                                <X size={16} /> Cancelar
                            </button>
                            <button 
                                onClick={handleUpload}
                                disabled={loading || previewData.filter(p => p.isValid).length === 0}
                                className="px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 shadow-sm shadow-blue-200 font-medium flex items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
                            >
                                {loading ? <RefreshCw className="animate-spin" size={18} /> : <Save size={18} />}
                                Procesar {previewData.filter(p => p.isValid).length} Registros
                            </button>
                        </div>
                    </div>
                )}
                <input 
                    type="file" 
                    ref={fileInputRef} 
                    className="hidden" 
                    accept=".xlsx, .xls" 
                    onChange={handleFileChange} 
                />
            </div>

            {/* Resultados */}
            {uploadResult && (
                <div className={`p-4 rounded-lg border flex items-start gap-3 ${
                    uploadResult.success ? 'bg-green-50 border-green-200 text-green-800' : 'bg-red-50 border-red-200 text-red-800'
                }`}>
                    {uploadResult.success ? <CheckCircle className="shrink-0" /> : <AlertTriangle className="shrink-0" />}
                    <div>
                        <h4 className="font-bold">{uploadResult.success ? 'Proceso Completado' : 'Error en la Carga'}</h4>
                        {uploadResult.success ? (
                            <div className="text-sm mt-1">
                                <p>Se actualizaron correctamente <strong>{uploadResult.count}</strong> empleados.</p>
                                {uploadResult.errors && uploadResult.errors.length > 0 && (
                                    <div className="mt-2 bg-white/50 p-2 rounded text-xs overflow-auto max-h-32">
                                        <p className="font-bold mb-1 text-red-700">Errores parciales:</p>
                                        <ul className="list-disc pl-4 space-y-1">
                                            {uploadResult.errors.map((e, i) => <li key={i}>{e}</li>)}
                                        </ul>
                                    </div>
                                )}
                            </div>
                        ) : (
                            <p className="text-sm mt-1">{uploadResult.message}</p>
                        )}
                    </div>
                </div>
            )}

            {/* Tabla de Previsualización */}
            {previewData.length > 0 && !uploadResult && (
                <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
                    <div className="p-4 border-b border-slate-100 bg-slate-50 flex justify-between items-center">
                        <h3 className="font-bold text-slate-700">Previsualización de Datos</h3>
                        <div className="flex items-center gap-4">
                            <span className="text-xs font-mono text-slate-500">
                                Total: {previewData.length} | Válidos: {previewData.filter(p => p.isValid).length}
                            </span>
                            <span className="text-xs text-slate-400">Mostrando primeros 100</span>
                        </div>
                    </div>
                    <div className="overflow-x-auto max-h-[400px]">
                        <table className="w-full text-sm text-left text-slate-600">
                            <thead className="text-xs text-slate-500 uppercase bg-slate-50 sticky top-0">
                                <tr>
                                    <th className="px-6 py-3">Estado</th>
                                    <th className="px-6 py-3">DNI</th>
                                    <th className="px-6 py-3">Nombre</th>
                                    <th className="px-6 py-3">Fecha Ingreso</th>
                                    <th className="px-6 py-3 text-center">Días Históricos</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-100">
                                {previewData.slice(0, 100).map((row) => (
                                    <tr key={row.id} className={!row.isValid ? 'bg-red-50' : 'hover:bg-slate-50'}>
                                        <td className="px-6 py-3">
                                            {row.isValid ? (
                                                <span className="text-green-600 flex items-center gap-1 text-xs font-bold">
                                                    <CheckCircle size={14} /> OK
                                                </span>
                                            ) : (
                                                <span className="text-red-600 flex items-center gap-1 text-xs font-bold">
                                                    <AlertTriangle size={14} /> Inválido
                                                </span>
                                            )}
                                        </td>
                                        <td className="px-6 py-3 font-mono">{row.dni || '-'}</td>
                                        <td className="px-6 py-3">{row.full_name}</td>
                                        <td className="px-6 py-3">{row.entry_date || <span className="text-red-400">Sin fecha</span>}</td>
                                        <td className="px-6 py-3 text-center">
                                            <span className={`font-bold ${row.legacy_days > 0 ? 'text-blue-700' : 'text-slate-400'}`}>
                                                {row.legacy_days}
                                            </span>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                </div>
            )}
        </div>
    );
}